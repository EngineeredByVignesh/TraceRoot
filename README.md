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
