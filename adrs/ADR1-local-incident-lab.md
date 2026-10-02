# ADR1: Local Incident Lab

## Status

Accepted

## Context

Investigations need reproducible failures and correlated deployment, metric, log, and alert evidence.

## Decision

Maintain IncidentLab as a separate repository containing demo-service and its Kubernetes manifests. Run locally on kind with Prometheus, Loki, Alertmanager, and Grafana.

Use deterministic bad-deployment, connection-pool latency, and dependency-failure scenarios. Track version, Git commit, deployment timestamp, and rollout status through Kubernetes metadata; deploy with explicit kubectl commands.

## Consequences

- Failures can be repeated without production access.
- Live investigations depend on the lab and observability stack.
- IncidentLab owns application manifests; TraceRoot owns the agent and tool API.

## Setup

Follow the sibling [IncidentLab runbook](../../IncidentLab/README.md) for cluster creation, observability, traffic generation, and cleanup. The lab requires no Cloudflare resource.
