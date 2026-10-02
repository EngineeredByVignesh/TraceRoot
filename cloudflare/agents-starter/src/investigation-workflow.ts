import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep
} from "cloudflare:workers";
import {
  getAlerts,
  getDeployments,
  queryLogs,
  queryMetrics
} from "./incident-tools";

type InvestigationParams = {
  question?: string;
  sinceSeconds?: number;
};

const retryStep = {
  retries: {
    limit: 3,
    delay: "10 seconds",
    backoff: "exponential"
  },
  timeout: "2 minutes"
} as const;

function toJsonString(value: unknown): string {
  return JSON.stringify(value);
}

export class InvestigationWorkflow extends WorkflowEntrypoint<
  Env,
  InvestigationParams
> {
  async run(event: WorkflowEvent<InvestigationParams>, step: WorkflowStep) {
    const sinceSeconds = event.payload.sinceSeconds ?? 1800;

    const deployment = await step.do(
      "collect deployment metadata",
      retryStep,
      async () => toJsonString(await getDeployments(this.env))
    );

    const alerts = await step.do("collect active alerts", retryStep, async () =>
      toJsonString(await getAlerts(this.env))
    );

    const errorRate = await step.do(
      "collect error rate metric",
      retryStep,
      async () =>
        toJsonString(
          await queryMetrics(
            this.env,
            'sum(rate(demo_service_requests_total{status_code=~"5.."}[5m])) / sum(rate(demo_service_requests_total[5m]))'
          )
        )
    );

    const p95Latency = await step.do(
      "collect p95 latency metric",
      retryStep,
      async () =>
        toJsonString(
          await queryMetrics(
            this.env,
            "histogram_quantile(0.95, sum by (le) (rate(demo_service_request_duration_seconds_bucket[5m])))"
          )
        )
    );

    const logs = await step.do("collect recent logs", retryStep, async () =>
      toJsonString(
        await queryLogs(
          this.env,
          '{namespace="incident-lab", app_kubernetes_io_name="demo-service"}',
          100,
          sinceSeconds
        )
      )
    );

    return {
      question: event.payload.question ?? "Investigate demo-service.",
      collectedAt: new Date().toISOString(),
      sinceSeconds,
      evidence: {
        deploymentJson: deployment,
        alertsJson: alerts,
        errorRateJson: errorRate,
        p95LatencyJson: p95Latency,
        logsJson: logs
      }
    };
  }
}
