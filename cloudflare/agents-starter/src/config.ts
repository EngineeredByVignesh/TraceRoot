export function requireEnv(env: Env, name: keyof Env): string {
  const value = env[name];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing required environment variable: ${String(name)}`);
  }
  return value;
}

export function requireNumber(
  env: Env,
  name: keyof Env,
  min: number,
  max: number,
  integer = false
): number {
  const value = Number(requireEnv(env, name));
  if (
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isSafeInteger(value))
  ) {
    throw new Error(
      `${String(name)} must be ${integer ? "an integer" : "a number"} between ${min} and ${max}.`
    );
  }
  return value;
}

export function requireProvider(
  env: Env,
  name: "MODEL_PROVIDER"
): "google" | "cloudflare" | "openrouter";
export function requireProvider(
  env: Env,
  name: "EMBEDDING_PROVIDER"
): "google" | "cloudflare";
export function requireProvider(
  env: Env,
  name: "MODEL_PROVIDER" | "EMBEDDING_PROVIDER"
) {
  const value = requireEnv(env, name);
  if (name === "MODEL_PROVIDER" && value === "openrouter") {
    return value;
  }
  if (value !== "google" && value !== "cloudflare") {
    const choices =
      name === "MODEL_PROVIDER"
        ? "google, cloudflare, or openrouter"
        : "google or cloudflare";
    throw new Error(`${name} must be ${choices}.`);
  }
  return value;
}
