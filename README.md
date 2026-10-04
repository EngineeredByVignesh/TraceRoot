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

## Benchmarks

The [benchmark guide](benchmarks/README.md) covers correlation, RCA and memory reuse A/B evaluation. One current dataset/config produces [results](benchmark-results.md) and raw evidence in `benchmarks/results.json`. The best prior context-enrichment run is retained under `benchmarks/baseline/`. Application timing is separate from Gateway accounting, which awaits the matching export.

The separate large-scale suite uses `benchmarks/config-large.json` and `benchmarks/dataset-large.json`, saving [large results](benchmark-results-large.md) and `benchmarks/results-large.json` without overwriting the small run. It covers ten incident categories and a ten-independent-incident alert burst; see the guide for execution and Gateway export commands.

Set `INCIDENT_MEMORY_ENABLED=false` in the agent's `.dev.vars` to disable historical retrieval for normal investigations. Leave it unset or set it to `true` to preserve retrieval. The benchmark runs both memory settings on isolated Workflow instances.

## Automatic Investigations

Opt-in [targeted historical RCA reuse](memory-reuse.md) checks explicit reuse rules against current deployment/log evidence. Eligible matches skip three evidence calls and RCA generation; all other alerts retain the full investigation. Existing benchmark results predate this path and remain unchanged.

Follow [ADR7](adrs/ADR7-alert-webhook-investigations.md#local-setup) to enable the authenticated Alertmanager webhook and configure the lab receiver. Firing alerts then start durable investigations automatically.

Open `/investigations` for the live workflow list, ordered newest first by start time. Each row opens `/investigations/<id>` with live stages, retries, and RCA text. Automatic investigations appear only on these pages, without popups. The home chat remains available at `/`.

### Reliability Controls

Copy the automatic-investigation budget, confidence, RCA and memory settings from `.dev.vars.example` into an existing `.dev.vars`. Values are required configuration, not code fallbacks. `LLM_COORDINATOR_NAME` identifies a shared instance of the existing ChatAgent binding; no new Cloudflare resource or migration is needed. All automatic correlation/RCA calls share its persisted concurrency leases, spacing and transient-failure cooldown. Interactive chat and embedding requests are outside that budget.

`CORRELATION_MIN_CONFIDENCE` gates merges, not accuracy: low-confidence positive classifications start separate investigations. `CORRELATION_OUTPUT_MODE=prompt-json` supports models without native JSON Schema; it parses strict JSON or exactly one JSON code block using a Markdown parser, then validates fields/confidence/active IDs. Formatting fallbacks are recorded; malformed JSON is never repaired. Use `json-schema` for native structured-output models. Failures remain conservative new-investigation fallbacks with diagnostic events. `RCA_MAX_RETRIES` controls Workflow retries; RCA SDK retries are disabled. Non-retryable HTTP configuration errors fail immediately. Watch `llm.request` and `correlation.failure` events for queue time, call duration, operation, IDs and failure class. Gateway metadata links RCA workflow/agent IDs and correlation alert fingerprints; benchmark IDs are embedded in those names. Gateway caching is bypassed for fresh investigations.

Renderer evidence uses `/api/orders`; database evidence uses connection metrics. Alerts/logs are component-scoped and RCA recommendations must preserve unrelated incidents. Memory never falls back to another namespace; automatic history matches must pass `INCIDENT_MEMORY_MIN_SCORE` and contain both service and component labels. Tag stored histories accordingly (for example `demo-service`, `order-renderer`); untagged memories will not enter component-scoped RCA context.

`CORRELATION_SCOPE_LABELS=namespace,service,component` rejects positive model merges across known values of those labels, preserving the original model confidence/decision in telemetry. Missing labels are unknown, not assumed equal or different. This is a conservative lab policy, not an LLM accuracy improvement: real cross-service/component cascades require relaxed scope labels or `none`, plus reliable dependency evidence. Confidence alone cannot stop high-confidence false merges. The benchmark reports policy rejections separately from model decisions.

### Workers AI Setup

Use `MODEL_PROVIDER=cloudflare` and `CLOUDFLARE_AI_MODEL=@cf/meta/llama-3.1-8b-instruct-fp8` ([model documentation](https://developers.cloudflare.com/workers-ai/models/llama-3.1-8b-instruct-fp8/)). The originally requested unsuffixed model was rejected by the live API as deprecated on 2026-05-30; FP8 is the supported variant of the same Llama 3.1 8B family. Keep classification overrides unset to use the same model. Google embeddings remain independently configured; this does not change the existing Vectorize index or re-embed production history. The AI binding is already remote: run `npx wrangler login` when OAuth has expired. Existing Gateway settings still apply through the binding ([Cloudflare setup](https://developers.cloudflare.com/ai-gateway/integrations/aig-workers-ai-binding/)). Check Workers AI quota/billing if calls report exhausted usage; this code does not enable billing or change account quotas.

Rebuild/reload IncidentLab using its existing README steps to pick up component-tagged logs; old images will not contain these tags. No live lab deployment or failure injection is performed by the benchmark.
