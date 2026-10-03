import type { AlertAssociation } from "./alert-admission";

export const investigationStages = [
  "Deployment",
  "Alerts",
  "Error rate",
  "Latency",
  "Logs",
  "History",
  "RCA",
  "Publish"
] as const;

export type InvestigationStage = (typeof investigationStages)[number];
export type InvestigationProgress = {
  id: string;
  alertName: string;
  status: "running" | "retrying" | "complete" | "failed";
  stage: InvestigationStage;
  completed: InvestigationStage[];
  startedAt: string;
  updatedAt: string;
  detail?: string;
  report?: string;
  alerts?: AlertAssociation[];
};
export type InvestigationState = { investigations: InvestigationProgress[] };

export function newestInvestigations(items: InvestigationProgress[]) {
  return [...items].sort(
    (a, b) =>
      Date.parse(b.startedAt) - Date.parse(a.startedAt) ||
      b.id.localeCompare(a.id)
  );
}
