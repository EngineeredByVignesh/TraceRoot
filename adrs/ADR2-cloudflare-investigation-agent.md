# ADR2: Cloudflare Investigation Agent

## Status

Accepted

## Context

One agent should gather evidence across the lab's systems, test hypotheses, and produce a supported incident report.

## Decision

Use Cloudflare agents-starter with Workers, the Agents SDK, and Durable Object state. A local FastAPI tool API exposes Prometheus, Loki, Alertmanager, and Kubernetes evidence.

Use Cloudflare Workers AI through workers-ai-provider for model inference, with the model selected by CLOUDFLARE_AI_MODEL. Reports include root cause, evidence, timeline, confidence, and remediation. Use one agent.

## Consequences

- Tool availability and credentials are operational dependencies.
- Missing evidence must be reflected in the report's confidence.
- Model inference uses Cloudflare credentials and Workers AI quota through the AI binding.

## Setup

1. Follow the [TraceRoot runbook](../README.md) to start the tool API and install the agent.
2. Copy cloudflare/agents-starter/.dev.vars.example to .dev.vars and configure:

```env
TOOL_API_BASE_URL=<tool-api-url>
TOOL_API_TOKEN=<matching-tool-api-token>
MODEL_PROVIDER=cloudflare
CLOUDFLARE_AI_MODEL=<model-from-env-example>
```

3. From cloudflare/agents-starter, run npx wrangler login. Keep the existing AI binding configured for remote inference:

```jsonc
"ai": {
  "binding": "AI",
  "remote": true
}
```

4. Run npm run start for local development.

## Verification

Ask: "Investigate why demo-service is returning 5xx errors." Confirm tool evidence supports the report.
