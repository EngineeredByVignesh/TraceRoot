# TraceRoot Pilot Benchmark Results

Frozen baseline `b394e216` (context-enrichment memory, dataset v2). Raw data: [results.json](results.json); Gateway accounting: [gateway-summary.json](gateway-summary.json). Artifact paths shown in the original report below refer to their pre-cleanup locations. Scores and accounting are unchanged.

Run: b394e216; started 2026-10-03T13:49:30.233Z.
Model: cloudflare/@cf/meta/llama-3.1-8b-instruct-fp8.

## Scope

Controlled evidence replay through real alert admission, configured LLMs, local Cloudflare Workflows and remote Vectorize. Live lab tools receive a separate smoke test. Dataset version 2; 2 repetition(s). This is not a production accuracy estimate.

AI Gateway measurements from the matching export are included below, separately from application timing. End-to-end workflow observations include intentional fixture delay and polling, not just inference.

## Results

| Metric | No memory | Vectorize memory |
| --- | ---: | ---: |
| Alert mapping accuracy (one-to-one) | 78.6% | 78.6% |
| New-incident decision accuracy | 78.6% | 78.6% |
| New-incident recall | 100.0% | 100.0% |
| Incorrect merge rate (cross-incident pairs) | 0.0% | 0.0% |
| Incorrect split rate (same-incident pairs) | 50.0% | 50.0% |
| Workflow reduction | 35.7% | 35.7% |
| Root cause keyword-rubric pass rate | 83.3% | 100.0% |
| Remediation keyword-rubric pass rate | 83.3% | 100.0% |
| Successful workflow rate | 100.0% | 100.0% |
| Workflows created | 9 | 9 |
| Correlation latency median (includes queue/failure) | 4.23 s | 4.83 s |
| Correlation latency p95 (includes queue/failure) | 4.76 s | 6.25 s |
| Completed batch-to-RCA observation median | 70.35 s | 71.27 s |
| Completed batch-to-RCA observation p95 | 93.94 s | 94.78 s |
| Model decision confidence Brier score (lower better) | 0.180 | 0.154 |
| Model decisions / unavailable / confidence-rejected | 10 / 0 / 1 | 10 / 0 / 1 |
| Scope-rejected positive model decisions | 2 | 4 |
| Fenced-JSON formatting fallbacks | 0 | 0 |
| Avg fixture tool HTTP calls/workflow (withoutMemory) | 5.00 | - |
| Avg fixture tool HTTP calls/workflow (withMemory) | - | 5.00 |

## Memory Comparison

Confidence threshold was fixed at 0.8 before execution. Model certainty is not an accuracy label. Brier scoring here measures new-vs-existing decision correctness only, not whether the selected existing ID is correct; mapping and merge metrics assess grouping.

New-incident recall includes conservative new-workflow fallbacks when correlation is unavailable. Zero incorrect merges does not imply accurate correlation: high split rates show the cost of these fallbacks.

- Root cause change: 16.7 percentage points.
- Remediation change: 16.7 percentage points.
- Useful retrieval proxy on paired completed RCAs (relevant retrieval plus rubric improvement): 2/6.
- Irrelevant retrieval fraction (returned matches, including distractor): 0/6.
- Negative transfer proxy on paired completed RCAs (either rubric worsened): 0/6. Incomplete RCAs are excluded from this specific proxy, not from accuracy/success denominators.
- Paired RCA completion: 6/6. The small sample and replay design limit conclusions about memory impact.
- Memory unavailable cases: 0/6.
- Unknown retrieval results due to missing Workflow output: 0/6.
- No-memory retrieval disabled cases: 6/6.

## Live Smoke Test

```json
{
  "demoService": "Existing kind deployment /healthz reachable (HTTP 200); not proof of application health",
  "prometheus": "ready",
  "kube-prometheus-stack-alertmanager": "ready",
  "loki": "ready",
  "tools/deployments": 200,
  "tools/alerts": 200,
  "liveMetrics": 200,
  "liveLogs": 200,
  "agent": "ready",
  "model": {
    "text": "OK",
    "structuredOutput": {
      "correlated": true,
      "investigationId": "benchmark-active",
      "confidence": 1,
      "reason": "The incoming alert shares the same service, namespace, component, and start time as the active investigation, indicating a likely causal relationship.",
      "latencyMs": 3189,
      "modelCorrelated": true,
      "modelConfidence": 1,
      "formatFallback": false,
      "outcome": "model"
    }
  }
}
```

## Limitations

- RCA scoring is a transparent regex rubric, not expert-adjudicated accuracy; negation and unsupported statements can produce false positives. Review raw reports before reporting headline accuracy.
- Historical examples deliberately overlap the current incident types: this measures assisted replay, not held-out generalization.
- The normal workflow gathers fixed tool calls regardless of memory, so a tool-count reduction is not expected. Retrieval/embedding binding calls are recorded separately in workflow outputs; they are not fixture HTTP calls.
- Time-to-RCA in raw output is an upper-bound polling observation measured from batch submission. Fixture responses intentionally wait to allow incoming alerts to see active workflows. No model-latency claim is made.
- Correlation is timing-dependent because completed investigations are not candidates. Exact five-alert/two-workflow grouping is measured, not assumed.
- No automatic writes of resulting RCAs, no normal namespace seeding, no live failure injection. Benchmark memories remain in the isolated namespace shown above.

## Runner Errors

None.

## Workflow Outcomes

- withoutMemory: 0/9 workflows did not complete; 0/14 decisions used the correlation-unavailable fallback.
- withMemory: 0/9 workflows did not complete; 0/14 decisions used the correlation-unavailable fallback.

Failed Workflow outputs do not include historical retrieval results, so retrieval absence is unknown for those cases, not proof of zero binding calls. Counterbalanced arm order reduces order bias but this small replay is still not causal proof of a memory benefit. Inspect raw error and latency records; SDK/Workflow retries are distinct from Gateway retries.

## Application LLM Telemetry

Durations are measured application call times, including response handling but excluding queue wait; these are not AI Gateway model latency.

- correlation: 20 attempts, 20 successful; success median 4.36 s, p95 6.11 s; failed status counts {}.
- rca: 18 attempts, 18 successful; success median 21.08 s, p95 27.04 s; failed status counts {}.

Raw per-alert decisions, workflow reports, retrievals, and rubric scores: `benchmarks/results-cloudflare.json`. Matching Gateway token/cost accounting and exported request durations are included below. Application latency is measured above.

## AI Gateway Export Analysis

Export: `logs-2026-10-03T18_25_24.986Z.json`; SHA-256 recorded in `benchmarks/gateway-summary-cloudflare.json`. 287 records (287 unique); 36 text requests match run b394e216 by metadata. Earlier runs/preflight are excluded.

| Arm / operation | Requests / HTTP 200 | Median | p95 | Input / output tokens | Estimated USD |
| --- | ---: | ---: | ---: | ---: | ---: |
| withoutMemory / correlation | 10 / 10 | 3.54 s | 4.09 s | 5466 / 643 | $0.001013 |
| withoutMemory / rca | 9 / 9 | 19.97 s | 26.09 s | 11244 / 4020 | $0.002860 |
| withMemory / correlation | 8 / 8 | 4.11 s | 5.61 s | 4245 / 697 | $0.000844 |
| withMemory / rca | 9 / 9 | 20.58 s | 25.89 s | 12826 / 3973 | $0.003086 |

Exact-attributed text total: **33781 input tokens, 9333 output tokens, $0.007802 estimated cost**. Status counts: `{"200":36}`; Gateway retry counts: `[0]`; cached requests: 0.

Within the run window, 33 embedding requests had status counts `{"200":33}`, median 0.56 s and p95 0.81 s. They cannot be allocated reliably by arm, and their logged zero usage/cost is not reliable billing evidence.

- Text calls use workflow ID or run/arm alert ID metadata, not time alone. Preflight and earlier attempts are excluded.
- Embedding calls have no run/arm metadata; timestamp attribution includes possible seed/search/overhead or unrelated calls. Zero logged usage/cost is missing accounting, not proof of free embeddings.
- Gateway retry_count is not SDK/Workflow retries. Cost is logged estimated successful-request cost, not an audited invoice.
- Memory RCA costs include all workflows, including erroneous splits; the two arms do not provide statistical evidence of generalization.

Coverage: `{"withoutMemory":{"expectedCorrelations":10,"recordedCorrelations":10,"completedWorkflows":9,"recordedRcas":9},"withMemory":{"expectedCorrelations":10,"recordedCorrelations":8,"completedWorkflows":9,"recordedRcas":9}}`. The application recorded 20 successful correlations but the export contains only 18 (two memory-arm calls missing). Do not infer failures from missing export records or compare full-arm token totals as if coverage were equal. All 18 RCA calls are represented.

Gateway duration is the exported request duration, not queue-inclusive application latency or necessarily pure inference time. Quantiles use linear interpolation. Accuracy and memory-benefit conclusions remain unchanged; this export does not score RCA correctness.
