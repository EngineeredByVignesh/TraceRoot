import { getAgentByName } from "agents";
import { requireEnv, requireNumber } from "./config";

export function errorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const value = error as {
    statusCode?: number;
    cause?: unknown;
    lastError?: unknown;
  };
  return (
    value.statusCode ?? errorStatus(value.lastError) ?? errorStatus(value.cause)
  );
}

export function modelErrorMessage(env: Env, error: unknown): string {
  let message = error instanceof Error ? error.message : String(error);
  if (
    error &&
    typeof error === "object" &&
    "text" in error &&
    typeof error.text === "string"
  )
    message += ` Model output: ${error.text.slice(0, 300)}`;
  for (const [key, value] of Object.entries(env)) {
    if (/KEY|TOKEN|SECRET/.test(key) && typeof value === "string" && value)
      message = message.replaceAll(value, "[redacted]");
  }
  return message.slice(0, 500);
}

export async function withModelBudget<T>(
  env: Env,
  operation: string,
  id: string,
  execute: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const coordinator = await getAgentByName(
    env.ChatAgent,
    requireEnv(env, "LLM_COORDINATOR_NAME")
  );
  const timeout = requireNumber(
    env,
    "LLM_REQUEST_TIMEOUT_MS",
    1000,
    180000,
    true
  );
  const queueTimeout = requireNumber(
    env,
    "LLM_QUEUE_TIMEOUT_MS",
    1000,
    180000,
    true
  );
  const poll = requireNumber(env, "LLM_QUEUE_POLL_MS", 50, 5000, true);
  const owner = crypto.randomUUID();
  const queuedAt = Date.now();
  while (true) {
    const slot = await coordinator.acquireModelSlot(owner, timeout);
    if (slot.acquired) break;
    const remaining = queueTimeout - (Date.now() - queuedAt);
    if (remaining <= 0)
      throw new Error(
        "LLM queue deadline exceeded; no model request was sent."
      );
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        Math.min(remaining, Math.max(poll, slot.retryAfterMs))
      )
    );
  }
  const started = Date.now();
  let status: number | undefined;
  let ok = false;
  let errorName: string | undefined;
  let errorMessage: string | undefined;
  try {
    const result = await execute(AbortSignal.timeout(timeout));
    ok = true;
    return result;
  } catch (error) {
    status = errorStatus(error);
    errorName = error instanceof Error ? error.name : "UnknownError";
    errorMessage = modelErrorMessage(env, error);
    if (status === 429 || status === 503) {
      await coordinator.pauseModelRequests(
        requireNumber(env, "LLM_FAILURE_COOLDOWN_MS", 1000, 300000, true)
      );
    }
    throw error;
  } finally {
    await coordinator.releaseModelSlot(owner);
    console.log(
      JSON.stringify({
        event: "llm.request",
        operation,
        id,
        ok,
        status,
        errorName,
        errorMessage,
        queueMs: started - queuedAt,
        durationMs: Date.now() - started
      })
    );
  }
}
