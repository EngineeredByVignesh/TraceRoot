# ADR3: Durable Investigations With Cloudflare Workflows

## Status

Accepted

## Context

Evidence collection can outlast a chat request or encounter transient tool API failures.

## Decision

Use Cloudflare Workflows to collect deployment metadata, alerts, 5xx error rate, p95 latency, and recent logs. Each persisted step has three retries, exponential backoff starting at ten seconds, and a two-minute timeout.

Agent tools start investigations and inspect instance status. The workflow returns an evidence bundle; RCA generation remains in the agent.

## Consequences

- Completed steps survive interruptions and are reused during recovery.
- Persistent failures can exhaust retries and fail the run.
- Sequential collection is not an atomic snapshot.

## Setup

Keep the existing wrangler.jsonc binding:

```jsonc
"workflows": [
  {
    "name": "incident-investigation-workflow",
    "binding": "INVESTIGATION_WORKFLOW",
    "class_name": "InvestigationWorkflow"
  }
]
```

Use the configuration in [ADR2](ADR2-cloudflare-investigation-agent.md). No extra workflow secret or manual dashboard creation is required.

From cloudflare/agents-starter, run npm run types after binding changes. Run npm run start locally or npm run deploy to provision the deployed workflow.

## Verification

Start a durable investigation through the agent and check its returned instance ID until completion. Confirm all five evidence sources appear.
