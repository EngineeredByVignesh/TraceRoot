# TraceRoot

TraceRoot turns firing alerts into evidence-backed incident investigations, reducing the manual work of grouping symptoms and searching logs, metrics, and deployment changes. It correlates related alerts, runs durable investigations, and produces an RCA, summary, and proposed fix. Reviewed historical incidents can be reused when current evidence satisfies explicit reuse conditions.

**100% observed reuse precision (12/12) · 0 false reuses (0/6 negative tests) · 36 evidence calls skipped · 12 RCA calls skipped**

These are large-suite observations, not production guarantees. The run was quota-confounded; [benchmark limitations](BENCHMARKS.md#limitations) matter.

## Demo

[View the demo screenshots and saved manual chat page](demo/README.md).

## Features & Use Cases

- **Automatic incident intake:** authenticated Alertmanager webhooks start investigations without a chat prompt.
- **Alert correlation:** group likely related firing alerts while keeping independent incidents separate.
- **Durable investigation:** retain completed steps and retry failures rather than restarting the whole investigation.
- **RCA and remediation:** combine current evidence into `RCA`, `Summary`, and `Fix`; recommend diagnostics when the cause is unknown.
- **Incident memory:** retrieve prior incidents and safely reuse reviewed remedies when current conditions match.
- **Manual chat investigation:** describe symptoms, ask follow-up questions, and query deployment, alert, metric, log, and historical evidence without waiting for a webhook.
- **Multi-provider support:** switch between Cloudflare Workers AI, Google Gemini, and OpenRouter through environment configuration.
- **Live visibility:** follow workflow stages and reports, with model and tool-call telemetry for debugging.

Use it to explore noisy alert bursts, investigate regressions, and evaluate recurring incidents. Current evidence tools are scoped to the configured demo deployment; this is not a production-ready general incident platform. Fixes are recommendations, not automatic remediation.

### Manual Chat

Open `/` and ask, for example: "Investigate demo-service errors: check deployments, active alerts, metrics, logs, and similar past incidents." Continue with follow-up questions or ask the agent to start a durable investigation. Chat uses the same evidence tools and configured model; an Alertmanager webhook is not required.

## How It Works

`Alert → Correlation → Incident → Workflow → RCA Agent → Vectorize Memory → RCA + Fix`

This is the conceptual flow; historical retrieval and reuse validation happen before final RCA generation.

[Read the full architecture](ARCHITECTURE.md).

## Tech Stack & Why

| Technology                                 | Why it is used                                                                                             |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Cloudflare Workers                         | Host the agent API, authenticated webhook, and UI assets in one runtime.                                   |
| Cloudflare Agents + Durable Objects        | Persist chat, investigation state, and shared model-call coordination; push progress to connected clients. |
| Cloudflare Workflows                       | Persist investigation steps and retry failed work without repeating completed steps.                       |
| Cloudflare Vectorize                       | Retrieve semantically similar incidents with metadata for evidence-checked historical reuse.               |
| Cloudflare AI Gateway                      | Observe provider requests, latency, token usage, failures, and estimated cost where available.             |
| Workers AI, Google Gemini, OpenRouter      | Select the chat/RCA provider through configuration without changing the investigation pipeline.            |
| React + TypeScript + Vite                  | Provide interactive chat and realtime investigation pages with typed application code.                     |
| FastAPI + Prometheus/Loki/Kubernetes tools | Expose authenticated evidence queries to the agent without granting it remediation commands.               |

### Models & Providers

The documented benchmarks used **Cloudflare Workers AI's Llama 3.1 8B Instruct FP8** (`@cf/meta/llama-3.1-8b-instruct-fp8`) for correlation and RCA, with **Google Gemini Embedding** (`gemini-embedding-001`, 768 dimensions) for Vectorize incident memory.

Set `MODEL_PROVIDER=cloudflare`, `google`, or `openrouter` to select the chat/RCA provider after configuring its model and credentials. Embeddings are selected independently through `EMBEDDING_PROVIDER=google|cloudflare`; an optional classification override can also use a separate model. Provider switching is explicit, not automatic failover. See [provider configuration](adrs/ADR3-multiple-model-providers.md) and [memory setup](adrs/ADR6-vectorize-incident-memory.md).

## Benchmark Results

| Observed metric                            |     Small suite |     Large suite |
| ------------------------------------------ | --------------: | --------------: |
| Alerts replayed, both arms                 |              44 |             300 |
| Reuse precision                            |             2/2 |           12/12 |
| False reuse / negative tests               |             0/6 |             0/6 |
| Tool / RCA calls directly skipped by reuse |           6 / 2 |         36 / 12 |
| RCA rubric accuracy, without → with memory |   78.6% → 71.4% |   61.1% → 75.9% |
| p95 time-to-RCA, without → with memory     | 55.60s → 62.28s | 93.13s → 77.76s |

Large-suite RCA accuracy increased by an observed **14.8 percentage points**, and p95 fell **16.5%**, but twelve without-memory workflows failed after quota exhaustion. These are not proven causal memory improvements. Cost is being optimized; we do not claim general cost savings.

[Full benchmark methodology and results](BENCHMARKS.md).

## Running Locally

Prerequisites: Node.js/npm, Python with venv support, a Cloudflare account with Wrangler authentication, and a configured model provider. Memory uses a remote Vectorize index even during local development. Follow the [IncidentLab setup and observability runbook](https://github.com/EngineeredByVignesh/IncidentLab#setup) for Docker, kind, Kubernetes, and evidence services.

From the repository root, prepare the tools API:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r tools-api/requirements.txt
Copy-Item tools-api/.env.example tools-api/.env
```

Edit `tools-api/.env` with your evidence endpoints and token, then run it in one terminal:

```powershell
.\.venv\Scripts\python.exe -m uvicorn tools-api.app.main:app --env-file tools-api/.env --host 127.0.0.1 --port 8788
```

In another terminal:

```powershell
cd cloudflare/agents-starter
npm ci
Copy-Item .dev.vars.example .dev.vars
npx wrangler login
```

Edit `.dev.vars` before starting: match the tools API token, choose `MODEL_PROVIDER=cloudflare|google|openrouter`, and fill the selected model/credentials. Configure embeddings and [create the Vectorize index](adrs/ADR6-vectorize-incident-memory.md#setup) when using memory. Suggested settings live only in the env examples; never commit local secrets. Bash users can use `cp` and `.venv/bin/python`.

```powershell
npm run start
```

Open the URL printed by Vite for chat; use `/investigations` for automatic investigations. To receive alerts from IncidentLab, follow [webhook configuration](adrs/ADR7-alert-webhook-investigations.md#local-setup) and its [Alertmanager runbook](https://github.com/EngineeredByVignesh/IncidentLab#alertmanager-routing). Chat startup alone does not configure alert delivery.

### Configuration

- [Provider selection](adrs/ADR3-multiple-model-providers.md): switch `MODEL_PROVIDER` after configuring credentials/models; embeddings and classification overrides remain independent.
- [AI Gateway](adrs/ADR5-ai-gateway-observability.md): set the shared `AI_GATEWAY_BASE_URL` account/gateway root and optional token; provider routes are derived automatically.
- [Memory and reviewed reuse](memory-reuse.md): retrieval is not causal proof, and reuse requires explicit matching conditions.
- [Env examples](cloudflare/agents-starter/.dev.vars.example) and [tools API settings](tools-api/.env.example): complete configuration reference.
