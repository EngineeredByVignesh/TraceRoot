# ADR7: Alert-Triggered Investigations

## Status

Accepted

## Context

Firing alerts should initiate an investigation without a user opening chat or asking a question. The existing evidence Workflow and configured model providers can perform that work durably.

## Decision

Add an opt-in, bearer-authenticated Alertmanager v4 receiver at `POST /api/alerts/webhook`. Allow only configured alert names and firing events. Each fingerprint/start-time pair identifies a Workflow; idempotent batch creation deduplicates retries and repeat notifications while the instance remains retained. A new firing episode starts a new investigation.

Reuse the evidence Workflow, then search historical memory, generate an RCA using the selected chat provider, and persist/broadcast the report in investigation state. Keep these operations in separate steps. Workflow IDs identify snapshots for idempotent updates. `GET /api/alerts/workflows/<id>` returns status and completed output using the same bearer token.

Persist investigation progress in agent state and synchronize it to the UI over the existing WebSocket. The investigation panel shows evidence stages, retries, elapsed time, and streamed RCA text. Refreshing restores the latest snapshot; periodic status checks detect terminal failures. Retain the latest 50 investigation snapshots independently of chat history. New alert investigations provide progress; older Workflow instances are not backfilled.

## Consequences

- Manual chat remains available. Automatic progress and reports appear only at `/investigations` and `/investigations/<id>`, with no popups or automatic chat messages. The list stays ordered by start time, newest first. The pages connect to the starter's `default` agent instance.
- Resolved and unlisted alerts do not start investigations. No remediation or automatic memory writes occur.
- Evidence, model, and publication failures use Workflow retries. Historical memory is best effort and reports its unavailability as context.
- The receiver acknowledges durable creation with HTTP 202; this does not mean the report is complete. Delivery failures return a non-success response for Alertmanager to retry.
- Limit requests to 64 KiB and 100 alerts. Duplicate suppression lasts for Workflow retention; repeated publication updates the same investigation snapshot.
- Alertmanager needs network access to the agent. Existing Alertmanager/Loki port-forwards are still needed for the host tools API, but they do not carry webhook delivery.

## Local Setup

1. Run IncidentLab, its observability port-forwards, and the tools API using the [runbook](../README.md).
2. In `cloudflare/agents-starter/.dev.vars`, uncomment all `ALERT_*` settings from `.dev.vars.example`. Use a separate random webhook token, select the lab alert names, and keep the chat/model and memory settings configured.
3. From the agent directory, expose the dev server to Docker Desktop. Set the Vite host exception in the terminal, then start it:

```powershell
$env:__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS="host.docker.internal"
npm run start -- --host 0.0.0.0
```

Use the port printed by Vite. This example assumes 5173. Alertmanager inside kind uses `host.docker.internal`, not `localhost`. If Docker cannot resolve that name, use the host address reachable from the cluster. Allow the dev server through the Windows firewall for the local network.

4. From IncidentLab, create a Kubernetes Secret containing the same token as `ALERT_WEBHOOK_TOKEN`. Use the actual value locally; do not commit it:

```powershell
kubectl create secret generic traceroot-webhook -n monitoring --from-literal=token=<webhook-token>
```

5. Create an untracked local Helm values file using the configuration below. It mounts the token Secret and routes only demo-service alerts to TraceRoot. If you already have custom receivers/routes, merge these entries into your configuration rather than replacing them.

```yaml
alertmanager:
  alertmanagerSpec:
    secrets:
      - traceroot-webhook
  config:
    route:
      receiver: "null"
      group_by: [alertname]
      group_wait: 30s
      group_interval: 5m
      repeat_interval: 4h
      routes:
        - receiver: traceroot
          matchers:
            - 'alertname=~"DemoServiceHighErrorRate|DemoServiceHighLatency"'
    receivers:
      - name: "null"
      - name: traceroot
        webhook_configs:
          - url: http://host.docker.internal:5173/api/alerts/webhook
            send_resolved: false
            max_alerts: 100
            http_config:
              authorization:
                type: Bearer
                credentials_file: /etc/alertmanager/secrets/traceroot-webhook/token
```

6. Apply the file from IncidentLab, retaining the lab's existing chart settings:

```powershell
helm upgrade kube-prometheus-stack prometheus-community/kube-prometheus-stack --namespace monitoring --reuse-values -f <local-values-file>
```

No additional Cloudflare resources are needed for this local path. Keep the dev server, tools API, and port-forwards running. Helm configuration is a one-time upstream change; changing the token requires updating both the local env and Kubernetes Secret.

## Verification

Run `npm test` in the agent directory for mocked webhook and Workflow checks. Then verify actual delivery:

1. Trigger `bad_deploy` and generate requests using IncidentLab. Wait for `DemoServiceHighErrorRate` to fire and pass Alertmanager's grouping delay.
2. Look for `alert_webhook.accepted` in the agent terminal. The event contains Workflow IDs.
3. Open `/investigations` and select the latest workflow to watch its progress and RCA, or fetch `/api/alerts/workflows/<id>` with `Authorization: Bearer <webhook-token>` to check evidence, report, or failure status.
4. Redeliver the same fingerprint/start-time payload: it returns the same ID and creates no additional Workflow. Resolved/unlisted alerts are ignored; missing authentication returns 401.

## References

- [Alertmanager webhook and HTTP configuration](https://prometheus.io/docs/alerting/latest/configuration/)
- [Workflow idempotency and batch creation](https://developers.cloudflare.com/workflows/build/rules-of-workflows/)
