export function correlationScores(rows) {
  let cross = 0,
    same = 0,
    merges = 0,
    splits = 0;
  for (let i = 0; i < rows.length; i++)
    for (let j = i + 1; j < rows.length; j++) {
      if (rows[i].caseId !== rows[j].caseId) continue;
      const related = rows[i].incident === rows[j].incident;
      const grouped = rows[i].workflowId === rows[j].workflowId;
      if (related) {
        same++;
        if (!grouped) splits++;
      } else {
        cross++;
        if (grouped) merges++;
      }
    }
  // Exact assignment using subsets of gold incidents, avoiding factorial burst evaluation.
  let correct = 0;
  for (const caseId of new Set(rows.map((r) => r.caseId))) {
    const subset = rows.filter((r) => r.caseId === caseId);
    const gold = [...new Set(subset.map((r) => r.incident))];
    const predicted = [...new Set(subset.map((r) => r.workflowId))];
    let assignments = new Map([[0n, 0]]);
    for (const id of predicted) {
      const next = new Map(assignments);
      const weights = gold.map(
        (incident) =>
          subset.filter((row) => row.incident === incident && row.workflowId === id).length,
      );
      for (const [mask, score] of assignments)
        for (let index = 0; index < gold.length; index++) {
          const bit = 1n << BigInt(index);
          if (mask & bit || !weights[index]) continue;
          const assigned = mask | bit;
          next.set(assigned, Math.max(next.get(assigned) ?? 0, score + weights[index]));
        }
      assignments = next;
    }
    correct += Math.max(...assignments.values());
  }
  const ratio = (a, b) => (b ? a / b : null);
  const workflows = new Set(rows.map((r) => r.workflowId)).size;
  return {
    alerts: rows.length,
    workflows,
    mappingAccuracy: ratio(correct, rows.length),
    newIncidentDecisionAccuracy: ratio(
      rows.filter((r) => r.expectedNew === !r.correlated).length,
      rows.length,
    ),
    newIncidentRecall: ratio(
      rows.filter((r) => r.expectedNew && !r.correlated).length,
      rows.filter((r) => r.expectedNew).length,
    ),
    incorrectMergeRate: ratio(merges, cross),
    incorrectSplitRate: ratio(splits, same),
    mergePairs: [merges, cross],
    splitPairs: [splits, same],
    workflowReduction: ratio(rows.length - workflows, rows.length),
  };
}

export function scoreReport(report, rubric) {
  const headings = [...report.matchAll(/^## (.+)\s*$/gm)];
  const reportFormat =
    headings.length === 3 &&
    headings.every((heading, index) => heading[1].trim() === ["RCA", "Summary", "Fix"][index]);
  const section = (index) =>
    reportFormat
      ? report
          .slice(
            headings[index].index + headings[index][0].length,
            headings[index + 1]?.index ?? report.length,
          )
          .replace(/\s+/g, " ")
      : "";
  const root = section(0),
    fix = section(2);
  const rootUnknown =
    /(?:^\s*(?:unknown|undetermined)\b|\b(?:root\s+)?cause[:\s]+(?:is\s+|remains\s+)?(?:unknown|undetermined)|\binsufficient\s+(?:current\s+)?evidence|\bcannot\s+(?:determine|establish)\b)/i.test(
      root,
    );
  const matches = (patterns, text) =>
    (patterns ?? []).some((pattern) => new RegExp(pattern, "i").test(text));
  const contradictsRoot = matches(rubric.forbiddenRootPatterns, root);
  // This is a transparent suggestion heuristic, not semantic adjudication.
  const suggestions = fix
    .split(/\n|;|(?<=[.!?])\s+/)
    .filter((clause) => !/^\s*(?:[-*]\s*)?(?:do not|don't|avoid|never)\b/i.test(clause))
    .join(" ");
  const unsupported =
    matches(rubric.unsupportedFixPatterns, suggestions) ||
    (rootUnknown && matches(rubric.causeSpecificFixPatterns, suggestions));
  return {
    reportFormat,
    rootUnknown: reportFormat ? rootUnknown : null,
    unsupportedRemediation: reportFormat ? unsupported : null,
    violations: !reportFormat
      ? ["invalid-report-format"]
      : [
          ...(contradictsRoot ? ["contradictory-root-claim"] : []),
          ...(unsupported ? ["unsupported-cause-specific-fix"] : []),
        ],
    rootCause:
      reportFormat &&
      !contradictsRoot &&
      (rubric.expectedUnknown ? rootUnknown : !rootUnknown) &&
      rubric.rootPatterns.every((p) => new RegExp(p, "i").test(root)),
    remediation:
      reportFormat &&
      !unsupported &&
      rubric.remediationPatterns.every((p) => new RegExp(p, "i").test(fix)),
  };
}

export function reuseScores(decisions) {
  const enabled = decisions.filter((item) => item.memoryEnabled !== false);
  const predictions = enabled.filter((item) => item.actualReuse === true);
  const valid = predictions.filter((item) => item.reuseCorrect === true).length;
  const invalid = predictions.filter((item) => item.reuseCorrect === false).length;
  const positives = enabled.filter((item) => item.expectedReuse === true);
  const negatives = enabled.filter((item) => item.expectedReuse === false);
  const unknown = enabled.filter(
    (item) => item.actualReuse == null || (item.actualReuse && item.reuseCorrect == null),
  ).length;
  const unknownNegatives = negatives.filter((item) => item.actualReuse == null).length;
  return {
    truePositives: valid,
    falsePositives: invalid,
    expectedPositives: positives.length,
    expectedNegatives: negatives.length,
    unknownDecisions: unknown,
    precision:
      predictions.length && !predictions.some((item) => item.reuseCorrect == null)
        ? valid / predictions.length
        : null,
    recall: positives.length
      ? positives.filter((item) => item.actualReuse && item.reuseCorrect === true).length /
        positives.length
      : null,
    falseReuseRate:
      negatives.length && !unknownNegatives
        ? negatives.filter((item) => item.actualReuse).length / negatives.length
        : null,
  };
}

export function memoryResult(investigation, expectedMemoryId, enabled = true) {
  let history;
  try {
    history =
      typeof investigation.output?.historicalContext === "string"
        ? JSON.parse(investigation.output.historicalContext)
        : investigation.output?.historicalContext;
  } catch {}
  const matches = history?.matches;
  const knownRetrieval = Array.isArray(matches) && !history?.unavailable;
  const actualReuse =
    investigation.output?.investigationMode === "historical-reuse"
      ? true
      : investigation.output?.investigationMode === "full"
        ? false
        : null;
  const correct =
    !enabled || actualReuse == null || typeof investigation.expectedReuse !== "boolean"
      ? null
      : actualReuse
        ? investigation.expectedReuse === false
          ? false
          : expectedMemoryId
            ? investigation.output?.reusedIncidentId === expectedMemoryId
            : null
        : investigation.expectedReuse === false;
  return {
    enabled,
    retrievalReturnedMatch: knownRetrieval ? matches.length > 0 : null,
    retrievedIncidentId: matches?.[0]?.id ?? null,
    retrievalSimilarity: matches?.[0]?.score ?? null,
    reuseCorrect: correct,
  };
}

export function latencySummary(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const quantile = (p) => {
    if (!sorted.length) return null;
    const index = (sorted.length - 1) * p;
    const low = Math.floor(index),
      high = Math.ceil(index);
    return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
  };
  return {
    samples: sorted.length,
    medianMs: quantile(0.5),
    p95Ms: quantile(0.95),
    maxMs: sorted.length ? sorted.at(-1) : null,
  };
}

export function confidenceScores(rows) {
  // Score model-decision certainty, excluding bypasses and unavailable calls.
  const evaluated = rows.filter(
    (row) => typeof row.modelCorrelated === "boolean" && Number.isFinite(row.modelConfidence),
  );
  const decisions = evaluated.map((row) => ({
    confidence: row.modelConfidence,
    correct: row.expectedNew === !row.modelCorrelated,
  }));
  return {
    modelDecisions: decisions.length,
    unavailable: rows.filter((row) => row.outcome === "unavailable").length,
    lowConfidenceRejected: rows.filter((row) => row.outcome === "low-confidence").length,
    scopeRejected: rows.filter((row) => row.outcome === "scope-rejected").length,
    formatFallbacks: rows.filter((row) => row.formatFallback).length,
    decisionBrierScore: decisions.length
      ? decisions.reduce((sum, row) => sum + (row.confidence - Number(row.correct)) ** 2, 0) /
        decisions.length
      : null,
    bins: [
      [0, 0.5],
      [0.5, 0.8],
      [0.8, 0.95],
      [0.95, 1],
    ].map(([min, max], i) => {
      const bin = decisions.filter(
        (row) => row.confidence >= min && (i === 3 ? row.confidence <= max : row.confidence < max),
      );
      return {
        min,
        max,
        samples: bin.length,
        accuracy: bin.length ? bin.filter((row) => row.correct).length / bin.length : null,
      };
    }),
    latency: latencySummary(rows.map((row) => row.latencyMs)),
  };
}
