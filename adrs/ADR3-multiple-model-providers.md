# ADR3: Multiple Model Providers

## Status

Accepted

## Context

Incident investigation should use a configurable model provider while sharing tools, chat state, workflows, and streamed responses.

## Decision

Resolve the chat model through one provider factory using explicit environment configuration. Initialize only the selected provider. Suggested values live in `.dev.vars.example`; the application has no configuration defaults. Missing required settings and unsupported providers produce configuration errors.

| MODEL_PROVIDER | Adapter | Required settings |
| --- | --- | --- |
| `cloudflare` | `workers-ai-provider` | `CLOUDFLARE_AI_MODEL`, authenticated remote `AI` binding |
| `google` | `@ai-sdk/google` | `GEMINI_AI_MODEL`, `GOOGLE_GENERATIVE_AI_API_KEY` |
| `openrouter` | `@openrouter/ai-sdk-provider` | `OPENROUTER_AI_MODEL`, `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL` |

Provider selection occurs for each chat response. Adding a provider requires an adapter, factory branch, validation, and env example entries.

## Consequences

- All chat providers share the same tools and investigation flow; select models supporting streaming and tool calling.
- Access requirements, quota, pricing, and model capabilities differ. There is no automatic application failover.
- OpenRouter chat uses its configured endpoint directly. Optional Google AI Gateway routing remains covered by [ADR5](ADR5-ai-gateway-observability.md).
- Embeddings remain independently configured through Google or Cloudflare; selecting OpenRouter chat does not change incident memory. See [ADR6](ADR6-vectorize-incident-memory.md).
- Pin the OpenRouter adapter to a release compatible with the application's AI SDK major version.

## Setup

1. Complete the local setup in the [TraceRoot runbook](../README.md). Edit `cloudflare/agents-starter/.dev.vars` using `.dev.vars.example` as the configuration reference.
2. Set `MODEL_PROVIDER` and uncomment/fill its model and credential settings. Comment out unused provider settings, except credentials needed by the selected embedding provider.
3. For Cloudflare, run `npx wrangler login` from the agent directory and retain the remote `AI` binding described in [ADR2](ADR2-cloudflare-investigation-agent.md).
4. For Google, create a key in [Google AI Studio](https://aistudio.google.com/apikey) with access to the selected model.
5. For OpenRouter, create a key in [OpenRouter Settings](https://openrouter.ai/settings/keys), ensure sufficient credits/access, and choose a model supporting tools from the [model catalog](https://openrouter.ai/models). Set `MODEL_PROVIDER=openrouter`, fill `OPENROUTER_API_KEY` and `OPENROUTER_AI_MODEL` with the catalog's full model ID, and uncomment `OPENROUTER_BASE_URL` from the example.
6. Keep `EMBEDDING_PROVIDER` and its required settings configured independently. Restart `npm run start` after changing local envs.

## Verification

Ask each selected provider to fetch current alerts and investigate demo-service. Confirm tool calls and streamed evidence-based responses. Missing credentials or models should identify the required env; unsupported providers should fail explicitly.

## References

- [OpenRouter AI SDK adapter and compatibility](https://github.com/OpenRouterTeam/ai-sdk-provider)
