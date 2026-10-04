# TraceRoot Benchmark Plan

The final TraceRoot evaluation consists of three experiments:

1. Alert → Incident Correlation
2. RCA Quality
3. Vectorize Memory A/B Test

---

## 1. Alert → Incident Correlation

Generate production-like incidents where each incident can produce multiple alerts, including scenarios where multiple unrelated incidents overlap in time.

### Evaluate

- **Alert → Incident Mapping Accuracy**
  - Percentage of alerts mapped to the correct underlying incident.

- **New Incident Detection Accuracy**
  - Percentage of alerts correctly identified as requiring a new incident/workflow.

- **Incorrect Merge Rate**
  - Unrelated alerts incorrectly grouped into the same incident.

- **Incorrect Split Rate**
  - Alerts belonging to the same incident incorrectly creating multiple incidents/workflows.

- **Alert → Workflow Reduction**
  - Reduction in redundant investigation workflows due to correlation.

- **Correlation Latency**
  - Time required to make the correlation decision.

- **Correlation Tokens / Cost**
  - LLM tokens and cost required for correlation.

### Example Result

> **1,000 alerts representing 300 incidents → 94% correct correlation and 65% fewer redundant investigations.**

---

## 2. RCA Quality

Every simulated incident has known ground truth.

Example:

```text
Incident: Bad deployment

Ground Truth RCA:
Deployment v2 introduced database timeouts.

Expected Remediation:
Rollback deployment v2.
```

TraceRoot investigates the incident using deployment information, alerts, Prometheus metrics, Loki logs, and other available evidence.

### Evaluate

- **Root Cause Accuracy**
- **Remediation Accuracy**
- **Successful Investigation Rate**
- **Time-to-RCA**
- **Tool Calls per Investigation**
- **Tokens per Investigation**
- **Cost per Investigation**

### Example Result

> **300 incidents → 91% root-cause accuracy, 89% remediation accuracy, and 24s median time-to-RCA.**

---

## 3. Vectorize Memory — A/B Test

Run the same evaluation dataset under two configurations:

```text
A: TraceRoot WITHOUT historical incident memory
B: TraceRoot WITH Vectorize historical incident memory
```

This isolates the impact of historical incident memory on RCA performance.

### Compare

| Metric                    | No Memory | Vectorize Memory | Improvement |
| ------------------------- | --------: | ---------------: | ----------: |
| RCA Accuracy              |        X% |               X% |        X pp |
| Remediation Accuracy      |        X% |               X% |        X pp |
| Avg Tokens / Incident     |         X |                X |          X% |
| Avg Tool Calls / Incident |         X |                X |          X% |
| Avg Time-to-RCA           |     X sec |            X sec |          X% |
| Avg Cost / Incident       |        $X |               $X |          X% |

### Memory-Specific Evaluation

- **Useful Retrieval Rate**
  - How often retrieved historical incidents improve the investigation.

- **Irrelevant Retrieval Rate**
  - How often retrieved incidents are unrelated to the current incident.

- **Negative Transfer Rate**
  - How often historical memory causes the RCA or remediation to become worse than the no-memory baseline.

### Example Result

> **Vectorize memory improved RCA accuracy by 8 percentage points while reducing average LLM token usage by 27% and time-to-RCA by 18%.**

---

# Final Benchmark Summary

The final results should summarize three dimensions.

## Incident Intelligence

- X% correlation accuracy
- X% new-incident detection accuracy
- X% incorrect merge rate
- X% incorrect split rate
- X% fewer redundant investigations
- X ms median correlation latency
- $X average correlation cost

## RCA Intelligence

- X% root-cause accuracy
- X% remediation accuracy
- X% successful investigation rate
- X sec median time-to-RCA
- X average tool calls per investigation
- X average tokens per investigation
- $X average cost per investigation

## Memory Impact

- +X percentage points RCA accuracy
- +X percentage points remediation accuracy
- -X% tokens
- -X% tool calls
- -X% time-to-RCA
- -X% cost per investigation
- X% useful retrieval rate
- X% irrelevant retrieval rate
- X% negative-transfer rate

---

# Final Headline

> **TraceRoot was evaluated across 1,000 production-like alerts representing X underlying incidents. It achieved X% alert-to-incident correlation accuracy and reduced redundant investigations by X%. Its RCA agent achieved X% root-cause accuracy and X% remediation accuracy. Vectorize-backed historical incident memory improved RCA accuracy by X percentage points while reducing LLM token consumption by X% and median time-to-RCA by X%.**
