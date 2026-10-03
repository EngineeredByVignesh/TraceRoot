# ADR8: Dedicated Classification Model

## Status

Accepted

## Context

Alert correlation may benefit from a smaller or different model than chat and RCA generation.

## Decision

Use an optional classification model only for incoming-alert correlation. When `CLASSIFICATION_AI_MODEL` is unset, empty, or whitespace, reuse the configured chat model and provider. Otherwise require `CLASSIFICATION_MODEL_PROVIDER` (`google`, `cloudflare`, or `openrouter`) and the selected model ID.

Google and OpenRouter require `CLASSIFICATION_MODEL_PROVIDER_API_KEY`; Cloudflare uses the existing Workers AI binding and does not require this key. Reuse the existing provider factory and shared AI Gateway settings from ADR5. Without a gateway, OpenRouter uses `OPENROUTER_BASE_URL`.

Chat, RCA generation, and embeddings remain unchanged. Invalid override configuration does not silently fall back to chat: correlation fails safely and the webhook starts a separate investigation, as defined in ADR7. Classification models must support structured output.

## Local Setup

1. In `cloudflare/agents-starter/.dev.vars`, uncomment the classification entries from `.dev.vars.example`.
2. Set the model ID and matching provider. For Google or OpenRouter, supply that provider's API key in `CLASSIFICATION_MODEL_PROVIDER_API_KEY`. For Cloudflare, leave the key commented out.
3. Keep the selected provider's existing routing configuration. Configure the shared `AI_GATEWAY_BASE_URL` root for gateway routing across providers, or `OPENROUTER_BASE_URL` for direct OpenRouter calls.
4. Restart the local dev server. Send a distinct firing alert while an investigation is running, then inspect correlation results in the webhook response/log and associated alerts on the investigation detail page.
5. To restore chat-model classification, remove or comment out `CLASSIFICATION_AI_MODEL`. No new Cloudflare resource is required.

## Consequences

- Classification credentials and model selection are independent of chat.
- With no model override, existing installations behave unchanged.
- Only correlation uses the override; existing validation, timeout, and deduplication remain in place.
