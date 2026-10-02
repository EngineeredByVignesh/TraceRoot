import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { embed } from "ai";

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

const CLOUDFLARE_EMBEDDING_MODEL = "@cf/google/embeddinggemma-300m";
const DEFAULT_GEMINI_EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMENSIONS = 768;
const MEMORY_NAMESPACE = "incident-memory";

function buildMemoryText(input: IncidentMemoryInput) {
  return [
    `Title: ${input.title}`,
    `Summary: ${input.summary}`,
    `Root cause: ${input.rootCause}`,
    `Remediation: ${input.remediation}`,
    `Labels: ${(input.labels ?? []).join(", ")}`
  ].join("\n");
}

async function embedText(env: Env, text: string) {
  const embeddingProvider = env.EMBEDDING_PROVIDER as
    | "google"
    | "cloudflare"
    | undefined;

  if (embeddingProvider !== "cloudflare") {
    const google = createGoogleGenerativeAI({
      apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
      baseURL: env.AI_GATEWAY_BASE_URL || undefined,
      headers: env.AI_GATEWAY_TOKEN
        ? {
            "cf-aig-authorization": `Bearer ${env.AI_GATEWAY_TOKEN}`
          }
        : undefined
    });

    const result = await embed({
      model: google.embedding(
        env.GEMINI_EMBEDDING_MODEL || DEFAULT_GEMINI_EMBEDDING_MODEL
      ),
      value: text,
      providerOptions: {
        google: {
          outputDimensionality: EMBEDDING_DIMENSIONS,
          taskType: "SEMANTIC_SIMILARITY"
        }
      }
    });

    return result.embedding;
  }

  const output = (await env.AI.run(CLOUDFLARE_EMBEDDING_MODEL, {
    text
  })) as EmbeddingOutput;

  const [embedding] = output.data;
  if (!embedding) {
    throw new Error("Workers AI embedding response did not include data.");
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
      namespace: MEMORY_NAMESPACE,
      values,
      metadata: {
        title: input.title,
        summary: input.summary,
        rootCause: input.rootCause,
        remediation: input.remediation,
        labels: input.labels ?? [],
        createdAt
      }
    }
  ]);

  return {
    id,
    createdAt,
    mutation,
    note: "Vectorize mutations are asynchronous; the memory may take a short time to appear in similarity search results."
  };
}

export async function searchSimilarIncidents(
  env: Env,
  query: string,
  topK: number
) {
  const vector = await embedText(env, query);
  const namespacedResults = await env.INCIDENT_MEMORY.query(vector, {
    namespace: MEMORY_NAMESPACE,
    topK,
    returnMetadata: "all"
  });

  if (namespacedResults.count > 0) {
    return namespacedResults;
  }

  const fallbackResults = await env.INCIDENT_MEMORY.query(vector, {
    topK,
    returnMetadata: "all"
  });

  return {
    ...fallbackResults,
    namespacedCount: namespacedResults.count,
    note:
      fallbackResults.count > 0
        ? "No matches were found in the incident-memory namespace, but matches were found without a namespace filter."
        : "No matches found. If an incident was just remembered, wait a few seconds and retry because Vectorize mutations are asynchronous."
  };
}
