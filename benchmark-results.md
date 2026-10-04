# TraceRoot Benchmark Results

Run: e5a2e55a. Window: 2026-10-04T09:20:01.459Z to 2026-10-04T09:43:11.800Z.
Model: cloudflare/@cf/meta/llama-3.1-8b-instruct-fp8. Dataset: v4, SHA-256 ca5e4e63a10a249c45df5b5c6eb87d8833be0cce2ba4b9127111927e75449251.
Memory reuse: true; similarity threshold 0.9. Correlation confidence threshold 0.8.

## Results

| Metric | Without memory | With memory |
| --- | ---: | ---: |
| Alerts / true incident instances | 22 / 14 | 22 / 14 |
| **Correlation quality** |  |  |
| Alert mapping accuracy | 81.8% | 90.9% |
| Incorrect merge pairs / cross-incident pairs | 0 / 12 | 0 / 12 |
| Incorrect split pairs / related pairs | 6 / 10 | 4 / 10 |
| Completed / created workflows | 18 / 18 | 16 / 16 |
| **RCA and remediation quality** |  |  |
| RCA accuracy (rubric proxy) | 78.6% | 71.4% |
| Remediation accuracy (rubric proxy) | 42.9% | 57.1% |
| Unsupported remediation rate (rule-detected) | 14.3% | 25.0% |
| Unsupported fixes / assessed representative reports | 2 / 14 | 3 / 12 |
| Root cause keyword passes / incident instances | 11 / 14 | 10 / 14 |
| Fix keyword passes / incident instances | 6 / 14 | 8 / 14 |
| Three-section format passes / completed workflows | 18 / 18 | 13 / 16 |
| **Retrieval and reuse quality** |  |  |
| Investigations with retrieved matches | 0 | 16 |
| Reuse precision (correct incident ID required) | N/A | 100.0% |
| Reuse recall (per expected-positive investigation) | N/A | 20.0% |
| False reuse rate (per expected-negative investigation) | N/A | 0.0% |
| Unknown reuse decisions / correctness | 0 | 0 |
| Reused / completed workflows | 0 / 18 | 2 / 16 |
| Known recurrence reuse hits / created recurrence workflows | 0 / 12 | 2 / 10 |
| False reuse / created fallback-test workflows | 0 / 6 | 0 / 6 |
| Fallback-test workflows with unknown outcome | 0 | 0 |
| **Efficiency** |  |  |
| Tool calls avoided through historical reuse (planned, excludes retries) | 0 | 6 |
| RCA LLM calls avoided through historical reuse | 0 | 2 |
| Workflow time-to-RCA median | 51.49 s | 51.18 s |
| Workflow time-to-RCA p95 | 55.60 s | 62.28 s |
| Actual tool HTTP requests (including retries) | 90 | 74 |
| Tool HTTP requests / created workflow | 5.00 | 4.63 |
| RCA LLM attempts / successful | 18 / 18 | 14 / 14 |
| Correlation LLM attempts / successful | 10 / 10 | 10 / 10 |
| RCA generation skipped by reuse | 0 | 2 |
| Batch-to-report median | 54.30 s | 52.02 s |
| Batch-to-report p95 | 73.26 s | 76.53 s |

## Memory Interpretation

Observed total tool-request change: 16 fewer with memory. RCA-attempt change: 4 fewer. These arm totals also reflect any differences in workflow grouping and retries; do not attribute all changes to reuse.
No-memory disables retrieval and reuse. Reuse saves the RCA generation request, not embeddings or alert correlation. A shorter investigation can finish before later alerts arrive, reducing active correlation candidates and increasing split workflows. Inspect grouping as well as per-workflow savings.

## Case Outcomes

| Arm / case | Status | Mode | Expected reuse | Top retrieval similarity | Reuse correct | Reason |
| --- | --- | --- | --- | ---: | --- | --- |
| withoutMemory / overlapping-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / overlapping-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / overlapping-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / overlapping-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / database-only-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / changed-image-r1 | complete | full | false | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / different-database-cause-r1 | complete | full | false | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / noisy-recurrence-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / insufficient-evidence-r1 | complete | full | false | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / overlapping-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / overlapping-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / overlapping-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / overlapping-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / database-only-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / changed-image-r2 | complete | full | false | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / different-database-cause-r2 | complete | full | false | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / noisy-recurrence-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / insufficient-evidence-r2 | complete | full | false | N/A | unknown/not assessed | memory-disabled |
| withMemory / overlapping-r1 | complete | full | true | 0.8413 | false | below-retrieval-threshold |
| withMemory / overlapping-r1 | complete | full | true | 0.8859 | false | below-retrieval-threshold |
| withMemory / overlapping-r1 | complete | full | true | 0.8530 | false | below-retrieval-threshold |
| withMemory / database-only-r1 | complete | historical-reuse | true | 0.9128 | true | current-evidence-satisfies-reuse-conditions |
| withMemory / changed-image-r1 | complete | full | false | 0.8556 | true | deployment-image-mismatch |
| withMemory / different-database-cause-r1 | complete | full | false | 0.8630 | true | conflicting-current-logs |
| withMemory / noisy-recurrence-r1 | complete | full | true | 0.8720 | false | below-retrieval-threshold |
| withMemory / insufficient-evidence-r1 | complete | full | false | 0.8471 | true | missing-current-log-signatures |
| withMemory / overlapping-r2 | complete | full | true | 0.8413 | false | below-retrieval-threshold |
| withMemory / overlapping-r2 | complete | full | true | 0.8859 | false | below-retrieval-threshold |
| withMemory / overlapping-r2 | complete | full | true | 0.8530 | false | below-retrieval-threshold |
| withMemory / database-only-r2 | complete | historical-reuse | true | 0.9128 | true | current-evidence-satisfies-reuse-conditions |
| withMemory / changed-image-r2 | complete | full | false | 0.8556 | true | deployment-image-mismatch |
| withMemory / different-database-cause-r2 | complete | full | false | 0.8630 | true | conflicting-current-logs |
| withMemory / noisy-recurrence-r2 | complete | full | true | 0.8720 | false | below-retrieval-threshold |
| withMemory / insufficient-evidence-r2 | complete | full | false | 0.8471 | true | missing-current-log-signatures |

## Application LLM Timing

Successful call durations include response handling, exclude queue wait, and are not Gateway inference-only latency.
- withoutMemory/correlation: 10 successful calls; median 4.09 s, p95 7.66 s.
- withoutMemory/rca: 18 successful calls; median 10.99 s, p95 14.79 s.
- withMemory/correlation: 10 successful calls; median 4.88 s, p95 6.43 s.
- withMemory/rca: 14 successful calls; median 9.61 s, p95 16.60 s.

## Gateway Accounting

The matching AI Gateway export is analyzed below. Tokens, cost, Gateway request durations and Gateway retry counts are not estimated from application timing. Intentional reuse produces no RCA Gateway request; missing expected calls are reported separately by the analyzer.

## Scope And Limitations

Controlled evidence replay with real LLMs, local Workflows and remote Vectorize; 2 repetitions in AB/BA order. Case types: overlapping, exact-recurrence, changed-image, different-database-cause, same-cause-noisy-wording, unknown-cause-safe-diagnostics. Known recurrence memories contain explicit benchmark-reviewed rules; this is assisted replay, not production-generalization accuracy.
Fixture evidence calls each wait 8 seconds. Batch-to-report is a polling observation that includes intake, fixture delays and queue wait; it is not pure model latency. Completed-only timing can hide failure: inspect completion counts.
RCA/fix accuracy uses section-specific patterns, unknown-cause expectations and explicit contradictory-cause/unsupported-action rules on one representative workflow per true incident. These are transparent proxies, not expert semantic/factual accuracy; negation and conditional wording still need review. Failed/malformed reports stay in accuracy denominators; unsupported-rate coverage excludes unassessable reports and is shown explicitly. Existing saved results are not rescored. No repairs were executed.
Reuse precision checks the reused incident ID against the seeded ground-truth incident, not just expected reuse eligibility. Recall is per created expected-positive investigation and conservatively includes unavailable outcomes as missed positives. False reuse rate is conditional on expected-negative investigations and is unknown if any negative decision is unavailable. Disabled-memory arms are not scored for reuse. Similarity is retrieval similarity, never causal confidence. Top retrieval ID/score can differ from the selected reused incident; complete retrieved matches remain in historicalContext.
Workflow time-to-RCA measures Workflow event timestamp through report publication, including retries and evidence collection, not recovery. Batch observations additionally include admission and polling. Avoided tool counts are the known three-step shortcut, not a counterfactual estimate of avoided retries. Embedding/search and correlation are not avoided; use actual HTTP/LLM logs and the matching Gateway export for observed totals.
False reuse is checked on changed-image, different-cause and insufficient-evidence workflows. Low recurrence hit rate can result from similarity filtering, indexing or rule validation; it is not silently tuned after execution. Retrieval failure must not be counted as a safe success.
Tool counts are actual fixture HTTP requests including retries, not embedding/Vectorize calls. Isolated memory seeds and preflight overhead are separate from scored workflows. No live failure injection or ordinary memory-namespace changes occur.

## Prerequisites And Errors

Live smoke test: {"demoService":"Existing kind deployment /healthz reachable (HTTP 200); not proof of application health","prometheus":"ready","kube-prometheus-stack-alertmanager":"ready","loki":"ready","tools/deployments":200,"tools/alerts":200,"liveMetrics":200,"liveLogs":200,"agent":"ready","model":{"text":"OK","structuredOutput":{"correlated":true,"investigationId":"benchmark-active","confidence":1,"reason":"Both alerts share the same namespace, service, component, and start time, indicating a causal dependency.","latencyMs":3096,"modelCorrelated":true,"modelConfidence":1,"formatFallback":false,"outcome":"model"}}}.
Runner errors: none.

## Raw Evidence

Raw decisions, reports, scopes, expected reuse eligibility, model events and actual tool calls: [results](benchmarks/results.json).
Reproduction instructions and metric definitions: [benchmark guide](benchmarks/guide.md). Final datasets: [small](benchmarks/dataset.json) and [large](benchmarks/dataset-large.json).

## Qualitative Review

Non-blinded spot check of conflict, ambiguous-evidence and format outcomes. These observations do not override automated scores or constitute an expert accuracy estimate. No dataset, threshold, prompt or scorer was changed during this run.

- Both exact database recurrences reused the correct seeded incident at retrieval similarity 0.9128. The other eight expected-positive workflows retrieved history but missed the unchanged 0.90 threshold, including both noisy recurrences at 0.8720. Precision is based on only two accepted reuses; recall is 2/10 created expected-positive investigations.
- All six expected-negative workflows rejected reuse: image mismatch, conflicting current logs or missing current signatures. Their similarities were also below 0.90, so this run does not independently prove safety against high-similarity negatives.
- Rejected reuse did not prevent historical anchoring during full RCA generation. Both with-memory different-database-cause reports suggested pool remedies despite current authentication/permission-denied evidence. Sources: `alert-d0c92f85e61daad4231a34d4504b41057b98313b829c21987ef3cc592221db32`, `alert-9ff98aeff0f80058f4384bfd8aaf01f5bfa34f7cc05033f19ec347aef6944e58`.
- With-memory insufficient-evidence-r1 acknowledged insufficient evidence but recommended releasing connections and resizing the pool. The scorer detected that unsupported remediation. Source: `alert-e1ab4d7a840c105e2660db75da7f736419236aad9572f6b4400586dedad9f274`.
- With-memory insufficient-evidence-r2 recommended a database connection pool reset despite an unknown cause. The existing action-pattern heuristic missed that wording and counted its Fix as passing. Consequently, the reported 25.0% unsupported-remediation rate is not a complete semantic safety assessment. Its unknown-RCA pass also does not validate its speculative explanation. Source: `alert-877b5716c6f4ac4cf7f6662d02491e833a9b235deb73d5e99560909b5b705ca5`.
- Three with-memory workflows failed the required report format; two were representative reports. Those remain accuracy failures and are excluded from unsupported-remediation coverage (12/14 representatives assessed), not counted as safe fixes.
- Total arm savings were 16 tool requests and four RCA calls, but only six tool requests and two RCA calls were directly skipped through reuse. The remainder reflects two fewer created workflows. Correlation does not consume incident memory; grouping differences are not a causal memory-quality result.

Next improvements to validate separately: prevent conflicting or unverified historical remedies from contaminating full investigations; enforce the three-section output contract; expand unsupported-action checks to cover pool resets; calibrate reuse retrieval on held-out recurrence and negative examples rather than lowering the threshold to fit this run.

Normal local agent and tools API were restarted after restoration. Matching Gateway text accounting for run `e5a2e55a`, October 4, 2026, approximately 14:50-15:13 IST, is included below; embedding-inclusive cost remains unknown.

## AI Gateway Export Analysis

Export: `logs-2026-10-04T09_53_44.582Z.json`; SHA-256 recorded in `benchmarks/gateway-summary.json`. 479 records (479 unique); 52 text requests match run e5a2e55a by metadata. Earlier runs/preflight are excluded.

| Arm / operation | Requests / HTTP 200 | Median | p95 | Input / output tokens | Estimated USD |
| --- | ---: | ---: | ---: | ---: | ---: |
| withoutMemory / correlation | 10 / 10 | 3.69 s | 7.20 s | 5589 / 748 | $0.001062 |
| withoutMemory / rca | 18 / 18 | 10.41 s | 14.26 s | 20095 / 3582 | $0.004075 |
| withMemory / correlation | 10 / 10 | 4.43 s | 6.09 s | 5449 / 849 | $0.001070 |
| withMemory / rca | 14 / 14 | 9.17 s | 16.09 s | 19496 / 2349 | $0.003630 |

Exact-attributed text total: **50629 input tokens, 7528 output tokens, $0.009837 estimated cost**. Status counts: `{"200":52}`; Gateway retry counts: `[0]`; cached requests: 0.

Within the run window, 46 embedding requests had status counts `{"200":46}`, median 0.53 s and p95 0.66 s. They cannot be allocated reliably by arm, and their logged zero usage/cost is not reliable billing evidence.

- Text calls use workflow ID or run/arm alert ID metadata, not time alone. Preflight and earlier attempts are excluded.
- Embedding calls have no run/arm metadata; timestamp attribution includes possible seed/search/overhead or unrelated calls. Zero logged usage/cost is missing accounting, not proof of free embeddings.
- Gateway retry_count is not SDK/Workflow retries. Cost is logged estimated successful-request cost, not an audited invoice.
- Memory RCA costs include all workflows, including erroneous splits; the two arms do not provide statistical evidence of generalization.

Coverage: `{"withoutMemory":{"expectedCorrelations":10,"recordedCorrelations":10,"completedWorkflows":18,"recordedRcas":18,"intentionallySkippedRcas":0,"applicationRcaAttempts":18},"withMemory":{"expectedCorrelations":10,"recordedCorrelations":10,"completedWorkflows":16,"recordedRcas":14,"intentionallySkippedRcas":2,"applicationRcaAttempts":14}}`. Historical reuse intentionally emits no RCA request. Compare exported RCA counts with application attempts, not completed workflow counts. Do not infer failures from missing export records or compare full-arm token totals as if coverage were equal.

Gateway duration is the exported request duration, not queue-inclusive application latency or necessarily pure inference time. Quantiles use linear interpolation. Accuracy and memory-benefit conclusions remain unchanged; this export does not score RCA correctness.

### Memory Accounting

Text-call coverage is complete in both arms. Without memory: 28 requests, 25684 input / 4330 output tokens, $0.005137 estimated cost. With memory: 24 requests, 24945 input / 3198 output tokens, $0.004700 estimated cost.

With-memory changes relative to without-memory: input tokens -2.88%; output tokens -26.14%; total text tokens -6.23%; logged text cost -8.51%. Request counts and token totals are measured separately; fewer requests do not necessarily imply fewer tokens.

These are observed arm totals, not matched-workflow causal savings: the arms created different numbers of workflows and generated different reports. Embedding-inclusive cost remains unknown. Grouping accuracy and the documented historical-anchoring error are unchanged by this accounting.
