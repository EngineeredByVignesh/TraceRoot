# Architecture Decision Records

Key architectural decisions for TraceRoot. Each ADR records its context, decision, consequences, and relevant setup guidance.

| ADR | Overview |
| --- | --- |
| [ADR1: Local Incident Lab](ADR1-local-incident-lab.md) | Maintain a separate kind-based lab for reproducible incidents and observability evidence. |
| [ADR2: Cloudflare Investigation Agent](ADR2-cloudflare-investigation-agent.md) | Build the stateful investigation agent on Cloudflare with an authenticated local evidence API. |
| [ADR3: Multiple Model Providers](ADR3-multiple-model-providers.md) | Select Workers AI, Gemini, or OpenRouter through environment configuration and a shared provider factory. |
| [ADR4: Durable Investigations](ADR4-cloudflare-workflows.md) | Persist evidence-collection steps and retry failures using Cloudflare Workflows. |
| [ADR5: AI Gateway and Observability](ADR5-ai-gateway-observability.md) | Observe model requests through optional AI Gateway routing alongside agent and tool telemetry. |
| [ADR6: Incident Memory](ADR6-vectorize-incident-memory.md) | Store and retrieve historical incidents in Vectorize with independently configured embeddings. |
| [ADR7: Alert-Triggered Investigations](ADR7-alert-webhook-investigations.md) | Authenticate, deduplicate, and correlate incoming alerts before starting durable investigations. |
| [ADR8: Dedicated Classification Model](ADR8-classification-model.md) | Optionally use a separate correlation model while keeping chat, RCA, and embeddings unchanged. |
