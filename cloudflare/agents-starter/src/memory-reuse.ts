import { z } from "zod";
import type { AlertNotification } from "./alert-webhook";

export const reuseConditionsSchema = z.object({
  namespace: z.string().min(1).max(100),
  service: z.string().min(1).max(100),
  component: z.string().min(1).max(100),
  deploymentImage: z.string().min(1).max(300),
  alertNames: z.array(z.string().min(1).max(100)).min(1).max(20),
  logSignatures: z.array(z.string().min(12).max(300)).min(1).max(10),
  conflictingLogSignatures: z
    .array(z.string().min(12).max(300))
    .max(10)
    .optional(),
  verification: z.array(z.string().min(1).max(500)).min(1).max(10)
});

export type ReuseConditions = z.infer<typeof reuseConditionsSchema>;
const candidateSchema = z.object({
  id: z.string(),
  score: z.number().min(0).max(1),
  metadata: z.object({
    rootCause: z.string().min(1),
    remediation: z.string().min(1),
    reuseConditions: z.string()
  })
});
const deploymentSchema = z.object({
  namespace: z.string(),
  name: z.string(),
  image: z.string()
});
const logsSchema = z.object({
  status: z.literal("success"),
  data: z.object({
    result: z.array(
      z.object({
        stream: z.record(z.string(), z.string()),
        values: z.array(
          z.tuple([z.string().max(30).regex(/^\d+$/), z.string()])
        )
      })
    )
  })
});

export function evaluateMemoryReuse(input: {
  history: unknown;
  deployment: unknown;
  logs: unknown;
  alert: AlertNotification;
  minimumScore: number;
  now: number;
}) {
  const history = z
    .object({ matches: z.array(z.unknown()) })
    .safeParse(input.history);
  const deployment = deploymentSchema.safeParse(input.deployment);
  const logs = logsSchema.safeParse(input.logs);
  const startsAt = Date.parse(input.alert.startsAt);
  if (
    !history.success ||
    !deployment.success ||
    !logs.success ||
    !Number.isFinite(startsAt) ||
    startsAt > input.now
  )
    return { candidate: null, reason: "invalid-current-evidence" };
  const verified = [];
  const rejected: string[] = [];
  if (!history.data.matches.length)
    return { candidate: null, reason: "no-retrieved-match" };
  for (const raw of history.data.matches) {
    const candidate = candidateSchema.safeParse(raw);
    if (!candidate.success) {
      rejected.push("missing-reuse-conditions");
      continue;
    }
    let conditions: ReuseConditions;
    try {
      conditions = reuseConditionsSchema.parse(
        JSON.parse(candidate.data.metadata.reuseConditions)
      );
    } catch {
      rejected.push("invalid-reuse-conditions");
      continue;
    }
    if (
      !["namespace", "service", "component"].every(
        (key) =>
          input.alert.labels[key] ===
          conditions[key as "namespace" | "service" | "component"]
      )
    ) {
      rejected.push("scope-mismatch");
      continue;
    }
    if (
      !conditions.alertNames.includes(input.alert.labels.alertname) ||
      input.alert.status !== "firing"
    ) {
      rejected.push("alert-mismatch");
      continue;
    }
    if (
      deployment.data.namespace !== conditions.namespace ||
      deployment.data.name !== conditions.service ||
      deployment.data.image !== conditions.deploymentImage
    ) {
      rejected.push("deployment-image-mismatch");
      continue;
    }
    const lines = logs.data.data.result
      .filter(
        (stream) =>
          stream.stream.namespace === conditions.namespace &&
          stream.stream.app_kubernetes_io_name === conditions.service
      )
      .flatMap((stream) => stream.values)
      .filter(([timestamp, line]) => {
        const time = Number(BigInt(timestamp) / 1000000n);
        return (
          time >= startsAt &&
          time <= input.now &&
          line.split(/\s+/).includes(`component=${conditions.component}`)
        );
      });
    if (
      conditions.conflictingLogSignatures?.some((signature) =>
        lines.some(([, line]) => line.includes(signature))
      )
    ) {
      rejected.push("conflicting-current-logs");
      continue;
    }
    if (
      !conditions.logSignatures.every((signature) =>
        lines.some(([, line]) => line.includes(signature))
      )
    ) {
      rejected.push("missing-current-log-signatures");
      continue;
    }
    if (candidate.data.score < input.minimumScore) {
      rejected.push("below-retrieval-threshold");
      continue;
    }
    verified.push({ ...candidate.data, conditions });
  }
  // Multiple qualifying memories are ambiguous: use a full investigation instead.
  return verified.length === 1
    ? {
        candidate: verified[0],
        reason: "current-evidence-satisfies-reuse-conditions"
      }
    : {
        candidate: null,
        reason:
          verified.length > 1
            ? "ambiguous-reusable-matches"
            : [...new Set(rejected)].join(",")
      };
}

export function selectReusableIncident(
  input: Parameters<typeof evaluateMemoryReuse>[0]
) {
  return evaluateMemoryReuse(input).candidate;
}

export function reusedIncidentReport(
  candidate: NonNullable<ReturnType<typeof selectReusableIncident>>
) {
  return [
    "## RCA",
    candidate.metadata.rootCause,
    "Historical hypothesis, not a confirmed current cause. Matching log signatures do not prove identical causality.",
    "## Summary",
    `Matched incident: ${candidate.id}. Similarity: ${candidate.score.toFixed(3)} (retrieval score, not causal confidence).`,
    "Current alert scope, deployment image and post-alert log signatures satisfy the stored reuse conditions. No new LLM RCA call was made; metrics and active-alert discovery were skipped.",
    `Scope: ${candidate.conditions.namespace}/${candidate.conditions.service}, component ${candidate.conditions.component}. Deployment image: ${candidate.conditions.deploymentImage}.`,
    ...candidate.conditions.logSignatures.map(
      (signature) => `- Observed post-alert log signature: ${signature}`
    ),
    "## Fix",
    candidate.metadata.remediation,
    "Proposed only; no repair was executed or recovery confirmed. Check other components before any broad repair. Verify:",
    ...candidate.conditions.verification.map((check) => `- ${check}`)
  ].join("\n\n");
}
