# TraceRoot

Cloudflare Agent and tool API for investigating the local IncidentLab Kubernetes environment.

## Contents

- `cloudflare/agents-starter/` - Cloudflare Agent app
- `tools-api/` - local FastAPI tool API for Prometheus, Loki, Alertmanager, and Kubernetes metadata
- `adrs/` - architecture decision records

## Local Tool API

Run IncidentLab first and keep its [observability port-forwards](../IncidentLab/README.md#observability-port-forwards) running before starting the tool API.

Start the tool API:

```powershell
python -m pip install -r tools-api/requirements.txt
Copy-Item tools-api/.env.example tools-api/.env
python -m uvicorn tools-api.app.main:app --env-file tools-api/.env --host 0.0.0.0 --port 8788 --reload
```

## Agent

```powershell
cd .\cloudflare\agents-starter
npm install
Copy-Item .dev.vars.example .dev.vars
npm run start
```

Before starting, edit both local env files with your configuration. Examples are the source of suggested values; the application has no configuration fallbacks. Uncomment settings for the selected provider and optional Gateway. Keep local env files out of Git.

## Switch Model Provider

Configure the model and credentials for each provider you intend to use in `.dev.vars` once. You can leave all three sets configured; only the selected chat provider is initialized. Then change just `MODEL_PROVIDER` to `google`, `cloudflare`, or `openrouter` and restart the agent.

| Provider | Settings used |
| --- | --- |
| `google` | `GEMINI_AI_MODEL`, `GOOGLE_GENERATIVE_AI_API_KEY` |
| `cloudflare` | `CLOUDFLARE_AI_MODEL`, existing authenticated `AI` binding |
| `openrouter` | `OPENROUTER_AI_MODEL`, `OPENROUTER_API_KEY`; `OPENROUTER_BASE_URL` for direct calls |

Configure `AI_GATEWAY_BASE_URL=https://gateway.ai.cloudflare.com/v1/<account-id>/<gateway-id>` once to enable Gateway routing. Google and OpenRouter endpoints are constructed automatically; Cloudflare uses the gateway ID through its AI binding. Keep `AI_GATEWAY_TOKEN` configured if Gateway HTTP authentication is enabled. No provider-specific Gateway URL edits are needed when switching. Leave the shared URL unset for direct calls.

This selector controls chat and RCA. `EMBEDDING_PROVIDER` and any explicitly configured `CLASSIFICATION_MODEL_PROVIDER` remain independent and unchanged.

## Automatic Investigations

Follow [ADR7](adrs/ADR7-alert-webhook-investigations.md#local-setup) to enable the authenticated Alertmanager webhook and configure the lab receiver. Firing alerts then start durable investigations automatically.

Open `/investigations` for the live workflow list, ordered newest first by start time. Each row opens `/investigations/<id>` with live stages, retries, and RCA text. Automatic investigations appear only on these pages, without popups. The home chat remains available at `/`.
