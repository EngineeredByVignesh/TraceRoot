# Benchmark Guide

## Final Evidence

| Suite | Dataset | Configuration | Raw results | Report | Gateway summary |
| --- | --- | --- | --- | --- | --- |
| Small | [dataset.json](dataset.json) | [config.json](config.json) | [results.json](results.json) | [Report](../benchmark-results.md) | [Summary](gateway-summary.json) |
| Large | [dataset-large.json](dataset-large.json) | [config-large.json](config-large.json) | [results-large.json](results-large.json) | [Report](../benchmark-results-large.md) | [Summary](gateway-summary-large.json) |

The small suite contains six cases covering exact/noisy recurrence, changed image, different cause, overlapping independent incidents and insufficient evidence. The large suite adds ten incident categories, individually and as an interleaved burst, while retaining the small cases. These are controlled evidence replays, not physical production fault injection. Different case mixtures are not a controlled model-quality comparison.

## Prerequisites

1. Follow [IncidentLab setup](../../IncidentLab/README.md), including observability port-forwards. Docker, kubectl, kind, demo service on 8080 and Prometheus on 9090 must be available.
2. Install agent Node dependencies and Python tools API requirements using [TraceRoot setup](../README.md).
3. Configure agent `.dev.vars` and tools API `.env`: authenticated webhook, selected model/provider, remote Vectorize, embedding model/dimensions, and tool endpoints. Keep secrets untracked.
4. Enable `INCIDENT_MEMORY_REUSE_ENABLED=true` and configure `INCIDENT_MEMORY_REUSE_MIN_SCORE` before running. Do not tune thresholds after seeing results.
5. Ensure adequate upstream quota for both memory arms. Stop conflicting agent/tools API processes or choose free ports in the suite configuration. Runs incur real upstream usage.

## Run

From the TraceRoot directory:

```powershell
node --test benchmarks/scoring.test.mjs
node benchmarks/run.mjs
node benchmarks/run.mjs --config config-large.json
```

Each suite runs two repetitions in AB/BA order. The runner checks live prerequisites, then uses controlled deployment/log/metric fixtures with real model calls, local Workflows and remote Vectorize. Configured fixture delay is included in measured time-to-RCA. Ground-truth IDs, expected reuse and scoring rubrics are not model inputs.

New runs overwrite the selected current result/report after archiving its prior raw result/report under `history/`. Preserve the matching Gateway summary and review separately before replacing a final evidence set. No archived old runs ship in this cleaned version.

## Isolation And Recovery

The runner backs up `.dev.vars`, enables authenticated benchmark-only APIs, uses ephemeral local state and isolated remote memory namespaces, temporarily blocks normal Alertmanager intake, and restores configuration after stopping its own processes. It does not write normal incident memory or inject live faults. Do not edit env files during execution. After forced termination, check `.dev.vars.benchmark-backup` before restarting the normal agent.

## Metrics And Schema

- Correlation: exact one-to-one alert assignment, incorrect merges/splits, policy rejections and fallbacks. Memory does not drive correlation; generation/timing differences are not causal memory gains.
- RCA/remediation: section-specific rule-based proxies against ground truth, including unknown causes and contradictory claims. Failed/malformed reports remain in accuracy denominators. Unsupported-remediation assessment excludes unassessable output and reports coverage; it is not expert semantic grading.
- Retrieval: `memory.retrievalReturnedMatch`, `retrievedIncidentId` and `retrievalSimilarity` describe retrieval, not causal confidence. Full retrieved matches remain in `output.historicalContext`.
- Reuse: `expectedReuse`, `output.investigationMode`, `output.reusedIncidentId`, `memory.reuseCorrect` and `output.reuseDecisionReason` distinguish eligibility from actual reuse. Correct reuse must select the expected seeded record.
- Reuse precision divides correct reuse by actual reuse; recall divides correct reuse by created expected-positive investigations, counting unavailable outcomes as misses. False reuse rate uses expected-negative investigations and is unknown when negative decisions are unavailable. Disabled-memory arms are not graded for reuse.
- Efficiency: actual tool requests including retries per created investigation; three skipped evidence calls and one skipped RCA call per confirmed reuse. Different workflow counts/retries are not direct reuse savings.
- Timing: Workflow event-to-report `output.timeToRcaMs`, application model timing and Gateway timing are separate. Tokens/cost require the matching export; embeddings without arm metadata cannot be reliably attributed. Quota failures, missing calls and retries must remain visible.

Run-linked `review.json` and `review-large.json` preserve qualitative findings without altering scores. Saved raw results are authoritative; report regeneration does not rescore them.

## Reports And Gateway

```powershell
node benchmarks/run.mjs --report-only
node benchmarks/analyze-gateway.mjs "<small-export.json>"
node benchmarks/run.mjs --config config-large.json --report-only
node benchmarks/analyze-gateway.mjs "<large-export.json>" --config config-large.json
```

Report-only performs no model calls but replaces the base report; rerun Gateway analysis afterward. Preserve any manually appended Gateway interpretation before regeneration. Exact request metadata links text calls to arms/operations. Timestamp-only embedding records and zero exported usage are not evidence of free calls.

The final reports retain measured failures and qualitative limitations. The large run is quota-confounded; do not present full-run differences as a clean causal memory improvement.
