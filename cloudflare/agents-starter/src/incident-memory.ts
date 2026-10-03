import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { embed } from "ai";
import { requireEnv, requireProvider } from "./config";
import { gatewaySettings } from "./ai-gateway";

type EmbeddingOutput = {
  data: number[][];
};

type IncidentMemoryInput = {
  title: string;
  summary: string;
  rootCause: string;
  remediation: string;
  labels?: string[];
};

function buildMemoryText(input: IncidentMemoryInput) {
  return [
    `Title: ${input.title}`,
    `Summary: ${input.summary}`,
    `Root cause: ${input.rootCause}`,
    `Remediation: ${input.remediation}`,
    `Labels: ${(input.labels ?? []).join(", ")}`,
  ].join("\n");
}

async function embedText(env: Env, text: string) {
  const gateway = gatewaySettings(env);
  const embeddingProvider = requireProvider(env, "EMBEDDING_PROVIDER");
  const dimensions = Number(requireEnv(env, "EMBEDDING_DIMENSIONS"));
  if (!Number.isSafeInteger(dimensions) || dimensions <= 0) {
    throw new Error("EMBEDDING_DIMENSIONS must be a positive integer.");
  }

  if (embeddingProvider !== "cloudflare") {
    const google = createGoogleGenerativeAI({
      apiKey: requireEnv(env, "GOOGLE_GENERATIVE_AI_API_KEY"),
      baseURL: gateway ? `${gateway.baseURL}/google-ai-studio/v1` : undefined,
      headers: gateway?.headers,
    });

    const result = await embed({
      model: google.embedding(requireEnv(env, "GEMINI_EMBEDDING_MODEL")),
      value: text,
      providerOptions: {
        google: {
          outputDimensionality: dimensions,
          taskType: "SEMANTIC_SIMILARITY",
        },
      },
    });

    return result.embedding;
  }

  const output = (await env.AI.run(
    requireEnv(env, "CLOUDFLARE_EMBEDDING_MODEL") as keyof AiModels,
    {
      text,
    },
    gateway ? { gateway: { id: gateway.id } } : undefined,
  )) as EmbeddingOutput;

  const [embedding] = output.data;
  if (!embedding) {
    throw new Error("Workers AI embedding response did not include data.");
  }
  if (embedding.length !== dimensions) {
    throw new Error(
      "Workers AI embedding dimensions do not match EMBEDDING_DIMENSIONS.",
    );
  }

  return embedding;
}

export async function rememberIncident(env: Env, input: IncidentMemoryInput) {
  const text = buildMemoryText(input);
  const values = await embedText(env, text);
  const id = `incident-${crypto.randomUUID()}`;
  const createdAt = new Date().toISOString();

  const mutation = await env.INCIDENT_MEMORY.upsert([
    {
      id,
      namespace: requireEnv(env, "INCIDENT_MEMORY_NAMESPACE"),
      values,
      metadata: {
        title: input.title,
        summary: input.summary,
        rootCause: input.rootCause,
        remediation: input.remediation,
        labels: input.labels ?? [],
        createdAt,
      },
    },
  ]);

  return {
    id,
    createdAt,
    mutation,
    note: "Vectorize mutations are asynchronous; the memory may take a short time to appear in similarity search results.",
  };
}

export async function searchSimilarIncidents(
  env: Env,
  query: string,
  topK: number,
) {
  const vector = await embedText(env, query);
  const namespacedResults = await env.INCIDENT_MEMORY.query(vector, {
    namespace: requireEnv(env, "INCIDENT_MEMORY_NAMESPACE"),
    topK,
    returnMetadata: "all",
  });

  if (namespacedResults.count > 0) {
    return namespacedResults;
  }

  const fallbackResults = await env.INCIDENT_MEMORY.query(vector, {
    topK,
    returnMetadata: "all",
  });

  return {
    ...fallbackResults,
    namespacedCount: namespacedResults.count,
    note:
      fallbackResults.count > 0
        ? "No matches were found in the incident-memory namespace, but matches were found without a namespace filter."
        : "No matches found. If an incident was just remembered, wait a few seconds and retry because Vectorize mutations are asynchronous.",
  };
}
