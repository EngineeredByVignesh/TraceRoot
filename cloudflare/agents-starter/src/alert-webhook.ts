import { z } from "zod";
import { requireEnv } from "./config";
import { getAgentByName } from "agents";

const alertSchema = z.object({
  status: z.enum(["firing", "resolved"]),
  fingerprint: z.string().min(1).max(256),
  startsAt: z.string().datetime({ offset: true }),
  labels: z.record(z.string(), z.string()),
  annotations: z.record(z.string(), z.string())
});

const webhookSchema = z.object({
  version: z.literal("4"),
  status: z.enum(["firing", "resolved"]),
  alerts: z.array(alertSchema).max(100)
});

export type AlertNotification = z.infer<typeof alertSchema>;

export async function alertWorkflowId(alert: AlertNotification) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      JSON.stringify([alert.fingerprint, alert.startsAt])
    )
  );
  return `alert-${Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function handleAlertWebhook(
  request: Request,
  env: Env
): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (env.ALERT_WEBHOOK_ENABLED !== "true") {
    return Response.json(
      { error: "Alert webhook is disabled." },
      { status: 503 }
    );
  }
  if (
    request.headers.get("authorization") !==
    `Bearer ${requireEnv(env, "ALERT_WEBHOOK_TOKEN")}`
  ) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const statusMatch = /^\/api\/alerts\/workflows\/(alert-[a-f0-9]{64})$/.exec(
    path
  );
  if (statusMatch && request.method === "GET") {
    const instance = await env.INVESTIGATION_WORKFLOW.get(statusMatch[1]);
    return Response.json({ id: instance.id, ...(await instance.status()) });
  }
  if (path !== "/api/alerts/webhook")
    return new Response("Not found", { status: 404 });
  if (request.method !== "POST")
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "POST" }
    });

  // Bound input before parsing so an authenticated sender cannot buffer an unbounded body.
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: "Missing body" }, { status: 400 });
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 65536) {
      await reader.cancel();
      return Response.json(
        { error: "Payload exceeds 64 KiB" },
        { status: 413 }
      );
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = webhookSchema.safeParse(body);
  if (!parsed.success)
    return Response.json(
      { error: "Invalid Alertmanager v4 payload" },
      { status: 400 }
    );

  const allowedNames = requireEnv(env, "ALERT_WEBHOOK_ALERT_NAMES")
    .split(",")
    .map((name) => name.trim());
  const firing = parsed.data.alerts.filter(
    (alert) =>
      alert.status === "firing" && allowedNames.includes(alert.labels.alertname)
  );
  if (!firing.length)
    return Response.json({ accepted: 0, ignored: parsed.data.alerts.length });
  const sinceSeconds = Number(
    requireEnv(env, "ALERT_INVESTIGATION_SINCE_SECONDS")
  );
  if (
    !Number.isSafeInteger(sinceSeconds) ||
    sinceSeconds < 300 ||
    sinceSeconds > 86400
  ) {
    throw new Error(
      "ALERT_INVESTIGATION_SINCE_SECONDS must be an integer between 300 and 86400."
    );
  }
  const agentName = requireEnv(env, "ALERT_WEBHOOK_AGENT_NAME");
  const agent = await getAgentByName(env.ChatAgent, agentName);
  const result = await agent.acceptAlerts(firing, sinceSeconds, agentName);
  console.log(
    JSON.stringify({
      event: "alert_webhook.accepted",
      ...result
    })
  );
  return Response.json(result, { status: 202 });
}
