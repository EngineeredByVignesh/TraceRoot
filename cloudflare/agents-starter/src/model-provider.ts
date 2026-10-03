import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createWorkersAI } from "workers-ai-provider";
import { requireEnv, requireProvider } from "./config";
import { gatewaySettings } from "./ai-gateway";

export function createClassificationModel(env: Env, sessionAffinity: string) {
  if (!env.CLASSIFICATION_AI_MODEL?.trim()) {
    return createChatModel(env, sessionAffinity);
  }
  const provider = requireProvider(
    {
      ...env,
      MODEL_PROVIDER: requireEnv(env, "CLASSIFICATION_MODEL_PROVIDER")
    },
    "MODEL_PROVIDER"
  );
  const model = requireEnv(env, "CLASSIFICATION_AI_MODEL");
  const apiKey =
    provider === "cloudflare"
      ? undefined
      : requireEnv(env, "CLASSIFICATION_MODEL_PROVIDER_API_KEY");
  return createChatModel(
    {
      ...env,
      MODEL_PROVIDER: provider,
      ...(provider === "google"
        ? { GEMINI_AI_MODEL: model, GOOGLE_GENERATIVE_AI_API_KEY: apiKey! }
        : {}),
      ...(provider === "openrouter"
        ? { OPENROUTER_AI_MODEL: model, OPENROUTER_API_KEY: apiKey! }
        : {}),
      ...(provider === "cloudflare" ? { CLOUDFLARE_AI_MODEL: model } : {})
    },
    sessionAffinity
  );
}

export function createChatModel(env: Env, sessionAffinity: string) {
  const gateway = gatewaySettings(env);
  switch (requireProvider(env, "MODEL_PROVIDER")) {
    case "cloudflare":
      return createWorkersAI({
        binding: env.AI,
        gateway: gateway ? { id: gateway.id } : undefined
      })(requireEnv(env, "CLOUDFLARE_AI_MODEL"), { sessionAffinity });
    case "google":
      return createGoogleGenerativeAI({
        apiKey: requireEnv(env, "GOOGLE_GENERATIVE_AI_API_KEY"),
        baseURL: gateway ? `${gateway.baseURL}/google-ai-studio/v1` : undefined,
        headers: gateway?.headers
      })(requireEnv(env, "GEMINI_AI_MODEL"));
    case "openrouter":
      return createOpenRouter({
        apiKey: requireEnv(env, "OPENROUTER_API_KEY"),
        baseURL: gateway
          ? `${gateway.baseURL}/openrouter`
          : requireEnv(env, "OPENROUTER_BASE_URL"),
        headers: gateway?.headers
      })(requireEnv(env, "OPENROUTER_AI_MODEL"));
  }
}
