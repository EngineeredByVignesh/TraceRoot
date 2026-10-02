# ADR4: AI Gateway and Agent Observability

## Status

Accepted

## Context

Investigations need visibility into model latency, token usage, estimated cost, request volume, failures, and tool execution.

## Decision

Route Google chat and embeddings through AI Gateway when AI_GATEWAY_BASE_URL is set; otherwise use Google directly. Send cf-aig-authorization when AI_GATEWAY_TOKEN is configured.

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
AI_GATEWAY_BASE_URL=https://gateway.ai.cloudflare.com/v1/<account_id>/<gateway_name>/google-ai-studio/v1
AI_GATEWAY_TOKEN=<gateway-token>
```

3. Keep the Google key from [ADR2](ADR2-cloudflare-investigation-agent.md). If gateway authentication is enabled, supply an authorized token without a Bearer prefix; otherwise the token may be omitted.
4. For deployment, set the base URL in Wrangler vars and run npx wrangler secret put AI_GATEWAY_TOKEN from the agent directory when authentication is enabled.
5. Keep the existing configuration and deploy:

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
- [Gateway authentication](https://developers.cloudflare.com/ai-gateway/configuration/authentication/)
