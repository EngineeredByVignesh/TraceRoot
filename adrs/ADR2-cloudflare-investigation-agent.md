# ADR2: Cloudflare Investigation Agent

## Status

Accepted

## Context

One agent should gather evidence across the lab's systems, test hypotheses, and produce a supported incident report.

## Decision

Use Cloudflare agents-starter with Workers, the Agents SDK, and Durable Object state. A local FastAPI tool API exposes Prometheus, Loki, Alertmanager, and Kubernetes evidence.

Default to Gemini through @ai-sdk/google; retain Workers AI via MODEL_PROVIDER=cloudflare. Reports include root cause, evidence, timeline, confidence, and remediation. Use one agent; ADR3-ADR5 cover durable execution, observability, and memory.

## Consequences

- Tool availability and credentials are operational dependencies.
- Deployed Workers require an HTTPS route to the local tool API.
- Missing evidence must be reflected in the report's confidence.

## Setup

1. Follow the [TraceRoot runbook](../README.md) to start the tool API and install the agent.
2. Copy cloudflare/agents-starter/.dev.vars.example to .dev.vars and configure:

```env
TOOL_API_BASE_URL=http://localhost:8788
TOOL_API_TOKEN=dev-token
MODEL_PROVIDER=google
GEMINI_MODEL=gemini-2.5-flash
GOOGLE_GENERATIVE_AI_API_KEY=<google-api-key>
```

3. Run npm run start from cloudflare/agents-starter. Workers AI chat uses MODEL_PROVIDER=cloudflare, CLOUDFLARE_AI_MODEL, and the existing remote AI binding.
4. For deployment, run npx wrangler login and expose the tool API through Cloudflare Tunnel. Set TOOL_API_BASE_URL to its HTTPS URL in Wrangler vars. Store secrets and deploy:

```powershell
npx wrangler secret put TOOL_API_TOKEN
npx wrangler secret put GOOGLE_GENERATIVE_AI_API_KEY
npm run deploy
```

Keep non-secret provider settings in wrangler.jsonc vars. Local .dev.vars values are not deployed.

## Verification

Ask: "Investigate why demo-service is returning 5xx errors." Confirm tool evidence supports the report.
