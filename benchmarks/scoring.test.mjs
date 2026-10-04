import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  correlationScores,
  confidenceScores,
  latencySummary,
  scoreReport,
  memoryResult,
  reuseScores,
} from "./scoring.mjs";
test("scores perfect separation, false merges, and splits without label leakage", () => {
  const rows = ["a", "a", "b", "b", "a"].map((incident, i) => ({
    caseId: "mixed",
    incident,
    workflowId: incident,
    expectedNew: i === 0 || i === 2,
    correlated: i !== 0 && i !== 2,
  }));
  const perfect = correlationScores(rows);
  assert.equal(perfect.mappingAccuracy, 1);
  assert.equal(perfect.incorrectMergeRate, 0);
  assert.equal(perfect.incorrectSplitRate, 0);
  assert.equal(perfect.workflowReduction, 0.6);
  assert.equal(
    correlationScores(rows.map((r) => ({ ...r, workflowId: "one" }))).incorrectMergeRate,
    1,
  );
  const split = correlationScores(rows.map((r, i) => ({ ...r, workflowId: String(i) })));
  assert.equal(split.incorrectSplitRate, 1);
  assert.equal(split.mappingAccuracy, 0.4);
});

test("confidence does not replace ground truth and latency includes failures", () => {
  const result = confidenceScores([
    {
      expectedNew: false,
      modelCorrelated: true,
      modelConfidence: 0.9,
      latencyMs: 100,
      outcome: "model",
    },
    {
      expectedNew: true,
      modelCorrelated: true,
      modelConfidence: 0.9,
      latencyMs: 200,
      outcome: "model",
    },
    { expectedNew: false, confidence: 0, latencyMs: 1000, outcome: "unavailable" },
  ]);
  assert.equal(result.modelDecisions, 2);
  assert.equal(result.unavailable, 1);
  assert.equal(result.bins[2].accuracy, 0.5);
  assert.ok(Math.abs(result.decisionBrierScore - 0.41) < 1e-12);
  assert.equal(result.latency.samples, 3);
  assert.equal(result.latency.medianMs, 200);
  assert.equal(latencySummary([]).p95Ms, null);
});

test("RCA and Fix proxies only score the requested sections", () => {
  const rubric = { rootPatterns: ["pool exhaustion"], remediationPatterns: ["restore.*pool"] };
  const valid =
    "## RCA\nPool exhaustion.\n## Summary\nDatabase affected.\n## Fix\nRestore the pool.";
  const scored = scoreReport(valid, rubric);
  assert.equal(scored.reportFormat, true);
  assert.equal(scored.rootCause, true);
  assert.equal(scored.remediation, true);
  const misplaced =
    "## RCA\nUnknown.\n## Summary\nPool exhaustion; restore the pool.\n## Fix\nUnknown.";
  assert.equal(scoreReport(misplaced, rubric).rootCause, false);
  assert.equal(scoreReport(misplaced, rubric).remediation, false);
  assert.equal(scoreReport(valid + "\n## Extra\nDetails", rubric).reportFormat, false);
  assert.equal(scoreReport("", rubric).rootCause, false);
});

test("unknown causes allow diagnostics but reject unsupported cause-specific fixes", () => {
  const rubric = {
    expectedUnknown: true,
    rootPatterns: ["unknown"],
    remediationPatterns: ["collect.*logs"],
    causeSpecificFixPatterns: ["resize.*pool"],
  };
  const report = (fix) =>
    `## RCA\nThe root cause is unknown.\n## Summary\nEvidence is insufficient.\n## Fix\n${fix}`;
  assert.equal(scoreReport(report("Collect current logs."), rubric).remediation, true);
  assert.equal(
    scoreReport(report("Resize the connection pool. Collect current logs."), rubric)
      .unsupportedRemediation,
    true,
  );
  assert.equal(
    scoreReport(report("Resize the connection pool. Collect current logs."), rubric).remediation,
    false,
  );
  assert.equal(
    scoreReport(report("Do not resize the pool. Collect current logs."), rubric)
      .unsupportedRemediation,
    false,
  );
  assert.equal(scoreReport("", rubric).unsupportedRemediation, null);
});

test("quoting correct evidence cannot rescue an explicitly contradictory root claim", () => {
  const rubric = {
    rootPatterns: ["authentication"],
    remediationPatterns: ["verify.*credentials"],
    forbiddenRootPatterns: ["likely cause.*pool exhaustion"],
  };
  const report =
    "## RCA\nThe likely cause is pool exhaustion, despite authentication failure logs.\n## Summary\nDatabase errors.\n## Fix\nVerify credentials.";
  assert.equal(scoreReport(report, rubric).rootCause, false);
  assert.ok(scoreReport(report, rubric).violations.includes("contradictory-root-claim"));
});

test("retrieval is not reuse and reuse correctness requires the expected incident ID", () => {
  const run = {
    expectedReuse: true,
    output: {
      investigationMode: "full",
      historicalContext: JSON.stringify({ matches: [{ id: "retrieved", score: 0.95 }] }),
      reusedIncidentId: null,
    },
  };
  assert.equal(memoryResult(run, "expected").retrievalReturnedMatch, true);
  assert.equal(memoryResult(run, "expected").reuseCorrect, false);
  const reused = {
    ...run,
    output: { ...run.output, investigationMode: "historical-reuse", reusedIncidentId: "other" },
  };
  assert.equal(memoryResult(reused, "expected").reuseCorrect, false);
  assert.equal(memoryResult(reused, undefined).reuseCorrect, null);
  assert.equal(
    memoryResult(
      { ...reused, output: { ...reused.output, reusedIncidentId: "expected" } },
      "expected",
    ).reuseCorrect,
    true,
  );
  assert.equal(memoryResult({ expectedReuse: true }, "expected").retrievalReturnedMatch, null);
  assert.equal(memoryResult(run, "expected", false).reuseCorrect, null);
  assert.equal(
    memoryResult({ output: { investigationMode: "full" } }, "expected").reuseCorrect,
    null,
  );
});

test("reuse precision/recall and false reuse handle wrong IDs and unavailable decisions", () => {
  const decisions = [
    { expectedReuse: true, actualReuse: true, reuseCorrect: true },
    { expectedReuse: true, actualReuse: false, reuseCorrect: false },
    { expectedReuse: false, actualReuse: true, reuseCorrect: false },
    { expectedReuse: false, actualReuse: false, reuseCorrect: true },
    { expectedReuse: true, actualReuse: true, reuseCorrect: false },
  ];
  const score = reuseScores(decisions);
  assert.equal(score.precision, 1 / 3);
  assert.equal(score.recall, 1 / 3);
  assert.equal(score.falseReuseRate, 1 / 2);
  assert.equal(
    reuseScores([...decisions, { expectedReuse: false, actualReuse: null, reuseCorrect: null }])
      .falseReuseRate,
    null,
  );
  assert.equal(
    reuseScores(decisions.map((item) => ({ ...item, memoryEnabled: false }))).precision,
    null,
  );
  assert.equal(
    reuseScores([{ expectedReuse: true, actualReuse: null, reuseCorrect: null }]).recall,
    0,
  );
});

test("exact correlation assignment handles ten incidents with split clusters", () => {
  const rows = Array.from({ length: 10 }, (_, incident) =>
    [0, 1, 2].map((index) => ({
      caseId: "burst",
      incident: String(incident),
      workflowId: `${incident}-${index === 2 ? "split" : "main"}`,
      expectedNew: index === 0,
      correlated: index === 1,
    })),
  ).flat();
  const scores = correlationScores(rows);
  assert.equal(scores.mappingAccuracy, 20 / 30);
  assert.deepEqual(scores.mergePairs, [0, 405]);
  assert.deepEqual(scores.splitPairs, [20, 30]);
});

test("large dataset covers ten incident types, an interleaved burst and unchanged small cases", async () => {
  const small = JSON.parse(await readFile(new URL("dataset.json", import.meta.url), "utf8"));
  const large = JSON.parse(await readFile(new URL("dataset-large.json", import.meta.url), "utf8"));
  assert.equal(large.version, 5);
  assert.equal(large.cases.length, 17);
  assert.equal(
    large.cases.reduce((sum, item) => sum + item.alerts.length, 0),
    75,
  );
  assert.equal(
    large.cases.reduce((sum, item) => sum + Object.keys(item.incidents).length, 0),
    27,
  );
  assert.deepEqual(large.cases.slice(-6), small.cases);
  const burst = large.cases.find((item) => item.id === "large-independent-burst");
  assert.equal(burst.alerts.length, 32);
  assert.equal(Object.keys(burst.incidents).length, 10);
  assert.equal(new Set(burst.alerts.slice(0, 10).map((item) => item.incident)).size, 10);
  for (const item of large.cases) {
    for (const alert of item.alerts) {
      assert.ok(item.incidents[alert.incident]);
      if (item.evidence) assert.ok(item.evidence[alert.component]?.logs.length);
      if (item.expectedReuse[alert.incident]) {
        const memory = large.memories.find(
          (memory) => memory.title === item.incidents[alert.incident].expectedMemoryTitle,
        );
        assert.ok(memory.reuseConditions.alertNames.includes(alert.name));
      }
    }
    for (const rubric of Object.values(item.incidents)) {
      for (const field of [
        "rootPatterns",
        "remediationPatterns",
        "forbiddenRootPatterns",
        "unsupportedFixPatterns",
      ])
        for (const pattern of rubric[field] ?? [])
          assert.doesNotThrow(() => new RegExp(pattern, "i"));
    }
  }
});

test("small dataset covers all required behaviors with resolvable reuse ground truth", async () => {
  const dataset = JSON.parse(await readFile(new URL("dataset.json", import.meta.url), "utf8"));
  assert.equal(dataset.version, 4);
  assert.equal(dataset.cases.length, 6);
  assert.equal(
    dataset.cases.reduce((total, item) => total + item.alerts.length, 0),
    11,
  );
  for (const id of [
    "overlapping",
    "database-only",
    "changed-image",
    "different-database-cause",
    "noisy-recurrence",
    "insufficient-evidence",
  ])
    assert.ok(dataset.cases.some((item) => item.id === id));
  for (const item of dataset.cases)
    for (const [incident, rubric] of Object.entries(item.incidents)) {
      for (const field of [
        "rootPatterns",
        "remediationPatterns",
        "forbiddenRootPatterns",
        "unsupportedFixPatterns",
      ])
        for (const pattern of rubric[field] ?? [])
          assert.doesNotThrow(() => new RegExp(pattern, "i"));
      if (item.expectedReuse[incident]) {
        const memory = dataset.memories.find(
          (memory) => memory.title === rubric.expectedMemoryTitle,
        );
        assert.ok(memory?.reuseConditions);
        for (const alert of item.alerts.filter((alert) => alert.incident === incident))
          assert.ok(memory.reuseConditions.alertNames.includes(alert.name));
      }
    }
  const unknown = dataset.cases.find((item) => item.id === "insufficient-evidence").incidents
    .database;
  const rubric = { ...dataset.evaluation, ...unknown };
  const diagnostic =
    "## RCA\nUnknown.\n## Summary\nNo diagnostic evidence.\n## Fix\nCollect current logs and traces.";
  assert.equal(scoreReport(diagnostic, rubric).rootCause, true);
  assert.equal(scoreReport(diagnostic, rubric).remediation, true);
  assert.equal(
    scoreReport(
      diagnostic.replace(
        "Collect current logs and traces.",
        "Restart the database. Collect current logs.",
      ),
      rubric,
    ).unsupportedRemediation,
    true,
  );
});
