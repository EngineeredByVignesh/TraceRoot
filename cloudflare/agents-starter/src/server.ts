import { callable, routeAgentRequest, type Schedule } from "agents";
import { getSchedulePrompt, scheduleSchema } from "agents/schedule";
import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import {
  convertToModelMessages,
  pruneMessages,
  stepCountIs,
  streamText,
  tool
} from "ai";
import { z } from "zod";
import {
  getAlerts,
  getDeployments,
  queryLogs,
  queryMetrics
} from "./incident-tools";
import { rememberIncident, searchSimilarIncidents } from "./incident-memory";
import { reuseConditionsSchema } from "./memory-reuse";
import { observeToolCall } from "./tool-telemetry";
import { createChatModel } from "./model-provider";
import { handleAlertWebhook } from "./alert-webhook";
import type { AlertNotification } from "./alert-webhook";
import { admitAlert } from "./alert-admission";
import type { AlertCorrelation } from "./alert-correlation";
import { requireNumber } from "./config";
import {
  newestInvestigations,
  type InvestigationProgress,
  type InvestigationState
} from "./investigation-progress";
export { InvestigationWorkflow } from "./investigation-workflow";

export class ChatAgent extends AIChatAgent<Env, InvestigationState> {
  initialState: InvestigationState = { investigations: [] };
  private alertIntake: Promise<unknown> = Promise.resolve();
  maxPersistedMessages = 100;
  chatRecovery = true;
  // Wait for MCP connections to be re-established after hibernation before
  // processing a message, so MCP tools aren't intermittently missing.
  waitForMcpConnections = true;

  onStart() {
    // Configure OAuth popup behavior for MCP servers that require authentication
    this.mcp.configureOAuthCallback({
      customHandler: (result) => {
        if (result.authSuccess) {
          return new Response("<script>window.close();</script>", {
            headers: { "content-type": "text/html" },
            status: 200
          });
        }
        return new Response(
          `Authentication Failed: ${result.authError || "Unknown error"}`,
          { headers: { "content-type": "text/plain" }, status: 400 }
        );
      }
    });
  }

  @callable()
  async addServer(name: string, url: string) {
    return await this.addMcpServer(name, url);
  }

  @callable()
  async removeServer(serverId: string) {
    await this.removeMcpServer(serverId);
  }

  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    const mcpTools = this.mcp.getAITools();
    const model = createChatModel(this.env, this.sessionAffinity);

    const result = streamText({
      model,
      system: `You are a Incident Investigator Agent for a kubernetes.

You have four incident tools:
- getDeployments: use it when the user asks about the demo-service deployment, rollout, version, image, or active failure mode.
- getAlerts: use it when the user asks about current alerts, symptoms, firing alerts, or whether the incident has triggered Alertmanager.
- queryMetrics: use it to run PromQL against Prometheus for error rate, latency, request volume, and service health.
- queryLogs: use it to run LogQL against Loki for demo-service error messages and symptoms.
- startInvestigationWorkflow: use it when the user wants a durable/long-running investigation that can retry and resume.
- getInvestigationWorkflowStatus: use it when the user asks for the status or result of a durable investigation.
- searchSimilarIncidents: use it early in investigations to find previous incidents with similar symptoms.
- rememberIncident: use it when the user asks to save an incident, RCA, root cause, or remediation for future memory.

For incident investigations, gather deployment metadata, alerts, metrics, and logs before giving a root-cause answer.
When answering from tool results, summarize concrete evidence and avoid guessing.
Current evidence outranks historical memory. Similar incidents are hypotheses, not proof; embedding similarity is retrieval similarity, never causal confidence. Reuse a historical RCA only when current evidence satisfies its stored reuse conditions; conflicts require a full investigation. If the cause is unknown or insufficiently supported, propose only evidence-supported diagnostics or containment, not a cause-specific fix as though established.
Final investigation results must contain exactly three Markdown headings in this order: ## RCA, ## Summary, ## Fix. Do not add a preamble, conclusion, or other headings. Under RCA, state the likely cause, supporting evidence and uncertainty; say unknown when evidence is insufficient. Under Summary, briefly describe affected scope, observed impact and any skipped checks or historical reuse. Under Fix, give the targeted proposed remedy and concise verification checks. Never claim a fix was executed or recovery confirmed without tool evidence; do not invent commands or configuration. Keep unrelated incidents separate. This format applies to final incident reports, not ordinary chat replies or status updates.

${getSchedulePrompt({ date: new Date() })}

If the user asks to schedule a task, use the schedule tool to schedule the task.`,
      // Prune old tool calls and reasoning to save tokens on long conversations
      messages: pruneMessages({
        messages: await convertToModelMessages(this.messages),
        toolCalls: "before-last-2-messages",
        reasoning: "before-last-message"
      }),
      tools: {
        // MCP tools from connected servers
        ...mcpTools,

        queryMetrics: tool({
          description:
            "Run an instant PromQL query against Prometheus. Use this for demo-service error rates, latency, request volume, and service health.",
          inputSchema: z.object({
            query: z.string().describe("PromQL query to execute")
          }),
          execute: async ({ query }) => {
            return observeToolCall(
              "queryMetrics",
              "tool_api",
              { queryLength: query.length },
              () => queryMetrics(this.env, query)
            );
          }
        }),

        queryLogs: tool({
          description:
            "Run a LogQL query against Loki. Use this to inspect demo-service logs for errors, timeouts, and failure-mode symptoms.",
          inputSchema: z.object({
            query: z
              .string()
              .default('{namespace="incident-lab"}')
              .describe("LogQL query to execute"),
            limit: z
              .number()
              .int()
              .min(1)
              .max(500)
              .default(100)
              .describe("Maximum log entries to return"),
            sinceSeconds: z
              .number()
              .int()
              .min(60)
              .max(86400)
              .default(1800)
              .describe("How far back to query, in seconds")
          }),
          execute: async ({ query, limit, sinceSeconds }) => {
            return observeToolCall(
              "queryLogs",
              "tool_api",
              { queryLength: query.length, limit, sinceSeconds },
              () => queryLogs(this.env, query, limit, sinceSeconds)
            );
          }
        }),

        getAlerts: tool({
          description:
            "Fetch current Alertmanager alerts from the local Kubernetes observability stack.",
          inputSchema: z.object({}),
          execute: async () => {
            return observeToolCall("getAlerts", "tool_api", {}, () =>
              getAlerts(this.env)
            );
          }
        }),

        getDeployments: tool({
          description:
            "Fetch Kubernetes deployment metadata for demo-service, including image, annotations, rollout status, app version, and active failure mode.",
          inputSchema: z.object({}),
          execute: async () => {
            return observeToolCall("getDeployments", "tool_api", {}, () =>
              getDeployments(this.env)
            );
          }
        }),

        startInvestigationWorkflow: tool({
          description:
            "Start a durable Cloudflare Workflow investigation for demo-service. Use this for long-running investigations that should retry and resume after failures.",
          inputSchema: z.object({
            question: z
              .string()
              .default("Investigate demo-service.")
              .describe("The investigation question or incident prompt"),
            sinceSeconds: z
              .number()
              .int()
              .min(300)
              .max(86400)
              .default(1800)
              .describe("How far back logs should be collected, in seconds")
          }),
          execute: async ({ question, sinceSeconds }) => {
            return observeToolCall(
              "startInvestigationWorkflow",
              "workflow",
              { questionLength: question.length, sinceSeconds },
              async () => {
                const instance = await this.env.INVESTIGATION_WORKFLOW.create({
                  params: { question, sinceSeconds }
                });
                return {
                  id: instance.id,
                  status: await instance.status()
                };
              }
            );
          }
        }),

        getInvestigationWorkflowStatus: tool({
          description:
            "Fetch the status and result of a durable Cloudflare Workflow investigation by instance ID.",
          inputSchema: z.object({
            instanceId: z
              .string()
              .describe(
                "Cloudflare Workflow instance ID returned by startInvestigationWorkflow"
              )
          }),
          execute: async ({ instanceId }) => {
            return observeToolCall(
              "getInvestigationWorkflowStatus",
              "workflow",
              { instanceId },
              async () => {
                const instance =
                  await this.env.INVESTIGATION_WORKFLOW.get(instanceId);
                return instance.status();
              }
            );
          }
        }),

        searchSimilarIncidents: tool({
          description:
            "Search historical incident memory for similar symptoms, root causes, or remediations.",
          inputSchema: z.object({
            query: z
              .string()
              .describe(
                "Current incident symptoms or question to search historical incidents for"
              ),
            topK: z
              .number()
              .int()
              .min(1)
              .max(10)
              .default(5)
              .describe("Maximum number of similar incidents to return")
          }),
          execute: async ({ query, topK }) => {
            return observeToolCall(
              "searchSimilarIncidents",
              "memory",
              { queryLength: query.length, topK },
              () => searchSimilarIncidents(this.env, query, topK)
            );
          }
        }),

        rememberIncident: tool({
          description:
            "Store an incident/RCA in long-term Vectorize memory. Only include reuseConditions when the user explicitly supplies and approves all rules for skipping a full investigation; never invent them from a likely root cause.",
          inputSchema: z.object({
            title: z.string().describe("Short incident title"),
            summary: z.string().describe("Brief incident summary"),
            rootCause: z.string().describe("Confirmed or likely root cause"),
            reuseConditions: reuseConditionsSchema
              .optional()
              .describe(
                "Explicit user-approved reuse rules; omit for ordinary incident memories."
              ),
            remediation: z
              .string()
              .describe("Remediation or mitigation that resolved the incident"),
            labels: z
              .array(z.string())
              .default([])
              .describe(
                "Optional labels such as service, symptom, or failure mode"
              )
          }),
          execute: async (input) => {
            return observeToolCall(
              "rememberIncident",
              "memory",
              {
                titleLength: input.title.length,
                labelCount: input.labels.length
              },
              () => rememberIncident(this.env, input)
            );
          }
        }),

        // Client-side tool: no execute function — the browser handles it
        getUserTimezone: tool({
          description:
            "Get the user's timezone from their browser. Use this when you need to know the user's local time.",
          inputSchema: z.object({})
        }),

        // Approval tool: requires user confirmation before executing
        calculate: tool({
          description:
            "Perform a math calculation with two numbers. Requires user approval for large numbers.",
          inputSchema: z.object({
            a: z.number().describe("First number"),
            b: z.number().describe("Second number"),
            operator: z
              .enum(["+", "-", "*", "/", "%"])
              .describe("Arithmetic operator")
          }),
          needsApproval: async ({ a, b }) =>
            Math.abs(a) > 1000 || Math.abs(b) > 1000,
          execute: async ({ a, b, operator }) => {
            const ops: Record<string, (x: number, y: number) => number> = {
              "+": (x, y) => x + y,
              "-": (x, y) => x - y,
              "*": (x, y) => x * y,
              "/": (x, y) => x / y,
              "%": (x, y) => x % y
            };
            if (operator === "/" && b === 0) {
              return { error: "Division by zero" };
            }
            return {
              expression: `${a} ${operator} ${b}`,
              result: ops[operator](a, b)
            };
          }
        }),

        scheduleTask: tool({
          description:
            "Schedule a task to be executed at a later time. Use this when the user asks to be reminded or wants something done later.",
          inputSchema: scheduleSchema,
          execute: async ({ when, description }) => {
            if (when.type === "no-schedule") {
              return "Not a valid schedule input";
            }
            const input =
              when.type === "scheduled"
                ? when.date
                : when.type === "delayed"
                  ? when.delayInSeconds
                  : when.type === "cron"
                    ? when.cron
                    : null;
            if (!input) return "Invalid schedule type";
            try {
              this.schedule(input, "executeTask", description, {
                idempotent: true
              });
              return `Task scheduled: "${description}" (${when.type}: ${input})`;
            } catch (error) {
              return `Error scheduling task: ${error}`;
            }
          }
        }),

        getScheduledTasks: tool({
          description: "List all tasks that have been scheduled",
          inputSchema: z.object({}),
          execute: async () => {
            const tasks = this.getSchedules();
            return tasks.length > 0 ? tasks : "No scheduled tasks found.";
          }
        }),

        cancelScheduledTask: tool({
          description: "Cancel a scheduled task by its ID",
          inputSchema: z.object({
            taskId: z.string().describe("The ID of the task to cancel")
          }),
          execute: async ({ taskId }) => {
            try {
              this.cancelSchedule(taskId);
              return `Task ${taskId} cancelled.`;
            } catch (error) {
              return `Error cancelling task: ${error}`;
            }
          }
        })
      },
      stopWhen: stepCountIs(20),
      abortSignal: options?.abortSignal
    });

    return result.toUIMessageStreamResponse();
  }

  updateInvestigation(progress: InvestigationProgress) {
    const current = this.state?.investigations ?? [];
    const previous = current.find((item) => item.id === progress.id);
    this.setState({
      investigations: newestInvestigations([
        {
          ...progress,
          alerts: progress.alerts ?? previous?.alerts,
          startedAt: previous?.startedAt ?? progress.startedAt
        },
        ...current.filter((item) => item.id !== progress.id)
      ]).slice(0, 50)
    });
  }

  acquireModelSlot(owner: string, timeoutMs: number) {
    this
      .sql`CREATE TABLE IF NOT EXISTS model_leases (owner TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)`;
    this
      .sql`CREATE TABLE IF NOT EXISTS model_budget (id INTEGER PRIMARY KEY, next_at INTEGER NOT NULL)`;
    const now = Date.now();
    this.sql`DELETE FROM model_leases WHERE expires_at <= ${now}`;
    const [budget] = this.sql<{
      next_at: number;
    }>`SELECT next_at FROM model_budget WHERE id = 1`;
    const [count] = this.sql<{
      total: number;
    }>`SELECT count(*) AS total FROM model_leases`;
    const limit = requireNumber(this.env, "LLM_MAX_CONCURRENCY", 1, 20, true);
    if ((budget?.next_at ?? 0) > now || count.total >= limit) {
      return {
        acquired: false,
        retryAfterMs: Math.max(0, (budget?.next_at ?? now) - now)
      };
    }
    const spacing = requireNumber(
      this.env,
      "LLM_MIN_INTERVAL_MS",
      0,
      60000,
      true
    );
    this
      .sql`INSERT OR REPLACE INTO model_leases VALUES (${owner}, ${now + timeoutMs})`;
    this.sql`INSERT OR REPLACE INTO model_budget VALUES (1, ${now + spacing})`;
    return { acquired: true, retryAfterMs: 0 };
  }

  releaseModelSlot(owner: string) {
    this.sql`DELETE FROM model_leases WHERE owner = ${owner}`;
  }

  pauseModelRequests(delayMs: number) {
    const until = Date.now() + delayMs;
    this
      .sql`INSERT INTO model_budget VALUES (1, ${until}) ON CONFLICT(id) DO UPDATE SET next_at = max(next_at, excluded.next_at)`;
  }

  acceptAlerts(
    alerts: AlertNotification[],
    sinceSeconds: number,
    agentName: string,
    memoryEnabled?: boolean
  ) {
    const admission = this.alertIntake.then(async () => {
      this
        .sql`CREATE TABLE IF NOT EXISTS alert_associations (episode_id TEXT PRIMARY KEY, investigation_id TEXT NOT NULL, correlation_json TEXT NOT NULL)`;
      const results = [];
      for (const alert of alerts) {
        results.push(
          await admitAlert(
            {
              env: this.env,
              memoryEnabled,
              sinceSeconds,
              agentName,
              getInvestigations: () => this.getInvestigations(),
              update: (progress) =>
                this.updateInvestigation({
                  ...progress,
                  alerts: progress.alerts
                }),
              find: (episodeId) => {
                const [row] = this.sql<{
                  investigation_id: string;
                  correlation_json: string;
                }>`SELECT investigation_id, correlation_json FROM alert_associations WHERE episode_id = ${episodeId}`;
                return row
                  ? {
                      investigationId: row.investigation_id,
                      correlation: JSON.parse(
                        row.correlation_json
                      ) as AlertCorrelation
                    }
                  : undefined;
              },
              save: (episodeId, investigationId, correlation) => {
                this
                  .sql`INSERT OR REPLACE INTO alert_associations VALUES (${episodeId}, ${investigationId}, ${JSON.stringify(correlation)})`;
              }
            },
            alert
          )
        );
      }
      return {
        created: results.reduce((sum, result) => sum + result.created, 0),
        workflows: [
          ...new Set(results.map((result) => result.investigationId))
        ],
        correlations: results.map((result) => result.correlation)
      };
    });
    this.alertIntake = admission.catch(() => {});
    return admission;
  }

  @callable()
  async getInvestigations() {
    const current = this.state?.investigations ?? [];
    await Promise.all(
      current
        .filter(
          (item) => item.status === "running" || item.status === "retrying"
        )
        .map(async (item) => {
          try {
            const instance = await this.env.INVESTIGATION_WORKFLOW.get(item.id);
            const status = await instance.status();
            const latest = this.state.investigations.find(
              (value) => value.id === item.id
            );
            if (
              latest &&
              status.status === "complete" &&
              latest.status !== "complete"
            ) {
              this.updateInvestigation({
                ...latest,
                status: "complete",
                updatedAt: new Date().toISOString()
              });
            }
            if (
              latest &&
              (status.status === "errored" || status.status === "terminated")
            ) {
              this.updateInvestigation({
                ...latest,
                status: "failed",
                detail: status.error?.message ?? "Investigation stopped.",
                updatedAt: new Date().toISOString()
              });
            }
          } catch {
            /* A temporary status lookup failure does not terminate the investigation. */
          }
        })
    );
    return this.state?.investigations ?? [];
  }

  async recordAlertReport(workflowId: string, report: string) {
    // Retain the RPC for already-running Workflows; reports belong to investigation state.
    const current = this.state?.investigations.find(
      (item) => item.id === workflowId
    );
    if (current) this.updateInvestigation({ ...current, report });
  }

  async executeTask(description: string, _task: Schedule<string>) {
    // Do the actual work here (send email, call API, etc.)
    console.log(`Executing scheduled task: ${description}`);

    // Notify connected clients via a broadcast event.
    // We use broadcast() instead of saveMessages() to avoid injecting
    // into chat history — that would cause the AI to see the notification
    // as new context and potentially loop.
    this.broadcast(
      JSON.stringify({
        type: "scheduled-task",
        description,
        timestamp: new Date().toISOString()
      })
    );
  }
}

export default {
  async fetch(request: Request, env: Env) {
    if (new URL(request.url).pathname.startsWith("/api/alerts/")) {
      try {
        return await handleAlertWebhook(request, env);
      } catch (error) {
        console.error(
          JSON.stringify({
            event: "alert_webhook.failure",
            message: error instanceof Error ? error.message : String(error)
          })
        );
        return Response.json(
          { error: "Alert processing failed; retry delivery." },
          { status: 503 }
        );
      }
    }
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
