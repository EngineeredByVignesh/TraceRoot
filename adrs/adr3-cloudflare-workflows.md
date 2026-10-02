# ADR 3: Use Cloudflare Workflows For Durable Investigations

## Status

Accepted

## Context

Incident investigations can take longer than a single chat turn or Worker request. Tool calls to Prometheus, Loki, Alertmanager, and Kubernetes can fail transiently, especially while the local lab is starting, port-forwards are reconnecting, or Cloudflare Tunnel is being restarted.

We want another meaningful Cloudflare primitive in the architecture without adding a separate orchestration system.

## Decision

Use Cloudflare Workflows for durable investigation runs.

The first Workflow will collect an evidence bundle for `demo-service`:

- deployment metadata
- current Alertmanager alerts
- Prometheus error-rate signal
- Prometheus p95 latency signal
- recent Loki logs

Each external evidence call runs as its own Workflow step with retry configuration. Completed steps are persisted by Cloudflare Workflows, so a resumed run does not redo already completed work.

The Cloudflare Agent will expose tools to:

- start a durable investigation Workflow
- fetch a Workflow instance status by ID

The normal chat tools remain available for quick interactive questions.

## Consequences

- Long-running investigations become resumable.
- Transient tool API failures can be retried by Workflow step policy.
- Investigation state is inspectable through Cloudflare Workflow instance status.
- The first implementation returns an evidence bundle; full LLM report generation inside the Workflow can be added later if needed.

## Upstream Setup Guide

Cloudflare Workflows are configured in `cloudflare/agents-starter/wrangler.jsonc` with:

```jsonc
"workflows": [
  {
    "name": "incident-investigation-workflow",
    "binding": "INVESTIGATION_WORKFLOW",
    "class_name": "InvestigationWorkflow"
  }
]
```

After changing Workflow bindings, regenerate Worker types:

```powershell
cd .\cloudflare\agents-starter
npm run types
```

For local development:

```powershell
cd .\cloudflare\agents-starter
npm run start
```

For deployment:

```powershell
cd .\cloudflare\agents-starter
npm run deploy
```

Required secrets and vars are unchanged from the agent setup:

```env
TOOL_API_BASE_URL=http://localhost:8788
TOOL_API_TOKEN=dev-token
MODEL_PROVIDER=google
GEMINI_MODEL=gemini-2.5-flash
CLOUDFLARE_AI_MODEL=@cf/google/gemma-4-26b-a4b-it
GOOGLE_GENERATIVE_AI_API_KEY=<your-google-api-key>
```

For deployed Workers, store sensitive values as Wrangler secrets:

```powershell
npx wrangler secret put TOOL_API_TOKEN
npx wrangler secret put GOOGLE_GENERATIVE_AI_API_KEY
```

If the tool API is still local, expose it with Cloudflare Tunnel and set `TOOL_API_BASE_URL` to the tunnel HTTPS URL.
