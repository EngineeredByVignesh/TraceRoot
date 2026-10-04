# TraceRoot Large-Scale Benchmark Results

**Quota-confounded run, not a clean full-run A/B comparison.** All 300 alerts were replayed, but Cloudflare's daily neuron allocation ran out during the final without-memory pass. Twelve workflows failed. Failed reports remain in the accuracy denominators; the apparent full-run quality advantage of memory must not be interpreted as a causal improvement. No results, dataset, model or thresholds were changed to hide these failures.

Run: 89c2a517. Window: 2026-10-04T10:14:52.723Z to 2026-10-04T11:31:34.135Z.
Model: cloudflare/@cf/meta/llama-3.1-8b-instruct-fp8. Dataset: v5, SHA-256 136e739050fac7306e59c67171e73634e90f566d4f5ec332b8a5a73234de1717.
Memory reuse: true; similarity threshold 0.9. Correlation confidence threshold 0.8.

## Results

| Metric | Without memory | With memory |
| --- | ---: | ---: |
| Alerts / true incident instances | 150 / 54 | 150 / 54 |
| **Correlation quality** |  |  |
| Alert mapping accuracy | 64.7% | 69.3% |
| Incorrect merge pairs / cross-incident pairs | 0 / 932 | 0 / 932 |
| Incorrect split pairs / related pairs | 89 / 154 | 78 / 154 |
| Completed / created workflows | 95 / 107 | 100 / 100 |
| **RCA and remediation quality** |  |  |
| RCA accuracy (rubric proxy) | 61.1% | 75.9% |
| Remediation accuracy (rubric proxy) | 33.3% | 61.1% |
| Unsupported remediation rate (rule-detected) | 8.7% | 2.1% |
| Unsupported fixes / assessed representative reports | 4 / 46 | 1 / 47 |
| Root cause keyword passes / incident instances | 33 / 54 | 41 / 54 |
| Fix keyword passes / incident instances | 18 / 54 | 33 / 54 |
| Three-section format passes / completed workflows | 83 / 95 | 87 / 100 |
| **Retrieval and reuse quality** |  |  |
| Investigations with retrieved matches | 0 | 100 |
| Reuse precision (correct incident ID required) | N/A | 100.0% |
| Reuse recall (per expected-positive investigation) | N/A | 12.8% |
| False reuse rate (per expected-negative investigation) | N/A | 0.0% |
| Unknown reuse decisions / correctness | 0 | 0 |
| Reused / completed workflows | 0 / 95 | 12 / 100 |
| Known recurrence reuse hits / created recurrence workflows | 0 / 101 | 12 / 94 |
| False reuse / created fallback-test workflows | 0 / 6 | 0 / 6 |
| Fallback-test workflows with unknown outcome | 3 | 0 |
| **Efficiency** |  |  |
| Tool calls avoided through historical reuse (planned, excludes retries) | 0 | 36 |
| RCA LLM calls avoided through historical reuse | 0 | 12 |
| Workflow time-to-RCA median | 54.05 s | 52.79 s |
| Workflow time-to-RCA p95 | 93.13 s | 77.76 s |
| Actual tool HTTP requests (including retries) | 535 | 464 |
| Tool HTTP requests / created workflow | 5.00 | 4.64 |
| RCA LLM attempts / successful | 119 / 95 | 88 / 88 |
| Correlation LLM attempts / successful | 113 / 108 | 115 / 115 |
| RCA generation skipped by reuse | 0 | 12 |
| Batch-to-report median | 170.09 s | 167.04 s |
| Batch-to-report p95 | 240.78 s | 218.37 s |

## Memory Interpretation

Observed total tool-request change: 71 fewer with memory. RCA-attempt change: 31 fewer. These arm totals also reflect any differences in workflow grouping and retries; do not attribute all changes to reuse.
No-memory disables retrieval and reuse. Reuse saves the RCA generation request, not embeddings or alert correlation. A shorter investigation can finish before later alerts arrive, reducing active correlation candidates and increasing split workflows. Inspect grouping as well as per-workflow savings.

## Case Outcomes

| Arm / case | Status | Mode | Expected reuse | Top retrieval similarity | Reuse correct | Reason |
| --- | --- | --- | --- | ---: | --- | --- |
| withoutMemory / large-bad_deploy-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-memory_leak-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-cpu_saturation-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-db_problem-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-dependency_outage-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-traffic_spike-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-traffic_spike-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-crash_loop-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-rollout_failure-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-rollout_failure-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-disk_pressure-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-network_latency-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / overlapping-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / overlapping-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / overlapping-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / overlapping-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / database-only-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / changed-image-r1 | complete | full | false | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / different-database-cause-r1 | complete | full | false | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / noisy-recurrence-r1 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / insufficient-evidence-r1 | complete | full | false | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-bad_deploy-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-memory_leak-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-cpu_saturation-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-db_problem-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-dependency_outage-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-traffic_spike-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-traffic_spike-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-traffic_spike-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-crash_loop-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-rollout_failure-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-disk_pressure-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-network_latency-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r2 | complete | full | true | N/A | unknown/not assessed | memory-disabled |
| withoutMemory / large-independent-burst-r2 | errored | unknown | true | N/A | unknown/not assessed | unavailable |
| withoutMemory / overlapping-r2 | errored | unknown | true | N/A | unknown/not assessed | unavailable |
| withoutMemory / overlapping-r2 | errored | unknown | true | N/A | unknown/not assessed | unavailable |
| withoutMemory / overlapping-r2 | errored | unknown | true | N/A | unknown/not assessed | unavailable |
| withoutMemory / overlapping-r2 | errored | unknown | true | N/A | unknown/not assessed | unavailable |
| withoutMemory / overlapping-r2 | errored | unknown | true | N/A | unknown/not assessed | unavailable |
| withoutMemory / database-only-r2 | errored | unknown | true | N/A | unknown/not assessed | unavailable |
| withoutMemory / database-only-r2 | errored | unknown | true | N/A | unknown/not assessed | unavailable |
| withoutMemory / changed-image-r2 | errored | unknown | false | N/A | unknown/not assessed | unavailable |
| withoutMemory / different-database-cause-r2 | errored | unknown | false | N/A | unknown/not assessed | unavailable |
| withoutMemory / noisy-recurrence-r2 | errored | unknown | true | N/A | unknown/not assessed | unavailable |
| withoutMemory / insufficient-evidence-r2 | errored | unknown | false | N/A | unknown/not assessed | unavailable |
| withMemory / large-bad_deploy-r1 | complete | full | true | 0.8754 | false | below-retrieval-threshold |
| withMemory / large-memory_leak-r1 | complete | full | true | 0.8840 | false | below-retrieval-threshold |
| withMemory / large-cpu_saturation-r1 | complete | full | true | 0.8974 | false | below-retrieval-threshold |
| withMemory / large-db_problem-r1 | complete | full | true | 0.8912 | false | below-retrieval-threshold |
| withMemory / large-db_problem-r1 | complete | full | true | 0.8836 | false | below-retrieval-threshold |
| withMemory / large-dependency_outage-r1 | complete | full | true | 0.8877 | false | below-retrieval-threshold |
| withMemory / large-traffic_spike-r1 | complete | full | true | 0.8988 | false | below-retrieval-threshold |
| withMemory / large-crash_loop-r1 | complete | full | true | 0.8920 | false | below-retrieval-threshold |
| withMemory / large-rollout_failure-r1 | complete | full | true | 0.8931 | false | below-retrieval-threshold |
| withMemory / large-rollout_failure-r1 | complete | full | true | 0.8864 | false | below-retrieval-threshold |
| withMemory / large-disk_pressure-r1 | complete | full | true | 0.8897 | false | below-retrieval-threshold |
| withMemory / large-network_latency-r1 | complete | historical-reuse | true | 0.9136 | true | current-evidence-satisfies-reuse-conditions |
| withMemory / large-independent-burst-r1 | complete | full | true | 0.8770 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r1 | complete | full | true | 0.8868 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r1 | complete | full | true | 0.8997 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r1 | complete | historical-reuse | true | 0.9136 | true | current-evidence-satisfies-reuse-conditions |
| withMemory / large-independent-burst-r1 | complete | full | true | 0.8884 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r1 | complete | full | true | 0.8883 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r1 | complete | full | true | 0.8943 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r1 | complete | full | true | 0.8878 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r1 | complete | full | true | 0.8754 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r1 | complete | full | true | 0.8840 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r1 | complete | full | true | 0.8974 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r1 | complete | full | true | 0.8912 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r1 | complete | full | true | 0.8877 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r1 | complete | full | true | 0.8988 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r1 | complete | full | true | 0.8920 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r1 | complete | full | true | 0.8931 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r1 | complete | full | true | 0.8897 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r1 | complete | historical-reuse | true | 0.9131 | true | current-evidence-satisfies-reuse-conditions |
| withMemory / large-independent-burst-r1 | complete | historical-reuse | true | 0.9058 | true | current-evidence-satisfies-reuse-conditions |
| withMemory / large-independent-burst-r1 | complete | full | true | 0.8919 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r1 | complete | historical-reuse | true | 0.9099 | true | current-evidence-satisfies-reuse-conditions |
| withMemory / large-independent-burst-r1 | complete | full | true | 0.8884 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r1 | complete | full | true | 0.8634 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r1 | complete | full | true | 0.8835 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r1 | complete | full | true | 0.8865 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r1 | complete | full | true | 0.8836 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r1 | complete | full | true | 0.8987 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r1 | complete | full | true | 0.8864 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r1 | complete | full | true | 0.8882 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r1 | complete | full | true | 0.8898 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r1 | complete | full | true | 0.8858 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r1 | complete | full | true | 0.8999 | false | below-retrieval-threshold |
| withMemory / overlapping-r1 | complete | full | true | 0.8413 | false | below-retrieval-threshold |
| withMemory / overlapping-r1 | complete | full | true | 0.8859 | false | below-retrieval-threshold |
| withMemory / overlapping-r1 | complete | full | true | 0.8530 | false | below-retrieval-threshold |
| withMemory / database-only-r1 | complete | historical-reuse | true | 0.9128 | true | current-evidence-satisfies-reuse-conditions |
| withMemory / changed-image-r1 | complete | full | false | 0.8556 | true | deployment-image-mismatch |
| withMemory / different-database-cause-r1 | complete | full | false | 0.8630 | true | conflicting-current-logs |
| withMemory / noisy-recurrence-r1 | complete | full | true | 0.8720 | false | below-retrieval-threshold |
| withMemory / insufficient-evidence-r1 | complete | full | false | 0.8471 | true | missing-current-log-signatures |
| withMemory / large-bad_deploy-r2 | complete | full | true | 0.8754 | false | below-retrieval-threshold |
| withMemory / large-memory_leak-r2 | complete | full | true | 0.8840 | false | below-retrieval-threshold |
| withMemory / large-cpu_saturation-r2 | complete | full | true | 0.8974 | false | below-retrieval-threshold |
| withMemory / large-db_problem-r2 | complete | full | true | 0.8912 | false | below-retrieval-threshold |
| withMemory / large-dependency_outage-r2 | complete | full | true | 0.8877 | false | below-retrieval-threshold |
| withMemory / large-traffic_spike-r2 | complete | full | true | 0.8988 | false | below-retrieval-threshold |
| withMemory / large-crash_loop-r2 | complete | full | true | 0.8920 | false | below-retrieval-threshold |
| withMemory / large-rollout_failure-r2 | complete | full | true | 0.8931 | false | below-retrieval-threshold |
| withMemory / large-disk_pressure-r2 | complete | full | true | 0.8897 | false | below-retrieval-threshold |
| withMemory / large-network_latency-r2 | complete | historical-reuse | true | 0.9136 | true | current-evidence-satisfies-reuse-conditions |
| withMemory / large-independent-burst-r2 | complete | full | true | 0.8997 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r2 | complete | full | true | 0.8943 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r2 | complete | full | true | 0.8878 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r2 | complete | full | true | 0.8884 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r2 | complete | full | true | 0.8754 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r2 | complete | full | true | 0.8840 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r2 | complete | full | true | 0.8974 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r2 | complete | full | true | 0.8912 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r2 | complete | full | true | 0.8877 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r2 | complete | full | true | 0.8988 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r2 | complete | full | true | 0.8920 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r2 | complete | full | true | 0.8931 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r2 | complete | full | true | 0.8897 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r2 | complete | historical-reuse | true | 0.9136 | true | current-evidence-satisfies-reuse-conditions |
| withMemory / large-independent-burst-r2 | complete | full | true | 0.8770 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r2 | complete | full | true | 0.8882 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r2 | complete | historical-reuse | true | 0.9099 | true | current-evidence-satisfies-reuse-conditions |
| withMemory / large-independent-burst-r2 | complete | full | true | 0.8898 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r2 | complete | full | true | 0.8919 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r2 | complete | historical-reuse | true | 0.9131 | true | current-evidence-satisfies-reuse-conditions |
| withMemory / large-independent-burst-r2 | complete | full | true | 0.8634 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r2 | complete | full | true | 0.8835 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r2 | complete | historical-reuse | true | 0.9058 | true | current-evidence-satisfies-reuse-conditions |
| withMemory / large-independent-burst-r2 | complete | full | true | 0.8836 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r2 | complete | full | true | 0.8987 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r2 | complete | full | true | 0.8858 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r2 | complete | full | true | 0.8864 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r2 | complete | full | true | 0.8865 | false | below-retrieval-threshold |
| withMemory / large-independent-burst-r2 | complete | full | true | 0.8999 | false | below-retrieval-threshold |
| withMemory / overlapping-r2 | complete | full | true | 0.8460 | false | below-retrieval-threshold |
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
- withoutMemory/correlation: 108 successful calls; median 3.94 s, p95 6.20 s.
- withoutMemory/rca: 95 successful calls; median 10.41 s, p95 15.24 s.
- withMemory/correlation: 115 successful calls; median 4.03 s, p95 6.60 s.
- withMemory/rca: 88 successful calls; median 9.67 s, p95 13.73 s.

## Gateway Accounting

The matching AI Gateway export is analyzed below. Tokens, cost, Gateway request durations and Gateway retry counts are not estimated from application timing. Intentional reuse produces no RCA Gateway request; missing expected calls are reported separately by the analyzer.

## Scope And Limitations

Controlled evidence replay with real LLMs, local Workflows and remote Vectorize; 2 repetitions in AB/BA order. Case types: single-incident-alert-group, single-incident-alert-group, single-incident-alert-group, single-incident-alert-group, single-incident-alert-group, single-incident-alert-group, single-incident-alert-group, single-incident-alert-group, single-incident-alert-group, single-incident-alert-group, ten-independent-simultaneous-incidents, overlapping, exact-recurrence, changed-image, different-database-cause, same-cause-noisy-wording, unknown-cause-safe-diagnostics. Known recurrence memories contain explicit benchmark-reviewed rules; this is assisted replay, not production-generalization accuracy.
Fixture evidence calls each wait 8 seconds. Batch-to-report is a polling observation that includes intake, fixture delays and queue wait; it is not pure model latency. Completed-only timing can hide failure: inspect completion counts.
RCA/fix accuracy uses section-specific patterns, unknown-cause expectations and explicit contradictory-cause/unsupported-action rules on one representative workflow per true incident. These are transparent proxies, not expert semantic/factual accuracy; negation and conditional wording still need review. Failed/malformed reports stay in accuracy denominators; unsupported-rate coverage excludes unassessable reports and is shown explicitly. Existing saved results are not rescored. No repairs were executed.
Reuse precision checks the reused incident ID against the seeded ground-truth incident, not just expected reuse eligibility. Recall is per created expected-positive investigation and conservatively includes unavailable outcomes as missed positives. False reuse rate is conditional on expected-negative investigations and is unknown if any negative decision is unavailable. Disabled-memory arms are not scored for reuse. Similarity is retrieval similarity, never causal confidence. Top retrieval ID/score can differ from the selected reused incident; complete retrieved matches remain in historicalContext.
Workflow time-to-RCA measures Workflow event timestamp through report publication, including retries and evidence collection, not recovery. Batch observations additionally include admission and polling. Avoided tool counts are the known three-step shortcut, not a counterfactual estimate of avoided retries. Embedding/search and correlation are not avoided; use actual HTTP/LLM logs and the matching Gateway export for observed totals.
False reuse is checked on changed-image, different-cause and insufficient-evidence workflows. Low recurrence hit rate can result from similarity filtering, indexing or rule validation; it is not silently tuned after execution. Retrieval failure must not be counted as a safe success.
Tool counts are actual fixture HTTP requests including retries, not embedding/Vectorize calls. Isolated memory seeds and preflight overhead are separate from scored workflows. No live failure injection or ordinary memory-namespace changes occur.

## Prerequisites And Errors

Live smoke test: {"demoService":"Existing kind deployment /healthz reachable (HTTP 200); not proof of application health","prometheus":"ready","kube-prometheus-stack-alertmanager":"ready","loki":"ready","tools/deployments":200,"tools/alerts":200,"liveMetrics":200,"liveLogs":200,"agent":"ready","model":{"text":"OK","structuredOutput":{"correlated":false,"investigationId":null,"confidence":0.7,"reason":"Below configured confidence threshold (0.8): Latency and errors on the same renderer component after a deployment suggest a causal relationship.","latencyMs":2123,"modelCorrelated":true,"modelConfidence":0.7,"formatFallback":false,"outcome":"low-confidence"}}}.
Runner errors: none.

## Raw Evidence

Raw decisions, reports, scopes, expected reuse eligibility, model events and actual tool calls: [results](benchmarks/results-large.json).
Reproduction instructions and metric definitions: [benchmark guide](benchmarks/guide.md). Final datasets: [small](benchmarks/dataset.json) and [large](benchmarks/dataset-large.json).

## Scale Breakdown

Ten individual incident types (32 alerts), one interleaved ten-independent-incident burst (32 alerts), and the six unchanged small-dataset cases (11 alerts), repeated twice per memory arm. Total: 300 alerts, 108 ground-truth incident instances, 207 created workflows, 195 completed workflows. Ground-truth instances are counted per case/repetition/arm, not as 108 distinct production root causes.

| Group / arm | Alerts / true incidents | Created / completed workflows | Mapping accuracy | Incorrect split pairs / related pairs |
| --- | ---: | ---: | ---: | ---: |
| Individual types / without memory | 64 / 20 | 24 / 24 | 93.8% | 10 / 72 |
| Individual types / with memory | 64 / 20 | 22 / 22 | 96.9% | 4 / 72 |
| Ten-incident burst / without memory | 64 / 20 | 63 / 62 | 32.8% | 71 / 72 |
| Ten-incident burst / with memory | 64 / 20 | 61 / 61 | 35.9% | 69 / 72 |
| Original six cases / without memory | 22 / 14 | 20 / 9 | 72.7% | 8 / 10 |
| Original six cases / with memory | 22 / 14 | 17 / 17 | 86.4% | 5 / 10 |

All scored cross-incident pairs remained separate. However, the configured component scope policy rejects cross-component merges; this is not proof that the LLM inferred independence unaided. Mapping accuracy is exact one-to-one assignment against ground truth, not merely the percentage of alerts assigned somewhere.

Burst workflows by repetition: without memory 31 and 32, with memory 32 and 29, against ten expected incidents each. This reveals severe fragmentation despite good isolated grouping. Intake is sequential and classification/RCA share a two-slot model budget. Status checks confirmed early burst workflows could finish before intake ended; active-only correlation then loses completed candidates. Incorrect model decisions and conservative fallbacks also occurred. No investigation lifetime or concurrency was tuned to force ten workflows.

## Quota And Reliability

All twelve failed workflows were in withoutMemory repetition 2: one final burst workflow and eleven workflows in the original six-case subset. Every recorded workflow error reports Workers AI error `4006`, exhaustion of the daily free neuron allocation. Application events contain 24 failed RCA attempts (initial attempts plus retries) and five failed correlation API calls with the same quota message. Runner errors being empty means the replay and cleanup finished; it does not mean all model calls succeeded.

The first repetition completed before these quota API failures, with 52/52 workflows complete in each arm. As an additional diagnostic, not a replacement for full-run results:

| First repetition only | Without memory | With memory |
| --- | ---: | ---: |
| Alerts / ground-truth incidents | 75 / 27 | 75 / 27 |
| Alert mapping accuracy | 66.7% | 66.7% |
| RCA rubric passes | 17 / 27 | 22 / 27 |
| Remediation rubric passes | 11 / 27 | 14 / 27 |

This subset is not selected as a winning result: it is the first predeclared repetition and is shown to expose the quota/order confound. It still has synthetic evidence, format/scorer limitations, grouping variation and non-blinded review; it does not establish statistically significant memory benefit.

Check Workers AI usage and ensure adequate quota before a fresh balanced rerun. Cloudflare documents a 10,000-neuron daily free allocation, daily reset at 00:00 UTC (05:30 IST), and Workers Paid for usage beyond the free allocation. No billing or provider configuration was changed by this task. See [Workers AI pricing and quota](https://developers.cloudflare.com/workers-ai/platform/pricing/). Waiting for reset alone does not establish that this full suite will fit within a fresh free allocation.

## Memory And Quality Review

- All 100 memory-assisted investigations retrieved a match. Twelve reused the expected seeded incident; reuse precision was 12/12, recall 12/94 created expected-positive investigations, and false reuse was 0/6 expected-negative investigations. Retrieval similarity is not causal confidence. Expected-negative similarities were also below 0.90, so this is not a high-similarity negative stress test.
- The twelve reuses directly skipped 36 planned tool requests and twelve RCA generation calls. Observed arm totals differ by 71 tool requests and 31 RCA attempts, but the rest includes different workflow grouping, retries and quota failures. Those totals are not pure reuse savings.
- Non-blinded spot check: withMemory different-database-cause-r1 rejected reuse because of conflicting current logs, yet blamed insufficient pool capacity and suggested increasing it despite authentication/permission-denied evidence. Its RCA keyword proxy can pass because authentication terms are quoted; a passing pattern score is not factual correctness. Source: `alert-e32cede006b4c9d3b8abb34eec5f75ac6362b59e25f956a57f95c80943afcf20`.
- WithMemory insufficient-evidence-r2 gave an unknown RCA and diagnostic next steps but used bold labels instead of the required three `##` headings. Its format failure stays in the scored results. Source: `alert-4e63e373f84d5c18cb131a522d28463e292e15cf701915a0fe496b60da011cfb`.
- Required-format passes were 83/95 completed without-memory and 87/100 completed with-memory workflows. Unsupported-remediation rates assess only 46/54 and 47/54 representative reports respectively; failed or malformed reports are not counted as safe fixes. The existing rule-based evaluator can miss unsupported actions, as already documented in the small run; it was not changed after seeing this run.

## Fixture And Comparison Limits

The new resource, OOM, restart, rollout and disk alerts in IncidentLab are explicitly synthetic signals, not real resource/Kubernetes fault measurements. Benchmark evidence is controlled replay, using real remote LLMs/Vectorize and local Workflows. No live demo image rebuild, rule deployment or physical fault injection was performed during this benchmark; IncidentLab's README supplies those setup commands.

Scenario names, summaries and logs carry clear diagnostic cues, and distinct components identify the intended incident boundaries. This is not a blind production-RCA or cross-component cascade benchmark. The shared deployment fixture always reports a successful rollout, while crash-loop/rollout-failure logs describe unavailable replicas; the rollout log also refers to a missing image tag. These contradictory fixture fields limit the validity of those RCA/reuse results. They were not repaired mid-run or hidden; correct deployment-state fixtures are needed before treating those scenarios as validated diagnostics.

The small v4 dataset, raw results and matching Gateway summary are preserved; report documentation links were cleaned without changing measured results. They remain at `benchmarks/dataset.json`, `benchmarks/results.json`, `benchmark-results.md`, and `benchmarks/gateway-summary.json`. The large run changes case mixture and expands the seeded memory catalog, so aggregate small/large percentages are not a controlled model comparison.

Setup/preflight calls are not scored investigations and are excluded from Gateway text accounting. The scalable evaluator was validated against frozen small-run correlation scores before this scored run.

Matching Gateway accounting is included below and saved separately in `benchmarks/gateway-summary-large.json`. Regenerate it with `node benchmarks/analyze-gateway.mjs "<export.json>" --config config-large.json` after report-only regeneration. Scored raw result SHA-256: `52bda981ca60084a72031fb7af85a36f622b2e076aab25309e1e89116a563374`.

## AI Gateway Export Analysis

Export: `logs-2026-10-04T11_54_55.108Z.json`; SHA-256 recorded in `benchmarks/gateway-summary-large.json`. 1000 records (1000 unique); 434 text requests match run 89c2a517 by metadata. Earlier runs/preflight are excluded.

| Arm / operation | Requests / HTTP 200 | Median | p95 | Input / output tokens | Estimated USD |
| --- | ---: | ---: | ---: | ---: | ---: |
| withoutMemory / correlation | 112 / 107 | 3.21 s | 5.62 s | 123692 / 5923 | $0.020449 |
| withoutMemory / rca | 119 / 95 | 9.78 s | 14.71 s | 128864 / 17256 | $0.024490 |
| withMemory / correlation | 115 / 115 | 3.64 s | 6.18 s | 127289 / 6693 | $0.021216 |
| withMemory / rca | 88 / 88 | 9.09 s | 13.16 s | 143171 / 13517 | $0.025584 |

Exact-attributed text total: **523016 input tokens, 43389 output tokens, $0.091740 estimated cost**. Status counts: `{"200":405,"429":29}`; Gateway retry counts: `[0]`; cached requests: 0.

Within the run window, 155 embedding requests had status counts `{"200":155}`, median 0.51 s and p95 0.63 s. They cannot be allocated reliably by arm, and their logged zero usage/cost is not reliable billing evidence.

- Text calls use workflow ID or run/arm alert ID metadata, not time alone. Preflight and earlier attempts are excluded.
- Embedding calls have no run/arm metadata; timestamp attribution includes possible seed/search/overhead or unrelated calls. Zero logged usage/cost is missing accounting, not proof of free embeddings.
- Gateway retry_count is not SDK/Workflow retries. Cost is logged estimated successful-request cost, not an audited invoice.
- Memory RCA costs include all workflows, including erroneous splits; the two arms do not provide statistical evidence of generalization.

Coverage: `{"withoutMemory":{"expectedCorrelations":116,"recordedCorrelations":112,"completedWorkflows":95,"recordedRcas":119,"intentionallySkippedRcas":0,"applicationRcaAttempts":119},"withMemory":{"expectedCorrelations":116,"recordedCorrelations":115,"completedWorkflows":100,"recordedRcas":88,"intentionallySkippedRcas":12,"applicationRcaAttempts":88}}`. Historical reuse intentionally emits no RCA request. Compare exported RCA counts with application attempts, not completed workflow counts. Do not infer failures from missing export records or compare full-arm token totals as if coverage were equal.

Gateway duration is the exported request duration, not queue-inclusive application latency or necessarily pure inference time. Quantiles use linear interpolation. Accuracy and memory-benefit conclusions remain unchanged; this export does not score RCA correctness.

### Large-Run Interpretation

The 29 exported HTTP 429 responses are all in the without-memory arm: 24 RCA attempts and five correlation calls. These counts agree with the recorded quota failures in application events. Gateway retry_count=0 does not mean there were no Workflow retries: those are separate exported RCA attempts.

All 207 application-recorded RCA attempts are present, including failures; the twelve historical reuses intentionally have no RCA request. Correlation coverage is less complete: the application records 113 without-memory attempts and 115 with-memory attempts, while the export contains 112 and 115. One recorded without-memory attempt is unmatched. Expected correlation decisions (116 per arm) also include decisions without an application request event; do not assume every unmatched decision reached the Gateway. The export has exactly 1,000 records, which alone does not establish complete export coverage.

| Observed exported text totals | Without memory | With memory |
| --- | ---: | ---: |
| Requests / HTTP 200 / HTTP 429 | 231 / 202 / 29 | 203 / 203 / 0 |
| Input + output tokens (successful calls) | 275,735 | 290,670 |
| Logged estimated successful-call cost | $0.044940 | $0.046800 |

With memory, the observed exported successful-call token total is 5.42% higher and logged text cost 4.14% higher, despite fewer requests. This is not a clean cost comparison: quota failures disproportionately suppressed successful without-memory calls, correlation coverage is not fully reconciled, and workflow grouping differed. It does not establish that memory increased cost, nor support a claim that memory saved total tokens or cost. Direct reuse still skipped the twelve RCA calls already documented; their counterfactual token cost is not measured. Embedding-inclusive cost remains unknown. Benchmark accuracy scores and raw results are unchanged.
