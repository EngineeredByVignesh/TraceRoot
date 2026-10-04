# Incident Benchmark

## Files

- `dataset.json`: version 4; six small cases covering exact/noisy recurrence, changed image, same symptoms/different cause, independent overlapping incidents, and insufficient evidence.
- `config.json`: ports, delays, timeouts and AB/BA repetitions.
- `run.mjs`, `scoring.mjs`, `scoring.test.mjs`: runner, transparent scoring and tests.
- `results.json`, `../benchmark-results.md`: current raw results and generated report.
- `review.json`: run-linked qualitative findings, preserved by report regeneration without changing automated scores.
- `analyze-gateway.mjs`, `gateway-summary.json`: accounting after the matching export arrives.
- `baseline/`: best previous run b394e216, raw results, report and matching Gateway summary. No older datasets, provider-specific runners or superseded failed attempts are retained.

## Large Benchmark

The small dataset, raw results, report and Gateway summary stay unchanged. `dataset-large.json` v5 includes the ten production incident categories (32 alert types), each alone and in an interleaved ten-independent-incident burst, plus all six unchanged small-dataset behavior cases. Explicit ground truth, current component logs, HTTP/DB metrics and reuse conditions are fixed before execution. Histories for the two original recurrence types are preserved with additional allowed synthetic alert names; eight additional incident histories are seeded in the isolated namespace.

`config-large.json` runs two repetitions in AB/BA order: 17 cases, 75 alerts and 27 true incidents per pass; 300 alerts and 108 true incident instances overall. Fixture delays, model and thresholds stay unchanged. The runner's intake/workflow observation timeout is 15 minutes for larger alert batches; provider queue/time budgets remain unchanged. Large bursts may outlive active investigations, so fragmentation is measured rather than prevented. Component scope policy still applies; this is not a cross-component causal-cascade test.

```powershell
node benchmarks/run.mjs --config config-large.json
node benchmarks/run.mjs --config config-large.json --report-only
node benchmarks/analyze-gateway.mjs "D:\MY FILES\Downloads\<large-run-export>.json" --config config-large.json
```

Outputs: `results-large.json`, `../benchmark-results-large.md`, and `gateway-summary-large.json`. Gateway accounting waits for the matching export. Small and large runs have different case mixtures and memory catalogs; compare scale and failure modes, not aggregate percentages as a controlled model-quality improvement. Resource/OOM/disk signals in IncidentLab are safe synthetic simulations, not physical fault injection. The benchmark uses real LLM calls, local Workflows and remote Vectorize with controlled evidence replay.

Run-specific scale/qualitative notes in `review-large.json` are preserved by report-only regeneration only when the run ID matches. The first large run exhausted Workers AI's quota in its final arm: full-run A/B quality is confounded, not a clean improvement result. Inspect completion counts and the report's quota warning before interpreting accuracy. Ensure adequate quota for another balanced replay; no provider or billing change is automatic.

## Prerequisites

Node/npm dependencies in `cloudflare/agents-starter`, Python with the tools API requirements, Docker, kubectl, an existing kind lab, demo service on 8080 and Prometheus on 9090. Alertmanager/Loki must be running; the runner opens their port-forwards if needed. Configure agent `.dev.vars` and `tools-api/.env`, including webhook token, provider authentication, remote Vectorize, embedding model/dimensions and normal tool settings.

Set `INCIDENT_MEMORY_REUSE_ENABLED=true` and an explicit `INCIDENT_MEMORY_REUSE_MIN_SCORE` before starting. Thresholds are recorded, not tuned after observing scores. No new Cloudflare resources are required. Stop an existing agent/tools API or select free ports in `config.json`. Remote calls consume quota and add three reviewed test memories to an isolated benchmark namespace.

## Run

From TraceRoot:

```powershell
node --test benchmarks/scoring.test.mjs
node benchmarks/run.mjs
```

The runner checks real lab tools and configured models, then scores controlled deployment/log/metric replay through real alert admission, LLMs, local Workflows and remote Vectorize. Two repetitions use AB then BA. Each repetition has 11 alerts and seven true incident instances: 22 alerts/14 incident instances per arm, 44 alerts total. The database authentication and pool-exhaustion cases share error-rate/latency symptoms but have different diagnostic logs. Noisy recurrence changes alert wording, not current cause/evidence. The insufficient-evidence case has empty metric results and no diagnostic log signature; it expects an unknown RCA and supported next diagnostics, not a guessed fix.

Known memories have explicit reuse rules. Negative cases share database scope but must fall back because the image or diagnostic signature differs. Reuse eligibility is ground truth kept outside model prompts. Ground-truth incident IDs and regex rubrics are not model inputs. Reuse decisions are measured, never assumed.

A deliberate eight-second evidence-response delay keeps workflows active for incoming alerts; completion latency includes it. Faster reused workflows can finish during admission and cause extra workflows. The report separates correlation quality, RCA/remediation quality, retrieval/reuse quality and efficiency. Report headings stay RCA, Summary and Fix. Accuracy is a section-specific rubric proxy with unknown-cause, contradictory-claim and unsupported-action checks, not expert semantic accuracy. Negation/conditional wording still needs review. Unsupported remediation rate includes only assessable representative reports; failures/malformed output stay in accuracy denominators, with assessment coverage shown separately.

## Memory Schema And Metrics

Existing `expectedReuse`, `output.investigationMode` (actual reuse), `output.reusedIncidentId` and `output.historicalContext` remain. Each investigation adds `memory` with `enabled`, `retrievalReturnedMatch`, top `retrievedIncidentId`, `retrievalSimilarity` and `reuseCorrect`. Complete matches remain in historicalContext; the top retrieved record need not be the reused record. `output.reuseDecisionReason` records acceptance/rejection and `output.timeToRcaMs` measures Workflow event through report publication. Missing old fields are unknown, not inferred success. The run records seeded memory IDs/titles so expected-positive reuse must select the correct record, not merely any record.

Reuse precision is correct-ID reuse divided by actual reuse; recall is correct reuse divided by all created expected-positive investigations, including unavailable outcomes as misses. False reuse rate is reuse among expected-negative investigations and remains unknown if any negative decision is unavailable. Disabled-memory arms are not graded for reuse. Split workflows can affect these per-investigation denominators, so correlation remains separate.

Average tool calls use actual fixture requests including retries divided by created investigations. Tool calls avoided use the three skipped evidence steps per confirmed reuse (no invented avoided retries); RCA calls avoided use the existing explicit skip flag. Workflow time-to-RCA includes evidence/retries/publication but not actual repair; legacy batch/polling timing and application LLM timing remain separate. Token/cost/Gateway-duration reporting is unchanged and requires the matching export, including embedding-accounting limitations. Similarity is retrieval similarity, not causal confidence.

Dataset/scorer v4/2 are prepared for the next run. Existing results/report/export for `60e43679` are preserved unchanged and must not be relabeled or rescored as the new benchmark. Thresholds and provider configuration have not been changed; no new benchmark is run without the user's go-ahead.

## Isolation And Recovery

The runner backs up `.dev.vars`, enables authenticated benchmark-only APIs, uses ephemeral local state and a dedicated remote memory namespace, blocks normal Alertmanager alerts with a temporary allowlist, and restores the env after stopping its own processes. No live failure injection or normal memory writes happen. Do not edit env while it runs. After forced termination, check/restore `.dev.vars.benchmark-backup` before restarting the normal agent. Reruns preserve the previous current run in `history/`; the initial obsolete history was removed during cleanup.

## Reports And Gateway

```powershell
node benchmarks/run.mjs --report-only
node benchmarks/analyze-gateway.mjs "D:\MY FILES\Downloads\<matching-export>.json"
```

Report-only uses saved raw data and performs no model calls. It regenerates the base report, so rerun Gateway analysis afterward. The analyzer matches exact alert/workflow metadata and distinguishes deliberately skipped RCA calls from missing export records. Embedding attribution remains timestamp-only if metadata is absent; zero exported usage/cost is not proof of free calls. No token/cost results are claimed before the matching export.

The baseline used older prompts, context-only memory, dataset v2 and whole-report keyword scoring. It is not a controlled accuracy/model comparison with this run. All results are measured; setup failures, missing outputs and retries are reported honestly.
