import { requireEnv } from "./config";

async function callToolApi(env: Env, path: string, init?: RequestInit) {
  const startedAt = Date.now();
  const method = init?.method ?? "GET";
  const response = await fetch(
    `${requireEnv(env, "TOOL_API_BASE_URL")}${path}`,
    {
      ...init,
      headers: {
        "content-type": "application/json",
        ...init?.headers,
        authorization: `Bearer ${requireEnv(env, "TOOL_API_TOKEN")}`
      }
    }
  );

  console.log(
    JSON.stringify({
      event: "tool_api.request",
      method,
      path,
      status: response.status,
      ok: response.ok,
      durationMs: Date.now() - startedAt
    })
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Tool API ${path} failed: ${response.status} ${body}`);
  }

  return response.json();
}

export async function getDeployments(env: Env) {
  return callToolApi(env, "/deployments");
}

export async function getAlerts(env: Env) {
  return callToolApi(env, "/alerts");
}

export async function queryMetrics(env: Env, query: string) {
  return callToolApi(env, "/metrics/query", {
    method: "POST",
    body: JSON.stringify({ query })
  });
}

export async function queryLogs(
  env: Env,
  query: string,
  limit: number,
  sinceSeconds: number
) {
  return callToolApi(env, "/logs/query", {
    method: "POST",
    body: JSON.stringify({
      query,
      limit,
      since_seconds: sinceSeconds
    })
  });
}
