# ADR5: Incident Memory With Vectorize

## Status

Accepted

## Context

Previous incidents, root causes, and remediations can inform new investigations.

## Decision

Store embeddings and metadata in Cloudflare Vectorize. Expose rememberIncident for title, summary, root cause, remediation, and labels; expose searchSimilarIncidents for historical context.

Default to Gemini gemini-embedding-001 with 768 dimensions. Select Workers AI @cf/google/embeddinggemma-300m via EMBEDDING_PROVIDER=cloudflare. Use a 768-dimensional cosine index and the incident-memory namespace.

## Consequences

- Historical matches provide context, not proof of the current root cause.
- Writes are asynchronous; mutation submission does not mean immediate search visibility.
- Gemini consumes Google quota instead of Workers AI embedding quota.
- Embedding models use incompatible vector spaces even at the same dimension. Re-embed stored incidents or use a separate index when changing provider/model.
- Local development reads and writes the remote index.

## Setup

1. From cloudflare/agents-starter, log in and create the index once:

```powershell
npx wrangler login
npx wrangler vectorize create incident-memory --dimensions=768 --metric=cosine
```

2. Keep one binding with the name expected by the code:

```jsonc
"vectorize": [
  {
    "binding": "INCIDENT_MEMORY",
    "index_name": "incident-memory",
    "remote": true
  }
]
```

3. Set these values in .dev.vars locally or Wrangler vars for deployment:

```env
EMBEDDING_PROVIDER=google
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
```

Gemini uses the key from [ADR2](ADR2-cloudflare-investigation-agent.md) and optional gateway settings from [ADR4](ADR4-ai-gateway-observability.md). Workers AI uses the existing remote AI binding.

4. Run npm run types after binding changes, then npm run start or npm run deploy.

## Verification

Ask: "Remember this incident: demo-service returned 5xx after a bad deployment. Root cause: FAILURE_MODE=bad_deploy. Remediation: roll back to v1. Labels: demo-service, bad-deploy, 5xx."

After indexing completes, ask: "Have we seen demo-service returning 5xx after a rollout?" Confirm the saved ID and metadata in the tool result.

## References

- [Vectorize setup](https://developers.cloudflare.com/vectorize/get-started/intro/)
- [Vectorize Workers API](https://developers.cloudflare.com/vectorize/reference/client-api/)
