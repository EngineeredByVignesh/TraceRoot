import { z } from "zod";
import { requireEnv } from "./config";
import { getAgentByName } from "agents";
import { rememberIncident, searchSimilarIncidents } from "./incident-memory";
import { reuseConditionsSchema } from "./memory-reuse";
import { generateText } from "ai";
import { createChatModel } from "./model-provider";
import { correlateAlert } from "./alert-correlation";
import { errorStatus, modelErrorMessage, withModelBudget } from "./llm-budget";

const alertSchema = z.object({
  status: z.enum(["firing", "resolved"]),
  fingerprint: z.string().min(1).max(256),
  startsAt: z.string().datetime({ offset: true }),
  labels: z.record(z.string(), z.string()),
  annotations: z.record(z.string(), z.string())
});

const webhookSchema = z.object({
  version: z.literal("4"),
  status: z.enum(["firing", "resolved"]),
  alerts: z.array(alertSchema).max(100)
});

export type AlertNotification = z.infer<typeof alertSchema>;

export async function alertWorkflowId(alert: AlertNotification) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      JSON.stringify([alert.fingerprint, alert.startsAt])
    )
  );
  return `alert-${Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function readPayload(
  request: Request
): Promise<{ body?: unknown; error?: Response }> {
  const reader = request.body?.getReader();
  if (!reader)
    return { error: Response.json({ error: "Missing body" }, { status: 400 }) };
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 65536) {
      await reader.cancel();
      return {
        error: Response.json(
          { error: "Payload exceeds 64 KiB" },
          { status: 413 }
        )
      };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { body: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { error: Response.json({ error: "Invalid JSON" }, { status: 400 }) };
  }
}

export async function handleAlertWebhook(
  request: Request,
  env: Env
): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (env.ALERT_WEBHOOK_ENABLED !== "true") {
    return Response.json(
      { error: "Alert webhook is disabled." },
      { status: 503 }
    );
  }
  if (
    request.headers.get("authorization") !==
    `Bearer ${requireEnv(env, "ALERT_WEBHOOK_TOKEN")}`
  ) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (path === "/api/alerts/benchmark") {
    if (env.BENCHMARK_ENABLED !== "true")
      return new Response("Not found", { status: 404 });
    if (request.method !== "POST")
      return new Response("Method not allowed", { status: 405 });
    if (!env.INCIDENT_MEMORY_NAMESPACE.startsWith("benchmark-"))
      return Response.json(
        {
          error: "Benchmark requires an isolated benchmark- memory namespace."
        },
        { status: 400 }
      );
    const payload = await readPayload(request);
    if (payload.error) return payload.error;
    const parsed = z
      .discriminatedUnion("operation", [
        z.object({ operation: z.literal("model-check") }),
        z.object({
          operation: z.literal("run"),
          agentName: z.string().regex(/^benchmark-[a-z0-9-]{1,100}$/),
          memoryEnabled: z.boolean(),
          alerts: z.array(alertSchema).min(1).max(50)
        }),
        z.object({
          operation: z.literal("remember"),
          incident: z.object({
            title: z.string().max(300),
            summary: z.string().max(2000),
            rootCause: z.string().max(2000),
            reuseConditions: reuseConditionsSchema.optional(),
            remediation: z.string().max(2000),
            labels: z.array(z.string().max(100)).max(20)
          })
        }),
        z.object({
          operation: z.literal("search"),
          query: z.string().max(2000)
        })
      ])
      .safeParse(payload.body);
    if (!parsed.success)
      return Response.json(
        { error: "Invalid benchmark request" },
        { status: 400 }
      );
    const body = parsed.data;
    if (body.operation === "model-check") {
      try {
        const result = await withModelBudget(
          env,
          "preflight",
          "benchmark-model-check",
          (signal) =>
            generateText({
              model: createChatModel(env, "benchmark-model-check", {
                operation: "preflight"
              }),
              maxRetries: 0,
              maxOutputTokens: 32,
              abortSignal: signal,
              prompt: "Reply with exactly OK."
            })
        );
        if (!result.text.trim())
          throw new Error("Model preflight returned no text.");
        const alert: AlertNotification = {
          status: "firing",
          fingerprint: "benchmark-model-check",
          startsAt: new Date().toISOString(),
          labels: {
            alertname: "Latency",
            namespace: "benchmark",
            service: "probe",
            component: "renderer"
          },
          annotations: {
            summary: "Renderer latency increased after a deployment."
          }
        };
        const correlation = await correlateAlert(env, alert, [
          {
            id: "benchmark-active",
            alertName: "Errors",
            startedAt: alert.startsAt,
            updatedAt: alert.startsAt,
            status: "running",
            stage: "Deployment",
            completed: [],
            alerts: [
              {
                episodeId: "benchmark-previous",
                alert: {
                  ...alert,
                  labels: { ...alert.labels, alertname: "Errors" },
                  annotations: {
                    summary:
                      "Renderer errors increased after the same deployment."
                  }
                },
                correlation: {
                  correlated: false,
                  investigationId: null,
                  confidence: 0,
                  reason: "Preflight seed"
                }
              }
            ]
          }
        ]);
        return Response.json({
          text: result.text,
          structuredOutput: correlation
        });
      } catch (error) {
        return Response.json(
          {
            error: modelErrorMessage(env, error),
            status: errorStatus(error),
            name: error instanceof Error ? error.name : "UnknownError"
          },
          { status: 502 }
        );
      }
    }
    if (body.operation === "remember")
      return Response.json(await rememberIncident(env, body.incident));
    if (body.operation === "search")
      return Response.json(await searchSimilarIncidents(env, body.query, 5));
    const agent = await getAgentByName(env.ChatAgent, body.agentName);
    const sinceSeconds = Number(
      requireEnv(env, "ALERT_INVESTIGATION_SINCE_SECONDS")
    );
    if (
      !Number.isSafeInteger(sinceSeconds) ||
      sinceSeconds < 300 ||
      sinceSeconds > 86400
    )
      return Response.json(
        { error: "Invalid investigation lookback." },
        { status: 400 }
      );
    return Response.json(
      await agent.acceptAlerts(
        body.alerts,
        sinceSeconds,
        body.agentName,
        body.memoryEnabled
      ),
      { status: 202 }
    );
  }

  const statusMatch = /^\/api\/alerts\/workflows\/(alert-[a-f0-9]{64})$/.exec(
    path
  );
  if (statusMatch && request.method === "GET") {
    const instance = await env.INVESTIGATION_WORKFLOW.get(statusMatch[1]);
    return Response.json({ id: instance.id, ...(await instance.status()) });
  }
  if (path !== "/api/alerts/webhook")
    return new Response("Not found", { status: 404 });
  if (request.method !== "POST")
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "POST" }
    });

  const payload = await readPayload(request);
  if (payload.error) return payload.error;
  const parsed = webhookSchema.safeParse(payload.body);
  if (!parsed.success)
    return Response.json(
      { error: "Invalid Alertmanager v4 payload" },
      { status: 400 }
    );

  const allowedNames = requireEnv(env, "ALERT_WEBHOOK_ALERT_NAMES")
    .split(",")
    .map((name) => name.trim());
  const firing = parsed.data.alerts.filter(
    (alert) =>
      alert.status === "firing" && allowedNames.includes(alert.labels.alertname)
  );
  if (!firing.length)
    return Response.json({ accepted: 0, ignored: parsed.data.alerts.length });
  const sinceSeconds = Number(
    requireEnv(env, "ALERT_INVESTIGATION_SINCE_SECONDS")
  );
  if (
    !Number.isSafeInteger(sinceSeconds) ||
    sinceSeconds < 300 ||
    sinceSeconds > 86400
  ) {
    throw new Error(
      "ALERT_INVESTIGATION_SINCE_SECONDS must be an integer between 300 and 86400."
    );
  }
  const agentName = requireEnv(env, "ALERT_WEBHOOK_AGENT_NAME");
  const agent = await getAgentByName(env.ChatAgent, agentName);
  const result = await agent.acceptAlerts(firing, sinceSeconds, agentName);
  console.log(
    JSON.stringify({
      event: "alert_webhook.accepted",
      ...result
    })
  );
  return Response.json(result, { status: 202 });
}
