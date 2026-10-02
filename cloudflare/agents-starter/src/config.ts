export function requireEnv(env: Env, name: keyof Env): string {
  const value = env[name];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing required environment variable: ${String(name)}`);
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
