# ADR3: Multiple Model Providers

## Status

Accepted

## Context

The Cloudflare-only agent in [ADR2](ADR2-cloudflare-investigation-agent.md) needs an alternative model provider without changing its tools, chat state, or investigation flow.

## Decision

Add Google Gemini through @ai-sdk/google alongside the existing Workers AI provider. Select the chat provider through MODEL_PROVIDER: google for Gemini or cloudflare for Workers AI.

Use GEMINI_AI_MODEL for Google and CLOUDFLARE_AI_MODEL for Cloudflare. Require explicit provider and model configuration; suggested values live in .dev.vars.example. Provider selection happens for each chat response; there is no automatic failover.

## Consequences

- Both providers share the same tools and streamed chat interface.
- Google requires its own API key and quota; Cloudflare continues using the AI binding.
- Model capabilities and response quality may differ between providers.
- Embedding selection is independent and covered by [ADR6](ADR6-vectorize-incident-memory.md). Optional Google gateway routing is covered by [ADR5](ADR5-ai-gateway-observability.md).

## Setup

1. Complete the agent and tool API setup in [ADR2](ADR2-cloudflare-investigation-agent.md).
2. To use Google, set these values in cloudflare/agents-starter/.dev.vars:

```env
MODEL_PROVIDER=google
GEMINI_AI_MODEL=<choose-ai-model>
GOOGLE_GENERATIVE_AI_API_KEY=<google-api-key>
```

3. Obtain the API key from Google AI Studio for a project with access to the selected model.
4. To switch back to Cloudflare, set MODEL_PROVIDER=cloudflare and CLOUDFLARE_AI_MODEL as described in ADR2. Restart local development after configuration changes.

## Verification

Ask the same investigation question with each provider selected. Confirm both can call the incident tools and stream an evidence-based response.
