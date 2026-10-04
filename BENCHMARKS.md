# TraceRoot Benchmarks

Controlled alert/evidence replay through real LLMs, local Cloudflare Workflows and remote Vectorize. These results evaluate the current lab implementation, not production incident accuracy or statistically established memory gains.

## Methodology

Both suites use two repetitions in AB/BA order, with and without memory. The model is `@cf/meta/llama-3.1-8b-instruct-fp8`; configured reuse similarity is 0.90 and correlation confidence is 0.80. Current evidence, ground truth and rubrics are fixed before execution. An eight-second fixture delay is included in time-to-RCA.

| Suite | Run ID | Dataset | Cases / alerts per pass | Total alerts / incident instances |
| --- | --- | --- | ---: | ---: |
| Small | `e5a2e55a` | [v4](benchmarks/dataset.json) | 6 / 11 | 44 / 28 |
| Large | `89c2a517` | [v5](benchmarks/dataset-large.json) | 17 / 75 | 300 / 108 |

Small cases cover exact/noisy recurrence, changed image, similar symptoms with a different cause, overlapping independent incidents, and insufficient evidence. Large cases retain those and add ten incident categories, individually and as an interleaved ten-independent-incident burst.

Correlation uses exact one-to-one ground-truth assignment and merge/split pairs. RCA/remediation accuracy are section-specific rule-based proxies, not expert factual grading. Retrieval and reuse are distinct: a match is not proof; correct reuse must select the expected stored incident. Precision is correct reuse / actual reuse; recall uses all created expected-positive investigations. False reuse uses expected-negative investigations.

Unsupported remediation is assessed only on readable representative reports; coverage is shown rather than counting missing output as safe. Failed/malformed reports remain accuracy failures. Tool totals include retries; direct avoided calls count only explicit historical skips. Workflow, application-call and Gateway latency are separate.

## Small Dataset

| Metric | Without memory | With memory |
| --- | ---: | ---: |
| Completed / created workflows | 18 / 18 | 16 / 16 |
| Correlation mapping accuracy | 81.8% | 90.9% |
| Incorrect merge / split pairs | 0 / 6 | 0 / 4 |
| RCA rubric accuracy | 78.6% | 71.4% |
| Remediation rubric accuracy | 42.9% | 57.1% |
| Unsupported fixes / assessed reports | 2 / 14 | 3 / 12 |
| Unsupported remediation rate | 14.3% | 25.0% |
| Retrieved matches | 0 | 16 |
| Reuse precision / recall | N/A | 2/2 (100%) / 2/10 (20%) |
| False reuses / negative investigations | N/A | 0 / 6 |
| Time-to-RCA median / p95 | 51.49s / 55.60s | 51.18s / 62.28s |
| Tool requests / requests per workflow | 90 / 5.00 | 74 / 4.63 |
| RCA attempts / successful | 18 / 18 | 14 / 14 |
| Tool / RCA calls directly avoided | 0 / 0 | 6 / 2 |

Memory did not improve RCA accuracy or p95 here. Rejected reuse still allowed historical anchoring during full RCA generation; the unsupported-action heuristic missed a pool-reset recommendation. Precision rests on just two accepted reuses. Correlation does not consume memory, so grouping differences are not causal memory improvements.

## Large Dataset

**Quota-confounded:** twelve without-memory workflows failed after Workers AI quota exhaustion. Keep these failures in the reported results; do not interpret the full-run arm differences as proven memory gains.

| Metric | Without memory | With memory |
| --- | ---: | ---: |
| Completed / created workflows | 95 / 107 | 100 / 100 |
| Correlation mapping accuracy | 64.7% | 69.3% |
| Incorrect merge / split pairs | 0 / 89 | 0 / 78 |
| RCA rubric accuracy | 61.1% | 75.9% |
| Remediation rubric accuracy | 33.3% | 61.1% |
| Unsupported fixes / assessed reports | 4 / 46 | 1 / 47 |
| Unsupported remediation rate | 8.7% | 2.1% |
| Retrieved matches | 0 | 100 |
| Reuse precision / recall | N/A | 12/12 (100%) / 12/94 (12.8%) |
| False reuses / negative investigations | N/A | 0 / 6 |
| Time-to-RCA median / p95 | 54.05s / 93.13s | 52.79s / 77.76s |
| Tool requests / requests per workflow | 535 / 5.00 | 464 / 4.64 |
| RCA attempts / successful | 119 / 95 | 88 / 88 |
| Tool / RCA calls directly avoided | 0 / 0 | 36 / 12 |

Observed RCA change: +14.8 percentage points. Observed p95 change: -16.5%. The first predeclared repetition was quota-free, with 52/52 workflows completed per arm: RCA rubric passes were 17/27 vs 22/27, remediation 11/27 vs 14/27, and mapping accuracy 66.7% in both arms. This diagnostic subset is not a replacement for the full results or a significance claim.

Individual incident groups mapped at 93.8% vs 96.9%; the ten-incident burst mapped at only 32.8% vs 35.9%. Active-only correlation, completion during sequential intake, model decisions and conservative fallbacks contributed to fragmentation. Zero scored cross-incident merges also reflects configured component scope guards, not unaided LLM reasoning.

## Tokens, Latency & Cost

Exact Gateway metadata links text calls to run, memory arm and operation. Latency below is successful RCA request duration, not end-to-end Workflow time. Cost is logged estimated text-call cost, not an invoice or embedding-inclusive total.

| Suite / arm | Text requests / HTTP 200 | Input / output tokens | RCA median / p95 | Estimated text USD |
| --- | ---: | ---: | ---: | ---: |
| Small / without | 28 / 28 | 25,684 / 4,330 | 10.41s / 14.26s | 0.005137 |
| Small / with | 24 / 24 | 24,945 / 3,198 | 9.17s / 16.09s | 0.004700 |
| Large / without | 231 / 202 | 252,556 / 23,179 | 9.78s / 14.71s | 0.044940 |
| Large / with | 203 / 203 | 270,460 / 20,210 | 9.09s / 13.16s | 0.046800 |

The large export contains 29 quota HTTP 429s, all without memory (24 RCA, five correlation). It covers all recorded RCA attempts but misses one recorded without-memory correlation request. With-memory large-run text tokens rose 5.42% and estimated text cost rose 4.14%. Small totals were lower, but different workflow grouping prevents attributing all differences to reuse. **Cost is being optimized; no general cost-savings claim is established.**

Embedding records lack arm metadata and reliable cost attribution. Zero exported usage/cost is missing accounting, not evidence that embeddings are free. Gateway retry counts do not represent all Workflow retries.

## Limitations

- Small accepted-reuse and negative samples do not establish production safety; expected-negative matches were also below the reuse threshold, so these are not high-similarity negative stress tests.
- Rule-based quality metrics can pass quoted evidence or miss unsupported actions. Non-blinded review found historical anchoring even after reuse rejection.
- Resource/OOM/disk evidence is synthetic. The shared deployment fixture reports a successful rollout while crash-loop/rollout-failure logs describe unavailability, limiting causal validation.
- Explicit component/cause cues simplify replay. Different dataset mixtures and seeded memories make small/large aggregates unsuitable as controlled model comparisons.
- Quota failures, workflow splits, missing Gateway coverage and unassessable reports constrain A/B conclusions. No dataset, threshold or result was changed to make a run look better.

Next priorities: reduce burst fragmentation, prevent conflicting historical context from anchoring RCA, enforce report format, improve semantic remediation assessment, and rerun balanced arms with adequate quota.

## Evidence & Reproduction

| Suite | Configuration | Raw evidence | Gateway summary | Qualitative review |
| --- | --- | --- | --- | --- |
| Small | [Config](benchmarks/config.json) | [Results](benchmarks/results.json) | [Gateway](benchmarks/gateway-summary.json) | [Review](benchmarks/review.json) |
| Large | [Config](benchmarks/config-large.json) | [Results](benchmarks/results-large.json) | [Gateway](benchmarks/gateway-summary-large.json) | [Review](benchmarks/review-large.json) |

[Prerequisites, execution commands and schema](benchmarks/guide.md). Detailed run reports: [small](benchmarks/benchmark-results.md), [large](benchmarks/benchmark-results-large.md). Both final datasets and raw results are preserved; no new benchmark was run for this documentation.
