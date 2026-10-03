export function gatewaySettings(env: Env) {
  const value = env.AI_GATEWAY_BASE_URL?.trim();
  if (!value) return undefined;
  const url = new URL(value);
  const segments = url.pathname.split("/").filter(Boolean);
  const suffix = segments.slice(3).join("/");
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    segments[0] !== "v1" ||
    !segments[1] ||
    !segments[2] ||
    !["", "google-ai-studio/v1", "openrouter", "workers-ai"].includes(suffix)
  ) {
    throw new Error(
      "AI_GATEWAY_BASE_URL must be https://<host>/v1/<account-id>/<gateway-id>."
    );
  }
  // Accept existing provider-specific URLs, but derive each provider from the same root.
  url.pathname = `/${segments.slice(0, 3).join("/")}`;
  return {
    baseURL: url.toString().replace(/\/$/, ""),
    id: decodeURIComponent(segments[2]),
    headers: env.AI_GATEWAY_TOKEN?.trim()
      ? { "cf-aig-authorization": `Bearer ${env.AI_GATEWAY_TOKEN.trim()}` }
      : undefined
  };
}
