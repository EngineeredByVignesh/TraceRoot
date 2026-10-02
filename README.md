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
$env:TOOL_API_TOKEN="dev-token"
$env:PROMETHEUS_URL="http://localhost:9090"
$env:ALERTMANAGER_URL="http://localhost:9093"
$env:LOKI_URL="http://localhost:3100"
$env:KUBECONFIG_CONTEXT="kind-incident-lab"
$env:K8S_NAMESPACE="incident-lab"
python -m uvicorn tools-api.app.main:app --host 0.0.0.0 --port 8788 --reload
```

## Agent

```powershell
cd .\cloudflare\agents-starter
npm install
npm run start
```

Copy `.dev.vars.example` to `.dev.vars` and fill secrets locally.
