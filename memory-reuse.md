# Targeted Incident Memory Reuse

## Behavior

Automatic alert investigations now retrieve history first. They collect current deployment metadata and component logs, then evaluate optional historical reuse conditions without another LLM call.

Reuse requires exactly one retrieved candidate above the configured similarity threshold, exact namespace/service/component and deployment image, a listed firing alert, and every configured log signature in correctly scoped logs timestamped after the alert started. Missing, stale, malformed, ambiguous or conflicting evidence falls back to the full five-tool investigation and generated RCA. Retrieval failures also fall back. Ordinary memories without reuse conditions remain context, never automatic shortcuts.

Optional `conflictingLogSignatures` explicitly disqualify a candidate when observed in current scoped logs, even if its positive signatures also occur. Workflow outputs record `reuseDecisionReason`. Current evidence always outranks memory; similarity is not causal confidence. Full RCA prompts require supported diagnostics/containment instead of an established-cause fix when the cause is unknown. Retrieval queries exclude fingerprints/timestamps so repeated benchmark IDs do not affect semantic similarity; provider and thresholds are unchanged.

A reused report clearly labels its root cause as a historical hypothesis, lists verification checks and states that metrics/active-alert discovery were skipped. Nothing is repaired automatically. Matching signatures are not proof of identical causality or recovery. This is an opt-in runbook shortcut, not a newly generated full RCA.

Final reports use only `RCA`, `Summary`, and `Fix`, in that order. Evidence and uncertainty stay under RCA, impact and skipped checks under Summary, and proposed remediation/verification under Fix. Chat and automatic RCA prompts request the same format; reused reports render it directly. Existing saved reports and benchmark results are not rewritten.

## Local Setup

No new Cloudflare resources or credentials are required. The existing Vectorize index/embedding configuration is unchanged. Local `.dev.vars` has been updated with:

```dotenv
INCIDENT_MEMORY_REUSE_ENABLED=true
INCIDENT_MEMORY_REUSE_MIN_SCORE=0.90
```

Both settings are listed in `.dev.vars.example`. Disable reuse with `INCIDENT_MEMORY_REUSE_ENABLED=false`; retrieval still enriches full RCA prompts. `INCIDENT_MEMORY_ENABLED=false` or the benchmark's per-workflow `memoryEnabled=false` disables retrieval and reuse. Restart the agent after env changes.

## Eligible Memories

Use the existing `rememberIncident` chat tool to store a confirmed historical root cause/remediation with `reuseConditions`. Explicitly supply and approve the rules; the tool instructs the model not to invent reuse conditions. This is a user review convention, not a cryptographically enforced approval system. Restrict access to memory-writing tools in any shared environment. Do not promote an unreviewed generated RCA to reusable memory.

For example, after verifying a real database incident, provide conditions shaped like this, substituting the exact deployed image, firing alert name, observed diagnostic signature and reviewed verification checks:

```json
{
  "namespace": "incident-lab",
  "service": "demo-service",
  "component": "database",
  "deploymentImage": "demo-service:v2",
  "alertNames": ["DBConnectionErrors"],
  "logSignatures": ["connection pool exhausted"],
  "verification": ["Check database acquisition error rate returns to baseline."]
}
```

Use component and service values in the memory's `labels` as well so scoped retrieval can find it. The example is schema documentation, not a claim that this exact alert/signature exists in the live lab. Existing records are not migrated automatically; save a reviewed record with these rules. Vectorize writes may take time to index. Multiple qualifying records deliberately disable reuse, so avoid duplicate reusable records for the same conditions.

## Accounting and Validation

- Eligible reuse: two planned tool HTTP calls instead of five; no RCA generation request/input/output tokens. Embedding/search and alert correlation still run and have their own overhead.
- Fallback: all five tool calls and the normal RCA request. Reuse does not reduce workflow creation or change correlation decisions.
- Output includes `investigationMode`, `reusedIncidentId` and `reuseTelemetry`. Planned tool counts exclude retries; use `tool_api.request` events for actual request counts. Reuse emits `incident_memory.reused` with workflow/memory IDs and similarity.
- A reused workflow correctly has no RCA Gateway record. Evaluate report usefulness and unsupported claims as well as cost; do not count missing generated RCAs as Gateway collection failures.

Unit/integration tests exercise eligible reuse, disabled memory, scope/image mismatch, stale/empty/conflicting logs, low scores, malformed rules, ambiguity and full fallback. Mocked Workflow execution verifies the two-vs-five tool calls and zero-vs-one RCA calls. These are functional tests, not token/cost/accuracy benchmark results. Measured evaluations are documented in the [small benchmark](benchmarks/benchmark-results.md) and [large benchmark](benchmarks/benchmark-results-large.md); see the [guide](benchmarks/guide.md) for reproduction and metric definitions.
