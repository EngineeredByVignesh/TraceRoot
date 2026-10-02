# Incident Investigator Agent — Phase 1

## Goal

Build a **Cloudflare AI Agent** that investigates incidents using the observability environment already running locally.

## Existing Environment

A `kind` Kubernetes cluster is running with:

- Demo application
- Prometheus
- Loki
- Alertmanager
- Grafana
- Reproducible failure scenarios
- Deployment information

## High-Level Architecture

```text
User
  |
  v
Cloudflare Worker
  |
  v
Incident Investigator Agent
  |
  +---- query_metrics()
  |
  +---- query_logs()
  |
  +---- get_alerts()
  |
  +---- get_deployments()
  |
  v
Investigation Loop
  |
  +---- Gather evidence
  +---- Form hypothesis
  +---- Query additional evidence
  +---- Verify / reject hypothesis
  |
  v
Incident Report / RCA
```

## Phase 1 Scope

Keep it simple.

Build **one agent** with access to the observability tools.

The agent should accept something like:

```text
Investigate why demo-service started returning 5xx errors.
```

It should independently decide which tools to call and produce:

- Probable root cause
- Supporting evidence
- Timeline
- Confidence
- Suggested remediation

## Cloudflare Stack

Start with:

- Cloudflare Workers
- Cloudflare Agents SDK
- Durable Objects / Agent state
- Gemini through Google AI API as the active model provider
- Workers AI kept as a configurable fallback

Do **not** add multi-agent architecture yet.

## Tool Layer

Initially expose:

```text
get_alerts()
query_metrics()
query_logs()
get_deployments()
```

These tools can connect to the local `kind` environment through a small API/MCP layer exposed using Cloudflare Tunnel.

## Later Phases

After Phase 1 works:

- MCP / FastMCP
- Vectorize + historical incidents
- Workflows + retries
- Agent observability
- Multi-agent investigation
- Isolated execution using AX / Agent Sandbox
- Security / authorization / tenant isolation

## Priority

**Get one end-to-end investigation working first.**

```text
Incident -> Agent -> Tools -> Evidence -> Reasoning -> RCA
```

Everything else comes afterward.

## Runbook

Use `README.md` as the source of truth for local setup, tool API configuration, model selection, and agent startup.
