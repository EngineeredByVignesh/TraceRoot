export function requireEnv(env: Env, name: keyof Env): string {
  const value = env[name];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing required environment variable: ${String(name)}`);
  }
  return value;
}

export function requireProvider(
  env: Env,
  name: "MODEL_PROVIDER" | "EMBEDDING_PROVIDER"
) {
  const value = requireEnv(env, name);
  if (value !== "google" && value !== "cloudflare") {
    throw new Error(`${name} must be google or cloudflare.`);
  }
  return value;
}
