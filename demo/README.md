# TraceRoot Demo

Local captures of manual chat and alert-triggered investigations. These are product examples, not benchmark measurements or proof of remediation execution.

## Manual Chat

[Open the hosted manual chat demo](https://engineeredbyvignesh.github.io/TraceRoot/demo/pages/manual-chat.html) to view the captured conversation. This is a static snapshot, not the live application.

[Saved HTML for offline viewing](pages/manual-chat.html). GitHub displays its source; open the downloaded HTML locally to render it.

For live chat, follow [local startup](../README.md#running-locally), open `/`, and ask the agent to investigate symptoms using deployment, alert, metric, log, and historical evidence.

## Investigation List

Alert-triggered workflows appear at `/investigations`, including running, retrying, and completed investigations.

![Investigation list showing running, retrying, and completed workflows](images/investigations-list.png)

## Investigation In Progress

Open a workflow to follow its evidence stages and RCA generation in realtime.

![Pod restart investigation with completed evidence steps and RCA generation in progress](images/investigation-in-progress.png)

## Completed RCA

The database latency example shows the final RCA, Summary, and Fix. Suggested commands are recommendations, not automatically executed repairs.

![Completed database latency investigation with RCA, Summary, and Fix](images/database-rca-report.png)

To reproduce the live scenario, use the [IncidentLab simulation runbook](https://github.com/EngineeredByVignesh/IncidentLab#simultaneous-incident-simulation) and configure [alert delivery](../adrs/ADR7-alert-webhook-investigations.md#local-setup). Historical reuse requires separately reviewed matching conditions; generated reports are not automatically promoted to memory.
