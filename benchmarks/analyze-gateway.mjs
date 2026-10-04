import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { latencySummary } from "./scoring.mjs";

const path = process.argv[2];
if (!path) throw new Error("Usage: node benchmarks/analyze-gateway.mjs <export.json>");
const configArgument = process.argv.indexOf("--config");
const config = JSON.parse(
  await readFile(
    new URL(configArgument < 0 ? "config.json" : process.argv[configArgument + 1], import.meta.url),
    "utf8",
  ),
);
const raw = await readFile(path, "utf8");
const records = JSON.parse(raw);
if (!Array.isArray(records)) throw new Error("Expected an array of Gateway events.");
const benchmark = JSON.parse(await readFile(new URL(config.resultFile, import.meta.url), "utf8"));
const unique = [
  ...new Map(
    records.map((event, index) => [
      event.$metadata?.requestId ?? event.$metadata?.id ?? `row-${index}`,
      event,
    ]),
  ).values(),
];
const workflows = new Map();
const alerts = new Map();
for (const [arm, data] of Object.entries(benchmark.arms)) {
  for (const investigation of data.investigations) workflows.set(investigation.id, arm);
  const caseIndices = new Map();
  for (const row of data.rows) {
    const index = caseIndices.get(row.caseId) ?? 0;
    alerts.set(row.alertId ?? `${benchmark.runId}-${arm}-${row.caseId}-${index}`, arm);
    caseIndices.set(row.caseId, index + 1);
  }
}
function attribution(event) {
  const metadata = event.source?.request?.metadata;
  if (metadata?.operation === "rca" && workflows.has(metadata.workflowId))
    return { arm: workflows.get(metadata.workflowId), operation: "rca" };
  if (metadata?.operation === "correlation" && alerts.has(metadata.alertId))
    return { arm: alerts.get(metadata.alertId), operation: "correlation" };
  return null;
}
const attributed = unique.filter((event) => event.dataset === "ai-gateway" && attribution(event));
const inWindow = unique.filter(
  (event) =>
    event.dataset === "ai-gateway" &&
    Date.parse(event.timestamp) >= Date.parse(benchmark.startedAt) &&
    Date.parse(event.timestamp) <= Date.parse(benchmark.finishedAt),
);
const embeddings = inWindow.filter(
  (event) =>
    event.source?.request?.task === "embeddings" ||
    event.source?.request?.path?.includes(":embedContent"),
);
function summarize(events) {
  const successful = events.filter((event) => event.source?.response?.status_code === 200);
  const statuses = {};
  for (const event of events) {
    const status = event.source?.response?.status_code ?? "unknown";
    statuses[status] = (statuses[status] ?? 0) + 1;
  }
  return {
    requests: events.length,
    successful: successful.length,
    statuses,
    latencyMs: latencySummary(
      successful.map((event) => event.source.response.duration_ms).filter(Number.isFinite),
    ),
    inputTokens: successful.reduce(
      (total, event) => total + (event.source.response.usage?.input_tokens ?? 0),
      0,
    ),
    outputTokens: successful.reduce(
      (total, event) => total + (event.source.response.usage?.output_tokens ?? 0),
      0,
    ),
    estimatedCostUsd: successful.reduce(
      (total, event) => total + (event.source.response.cost_usd ?? 0),
      0,
    ),
    retryCounts: [...new Set(events.map((event) => event.source?.response?.retry_count ?? null))],
    cachedRequests: events.filter((event) => event.source?.response?.cached === true).length,
  };
}
const summary = {
  runId: benchmark.runId,
  sourceFile: path,
  sourceSha256: createHash("sha256").update(raw).digest("hex"),
  window: { start: benchmark.startedAt, end: benchmark.finishedAt },
  exportRecords: records.length,
  uniqueRecords: unique.length,
  inWindow: inWindow.length,
  exactTextRecords: attributed.length,
  excludedRecords: unique.length - attributed.length,
  textGeneration: summarize(attributed),
  coverage: Object.fromEntries(
    Object.entries(benchmark.arms).map(([arm, data]) => [
      arm,
      {
        expectedCorrelations: data.rows.filter((row) => row.outcome !== "bypass").length,
        recordedCorrelations: attributed.filter(
          (event) =>
            attribution(event).arm === arm && attribution(event).operation === "correlation",
        ).length,
        completedWorkflows: data.investigations.filter(
          (investigation) => investigation.status === "complete",
        ).length,
        recordedRcas: attributed.filter(
          (event) => attribution(event).arm === arm && attribution(event).operation === "rca",
        ).length,
        intentionallySkippedRcas: data.investigations.filter(
          (item) => item.output?.investigationMode === "historical-reuse",
        ).length,
        applicationRcaAttempts: (benchmark.llmRequests ?? []).filter(
          (item) =>
            item.event === "llm.request" &&
            item.operation === "rca" &&
            data.investigations.some((workflow) => workflow.id === item.id),
        ).length,
      },
    ]),
  ),
  operations: Object.fromEntries(
    ["correlation", "rca"].map((operation) => [
      operation,
      summarize(attributed.filter((event) => attribution(event).operation === operation)),
    ]),
  ),
  arms: Object.fromEntries(
    Object.keys(benchmark.arms).map((arm) => [
      arm,
      {
        overall: summarize(attributed.filter((event) => attribution(event).arm === arm)),
        operations: Object.fromEntries(
          ["correlation", "rca"].map((operation) => [
            operation,
            summarize(
              attributed.filter(
                (event) =>
                  attribution(event).arm === arm && attribution(event).operation === operation,
              ),
            ),
          ]),
        ),
      },
    ]),
  ),
  embeddingsWindowOnly: summarize(embeddings),
  warnings: [
    "Text calls use workflow ID or run/arm alert ID metadata, not time alone. Preflight and earlier attempts are excluded.",
    "Embedding calls have no run/arm metadata; timestamp attribution includes possible seed/search/overhead or unrelated calls. Zero logged usage/cost is missing accounting, not proof of free embeddings.",
    "Gateway retry_count is not SDK/Workflow retries. Cost is logged estimated successful-request cost, not an audited invoice.",
    "Memory RCA costs include all workflows, including erroneous splits; the two arms do not provide statistical evidence of generalization.",
  ],
};
const summaryName = config.gatewaySummaryFile ?? "gateway-summary.json";
await writeFile(new URL(summaryName, import.meta.url), JSON.stringify(summary, null, 2) + "\n");
const seconds = (value) => (value == null ? "N/A" : (value / 1000).toFixed(2));
const lines = [
  "## AI Gateway Export Analysis",
  "",
  `Export: \`${path.split(/[\\/]/).at(-1)}\`; SHA-256 recorded in \`benchmarks/${summaryName}\`. ${records.length} records (${unique.length} unique); ${attributed.length} text requests match run ${benchmark.runId} by metadata. Earlier runs/preflight are excluded.`,
  "",
  "| Arm / operation | Requests / HTTP 200 | Median | p95 | Input / output tokens | Estimated USD |",
  "| --- | ---: | ---: | ---: | ---: | ---: |",
];
for (const [arm, data] of Object.entries(summary.arms))
  for (const [operation, stats] of Object.entries(data.operations)) {
    lines.push(
      `| ${arm} / ${operation} | ${stats.requests} / ${stats.successful} | ${seconds(stats.latencyMs.medianMs)} s | ${seconds(stats.latencyMs.p95Ms)} s | ${stats.inputTokens} / ${stats.outputTokens} | $${stats.estimatedCostUsd.toFixed(6)} |`,
    );
  }
lines.push(
  "",
  `Exact-attributed text total: **${summary.textGeneration.inputTokens} input tokens, ${summary.textGeneration.outputTokens} output tokens, $${summary.textGeneration.estimatedCostUsd.toFixed(6)} estimated cost**. Status counts: \`${JSON.stringify(summary.textGeneration.statuses)}\`; Gateway retry counts: \`${JSON.stringify(summary.textGeneration.retryCounts)}\`; cached requests: ${summary.textGeneration.cachedRequests}.`,
  "",
  `Within the run window, ${embeddings.length} embedding requests had status counts \`${JSON.stringify(summary.embeddingsWindowOnly.statuses)}\`, median ${seconds(summary.embeddingsWindowOnly.latencyMs.medianMs)} s and p95 ${seconds(summary.embeddingsWindowOnly.latencyMs.p95Ms)} s. They cannot be allocated reliably by arm, and their logged zero usage/cost is not reliable billing evidence.`,
  "",
  ...summary.warnings.map((warning) => `- ${warning}`),
  "",
  `Coverage: \`${JSON.stringify(summary.coverage)}\`. Historical reuse intentionally emits no RCA request. Compare exported RCA counts with application attempts, not completed workflow counts. Do not infer failures from missing export records or compare full-arm token totals as if coverage were equal.`,
  "",
  "Gateway duration is the exported request duration, not queue-inclusive application latency or necessarily pure inference time. Quantiles use linear interpolation. Accuracy and memory-benefit conclusions remain unchanged; this export does not score RCA correctness.",
);
const reportPath = new URL(config.reportFile, import.meta.url);
const noMemory = summary.arms.withoutMemory;
const memory = summary.arms.withMemory;
const completeCoverage = Object.values(summary.coverage).every(
  (coverage) =>
    coverage.expectedCorrelations === coverage.recordedCorrelations &&
    coverage.applicationRcaAttempts === coverage.recordedRcas,
);
if (noMemory && memory && completeCoverage) {
  const a = noMemory.overall,
    b = memory.overall;
  const percentChange = (before, after) =>
    before ? `${(100 * (after / before - 1)).toFixed(2)}%` : "N/A";
  lines.push(
    "",
    "### Memory Accounting",
    "",
    `Text-call coverage is complete in both arms. Without memory: ${a.requests} requests, ${a.inputTokens} input / ${a.outputTokens} output tokens, $${a.estimatedCostUsd.toFixed(6)} estimated cost. With memory: ${b.requests} requests, ${b.inputTokens} input / ${b.outputTokens} output tokens, $${b.estimatedCostUsd.toFixed(6)} estimated cost.`,
    "",
    `With-memory changes relative to without-memory: input tokens ${percentChange(a.inputTokens, b.inputTokens)}; output tokens ${percentChange(a.outputTokens, b.outputTokens)}; total text tokens ${percentChange(a.inputTokens + a.outputTokens, b.inputTokens + b.outputTokens)}; logged text cost ${percentChange(a.estimatedCostUsd, b.estimatedCostUsd)}. Request counts and token totals are measured separately; fewer requests do not necessarily imply fewer tokens.`,
    "",
    "These are observed arm totals, not matched-workflow causal savings: the arms created different numbers of workflows and generated different reports. Embedding-inclusive cost remains unknown. Grouping accuracy and the documented historical-anchoring error are unchanged by this accounting.",
  );
}
let report = await readFile(reportPath, "utf8");
report = report.split("## AI Gateway Export Analysis")[0].trimEnd();
report = report.replace(
  "AI Gateway token, cost, model latency and retry analytics are excluded pending the user's export.",
  "AI Gateway measurements from the matching export are included below, separately from application timing.",
);
report = report.replace(
  "Pending the matching AI Gateway export.",
  "The matching AI Gateway export is analyzed below.",
);
report = report.replace(
  "Provider token/cost accounting and Gateway inference latency require a matching export.",
  "Matching Gateway token/cost accounting and exported request durations are included below.",
);
await writeFile(reportPath, report + "\n\n" + lines.join("\n") + "\n");
console.log(JSON.stringify(summary, null, 2));
