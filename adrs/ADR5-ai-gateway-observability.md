# ADR5: AI Gateway and Agent Observability

## Status

Accepted

## Context

Investigations need visibility into model latency, token usage, estimated cost, request volume, failures, and tool execution.

## Decision

Route all three chat/classification providers and Google/Cloudflare embeddings through the same AI Gateway when `AI_GATEWAY_BASE_URL` is set. Use a shared gateway root and derive Google (`/google-ai-studio/v1`) and OpenRouter (`/openrouter`) endpoints. Workers AI uses its existing binding with the gateway ID extracted from that root; the gateway must belong to the binding's account. Without the URL, retain direct-provider behavior.

Send `cf-aig-authorization` for Google/OpenRouter HTTP calls when `AI_GATEWAY_TOKEN` is configured. Workers AI binding calls use binding authentication, not this HTTP token. Continue using each external provider's API key. Existing Google-specific gateway URLs are accepted and normalized for compatibility; new configuration should use the root URL.

Enable Workers observability and traces. Emit agent.tool.start, agent.tool.success, agent.tool.failure, and tool_api.request events for execution and timing.

## Consequences

- Gateway analytics cover model requests; usage and estimated cost depend on provider reporting.
- Tool telemetry appears in Worker logs, not Gateway model analytics.
- Tracing configuration alone does not guarantee a span for every tool call.
- Retry behavior follows configured SDK or gateway policies.

## Setup

1. Create an AI Gateway in the Cloudflare dashboard; copy its account ID and gateway name.
2. Set these values in cloudflare/agents-starter/.dev.vars:

```env
AI_GATEWAY_BASE_URL=https://gateway.ai.cloudflare.com/v1/<account_id>/<gateway_name>
AI_GATEWAY_TOKEN=<gateway-token>
```

3. Keep the selected provider key from [ADR3](ADR3-multiple-model-providers.md). If gateway HTTP authentication is enabled, supply an authorized token without a Bearer prefix; otherwise the token may be omitted. OpenRouter's direct `OPENROUTER_BASE_URL` is only required when the gateway URL is unset. Workers AI requires no extra API key or binding; use a gateway in the same Cloudflare account. Restart the local dev server after changing env values.
4. Keep the existing observability configuration:

```jsonc
"observability": {
  "enabled": true,
  "traces": { "enabled": true }
}
```

## Verification

Send a model request and inspect its model, duration, usage, and status in Gateway logs. Trigger a tool call and inspect Worker events; failed calls should emit agent.tool.failure.

## References

- [Google AI Studio gateway endpoint](https://developers.cloudflare.com/ai-gateway/usage/providers/google-ai-studio/)
- [OpenRouter gateway endpoint](https://developers.cloudflare.com/ai-gateway/usage/providers/openrouter/)
- [Workers AI gateway binding](https://developers.cloudflare.com/ai-gateway/usage/providers/workersai/)
- [Gateway authentication](https://developers.cloudflare.com/ai-gateway/configuration/authentication/)
