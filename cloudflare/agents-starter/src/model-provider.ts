import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createWorkersAI } from "workers-ai-provider";
import { requireEnv, requireProvider } from "./config";

export function createChatModel(env: Env, sessionAffinity: string) {
  switch (requireProvider(env, "MODEL_PROVIDER")) {
    case "cloudflare":
      return createWorkersAI({ binding: env.AI })(
        requireEnv(env, "CLOUDFLARE_AI_MODEL"),
        { sessionAffinity }
      );
    case "google":
      return createGoogleGenerativeAI({
        apiKey: requireEnv(env, "GOOGLE_GENERATIVE_AI_API_KEY"),
        baseURL: env.AI_GATEWAY_BASE_URL || undefined,
        headers: env.AI_GATEWAY_TOKEN
          ? { "cf-aig-authorization": `Bearer ${env.AI_GATEWAY_TOKEN}` }
          : undefined
      })(requireEnv(env, "GEMINI_AI_MODEL"));
    case "openrouter":
      return createOpenRouter({
        apiKey: requireEnv(env, "OPENROUTER_API_KEY"),
        baseURL: requireEnv(env, "OPENROUTER_BASE_URL")
      })(requireEnv(env, "OPENROUTER_AI_MODEL"));
  }
}
