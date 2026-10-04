import type { AlertNotification } from "./alert-webhook";

export function evidenceQueries(alert?: AlertNotification) {
  const labels = alert?.labels ?? {};
  const database = labels.component === "database";
  const selectors = ["namespace", "service", ...(database ? ["database"] : [])]
    .filter((key) => labels[key])
    .map((key) => `${key}=${JSON.stringify(labels[key])}`);
  if (!database && (labels.route || labels.component === "order-renderer"))
    selectors.push(`route=${JSON.stringify(labels.route || "/api/orders")}`);
  const filter = selectors.join(",");
  const metric = database
    ? "demo_service_db_connections_total"
    : "demo_service_requests_total";
  const error = database ? 'result="error"' : 'status_code=~"5.."';
  const histogram = database
    ? "demo_service_db_connection_duration_seconds_bucket"
    : "demo_service_request_duration_seconds_bucket";
  const logSelectors = [
    labels.namespace
      ? `namespace=${JSON.stringify(labels.namespace)}`
      : undefined,
    labels.service
      ? `app_kubernetes_io_name=${JSON.stringify(labels.service)}`
      : undefined
  ].filter(Boolean);
  return {
    errorRate: `sum(rate(${metric}{${filter}${filter ? "," : ""}${error}}[5m])) / sum(rate(${metric}{${filter}}[5m]))`,
    latency: `histogram_quantile(0.95, sum by (le) (rate(${histogram}{${filter}}[5m])))`,
    logs: `{${logSelectors.join(",")}}${labels.component ? ` |= ${JSON.stringify(`component=${labels.component}`)}` : ""}`,
    scope: {
      namespace: labels.namespace,
      service: labels.service,
      component: labels.component,
      database: labels.database
    },
    metricKind: database ? "database connection acquisition" : "HTTP requests"
  };
}

export function scopeAlerts(value: unknown, alert?: AlertNotification) {
  if (!Array.isArray(value) || !alert) return value;
  const keys = ["namespace", "service", "component"];
  const matches = (item: { labels?: Record<string, string> }) =>
    keys.every(
      (key) => !alert.labels[key] || item.labels?.[key] === alert.labels[key]
    );
  return {
    related: value.filter(matches),
    unrelatedCount: value.filter((item) => !matches(item)).length
  };
}
