## Goal

Build a small realistic Kubernetes environment that will later be investigated by our **Cloudflare Incident Investigator Agent**.

## Local Architecture

```text
kind Kubernetes Cluster
│
├── Demo Service
│   ├── Deployment
│   ├── Service
│   └── Reproducible failure scenarios
│
├── Prometheus
├── Loki
├── Alertmanager
└── Grafana
```

## Initial Incident Scenarios

Start with 2–3 deterministic failures:

1. Bad deployment → error-rate spike → alert
2. DB/connection-pool issue → latency spike
3. Dependency failure → 5xx spike

The environment should expose enough evidence to correlate:

```text
Deployment
    ↓
Failure introduced
    ↓
Metrics change
    ↓
Logs show symptoms
    ↓
Alert fires
```

## Deployment Tracking

Skip ArgoCD initially.

Use direct `kubectl` commands and retain:

- version
- Git commit
- deployment timestamp
- rollout status

## Later Connectivity

```text
Cloudflare Agent
      ↓
MCP / Tool APIs
      ↓
Cloudflare Tunnel
      ↓
kind Cluster
      ↓
Prometheus / Loki / K8s / Deployments
```

The current goal is to keep the lab and agent path simple: explicit setup commands, service-owned Kubernetes manifests, and one Cloudflare Agent that can investigate reproducible incidents end to end.
