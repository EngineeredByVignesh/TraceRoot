# ADR 4: Route LLM Calls Through Cloudflare AI Gateway

## Status

Accepted

## Context

The agent can now call Gemini directly through the Google AI API. That works, but direct provider calls give us limited model-level operational visibility from the Cloudflare side.

We want visibility into:

- LLM latency
- token usage and estimated cost
- provider/model failures
- retry behavior
- model-level request volume

## Decision

Route Gemini calls through Cloudflare AI Gateway when `AI_GATEWAY_BASE_URL` is configured.

The app keeps direct Google API support as the local fallback. This means the same code can run before AI Gateway is configured, then gain observability by setting Gateway config only.

The active Gemini provider remains `@ai-sdk/google`; only the provider base URL and optional Cloudflare AI Gateway auth header change.

## Consequences

- Cloudflare AI Gateway becomes the LLM observability layer.
- The app can inspect latency, errors, token usage, and costs in the AI Gateway dashboard.
- Direct Google API calls remain available by leaving `AI_GATEWAY_BASE_URL` empty.
- Cloudflare Workers AI remains disabled by config but still available with `MODEL_PROVIDER=cloudflare`.

## Upstream Setup Guide

Create an AI Gateway in Cloudflare:

1. Open the Cloudflare dashboard.
2. Go to `AI` > `AI Gateway`.
3. Create a Gateway, for example `traceroot`.
4. Copy your Cloudflare Account ID.
5. Build the Google AI Studio provider-native base URL:

```text
https://gateway.ai.cloudflare.com/v1/<account_id>/<gateway_name>/google-ai-studio/v1
```

Set the local agent config:

```env
AI_GATEWAY_BASE_URL=https://gateway.ai.cloudflare.com/v1/<account_id>/<gateway_name>/google-ai-studio/v1
AI_GATEWAY_TOKEN=<optional-cloudflare-ai-gateway-token>
```

Keep the Google key configured because Cloudflare AI Gateway forwards to Google AI Studio:

```env
GOOGLE_GENERATIVE_AI_API_KEY=<your-google-api-key>
```

For local development, add the values to:

```text
cloudflare/agents-starter/.dev.vars
```

For deployed Workers, store the token as a secret if you use one:

```powershell
cd .\cloudflare\agents-starter
npx wrangler secret put AI_GATEWAY_TOKEN
```

Set `AI_GATEWAY_BASE_URL` as a normal Wrangler var in `wrangler.jsonc` or through your deployment environment.

Verification:

1. Start the agent.
2. Ask any question that requires the model.
3. Open the AI Gateway dashboard.
4. Confirm the request appears under the Gateway logs/analytics.

References:

- Cloudflare AI Gateway Google AI Studio provider endpoint: `https://developers.cloudflare.com/ai-gateway/usage/providers/google-ai-studio/`
- Cloudflare AI Gateway getting started: `https://developers.cloudflare.com/ai-gateway/get-started/`
