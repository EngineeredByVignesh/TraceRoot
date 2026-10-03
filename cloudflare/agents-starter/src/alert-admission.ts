import { correlateAlert, type AlertCorrelation } from "./alert-correlation";
import { alertWorkflowId, type AlertNotification } from "./alert-webhook";
import type { InvestigationProgress } from "./investigation-progress";

export type AlertAssociation = {
  episodeId: string;
  alert: AlertNotification;
  correlation: AlertCorrelation;
};
type AdmissionContext = {
  env: Env;
  agentName: string;
  sinceSeconds: number;
  getInvestigations: () => Promise<InvestigationProgress[]>;
  update: (progress: InvestigationProgress) => void;
  find: (
    episodeId: string
  ) => { investigationId: string; correlation: AlertCorrelation } | undefined;
  save: (
    episodeId: string,
    investigationId: string,
    correlation: AlertCorrelation
  ) => void;
};

export async function admitAlert(
  context: AdmissionContext,
  alert: AlertNotification
) {
  const episodeId = await alertWorkflowId(alert);
  const existing = context.find(episodeId);
  if (existing) return { ...existing, created: 0 };
  const investigations = await context.getInvestigations();
  const active = investigations.filter(
    (item) => item.status === "running" || item.status === "retrying"
  );
  let correlation: AlertCorrelation = {
    correlated: false,
    investigationId: null,
    confidence: 0,
    reason: "No in-progress investigations."
  };
  if (active.length) {
    try {
      correlation = await correlateAlert(context.env, alert, active);
    } catch {
      correlation = {
        correlated: false,
        investigationId: null,
        confidence: 0,
        reason: "Correlation unavailable; starting a separate investigation."
      };
    }
  }
  // The target may have finished during inference; never merge into a completed incident.
  const latest = await context.getInvestigations();
  const target = latest.find(
    (item) =>
      item.id === correlation.investigationId &&
      (item.status === "running" || item.status === "retrying")
  );
  if (correlation.correlated && target) {
    const alerts = target.alerts ?? [];
    context.update({
      ...target,
      alerts: [
        ...alerts.filter((item) => item.episodeId !== episodeId),
        { episodeId, alert, correlation }
      ]
    });
    context.save(episodeId, target.id, correlation);
    return { investigationId: target.id, correlation, created: 0 };
  }
  if (correlation.correlated)
    correlation = {
      correlated: false,
      investigationId: null,
      confidence: 0,
      reason: "The correlated investigation finished before association."
    };
  const created = await context.env.INVESTIGATION_WORKFLOW.createBatch([
    {
      id: episodeId,
      params: {
        question: `Investigate firing alert ${alert.labels.alertname}.`,
        sinceSeconds: context.sinceSeconds,
        alert,
        agentName: context.agentName
      }
    }
  ]);
  const snapshots = await context.getInvestigations();
  const current = snapshots.find((item) => item.id === episodeId);
  const now = new Date().toISOString();
  context.update({
    id: episodeId,
    alertName: alert.labels.alertname,
    stage: "Deployment",
    status: "running",
    completed: [],
    startedAt: now,
    updatedAt: now,
    ...current,
    alerts: current?.alerts?.length
      ? current.alerts
      : [{ episodeId, alert, correlation }]
  });
  context.save(episodeId, episodeId, correlation);
  return { investigationId: episodeId, correlation, created: created.length };
}
