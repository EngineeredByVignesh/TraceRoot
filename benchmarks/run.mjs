import { readFile, writeFile, access, mkdir, copyFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createServer as createPortProbe } from "node:net";
import { createHash, randomUUID } from "node:crypto";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";
import {
  correlationScores,
  confidenceScores,
  latencySummary,
  scoreReport,
  memoryResult,
  reuseScores,
} from "./scoring.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const agentDir = fileURLToPath(new URL("../cloudflare/agents-starter/", import.meta.url));
const configArgument = process.argv.indexOf("--config");
const config = JSON.parse(
  await readFile(
    new URL(configArgument < 0 ? "config.json" : process.argv[configArgument + 1], import.meta.url),
    "utf8",
  ),
);
const dataset = JSON.parse(await readFile(new URL(config.dataset, import.meta.url), "utf8"));
let review;
try {
  review = JSON.parse(
    await readFile(new URL(config.reviewFile ?? "review.json", import.meta.url), "utf8"),
  );
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const varsPath = `${agentDir}.dev.vars`;
const backupPath = `${varsPath}.benchmark-backup`;
const original = await readFile(varsPath, "utf8");
const vars = parseEnv(original);
const toolsEnv = {
  ...parseEnv(await readFile(`${root}tools-api/.env.example`, "utf8")),
  ...parseEnv(await readFile(`${root}tools-api/.env`, "utf8")),
};
const runId = randomUUID().slice(0, 8);
const namespace = `benchmark-${runId}`;
const base = `http://127.0.0.1:${config.agentPort}`;
const children = [];
const output = {
  runId,
  namespace,
  startedAt: new Date().toISOString(),
  modelProvider: vars.MODEL_PROVIDER,
  model:
    vars[
      {
        google: "GEMINI_AI_MODEL",
        cloudflare: "CLOUDFLARE_AI_MODEL",
        openrouter: "OPENROUTER_AI_MODEL",
      }[vars.MODEL_PROVIDER]
    ],
  datasetVersion: dataset.version,
  scoringVersion: 2,
  datasetSha256: createHash("sha256").update(JSON.stringify(dataset)).digest("hex"),
  mode: "controlled-evidence-replay",
  preflight: {},
  arms: {},
  errors: [],
  configuration: {
    datasetCases: dataset.cases.map((testCase) => ({
      id: testCase.id,
      behavior: testCase.behavior ?? testCase.id,
      alerts: testCase.alerts.length,
    })),
    memoryReuseEnabled: vars.INCIDENT_MEMORY_REUSE_ENABLED === "true",
    memoryReuseMinimumScore: Number(vars.INCIDENT_MEMORY_REUSE_MIN_SCORE),
    correlationMinimumConfidence: Number(vars.CORRELATION_MIN_CONFIDENCE),
    correlationOutputMode: vars.CORRELATION_OUTPUT_MODE,
    correlationScopeLabels: vars.CORRELATION_SCOPE_LABELS,
    localState: "ephemeral (persistState=false)",
    maxConcurrency: Number(vars.LLM_MAX_CONCURRENCY),
    requestTimeoutMs: Number(vars.LLM_REQUEST_TIMEOUT_MS),
    fixtureDelayMs: config.fixtureDelayMs,
    repetitions: config.repetitions ?? 1,
    armOrders: config.armOrders ?? [["withoutMemory", "withMemory"]],
  },
};
let activeCase;
let fixture;
let toolCalls = [];
let restore = false;
let agent;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const quote = (value) => JSON.stringify(String(value));

function start(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: root,
    env: process.env,
    windowsHide: true,
    ...options,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const log = [];
  child.stdout.on("data", (chunk) => log.push(chunk.toString()));
  child.stderr.on("data", (chunk) => log.push(chunk.toString()));
  child.on("error", (error) => log.push(error.message));
  children.push({ child, log });
  return { child, log };
}
async function stop(child) {
  if (child.exitCode !== null) return;
  if (process.platform === "win32")
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
      killer.once("exit", resolve);
      killer.once("error", resolve);
    });
  else child.kill("SIGTERM");
}
async function waitFor(url, ms = 60000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (r.ok) return;
    } catch {}
    await delay(500);
  }
  throw new Error(`Service unavailable: ${url}`);
}
async function api(body) {
  const response = await fetch(`${base}/api/alerts/benchmark`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${vars.ALERT_WEBHOOK_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(config.workflowTimeoutMs),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`Benchmark API ${response.status}: ${JSON.stringify(result)}`);
  return result;
}
function alertPayload(row, index, caseId, arm) {
  return {
    status: "firing",
    fingerprint: `${runId}-${arm}-${caseId}-${index}`,
    startsAt: output.startedAt,
    labels: {
      alertname: row.name,
      namespace: "incident-lab",
      service: "demo-service",
      component: row.component,
      ...(row.route ? { route: row.route } : {}),
      ...(row.component === "database" ? { database: "orders-db" } : {}),
      severity: "warning",
      investigate: "true",
    },
    annotations: { summary: row.summary },
  };
}
function workflowId(alert) {
  return `alert-${createHash("sha256")
    .update(JSON.stringify([alert.fingerprint, alert.startsAt]))
    .digest("hex")}`;
}
async function completed(id) {
  const deadline = Date.now() + config.workflowTimeoutMs;
  while (Date.now() < deadline) {
    const r = await fetch(`${base}/api/alerts/workflows/${id}`, {
      headers: { authorization: `Bearer ${vars.ALERT_WEBHOOK_TOKEN}` },
      signal: AbortSignal.timeout(10000),
    });
    const data = await r.json();
    if (data.status === "complete" || data.status === "errored" || data.status === "terminated")
      return data;
    await delay(config.pollIntervalMs);
  }
  return { id, status: "timeout" };
}
function snapshot(path, body) {
  if (activeCase.evidence && (path === "/logs/query" || path === "/metrics/query")) {
    const entries = Object.entries(activeCase.evidence).filter(([component, evidence]) =>
      path === "/logs/query"
        ? !body.query.includes("component=") || body.query.includes(`component=${component}`)
        : body.query.includes("db_connection") || body.query.includes("db_connections")
          ? component === "database"
          : !body.query.includes("route=") || body.query.includes(JSON.stringify(evidence.route)),
    );
    return {
      status: "success",
      data: {
        resultType: path === "/logs/query" ? "streams" : "vector",
        result: entries.map(([component, evidence]) =>
          path === "/logs/query"
            ? {
                stream: {
                  namespace: "incident-lab",
                  app_kubernetes_io_name: "demo-service",
                  component,
                },
                values: evidence.logs.map((line) => [
                  String(BigInt(Date.now()) * 1000000n),
                  `ERROR simulation=true component=${component} ${line}`,
                ]),
              }
            : {
                metric: { namespace: "incident-lab", service: "demo-service", component },
                value: [
                  Date.now() / 1000,
                  String(
                    body.query.includes("histogram_quantile")
                      ? evidence.latency
                      : evidence.errorRate,
                  ),
                ],
              },
        ),
      },
    };
  }
  const db = activeCase.failureMode.includes("db_problem");
  const dbAuth = activeCase.failureMode.includes("db_auth");
  const renderer = activeCase.failureMode.includes("bad_deploy");
  if (path === "/deployments")
    return {
      name: "demo-service",
      namespace: "incident-lab",
      image: activeCase.image ?? "demo-service:v2",
      env: [{ name: "APP_VERSION", value: activeCase.image === "demo-service:v3" ? "v3" : "v2" }],
      rollout_status: "deployment successfully rolled out",
    };
  if (path === "/alerts")
    return activeCase.alerts.map((a) => ({
      labels: {
        alertname: a.name,
        component: a.component,
        namespace: "incident-lab",
        service: "demo-service",
      },
      annotations: { summary: a.summary },
      status: { state: "active" },
    }));
  if (path === "/metrics/query")
    return {
      status: "success",
      data: {
        resultType: "vector",
        result:
          activeCase.failureMode === "unknown"
            ? []
            : [
                {
                  metric: { namespace: "incident-lab", service: "demo-service" },
                  value: [
                    Date.now() / 1000,
                    String(
                      body.query.includes("histogram_quantile")
                        ? body.query.includes("db_connection")
                          ? db || dbAuth
                            ? 1.2
                            : 0.01
                          : renderer
                            ? 1.1
                            : 0.02
                        : body.query.includes("db_connections")
                          ? db || dbAuth
                            ? 0.8
                            : 0
                          : renderer
                            ? 0.65
                            : 0,
                    ),
                  ],
                },
              ],
      },
    };
  if (path === "/logs/query")
    return {
      status: "success",
      data: {
        resultType: "streams",
        result: [
          {
            stream: { namespace: "incident-lab", app_kubernetes_io_name: "demo-service" },
            values: [
              ...(renderer &&
              (!body.query.includes("component=") ||
                body.query.includes("component=order-renderer"))
                ? [
                    [
                      String(BigInt(Date.now()) * 1000000n),
                      "ERROR component=order-renderer order handler exception after v2; rendering path delayed 1100ms; renderer liveness failed",
                    ],
                  ]
                : []),
              ...(db &&
              (!body.query.includes("component=") || body.query.includes("component=database"))
                ? [
                    [
                      String(BigInt(Date.now()) * 1000000n),
                      "ERROR component=database database=orders-db connection pool exhausted; independent /api/db acquisition timeout; acquisition wait 1200ms",
                    ],
                  ]
                : []),
              ...(dbAuth && body.query.includes("component=database")
                ? [
                    [
                      String(BigInt(Date.now()) * 1000000n),
                      "ERROR component=database database=orders-db authentication failed; permission denied using current credentials; retry backoff 1200ms; no pool exhaustion",
                    ],
                  ]
                : []),
              ...(activeCase.failureMode === "unknown"
                ? [
                    [
                      String(BigInt(Date.now()) * 1000000n),
                      "WARN component=database /api/db failed intermittently; diagnostic detail unavailable; cause undetermined",
                    ],
                  ]
                : []),
            ],
          },
        ],
      },
    };
  throw new Error(`Unexpected fixture path ${path}`);
}
async function arm(name, memoryEnabled, repetition = 0) {
  const rows = output.arms[name]?.rows ?? [],
    investigations = output.arms[name]?.investigations ?? [],
    quality = output.arms[name]?.quality ?? [];
  for (const originalCase of dataset.cases) {
    const testCase = { ...originalCase, id: `${originalCase.id}-r${repetition + 1}` };
    activeCase = testCase;
    const alerts = testCase.alerts.map((row, i) => alertPayload(row, i, testCase.id, name));
    const started = Date.now();
    const result = await api({
      operation: "run",
      agentName: `benchmark-${runId}-${name}-${testCase.id}`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-"),
      memoryEnabled,
      alerts,
    });
    const seen = new Set();
    result.correlations.forEach((decision, i) => {
      const incident = testCase.alerts[i].incident;
      rows.push({
        alertId: alerts[i].fingerprint,
        caseId: testCase.id,
        incident,
        workflowId: decision.correlated ? decision.investigationId : workflowId(alerts[i]),
        expectedNew: !seen.has(incident),
        correlated: decision.correlated,
        confidence: decision.confidence,
        modelConfidence: decision.modelConfidence,
        modelCorrelated: decision.modelCorrelated,
        outcome: decision.outcome,
        formatFallback: decision.formatFallback,
        latencyMs: decision.latencyMs,
        reason: decision.reason,
      });
      seen.add(incident);
    });
    await Promise.all(
      result.workflows.map(async (id) => {
        const done = await completed(id);
        const incident =
          testCase.alerts[alerts.findIndex((alert) => workflowId(alert) === id)].incident;
        const investigation = {
          caseId: testCase.id,
          id,
          status: done.status,
          error: done.error,
          output: done.output,
          expectedReuse: testCase.expectedReuse[incident],
          observedTimeToRcaMs: Date.now() - started,
        };
        const expectedMemoryId = output.memorySeeds?.find(
          (seed) => seed.title === testCase.incidents[incident].expectedMemoryTitle,
        )?.id;
        investigation.memory = memoryResult(investigation, expectedMemoryId, memoryEnabled);
        investigations.push(investigation);
      }),
    );
    for (const [incident, rubric] of Object.entries(testCase.incidents)) {
      const first = rows.find((r) => r.caseId === testCase.id && r.incident === incident);
      const run = investigations.find((r) => r.id === first.workflowId);
      const historical = run?.output?.historicalContext;
      let retrieval;
      try {
        retrieval = typeof historical === "string" ? JSON.parse(historical) : historical;
      } catch {}
      const matches = retrieval?.matches ?? [];
      const relevant = matches.filter((m) =>
        (m.metadata?.labels ?? []).some((l) => rubric.memoryLabels.includes(l)),
      );
      quality.push({
        caseId: testCase.id,
        incident,
        workflowId: first.workflowId,
        success: run?.status === "complete",
        expectedReuse: testCase.expectedReuse[incident],
        reused: run?.output?.investigationMode === "historical-reuse",
        ...scoreReport(run?.output?.report ?? "", { ...dataset.evaluation, ...rubric }),
        retrievalDisabled: retrieval?.disabled === true,
        retrievalUnavailable: retrieval?.unavailable === true,
        retrieved: matches.length,
        relevant: relevant.length,
        irrelevant: matches.length - relevant.length,
      });
    }
    console.log(
      `${name}/${testCase.id}: ${result.workflows.length} workflows, ${result.correlations.length} decisions`,
    );
    output.arms[name] = {
      rows,
      investigations,
      quality,
      correlation: correlationScores(rows),
      confidence: confidenceScores(rows),
      toolCalls: toolCalls.filter((call) => call.arm === name),
      rootCauseAccuracy: quality.filter((q) => q.rootCause).length / quality.length,
      remediationAccuracy: quality.filter((q) => q.remediation).length / quality.length,
      successfulInvestigationRate:
        investigations.filter((i) => i.status === "complete").length / investigations.length,
    };
    output.arms[name].caseToolCalls = [...new Set(rows.map((row) => row.caseId))].map((caseId) => ({
      caseId,
      count: toolCalls.filter((call) => call.arm === name && call.caseId === caseId).length,
    }));
    await writeFile(
      new URL(config.resultFile, import.meta.url),
      JSON.stringify({ ...output, partial: { name, rows, investigations, quality } }, null, 2),
    );
  }
}

function report() {
  const pct = (value) => (value == null ? "N/A" : `${(100 * value).toFixed(1)}%`);
  const seconds = (value) => (value == null ? "N/A" : `${(value / 1000).toFixed(2)} s`);
  const requests = (output.llmRequests ?? []).filter((item) => item.event === "llm.request");
  function stats(name) {
    const arm = output.arms[name];
    if (!arm) return null;
    const ids = new Set(arm.investigations.map((item) => item.id));
    const calls = requests.filter((item) =>
      item.operation === "rca"
        ? ids.has(item.id)
        : item.operation === "correlation" && item.id.startsWith(`${output.runId}-${name}-`),
    );
    const finished = arm.investigations.filter((item) => item.status === "complete");
    const reusable = finished.filter(
      (item) => item.output?.investigationMode === "historical-reuse",
    );
    const safetyCases = arm.investigations.filter((item) => item.expectedReuse === false);
    const recurrenceCases = arm.investigations.filter((item) => item.expectedReuse === true);
    const reuse = reuseScores(
      arm.investigations.map((item) => ({
        memoryEnabled: name === "withMemory",
        expectedReuse: item.expectedReuse,
        actualReuse:
          item.output?.investigationMode === "historical-reuse"
            ? true
            : item.output?.investigationMode === "full"
              ? false
              : null,
        reuseCorrect: item.memory?.reuseCorrect ?? null,
      })),
    );
    return {
      arm,
      finished,
      reusable,
      reuse,
      unsupported: arm.quality.filter((item) => item.unsupportedRemediation === true).length,
      unsupportedAssessed: arm.quality.filter(
        (item) => typeof item.unsupportedRemediation === "boolean",
      ).length,
      toolsAvoided: reusable.reduce(
        (sum, item) => sum + (item.output?.reuseTelemetry?.skippedToolHttpCalls ?? 0),
        0,
      ),
      rcaCallsAvoided: reusable.filter(
        (item) => item.output?.reuseTelemetry?.rcaLlmSkipped === true,
      ).length,
      workflowTiming: latencySummary(finished.map((item) => item.output?.timeToRcaMs)),
      tools: (output.toolCalls ?? toolCalls).filter((item) => item.arm === name).length,
      calls,
      rca: calls.filter((item) => item.operation === "rca"),
      correlation: calls.filter((item) => item.operation === "correlation"),
      falseReuse: safetyCases.filter(
        (item) => item.output?.investigationMode === "historical-reuse",
      ).length,
      safetyCases: safetyCases.length,
      unknownSafety: safetyCases.filter((item) => item.status !== "complete").length,
      recurrenceHits: recurrenceCases.filter((item) => item.memory?.reuseCorrect === true).length,
      recurrenceCases: recurrenceCases.length,
      formatPasses: finished.filter(
        (item) =>
          scoreReport(item.output?.report ?? "", { rootPatterns: [], remediationPatterns: [] })
            .reportFormat,
      ).length,
      observation: latencySummary(finished.map((item) => item.observedTimeToRcaMs)),
    };
  }
  const names = ["withoutMemory", "withMemory"];
  const data = names.map(stats);
  const lines = [
    `# ${config.reportTitle ?? "TraceRoot Benchmark Results"}`,
    ...(review?.runId === output.runId && review.summary ? ["", review.summary] : []),
    "",
    `Run: ${output.runId}. Window: ${output.startedAt} to ${output.finishedAt ?? "in progress"}.`,
    `Model: ${output.modelProvider}/${output.model}. Dataset: v${output.datasetVersion}, SHA-256 ${output.datasetSha256}.`,
    `Memory reuse: ${output.configuration.memoryReuseEnabled}; similarity threshold ${output.configuration.memoryReuseMinimumScore}. Correlation confidence threshold ${output.configuration.correlationMinimumConfidence}.`,
    "",
    "## Results",
    "",
    "| Metric | Without memory | With memory |",
    "| --- | ---: | ---: |",
  ];
  const row = (label, fn) =>
    lines.push(`| ${label} | ${data.map((item) => (item ? fn(item) : "N/A")).join(" | ")} |`);
  row(
    "Alerts / true incident instances",
    (item) => `${item.arm.rows.length} / ${item.arm.quality.length}`,
  );
  row("**Correlation quality**", () => "");
  row("Alert mapping accuracy", (item) => pct(item.arm.correlation.mappingAccuracy));
  row("Incorrect merge pairs / cross-incident pairs", (item) =>
    item.arm.correlation.mergePairs.join(" / "),
  );
  row("Incorrect split pairs / related pairs", (item) =>
    item.arm.correlation.splitPairs.join(" / "),
  );
  row(
    "Completed / created workflows",
    (item) => `${item.finished.length} / ${item.arm.investigations.length}`,
  );
  row("**RCA and remediation quality**", () => "");
  row("RCA accuracy (rubric proxy)", (item) => pct(item.arm.rootCauseAccuracy));
  row("Remediation accuracy (rubric proxy)", (item) => pct(item.arm.remediationAccuracy));
  row("Unsupported remediation rate (rule-detected)", (item) =>
    pct(item.unsupportedAssessed ? item.unsupported / item.unsupportedAssessed : null),
  );
  row(
    "Unsupported fixes / assessed representative reports",
    (item) => `${item.unsupported} / ${item.unsupportedAssessed}`,
  );
  row(
    "Root cause keyword passes / incident instances",
    (item) => `${item.arm.quality.filter((q) => q.rootCause).length} / ${item.arm.quality.length}`,
  );
  row(
    "Fix keyword passes / incident instances",
    (item) =>
      `${item.arm.quality.filter((q) => q.remediation).length} / ${item.arm.quality.length}`,
  );
  row(
    "Three-section format passes / completed workflows",
    (item) => `${item.formatPasses} / ${item.finished.length}`,
  );
  row("**Retrieval and reuse quality**", () => "");
  row(
    "Investigations with retrieved matches",
    (item) =>
      item.arm.investigations.filter((run) => run.memory?.retrievalReturnedMatch === true).length,
  );
  row("Reuse precision (correct incident ID required)", (item) => pct(item.reuse.precision));
  row("Reuse recall (per expected-positive investigation)", (item) => pct(item.reuse.recall));
  row("False reuse rate (per expected-negative investigation)", (item) =>
    pct(item.reuse.falseReuseRate),
  );
  row("Unknown reuse decisions / correctness", (item) => item.reuse.unknownDecisions);
  row(
    "Reused / completed workflows",
    (item) => `${item.reusable.length} / ${item.finished.length}`,
  );
  row(
    "Known recurrence reuse hits / created recurrence workflows",
    (item) => `${item.recurrenceHits} / ${item.recurrenceCases}`,
  );
  row(
    "False reuse / created fallback-test workflows",
    (item) => `${item.falseReuse} / ${item.safetyCases}`,
  );
  row("Fallback-test workflows with unknown outcome", (item) => item.unknownSafety);
  row("**Efficiency**", () => "");
  row(
    "Tool calls avoided through historical reuse (planned, excludes retries)",
    (item) => item.toolsAvoided,
  );
  row("RCA LLM calls avoided through historical reuse", (item) => item.rcaCallsAvoided);
  row("Workflow time-to-RCA median", (item) => seconds(item.workflowTiming.medianMs));
  row("Workflow time-to-RCA p95", (item) => seconds(item.workflowTiming.p95Ms));
  row("Actual tool HTTP requests (including retries)", (item) => item.tools);
  row("Tool HTTP requests / created workflow", (item) =>
    item.arm.investigations.length
      ? (item.tools / item.arm.investigations.length).toFixed(2)
      : "N/A",
  );
  row(
    "RCA LLM attempts / successful",
    (item) => `${item.rca.length} / ${item.rca.filter((call) => call.ok).length}`,
  );
  row(
    "Correlation LLM attempts / successful",
    (item) => `${item.correlation.length} / ${item.correlation.filter((call) => call.ok).length}`,
  );
  row("RCA generation skipped by reuse", (item) => item.reusable.length);
  row("Batch-to-report median", (item) => seconds(item.observation.medianMs));
  row("Batch-to-report p95", (item) => seconds(item.observation.p95Ms));
  if (data.every(Boolean)) {
    lines.push(
      "",
      "## Memory Interpretation",
      "",
      `Observed total tool-request change: ${data[0].tools - data[1].tools} fewer with memory. RCA-attempt change: ${data[0].rca.length - data[1].rca.length} fewer. These arm totals also reflect any differences in workflow grouping and retries; do not attribute all changes to reuse.`,
      "No-memory disables retrieval and reuse. Reuse saves the RCA generation request, not embeddings or alert correlation. A shorter investigation can finish before later alerts arrive, reducing active correlation candidates and increasing split workflows. Inspect grouping as well as per-workflow savings.",
    );
  }
  lines.push(
    "",
    "## Application LLM Timing",
    "",
    "Successful call durations include response handling, exclude queue wait, and are not Gateway inference-only latency.",
  );
  for (const [index, name] of names.entries())
    for (const operation of ["correlation", "rca"]) {
      const calls = data[index]?.[operation]?.filter((item) => item.ok) ?? [];
      const timing = latencySummary(calls.map((item) => item.durationMs));
      lines.push(
        `- ${name}/${operation}: ${calls.length} successful calls; median ${seconds(timing.medianMs)}, p95 ${seconds(timing.p95Ms)}.`,
      );
    }
  lines.push(
    "",
    "## Gateway Accounting",
    "",
    "Pending the matching AI Gateway export. Tokens, cost, Gateway request durations and Gateway retry counts are not estimated from application timing. Intentional reuse produces no RCA Gateway request; missing expected calls are reported separately by the analyzer.",
    "",
    "## Scope And Limitations",
    "",
    `Controlled evidence replay with real LLMs, local Workflows and remote Vectorize; ${output.configuration.repetitions} repetitions in AB/BA order. Case types: ${(output.configuration.datasetCases ?? []).map((testCase) => testCase.behavior).join(", ") || "see saved dataset version"}. Known recurrence memories contain explicit benchmark-reviewed rules; this is assisted replay, not production-generalization accuracy.`,
    `Fixture evidence calls each wait ${output.configuration.fixtureDelayMs / 1000} seconds. Batch-to-report is a polling observation that includes intake, fixture delays and queue wait; it is not pure model latency. Completed-only timing can hide failure: inspect completion counts.`,
    "RCA/fix accuracy uses section-specific patterns, unknown-cause expectations and explicit contradictory-cause/unsupported-action rules on one representative workflow per true incident. These are transparent proxies, not expert semantic/factual accuracy; negation and conditional wording still need review. Failed/malformed reports stay in accuracy denominators; unsupported-rate coverage excludes unassessable reports and is shown explicitly. Existing saved results are not rescored. No repairs were executed.",
    "Reuse precision checks the reused incident ID against the seeded ground-truth incident, not just expected reuse eligibility. Recall is per created expected-positive investigation and conservatively includes unavailable outcomes as missed positives. False reuse rate is conditional on expected-negative investigations and is unknown if any negative decision is unavailable. Disabled-memory arms are not scored for reuse. Similarity is retrieval similarity, never causal confidence. Top retrieval ID/score can differ from the selected reused incident; complete retrieved matches remain in historicalContext.",
    "Workflow time-to-RCA measures Workflow event timestamp through report publication, including retries and evidence collection, not recovery. Batch observations additionally include admission and polling. Avoided tool counts are the known three-step shortcut, not a counterfactual estimate of avoided retries. Embedding/search and correlation are not avoided; use actual HTTP/LLM logs and the matching Gateway export for observed totals.",
    "False reuse is checked on changed-image, different-cause and insufficient-evidence workflows. Low recurrence hit rate can result from similarity filtering, indexing or rule validation; it is not silently tuned after execution. Retrieval failure must not be counted as a safe success.",
    "Tool counts are actual fixture HTTP requests including retries, not embedding/Vectorize calls. Isolated memory seeds and preflight overhead are separate from scored workflows. No live failure injection or ordinary memory-namespace changes occur.",
    "",
    "## Prerequisites And Errors",
    "",
    `Live smoke test: ${JSON.stringify(output.preflight)}.`,
    ...(output.errors.length
      ? output.errors.map((error) => `- ${error}`)
      : ["Runner errors: none."]),
    "",
    "## Raw Evidence",
    "",
    `Raw decisions, reports, scopes, expected reuse eligibility, model events and actual tool calls: [results](${config.resultFile}).`,
    "Reproduction instructions and metric definitions: [benchmark guide](guide.md). Final datasets: [small](dataset.json) and [large](dataset-large.json).",
  );
  if (review?.runId === output.runId) {
    if (review.sectionsMarkdown) {
      lines.push("", review.sectionsMarkdown);
    } else {
      lines.push("", "## Qualitative Review", "", review.method);
      for (const finding of review.findings)
        lines.push(`- ${finding.finding} Source workflow: ${finding.workflowId}.`);
    }
  }
  return lines.join("\n") + "\n";
}

if (process.argv.includes("--report-only")) {
  Object.assign(
    output,
    JSON.parse(await readFile(new URL(config.resultFile, import.meta.url), "utf8")),
  );
  await writeFile(new URL(config.reportFile, import.meta.url), report());
  console.log("Report regenerated from existing raw results; no services or model calls started.");
  process.exit(0);
}

try {
  try {
    const previousPath = new URL(config.resultFile, import.meta.url);
    const previous = JSON.parse(await readFile(previousPath, "utf8"));
    const history = new URL("history/", import.meta.url);
    await mkdir(history, { recursive: true });
    await copyFile(previousPath, new URL(`${previous.runId}.json`, history));
    await copyFile(
      new URL(config.reportFile, import.meta.url),
      new URL(`${previous.runId}.md`, history),
    );
    output.previousRun = {
      runId: previous.runId,
      raw: `benchmarks/history/${previous.runId}.json`,
      scored: Object.keys(previous.arms ?? {}).length > 0,
    };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  try {
    await access(backupPath);
    throw new Error("Existing benchmark env backup found; restore/check it before running.");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  if (!vars.ALERT_WEBHOOK_TOKEN)
    throw new Error("Configure ALERT_WEBHOOK_TOKEN in .dev.vars first.");
  for (const port of [config.agentPort, config.toolApiPort, config.fixturePort]) {
    await new Promise((resolve, reject) => {
      const probe = createPortProbe();
      probe.once("error", () =>
        reject(
          new Error(
            `Benchmark port ${port} is already in use; stop that service or change config.json.`,
          ),
        ),
      );
      probe.listen(port, "127.0.0.1", () => probe.close(resolve));
    });
  }
  await waitFor("http://localhost:8080/healthz", 5000);
  output.preflight.demoService =
    "Existing kind deployment /healthz reachable (HTTP 200); not proof of application health";
  await waitFor("http://localhost:9090/-/ready", 5000);
  output.preflight.prometheus = "ready";
  for (const [service, port] of [
    ["kube-prometheus-stack-alertmanager", 9093],
    ["loki", 3100],
  ]) {
    try {
      await waitFor(`http://localhost:${port}/${port === 9093 ? "-/ready" : "ready"}`, 1000);
    } catch {
      start("kubectl", [
        "--context",
        toolsEnv.KUBECONFIG_CONTEXT,
        "port-forward",
        "-n",
        "monitoring",
        `svc/${service}`,
        `${port}:${port}`,
      ]);
      await waitFor(`http://localhost:${port}/${port === 9093 ? "-/ready" : "ready"}`);
    }
    output.preflight[service] = "ready";
  }
  start(
    config.python,
    [
      "-m",
      "uvicorn",
      "tools-api.app.main:app",
      "--host",
      "127.0.0.1",
      "--port",
      String(config.toolApiPort),
    ],
    { env: { ...process.env, ...toolsEnv } },
  );
  await waitFor(`http://127.0.0.1:${config.toolApiPort}/healthz`);
  for (const path of ["/deployments", "/alerts"]) {
    const r = await fetch(`http://127.0.0.1:${config.toolApiPort}${path}`, {
      headers: { authorization: `Bearer ${toolsEnv.TOOL_API_TOKEN}` },
    });
    output.preflight[`tools${path}`] = r.status;
    if (!r.ok) throw new Error(`Live tools ${path} returned ${r.status}`);
  }
  const liveMetric = await fetch(`http://127.0.0.1:${config.toolApiPort}/metrics/query`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${toolsEnv.TOOL_API_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ query: "up" }),
  });
  output.preflight.liveMetrics = liveMetric.status;
  const liveLogs = await fetch(`http://127.0.0.1:${config.toolApiPort}/logs/query`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${toolsEnv.TOOL_API_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ query: '{namespace="incident-lab"}', limit: 5, since_seconds: 1800 }),
  });
  output.preflight.liveLogs = liveLogs.status;
  if (!liveMetric.ok || !liveLogs.ok) throw new Error("Live metric/log evidence unavailable");
  fixture = createServer(async (req, res) => {
    try {
      if (req.headers.authorization !== `Bearer ${vars.TOOL_API_TOKEN}`) {
        res.writeHead(401).end();
        return;
      }
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const data = snapshot(req.url, raw ? JSON.parse(raw) : {});
      toolCalls.push({ path: req.url, caseId: activeCase.id, arm: output.currentArm });
      await delay(config.fixtureDelayMs);
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(data));
    } catch (error) {
      res.writeHead(500).end(JSON.stringify({ error: error.message }));
    }
  });
  await new Promise((resolve, reject) => {
    fixture.once("error", reject);
    fixture.listen(config.fixturePort, "127.0.0.1", resolve);
  });
  const overrides = {
    BENCHMARK_ENABLED: "true",
    ALERT_WEBHOOK_ENABLED: "true",
    ALERT_WEBHOOK_ALERT_NAMES: "BenchmarkOnly",
    INCIDENT_MEMORY_ENABLED: "true",
    INCIDENT_MEMORY_NAMESPACE: namespace,
    TOOL_API_BASE_URL: `http://127.0.0.1:${config.fixturePort}`,
  };
  await writeFile(backupPath, original);
  restore = true;
  await writeFile(
    varsPath,
    original +
      "\n" +
      Object.entries(overrides)
        .map(([key, value]) => `${key}=${quote(value)}`)
        .join("\n") +
      "\n",
  );
  agent = start(
    process.execPath,
    [
      `${agentDir}node_modules/vite/bin/vite.js`,
      "--host",
      "127.0.0.1",
      "--port",
      String(config.agentPort),
      "--strictPort",
    ],
    { cwd: agentDir, env: { ...process.env, BENCHMARK_ENABLED: "true" } },
  );
  await waitFor(base, 90000);
  output.preflight.agent = "ready";
  output.preflight.model = await api({ operation: "model-check" });
  output.memorySeeds = [];
  for (const incident of dataset.memories) {
    const remembered = await api({ operation: "remember", incident });
    output.memorySeeds.push({ id: remembered.id, title: incident.title });
  }
  const deadline = Date.now() + config.memoryIndexWaitMs;
  let indexed = false;
  while (Date.now() < deadline) {
    const searches = [];
    for (const memory of dataset.memories)
      searches.push(await api({ operation: "search", query: memory.title }));
    if (
      searches.every((search, index) =>
        (search.matches ?? []).some(
          (m) => m.namespace === namespace && m.metadata?.title === dataset.memories[index].title,
        ),
      )
    ) {
      indexed = true;
      break;
    }
    await delay(3000);
  }
  if (!indexed)
    throw new Error("Benchmark memories did not become queryable in the isolated namespace.");
  for (let repetition = 0; repetition < (config.repetitions ?? 1); repetition++) {
    const order = config.armOrders?.[repetition] ?? ["withoutMemory", "withMemory"];
    for (const name of order) {
      output.currentArm = name;
      await arm(name, name === "withMemory", repetition);
    }
  }
  output.llmRequests = agent.log
    .join("")
    .split("\n")
    .flatMap((line) => {
      try {
        const event = JSON.parse(line);
        return event.event === "llm.request" || event.event === "correlation.failure"
          ? [event]
          : [];
      } catch {
        return [];
      }
    });
  output.agentErrors = agent.log
    .join("")
    .split("\n")
    .filter((line) => line.includes('"event":"alert_webhook.failure"'));
} catch (error) {
  output.errors.push(error.message);
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (agent)
    output.llmRequests = agent.log
      .join("")
      .split("\n")
      .flatMap((line) => {
        try {
          const event = JSON.parse(line);
          return event.event === "llm.request" || event.event === "correlation.failure"
            ? [event]
            : [];
        } catch {
          return [];
        }
      });
  for (const { child } of children.reverse()) await stop(child);
  if (fixture) await new Promise((resolve) => fixture.close(resolve));
  if (restore) {
    await writeFile(varsPath, original);
    const { unlink } = await import("node:fs/promises");
    await unlink(backupPath);
  }
  delete output.currentArm;
  output.finishedAt = new Date().toISOString();
  output.toolCalls = toolCalls;
  await writeFile(
    new URL(config.resultFile, import.meta.url),
    JSON.stringify(output, null, 2) + "\n",
  );
  await writeFile(new URL(config.reportFile, import.meta.url), report());
  console.log(`Results written; .dev.vars restored. Namespace: ${namespace}`);
}
