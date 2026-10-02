# ADR 5: Use Vectorize For Incident Memory

## Status

Accepted

## Context

The agent can investigate the live incident lab, but every investigation starts from scratch. Real incident response improves when prior incidents, symptoms, root causes, and remediations can be reused.

We want the agent to answer:

- "Have we seen something similar before?"
- "What was the previous root cause?"
- "What remediation worked last time?"

## Decision

Use Cloudflare Vectorize as the incident memory store.

Incident/RCA summaries are embedded with Workers AI and stored in a Vectorize index. During future investigations, the agent can embed the current symptoms and retrieve similar previous incidents as context.

The first implementation exposes two tools:

- `rememberIncident`: store an incident summary, root cause, remediation, and optional labels.
- `searchSimilarIncidents`: retrieve semantically similar prior incidents.

Embeddings default to Google Gemini:

```text
gemini-embedding-001
```

The embedding provider is feature-flagged:

```env
EMBEDDING_PROVIDER=google
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
```

Cloudflare Workers AI embeddings remain available with:

```env
EMBEDDING_PROVIDER=cloudflare
```

The Workers AI fallback model is:

```text
@cf/google/embeddinggemma-300m
```

This model produces 768-dimensional embeddings, so the Vectorize index uses:

```text
dimensions = 768
metric = cosine
```

## Consequences

- Historical incidents become searchable from the agent.
- Similar prior RCAs can be used as investigation context.
- Gemini embeddings are used by default to avoid consuming Workers AI embedding budget.
- Workers AI remains available as a feature-flagged fallback.
- Vectorize mutation visibility is eventually consistent, so a freshly stored incident may take a short time to appear in search results.

## Upstream Setup Guide

Create the Vectorize index:

```powershell
cd .\cloudflare\agents-starter
npx wrangler vectorize create incident-memory --dimensions=768 --metric=cosine
```

Bind it in `wrangler.jsonc`:

```jsonc
"vectorize": [
  {
    "binding": "INCIDENT_MEMORY",
    "index_name": "incident-memory"
  }
]
```

Regenerate Worker types after changing the binding:

```powershell
npm run types
```

No new secret is required when Gemini chat is already configured. Gemini embeddings use the existing Google API key and optional AI Gateway route:

```env
GOOGLE_GENERATIVE_AI_API_KEY=<your-google-api-key>
AI_GATEWAY_BASE_URL=<optional-ai-gateway-google-ai-studio-base-url>
AI_GATEWAY_TOKEN=<optional-ai-gateway-token>
```

The Cloudflare fallback uses the existing Workers AI binding:

```jsonc
"ai": {
  "binding": "AI",
  "remote": true
}
```

For local development, Wrangler uses the configured remote Vectorize index. You must be logged in:

```powershell
npx wrangler login
```

Verification prompt:

```text
Remember this incident: demo-service had a bad deployment causing 5xx responses. Root cause: FAILURE_MODE=bad_deploy. Remediation: roll back to v1. Tags: demo-service, bad-deploy, 5xx.
```

Then ask:

```text
Have we seen something similar to demo-service returning 5xx after a rollout?
```

References:

- Cloudflare Vectorize intro: `https://developers.cloudflare.com/vectorize/get-started/intro/`
- Cloudflare Vectorize Workers API: `https://developers.cloudflare.com/vectorize/reference/client-api/`
- Cloudflare Workers AI EmbeddingGemma model: `https://developers.cloudflare.com/workers-ai/models/embeddinggemma-300m/`
