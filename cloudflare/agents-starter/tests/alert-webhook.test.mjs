import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

async function loadSource(path, overrides = {}) {
  const source = ts.transpileModule(
    await readFile(new URL(path, import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX
      }
    }
  ).outputText;
  const imports = [...source.matchAll(/from "([^"]+)"/g)];
  let resolved = source;
  for (const [, name] of imports) {
    const url =
      overrides[name] ??
      (name === "./llm-budget"
        ? "data:text/javascript,export const errorStatus = error => error?.statusCode; export const modelErrorMessage = (_env,error) => error.message; export const withModelBudget = async (_env, _operation, _id, execute) => execute(new AbortController().signal);"
        : name === "./model-provider"
          ? "data:text/javascript,export const createChatModel = () => ({}); export const createClassificationModel = () => ({});"
          : name === "./alert-correlation"
            ? await loadSource("../src/alert-correlation.ts")
            : name === "./memory-reuse"
              ? await loadSource("../src/memory-reuse.ts")
              : name === "./investigation-evidence"
                ? await loadSource("../src/investigation-evidence.ts")
                : name === "./investigation-progress"
                  ? await loadSource("../src/investigation-progress.ts")
                  : name === "./config"
                    ? await loadSource("../src/config.ts")
                    : name === "./ai-gateway"
                      ? await loadSource("../src/ai-gateway.ts")
                      : import.meta.resolve(name));
    resolved = resolved.replaceAll(`from "${name}"`, `from "${url}"`);
  }
  return `data:text/javascript;base64,${Buffer.from(resolved).toString("base64")}`;
}

const { handleAlertWebhook, alertWorkflowId } = await import(
  await loadSource("../src/alert-webhook.ts", {
    "./incident-memory":
      "data:text/javascript,export const rememberIncident = async () => ({}); export const searchSimilarIncidents = async () => ({});",
    agents: `data:text/javascript,export const getAgentByName = async (binding) => binding;`
  })
);
const alert = {
  status: "firing",
  fingerprint: "abc123",
  startsAt: "2026-10-02T10:00:00Z",
  labels: { alertname: "DemoServiceHighErrorRate" },
  annotations: { summary: "5xx errors" }
};
test("classification model overrides are optional and provider-specific", async () => {
  const moduleUrl = (source) =>
    `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const factory = (name, provider) =>
    moduleUrl(
      `export const ${name} = (options) => (model, settings) => ({ provider: '${provider}', options, model, settings });`
    );
  const { createClassificationModel, createChatModel } = await import(
    await loadSource("../src/model-provider.ts", {
      "@ai-sdk/google": factory("createGoogleGenerativeAI", "google"),
      "@openrouter/ai-sdk-provider": factory("createOpenRouter", "openrouter"),
      "workers-ai-provider": factory("createWorkersAI", "cloudflare")
    })
  );
  const env = {
    MODEL_PROVIDER: "google",
    GEMINI_AI_MODEL: "chat",
    GOOGLE_GENERATIVE_AI_API_KEY: "chat-key",
    OPENROUTER_BASE_URL: "https://example.test/v1",
    AI: {}
  };
  for (const model of [undefined, "", "  "]) {
    assert.deepEqual(
      createClassificationModel(
        {
          ...env,
          CLASSIFICATION_AI_MODEL: model,
          CLASSIFICATION_MODEL_PROVIDER: "invalid"
        },
        "session"
      ),
      createChatModel(env, "session")
    );
  }
  for (const provider of ["google", "openrouter", "cloudflare"]) {
    const selected = createClassificationModel(
      {
        ...env,
        CLASSIFICATION_AI_MODEL: "classifier",
        CLASSIFICATION_MODEL_PROVIDER: provider,
        CLASSIFICATION_MODEL_PROVIDER_API_KEY: "classifier-key"
      },
      "session"
    );
    assert.equal(selected.provider, provider);
    assert.equal(selected.model, "classifier");
    if (provider !== "cloudflare")
      assert.equal(selected.options.apiKey, "classifier-key");
    else assert.equal(selected.options.binding, env.AI);
  }
  assert.equal(createChatModel(env, "session").model, "chat");
  const gatewayRoot =
    "https://gateway.ai.cloudflare.com/v1/account/shared-gateway";
  const gatewayEnv = {
    ...env,
    AI_GATEWAY_BASE_URL: gatewayRoot,
    AI_GATEWAY_TOKEN: "gateway-token"
  };
  const allProviders = {
    ...gatewayEnv,
    GEMINI_AI_MODEL: "google-model",
    GOOGLE_GENERATIVE_AI_API_KEY: "google-key",
    CLOUDFLARE_AI_MODEL: "cloudflare-model",
    OPENROUTER_AI_MODEL: "openrouter-model",
    OPENROUTER_API_KEY: "openrouter-key",
    OPENROUTER_BASE_URL: "https://example.test/direct"
  };
  for (const provider of ["google", "cloudflare", "openrouter"]) {
    const selected = createChatModel(
      { ...allProviders, MODEL_PROVIDER: provider },
      "session"
    );
    assert.equal(selected.provider, provider);
    assert.equal(selected.model, `${provider}-model`);
    if (provider === "cloudflare") {
      assert.deepEqual(selected.options.gateway, {
        id: "shared-gateway",
        metadata: {},
        skipCache: true
      });
    } else {
      assert.equal(selected.options.apiKey, `${provider}-key`);
      assert.equal(
        selected.options.baseURL,
        `${gatewayRoot}/${provider === "google" ? "google-ai-studio/v1" : "openrouter"}`
      );
    }
  }
  assert.equal(allProviders.MODEL_PROVIDER, "google");
  const google = createChatModel(gatewayEnv, "session");
  assert.equal(google.options.baseURL, `${gatewayRoot}/google-ai-studio/v1`);
  assert.equal(
    google.options.headers["cf-aig-authorization"],
    "Bearer gateway-token"
  );
  const openrouter = createChatModel(
    {
      ...gatewayEnv,
      MODEL_PROVIDER: "openrouter",
      OPENROUTER_API_KEY: "router-key",
      OPENROUTER_AI_MODEL: "router-model",
      OPENROUTER_BASE_URL: undefined
    },
    "session"
  );
  assert.equal(openrouter.options.baseURL, `${gatewayRoot}/openrouter`);
  assert.equal(openrouter.options.apiKey, "router-key");
  assert.equal(
    openrouter.options.headers["cf-aig-authorization"],
    "Bearer gateway-token"
  );
  const workers = createChatModel(
    {
      ...gatewayEnv,
      MODEL_PROVIDER: "cloudflare",
      CLOUDFLARE_AI_MODEL: "workers-model"
    },
    "session"
  );
  assert.deepEqual(workers.options.gateway, {
    id: "shared-gateway",
    metadata: {},
    skipCache: true
  });
  assert.equal(workers.options.binding, env.AI);
  assert.equal(
    createChatModel(
      {
        ...env,
        MODEL_PROVIDER: "openrouter",
        OPENROUTER_API_KEY: "key",
        OPENROUTER_AI_MODEL: "model"
      },
      "session"
    ).options.baseURL,
    env.OPENROUTER_BASE_URL
  );
  assert.equal(
    createChatModel({ ...env, AI_GATEWAY_TOKEN: "unused" }, "session").options
      .headers,
    undefined
  );
  assert.equal(
    createChatModel(
      {
        ...gatewayEnv,
        AI_GATEWAY_BASE_URL: `${gatewayRoot}/google-ai-studio/v1/`
      },
      "session"
    ).options.baseURL,
    google.options.baseURL
  );
  assert.equal(
    createClassificationModel(
      {
        ...gatewayEnv,
        CLASSIFICATION_AI_MODEL: "classifier",
        CLASSIFICATION_MODEL_PROVIDER: "openrouter",
        CLASSIFICATION_MODEL_PROVIDER_API_KEY: "classifier-key"
      },
      "session"
    ).options.baseURL,
    `${gatewayRoot}/openrouter`
  );
  assert.throws(
    () =>
      createChatModel(
        {
          ...env,
          AI_GATEWAY_BASE_URL:
            "https://api.cloudflare.com/client/v4/accounts/account/ai/run"
        },
        "session"
      ),
    /AI_GATEWAY_BASE_URL/
  );
  assert.throws(
    () =>
      createClassificationModel(
        { ...env, CLASSIFICATION_AI_MODEL: "classifier" },
        "s"
      ),
    /CLASSIFICATION_MODEL_PROVIDER/
  );
  assert.throws(
    () =>
      createClassificationModel(
        {
          ...env,
          CLASSIFICATION_AI_MODEL: "classifier",
          CLASSIFICATION_MODEL_PROVIDER: "google"
        },
        "s"
      ),
    /CLASSIFICATION_MODEL_PROVIDER_API_KEY/
  );
  assert.throws(
    () =>
      createClassificationModel(
        {
          ...env,
          CLASSIFICATION_AI_MODEL: "classifier",
          CLASSIFICATION_MODEL_PROVIDER: "invalid"
        },
        "s"
      ),
    /MODEL_PROVIDER must be/
  );
  assert.equal(
    createClassificationModel(
      {
        ...env,
        CLASSIFICATION_AI_MODEL: "classifier",
        CLASSIFICATION_MODEL_PROVIDER: "cloudflare"
      },
      "s"
    ).provider,
    "cloudflare"
  );
});

test("correlation uses compact context and rejects low-confidence merges", async () => {
  const stub = (source) =>
    `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const { correlateAlert } = await import(
    await loadSource("../src/alert-correlation.ts", {
      ai: stub(
        "export const generateText = async () => ({}); export const generateObject = async options => { globalThis.compactCorrelationOptions = options; return {object: {correlated: true, investigationId: 'active', confidence: 0.6, reason: 'Weak evidence'}}; };"
      ),
      "./model-provider": stub(
        "export const createClassificationModel = () => ({});"
      )
    })
  );
  try {
    const result = await correlateAlert(
      {
        CORRELATION_MIN_CONFIDENCE: "0.8",
        CORRELATION_OUTPUT_MODE: "json-schema",
        CORRELATION_SCOPE_LABELS: "none",
        CORRELATION_MAX_OUTPUT_TOKENS: "512"
      },
      alert,
      [
        {
          id: "active",
          startedAt: alert.startsAt,
          alertName: alert.labels.alertname,
          report: "DO NOT SEND THIS LARGE REPORT",
          alerts: [{ alert }]
        }
      ]
    );
    assert.equal(result.correlated, false);
    assert.equal(result.investigationId, null);
    assert.equal(result.outcome, "low-confidence");
    assert.equal(result.modelCorrelated, true);
    assert.equal(result.modelConfidence, 0.6);
    assert.doesNotMatch(
      globalThis.compactCorrelationOptions.prompt,
      /LARGE REPORT/
    );
    assert.equal(globalThis.compactCorrelationOptions.maxRetries, 0);
  } finally {
    delete globalThis.compactCorrelationOptions;
  }
});

test("correlation parses one fenced JSON block without repairing malformed data", async () => {
  const { parseCorrelationText } = await import(
    await loadSource("../src/alert-correlation.ts")
  );
  const object = {
    correlated: false,
    investigationId: null,
    confidence: 0.9,
    reason: "Independent component"
  };
  assert.deepEqual(parseCorrelationText(JSON.stringify(object)), {
    object,
    formatFallback: false
  });
  assert.deepEqual(
    parseCorrelationText(
      `Here is the result:\n\n\`\`\`json\n${JSON.stringify(object)}\n\`\`\``
    ),
    { object, formatFallback: true }
  );
  assert.throws(() =>
    parseCorrelationText('```json\n{"correlated":false,}\n```')
  );
  assert.throws(
    () => parseCorrelationText("```json\n{}\n```\n```json\n{}\n```"),
    /exactly one/
  );
  assert.throws(
    () => parseCorrelationText('Here is JSON: {"correlated":false}'),
    /exactly one/
  );
});

test("scope policy rejects a high-confidence cross-component merge without rewriting the model decision", async () => {
  const stub = (source) =>
    `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const { correlateAlert, conflictingScope } = await import(
    await loadSource("../src/alert-correlation.ts", {
      ai: stub(
        "export const generateText = async () => ({}); export const generateObject = async () => ({object:{correlated:true,investigationId:'renderer',confidence:0.99,reason:'Shared deployment'}});"
      )
    })
  );
  const env = {
    CORRELATION_OUTPUT_MODE: "json-schema",
    CORRELATION_MIN_CONFIDENCE: "0.8",
    CORRELATION_MAX_OUTPUT_TOKENS: "512",
    CORRELATION_SCOPE_LABELS: "namespace,service,component"
  };
  const incoming = {
    ...alert,
    labels: {
      ...alert.labels,
      namespace: "lab",
      service: "demo",
      component: "database"
    }
  };
  const target = {
    id: "renderer",
    alerts: [
      {
        alert: {
          ...incoming,
          labels: { ...incoming.labels, component: "renderer" }
        }
      }
    ]
  };
  assert.deepEqual(conflictingScope(env, incoming, target), ["component"]);
  const decision = await correlateAlert(env, incoming, [target]);
  assert.equal(decision.correlated, false);
  assert.equal(decision.investigationId, null);
  assert.equal(decision.outcome, "scope-rejected");
  assert.equal(decision.modelCorrelated, true);
  assert.equal(decision.modelConfidence, 0.99);
  assert.deepEqual(
    conflictingScope(
      { ...env, CORRELATION_SCOPE_LABELS: "none" },
      incoming,
      target
    ),
    []
  );
  assert.deepEqual(
    conflictingScope(
      env,
      { ...incoming, labels: { namespace: "lab" } },
      target
    ),
    []
  );
});

test("evidence scopes database and renderer queries with escaped label values", async () => {
  const { evidenceQueries, scopeAlerts } = await import(
    await loadSource("../src/investigation-evidence.ts")
  );
  const db = {
    ...alert,
    labels: {
      namespace: "incident-lab",
      service: "demo-service",
      component: "database",
      database: 'orders"db'
    }
  };
  const queries = evidenceQueries(db);
  assert.match(queries.errorRate, /demo_service_db_connections_total/);
  assert.match(queries.errorRate, /result="error"/);
  assert.match(
    queries.latency,
    /demo_service_db_connection_duration_seconds_bucket/
  );
  assert.ok(queries.errorRate.includes('database="orders\\"db"'));
  assert.match(queries.logs, /component=database/);
  assert.match(
    evidenceQueries({
      ...db,
      labels: { ...db.labels, component: "order-renderer" }
    }).errorRate,
    /route="\/api\/orders"/
  );
  const scoped = scopeAlerts(
    [db, { ...db, labels: { ...db.labels, component: "order-renderer" } }],
    db
  );
  assert.equal(scoped.related.length, 1);
  assert.equal(scoped.unrelatedCount, 1);
  const simulated = evidenceQueries({
    ...db,
    labels: { ...db.labels, component: "storage-writer", route: "/api/simulate/disk_pressure" }
  });
  assert.match(simulated.errorRate, /route="\/api\/simulate\/disk_pressure"/);
  assert.match(simulated.latency, /route="\/api\/simulate\/disk_pressure"/);
  assert.match(simulated.logs, /component=storage-writer/);
});

test("memory enforces namespace, relevance score and all scope labels without global fallback", async () => {
  const stub = (source) =>
    `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const { searchSimilarIncidents } = await import(
    await loadSource("../src/incident-memory.ts", {
      ai: stub("export const embed = async () => ({embedding:[1,2]});"),
      "@ai-sdk/google": stub(
        "export const createGoogleGenerativeAI = () => ({embedding: () => ({})});"
      )
    })
  );
  let calls = 0;
  const env = {
    EMBEDDING_PROVIDER: "google",
    EMBEDDING_DIMENSIONS: "2",
    GEMINI_EMBEDDING_MODEL: "embedding",
    GOOGLE_GENERATIVE_AI_API_KEY: "test",
    INCIDENT_MEMORY_NAMESPACE: "benchmark-test",
    INCIDENT_MEMORY_MIN_SCORE: "0.65",
    INCIDENT_MEMORY: {
      query: async (_vector, options) => {
        calls++;
        assert.equal(options.namespace, "benchmark-test");
        return {
          count: 3,
          matches: [
            {
              id: "relevant",
              score: 0.9,
              metadata: { labels: ["database", "demo-service"] }
            },
            {
              id: "wrong-component",
              score: 0.99,
              metadata: { labels: ["registry", "demo-service"] }
            },
            {
              id: "weak",
              score: 0.4,
              metadata: { labels: ["database", "demo-service"] }
            }
          ]
        };
      }
    }
  };
  const results = await searchSimilarIncidents(env, "pool issue", 5, {
    labels: ["database", "demo-service"]
  });
  assert.deepEqual(
    results.matches.map((match) => match.id),
    ["relevant"]
  );
  assert.equal(results.filteredCount, 2);
  env.INCIDENT_MEMORY.query = async () => {
    calls++;
    return { count: 0, matches: [] };
  };
  assert.equal((await searchSimilarIncidents(env, "no match", 5)).count, 0);
  assert.equal(calls, 2);
});

test("shared model budget queues, releases failed leases and cools down transient errors", async () => {
  const stub = (source) =>
    `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const { withModelBudget, errorStatus } = await import(
    await loadSource("../src/llm-budget.ts", {
      agents: stub("export const getAgentByName = async binding => binding;")
    })
  );
  let acquired = 0,
    released = 0,
    paused = 0;
  const env = {
    LLM_COORDINATOR_NAME: "test-coordinator",
    LLM_REQUEST_TIMEOUT_MS: "1000",
    LLM_QUEUE_TIMEOUT_MS: "1000",
    LLM_QUEUE_POLL_MS: "50",
    LLM_FAILURE_COOLDOWN_MS: "1000",
    ChatAgent: {
      acquireModelSlot: async () => ({
        acquired: ++acquired > 1,
        retryAfterMs: 0
      }),
      releaseModelSlot: async () => released++,
      pauseModelRequests: async () => paused++
    }
  };
  assert.equal(
    await withModelBudget(env, "test", "id", async (signal) => {
      assert.equal(signal.aborted, false);
      return "ok";
    }),
    "ok"
  );
  assert.equal(acquired, 2);
  assert.equal(released, 1);
  await assert.rejects(
    withModelBudget(env, "test", "id", async () => {
      throw Object.assign(new Error("limited"), { statusCode: 429 });
    }),
    /limited/
  );
  assert.equal(released, 2);
  assert.equal(paused, 1);
  assert.equal(errorStatus({ lastError: { statusCode: 503 } }), 503);
});
test("alert admission correlates active incidents, deduplicates retries, and fails open", async () => {
  const moduleUrl = (source) =>
    `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const correlationUrl = await loadSource("../src/alert-correlation.ts", {
    ai: moduleUrl(
      "export const generateText = async () => ({}); export const generateObject = async () => { globalThis.correlationTest.calls++; if (globalThis.correlationTest.error) throw new Error('unavailable'); return {object: globalThis.correlationTest.result}; };"
    ),
    "./model-provider": moduleUrl(
      "export const createClassificationModel = () => ({});"
    )
  });
  const { admitAlert } = await import(
    await loadSource("../src/alert-admission.ts", {
      "./alert-correlation": correlationUrl,
      "./alert-webhook": moduleUrl(
        "export const alertWorkflowId = async (alert) => alert.fingerprint;"
      )
    })
  );
  globalThis.correlationTest = {
    calls: 0,
    result: {
      correlated: true,
      investigationId: "active",
      confidence: 0.95,
      reason: "Same deployment"
    }
  };
  let items = [];
  let creates = 0;
  const saved = new Map();
  const context = {
    env: {
      CORRELATION_MIN_CONFIDENCE: "0.8",
      CORRELATION_OUTPUT_MODE: "json-schema",
      CORRELATION_SCOPE_LABELS: "none",
      CORRELATION_MAX_OUTPUT_TOKENS: "512",
      INVESTIGATION_WORKFLOW: {
        createBatch: async () => {
          creates++;
          return [{}];
        }
      }
    },
    agentName: "default",
    sinceSeconds: 1800,
    getInvestigations: async () => items,
    update: (item) => {
      items = [item, ...items.filter((other) => other.id !== item.id)];
    },
    find: (id) => saved.get(id),
    save: (id, investigationId, correlation) =>
      saved.set(id, { investigationId, correlation })
  };
  try {
    await admitAlert(context, { ...alert, fingerprint: "first" });
    assert.equal(creates, 1);
    assert.equal(globalThis.correlationTest.calls, 0);
    items = [{ ...items[0], id: "active" }];
    const matched = await admitAlert(context, alert);
    assert.equal(matched.investigationId, "active");
    assert.equal(creates, 1);
    assert.equal(items[0].alerts.length, 2);
    items[0].status = "complete";
    await admitAlert(context, alert);
    assert.equal(creates, 1);
    assert.equal(globalThis.correlationTest.calls, 1);
    items[0].status = "running";
    for (const result of [
      {
        correlated: false,
        investigationId: null,
        confidence: 0.2,
        reason: "Unrelated"
      },
      {
        correlated: true,
        investigationId: "invented",
        confidence: 0.9,
        reason: "Invalid"
      },
      {
        correlated: true,
        investigationId: "active",
        confidence: 2,
        reason: "Invalid confidence"
      }
    ]) {
      globalThis.correlationTest.result = result;
      const admitted = await admitAlert(context, {
        ...alert,
        fingerprint: `new-${creates}`
      });
      assert.equal(admitted.created, 1);
    }
    globalThis.correlationTest.error = true;
    assert.equal(
      (await admitAlert(context, { ...alert, fingerprint: "failure" })).created,
      1
    );
    assert.equal(creates, 5);
  } finally {
    delete globalThis.correlationTest;
  }
});
function fixture() {
  const instances = new Map();
  let calls = 0;
  const env = {
    ALERT_WEBHOOK_ENABLED: "true",
    ALERT_WEBHOOK_TOKEN: "test-secret",
    ALERT_WEBHOOK_ALERT_NAMES:
      "DemoServiceHighErrorRate,DemoServiceHighLatency",
    ALERT_WEBHOOK_AGENT_NAME: "default",
    ALERT_INVESTIGATION_SINCE_SECONDS: "1800",
    INVESTIGATION_WORKFLOW: {
      async createBatch(entries) {
        calls++;
        const created = [];
        for (const entry of entries)
          if (!instances.has(entry.id)) {
            instances.set(entry.id, entry);
            created.push({ id: entry.id });
          }
        return created;
      },
      async get(id) {
        return {
          id,
          async status() {
            return { status: "complete", output: { report: "RCA" } };
          }
        };
      }
    }
  };
  env.ChatAgent = {
    async acceptAlerts(alerts, sinceSeconds, agentName) {
      const entries = await Promise.all(
        alerts.map(async (alert) => ({
          id: await alertWorkflowId(alert),
          params: {
            alert,
            sinceSeconds,
            agentName,
            question: `Investigate firing alert ${alert.labels.alertname}.`
          }
        }))
      );
      const created = await env.INVESTIGATION_WORKFLOW.createBatch(entries);
      return {
        created: created.length,
        workflows: [...new Set(entries.map((entry) => entry.id))]
      };
    }
  };
  return { env, instances, calls: () => calls };
}
function request(alerts = [alert], options = {}) {
  return new Request("http://localhost/api/alerts/webhook", {
    method: "POST",
    headers: { authorization: "Bearer test-secret" },
    body: JSON.stringify({ version: "4", status: "firing", alerts }),
    ...options
  });
}

test("authentication and disabled flag prevent Workflow creation", async () => {
  const f = fixture();
  assert.equal(
    (await handleAlertWebhook(request([alert], { headers: {} }), f.env)).status,
    401
  );
  assert.equal(
    (
      await handleAlertWebhook(request(), {
        ...f.env,
        ALERT_WEBHOOK_ENABLED: "false"
      })
    ).status,
    503
  );
  assert.equal(f.calls(), 0);
});

test("memory disabled avoids embeddings and Vectorize, and benchmark API is opt-in", async () => {
  const moduleUrl = (source) =>
    `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const { searchSimilarIncidents } = await import(
    await loadSource("../src/incident-memory.ts", {
      ai: moduleUrl(
        "export const embed = async () => { throw new Error('embedding must not run'); };"
      ),
      "@ai-sdk/google": moduleUrl(
        "export const createGoogleGenerativeAI = () => { throw new Error('provider must not initialize'); };"
      )
    })
  );
  assert.deepEqual(
    await searchSimilarIncidents(
      { INCIDENT_MEMORY_ENABLED: "false" },
      "test",
      5
    ),
    { count: 0, matches: [], disabled: true }
  );
  const f = fixture();
  const response = await handleAlertWebhook(
    new Request("http://localhost/api/alerts/benchmark", {
      method: "POST",
      headers: { authorization: "Bearer test-secret" },
      body: JSON.stringify({ operation: "search", query: "test" })
    }),
    f.env
  );
  assert.equal(response.status, 404);
  const enabled = {
    ...f.env,
    BENCHMARK_ENABLED: "true",
    INCIDENT_MEMORY_NAMESPACE: "benchmark-test"
  };
  for (const [body, expected] of [
    ["{", 400],
    ["x".repeat(65537), 413]
  ]) {
    const invalid = await handleAlertWebhook(
      new Request("http://localhost/api/alerts/benchmark", {
        method: "POST",
        headers: { authorization: "Bearer test-secret" },
        body
      }),
      enabled
    );
    assert.equal(invalid.status, expected);
  }
  const unsafe = await handleAlertWebhook(
    new Request("http://localhost/api/alerts/benchmark", {
      method: "POST",
      headers: { authorization: "Bearer test-secret" },
      body: JSON.stringify({ operation: "search", query: "test" })
    }),
    { ...enabled, INCIDENT_MEMORY_NAMESPACE: "incident-memory" }
  );
  assert.equal(unsafe.status, 400);
});

test("isolated benchmark accepts a 32-alert burst and rejects batches over 50", async () => {
  let admitted = 0;
  const env = {
    ...fixture().env,
    BENCHMARK_ENABLED: "true",
    INCIDENT_MEMORY_NAMESPACE: "benchmark-test",
    ALERT_INVESTIGATION_SINCE_SECONDS: "1800",
    ChatAgent: {
      acceptAlerts: async (alerts) => { admitted = alerts.length; return { workflows: [], correlations: [] }; }
    }
  };
  for (const [count, expected] of [[32, 202], [51, 400]]) {
    const response = await handleAlertWebhook(new Request("http://localhost/api/alerts/benchmark", {
      method: "POST",
      headers: { authorization: "Bearer test-secret" },
      body: JSON.stringify({
        operation: "run", agentName: "benchmark-large-burst", memoryEnabled: true,
        alerts: Array.from({ length: count }, (_, index) => ({ ...alert, fingerprint: `burst-${index}` }))
      })
    }), env);
    assert.equal(response.status, expected);
  }
  assert.equal(admitted, 32);
});

test("live panel renders stages, retry details, reports, and disconnected state", async () => {
  const { Investigations } = await import(
    await loadSource("../src/investigations.tsx")
  );
  const progress = {
    id: "alert-ui-test",
    alertName: "DemoServiceHighErrorRate",
    stage: "Alerts",
    status: "retrying",
    completed: ["Deployment"],
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    detail: "Alertmanager unavailable"
  };
  const html = renderToStaticMarkup(
    createElement(Investigations, {
      investigations: [progress],
      connected: false
    })
  );
  assert.match(html, /Disconnected/);
  assert.match(html, /Alertmanager unavailable/);
  assert.match(html, /Alerts - retrying/);
  assert.match(html, /Investigation stages/);
  const complete = renderToStaticMarkup(
    createElement(Investigations, {
      investigations: [
        {
          ...progress,
          status: "complete",
          report: "Evidence supports a bad deployment."
        }
      ],
      connected: true
    })
  );
  assert.match(complete, /Complete/);
  assert.match(complete, /Evidence supports a bad deployment/);
  assert.equal(
    renderToStaticMarkup(
      createElement(Investigations, { investigations: [], connected: true })
    ),
    ""
  );
});

test("investigation routes preserve home and link workflows to dedicated detail pages", async () => {
  const { investigationRoute, InvestigationView } = await import(
    await loadSource("../src/investigation-pages.tsx")
  );
  assert.equal(investigationRoute("/"), undefined);
  assert.equal(investigationRoute("/investigations"), null);
  assert.equal(investigationRoute("/investigations/"), null);
  assert.equal(
    investigationRoute("/investigations/alert-route-test"),
    "alert-route-test"
  );
  assert.equal(investigationRoute("/investigations/%"), undefined);
  const item = {
    id: "alert-route-test",
    alertName: "DemoServiceHighErrorRate",
    stage: "RCA",
    status: "running",
    completed: ["Deployment", "Alerts"],
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    report: "Live RCA preview."
  };
  const props = {
    items: [item],
    connected: true,
    loading: false,
    refresh: () => {}
  };
  const list = renderToStaticMarkup(
    createElement(InvestigationView, { ...props, id: null })
  );
  assert.match(list, /href="\/investigations\/alert-route-test"/);
  assert.doesNotMatch(list, /Live RCA preview/);
  const older = {
    ...item,
    id: "older-workflow",
    startedAt: "2026-10-01T10:00:00Z",
    updatedAt: "2026-10-04T10:00:00Z"
  };
  const newer = {
    ...item,
    id: "newer-workflow",
    startedAt: "2026-10-03T10:00:00Z"
  };
  const sorted = renderToStaticMarkup(
    createElement(InvestigationView, {
      ...props,
      items: [older, newer],
      id: null
    })
  );
  assert.ok(
    sorted.indexOf("/investigations/newer-workflow") <
      sorted.indexOf("/investigations/older-workflow")
  );
  const detail = renderToStaticMarkup(
    createElement(InvestigationView, { ...props, id: item.id })
  );
  assert.match(detail, /Live RCA preview/);
  assert.match(detail, /Investigation stages/);
  assert.match(detail, /href="\/investigations"/);
  const missing = renderToStaticMarkup(
    createElement(InvestigationView, { ...props, id: "missing" })
  );
  assert.match(missing, /Investigation not found/);
  const empty = renderToStaticMarkup(
    createElement(InvestigationView, { ...props, items: [], id: null })
  );
  assert.match(empty, /No investigations yet/);
});

test("invalid JSON, malformed alerts, and oversized bodies are rejected", async () => {
  const f = fixture();
  for (const body of [
    "{",
    JSON.stringify({ version: "4", status: "firing", alerts: [{}] })
  ]) {
    assert.equal(
      (await handleAlertWebhook(request([], { body }), f.env)).status,
      400
    );
  }
  assert.equal(
    (await handleAlertWebhook(request([], { body: "x".repeat(65537) }), f.env))
      .status,
    413
  );
  assert.equal(f.calls(), 0);
});

test("resolved and unlisted alerts do not create investigations", async () => {
  const f = fixture();
  const response = await handleAlertWebhook(
    request([
      { ...alert, status: "resolved" },
      { ...alert, labels: { alertname: "Watchdog" } }
    ]),
    f.env
  );
  assert.equal(response.status, 200);
  assert.equal(f.calls(), 0);
});

test("firing episodes deduplicate payloads, retries, and concurrent deliveries", async () => {
  const f = fixture();
  const first = await handleAlertWebhook(request([alert, alert]), f.env);
  assert.equal(first.status, 202);
  const result = await first.json();
  assert.equal(result.created, 1);
  assert.equal(result.workflows.length, 1);
  const retries = await Promise.all([
    handleAlertWebhook(request(), f.env),
    handleAlertWebhook(request(), f.env)
  ]);
  for (const response of retries)
    assert.equal((await response.json()).created, 0);
  assert.equal(f.instances.size, 1);
  const nextEpisode = { ...alert, startsAt: "2026-10-02T11:00:00Z" };
  assert.notEqual(
    await alertWorkflowId(alert),
    await alertWorkflowId(nextEpisode)
  );
  await handleAlertWebhook(request([nextEpisode]), f.env);
  assert.equal(f.instances.size, 2);
  const params = [...f.instances.values()][0].params;
  assert.equal(params.sinceSeconds, 1800);
  assert.equal(params.agentName, "default");
});

test("invalid configuration and creation failures remain retryable", async () => {
  const f = fixture();
  await assert.rejects(
    handleAlertWebhook(request(), {
      ...f.env,
      ALERT_INVESTIGATION_SINCE_SECONDS: "bad"
    }),
    /SINCE_SECONDS/
  );
  f.env.INVESTIGATION_WORKFLOW.createBatch = async () => {
    throw new Error("unavailable");
  };
  await assert.rejects(handleAlertWebhook(request(), f.env), /unavailable/);
});

test("authenticated status returns completed report", async () => {
  const f = fixture();
  const url = `http://localhost/api/alerts/workflows/${await alertWorkflowId(alert)}`;
  const response = await handleAlertWebhook(
    new Request(url, { headers: { authorization: "Bearer test-secret" } }),
    f.env
  );
  assert.equal((await response.json()).output.report, "RCA");
});

test("memory reuse requires exact scope, fresh evidence and one unambiguous eligible record", async () => {
  const { selectReusableIncident, evaluateMemoryReuse, reusedIncidentReport } =
    await import(await loadSource("../src/memory-reuse.ts"));
  const now = Date.now();
  const conditions = {
    namespace: "incident-lab",
    service: "demo-service",
    component: "database",
    deploymentImage: "demo-service:v2",
    alertNames: ["DBConnectionErrors"],
    logSignatures: ["connection pool exhausted"],
    verification: ["Check database acquisition error rate returns to baseline."]
  };
  const match = {
    id: "historical-db",
    score: 0.96,
    metadata: {
      rootCause: "Pool exhausted",
      remediation: "Inspect leaked connections",
      reuseConditions: JSON.stringify(conditions)
    }
  };
  const input = {
    history: { matches: [match] },
    alert: {
      ...alert,
      startsAt: new Date(now - 1000).toISOString(),
      labels: {
        alertname: "DBConnectionErrors",
        namespace: "incident-lab",
        service: "demo-service",
        component: "database"
      }
    },
    deployment: {
      namespace: "incident-lab",
      name: "demo-service",
      image: "demo-service:v2"
    },
    logs: {
      status: "success",
      data: {
        result: [
          {
            stream: {
              namespace: "incident-lab",
              app_kubernetes_io_name: "demo-service"
            },
            values: [
              [
                String(BigInt(now) * 1000000n),
                "ERROR component=database connection pool exhausted"
              ]
            ]
          }
        ]
      }
    },
    minimumScore: 0.9,
    now
  };
  const selected = selectReusableIncident(input);
  assert.equal(
    selectReusableIncident({
      ...input,
      alert: {
        ...input.alert,
        annotations: {
          summary: "Noisy checkout failures again, database is grumpy."
        }
      }
    }).id,
    "historical-db"
  );
  assert.equal(
    evaluateMemoryReuse(input).reason,
    "current-evidence-satisfies-reuse-conditions"
  );
  assert.equal(
    evaluateMemoryReuse({
      ...input,
      deployment: { ...input.deployment, image: "demo-service:v3" }
    }).reason,
    "deployment-image-mismatch"
  );
  assert.equal(
    evaluateMemoryReuse({
      ...input,
      history: { matches: [{ ...match, score: 0.85 }] }
    }).reason,
    "below-retrieval-threshold"
  );
  assert.equal(
    evaluateMemoryReuse({
      ...input,
      history: { matches: [match, { ...match, id: "second" }] }
    }).reason,
    "ambiguous-reusable-matches"
  );
  const conflict = {
    ...input,
    history: {
      matches: [
        {
          ...match,
          metadata: {
            ...match.metadata,
            reuseConditions: JSON.stringify({
              ...conditions,
              conflictingLogSignatures: ["authentication failed"]
            })
          }
        }
      ]
    },
    logs: {
      ...input.logs,
      data: {
        result: [
          {
            ...input.logs.data.result[0],
            values: [
              [
                String(BigInt(now) * 1000000n),
                "ERROR component=database connection pool exhausted; authentication failed"
              ]
            ]
          }
        ]
      }
    }
  };
  assert.equal(evaluateMemoryReuse(conflict).candidate, null);
  assert.equal(
    evaluateMemoryReuse(conflict).reason,
    "conflicting-current-logs"
  );
  assert.equal(selected.id, "historical-db");
  const report = reusedIncidentReport(selected);
  assert.match(report, /Historical hypothesis/);
  assert.deepEqual(report.match(/^## .+$/gm), [
    "## RCA",
    "## Summary",
    "## Fix"
  ]);
  for (const variant of [
    { history: { matches: [{ ...match, score: 0.85 }] } },
    { history: { matches: [match, { ...match, id: "ambiguous" }] } },
    {
      history: {
        matches: [
          {
            ...match,
            metadata: { ...match.metadata, reuseConditions: "invalid" }
          }
        ]
      }
    },
    { history: { unavailable: true } },
    { deployment: { ...input.deployment, image: "demo-service:v3" } },
    {
      alert: {
        ...input.alert,
        labels: { ...input.alert.labels, component: "order-renderer" }
      }
    },
    { alert: { ...input.alert, startsAt: new Date(now + 1).toISOString() } },
    { logs: { status: "success", data: { result: [] } } },
    {
      logs: {
        ...input.logs,
        data: {
          result: [
            {
              ...input.logs.data.result[0],
              values: [
                [
                  String(BigInt(now - 2000) * 1000000n),
                  "ERROR component=database connection pool exhausted"
                ]
              ]
            }
          ]
        }
      }
    }
  ])
    assert.equal(selectReusableIncident({ ...input, ...variant }), null);
});

test("Workflow reuse skips RCA and three tools; disabled or mismatched memory falls back", async () => {
  const moduleUrl = (source) =>
    `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const now = Date.now();
  const conditions = {
    namespace: "incident-lab",
    service: "demo-service",
    component: "database",
    deploymentImage: "demo-service:v2",
    alertNames: ["DBConnectionErrors"],
    logSignatures: ["connection pool exhausted"],
    verification: ["Check current database error rate."]
  };
  const state = (globalThis.reuseWorkflowTest = {
    tools: [],
    modelCalls: 0,
    memoryCalls: 0,
    published: [],
    deployment: {
      namespace: "incident-lab",
      name: "demo-service",
      image: "demo-service:v2"
    },
    logs: {
      status: "success",
      data: {
        result: [
          {
            stream: {
              namespace: "incident-lab",
              app_kubernetes_io_name: "demo-service"
            },
            values: [
              [
                String(BigInt(now) * 1000000n),
                "ERROR component=database connection pool exhausted"
              ]
            ]
          }
        ]
      }
    },
    history: {
      count: 1,
      matches: [
        {
          id: "db-history",
          score: 0.95,
          metadata: {
            rootCause: "Pool exhaustion",
            remediation: "Inspect connections",
            reuseConditions: JSON.stringify(conditions)
          }
        }
      ]
    }
  });
  const { InvestigationWorkflow } = await import(
    await loadSource("../src/investigation-workflow.ts", {
      "cloudflare:workers": moduleUrl(
        "export class WorkflowEntrypoint { constructor(env) { this.env = env; } }"
      ),
      "cloudflare:workflows": moduleUrl(
        "export class NonRetryableError extends Error {}"
      ),
      "./incident-tools": moduleUrl(
        `const s = () => globalThis.reuseWorkflowTest; export async function getDeployments() {s().tools.push('deployment'); return s().deployment;} export async function queryLogs() {s().tools.push('logs'); return s().logs;} export async function getAlerts() {s().tools.push('alerts'); return [];} export async function queryMetrics() {s().tools.push('metrics'); return {};}`
      ),
      "./incident-memory": moduleUrl(
        "export async function searchSimilarIncidents(_env,query) { globalThis.reuseWorkflowTest.memoryCalls++; globalThis.reuseWorkflowTest.memoryQuery=query; return globalThis.reuseWorkflowTest.history; }"
      ),
      agents: moduleUrl(
        "export async function getAgentByName() {return {updateInvestigation: async () => {}, getInvestigations: async () => [], recordAlertReport: async (_id,report) => globalThis.reuseWorkflowTest.published.push(report)};}"
      ),
      ai: moduleUrl(
        "export function streamText() { globalThis.reuseWorkflowTest.modelCalls++; return {textStream: (async function*() {yield 'Full investigation report';})(), text: Promise.resolve('Full investigation report'), finishReason: Promise.resolve('stop')};}"
      )
    })
  );
  const env = {
    INCIDENT_MEMORY_REUSE_ENABLED: "true",
    INCIDENT_MEMORY_REUSE_MIN_SCORE: "0.9",
    INCIDENT_MEMORY_TOP_K: "5",
    RCA_MAX_RETRIES: "1",
    RCA_RETRY_DELAY_SECONDS: "30",
    RCA_MAX_OUTPUT_TOKENS: "1600"
  };
  const event = {
    instanceId: "reuse-test",
    timestamp: new Date(now),
    payload: {
      agentName: "default",
      alert: {
        ...alert,
        startsAt: new Date(now - 1000).toISOString(),
        labels: {
          namespace: "incident-lab",
          service: "demo-service",
          component: "database",
          alertname: "DBConnectionErrors"
        }
      }
    }
  };
  const step = { do: async (_name, _options, callback) => callback() };
  try {
    const reused = await new InvestigationWorkflow(env).run(event, step);
    assert.equal(reused.investigationMode, "historical-reuse");
    assert.equal(reused.reusedIncidentId, "db-history");
    const query = JSON.parse(state.memoryQuery);
    assert.equal(query.fingerprint, undefined);
    assert.equal(query.startsAt, undefined);
    assert.deepEqual(query.labels, event.payload.alert.labels);
    assert.equal(
      reused.reuseDecisionReason,
      "current-evidence-satisfies-reuse-conditions"
    );
    assert.ok(reused.timeToRcaMs >= 0);
    assert.deepEqual(state.tools, ["deployment", "logs"]);
    assert.equal(state.modelCalls, 0);
    assert.equal(state.published.length, 1);
    assert.equal(reused.reuseTelemetry.rcaLlmSkipped, true);
    state.tools = [];
    const disabled = await new InvestigationWorkflow(env).run(
      { ...event, payload: { ...event.payload, memoryEnabled: false } },
      step
    );
    assert.equal(disabled.investigationMode, "full");
    assert.equal(disabled.reuseDecisionReason, "memory-disabled");
    assert.equal(state.tools.length, 5);
    assert.equal(state.memoryCalls, 1);
    assert.equal(state.modelCalls, 1);
    state.tools = [];
    state.deployment.image = "demo-service:v3";
    const mismatch = await new InvestigationWorkflow(env).run(event, step);
    assert.equal(mismatch.investigationMode, "full");
    assert.equal(mismatch.reuseDecisionReason, "deployment-image-mismatch");
    assert.equal(state.tools.length, 5);
    assert.equal(state.modelCalls, 2);
  } finally {
    delete globalThis.reuseWorkflowTest;
  }
});

test("automatic Workflow retries model failure and publishes a report; manual mode stays evidence-only", async () => {
  const moduleUrl = (source) =>
    `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const overrides = {
    "cloudflare:workflows": moduleUrl(
      "export class NonRetryableError extends Error {}"
    ),
    "cloudflare:workers": moduleUrl(
      "export class WorkflowEntrypoint { constructor(env) { this.env = env; } }"
    ),
    "./incident-tools": moduleUrl(
      "export const getAlerts = async () => []; export const getDeployments = async () => ({image: 'v2'}); export const queryLogs = async () => ({logs: ['500 error']}); export const queryMetrics = async () => ({value: 0.5});"
    ),
    "./incident-memory": moduleUrl(
      "export const searchSimilarIncidents = async () => { globalThis.alertWorkflowTest.memoryCalls++; throw new Error('memory offline'); };"
    ),
    "./model-provider": moduleUrl(
      "export const createChatModel = () => ({modelId: 'test'});"
    ),
    ai: moduleUrl(
      "export const streamText = () => { if (++globalThis.alertWorkflowTest.modelCalls === 1) throw new Error('temporary model failure'); const text = 'Likely bad deployment; evidence: image v2 and 500 errors.'; return { text: Promise.resolve(text), textStream: (async function* () { yield text; })() }; };"
    ),
    agents: moduleUrl(
      "export const getAgentByName = async () => ({getInvestigations: async () => [], updateInvestigation: async (progress) => { globalThis.alertWorkflowTest.progress.push(progress); }, recordAlertReport: async (id, report) => { globalThis.alertWorkflowTest.published.push({id, report}); }});"
    )
  };
  const { InvestigationWorkflow } = await import(
    await loadSource("../src/investigation-workflow.ts", overrides)
  );
  globalThis.alertWorkflowTest = {
    modelCalls: 0,
    memoryCalls: 0,
    published: [],
    progress: []
  };
  const names = [];
  const step = {
    async do(name, _config, callback) {
      names.push(name);
      try {
        return await callback();
      } catch {
        return callback();
      }
    }
  };
  try {
    const workflow = new InvestigationWorkflow({
      RCA_MAX_RETRIES: "1",
      RCA_RETRY_DELAY_SECONDS: "30",
      RCA_MAX_OUTPUT_TOKENS: "1600",
      INCIDENT_MEMORY_TOP_K: "5"
    });
    const output = await workflow.run(
      {
        instanceId: "alert-test",
        timestamp: new Date(),
        payload: { alert, agentName: "default", sinceSeconds: 1800 }
      },
      step
    );
    assert.match(output.report, /bad deployment/);
    assert.equal(globalThis.alertWorkflowTest.modelCalls, 2);
    assert.equal(globalThis.alertWorkflowTest.published[0].id, "alert-test");
    assert.ok(names.includes("publish alert report to chat"));
    assert.ok(
      globalThis.alertWorkflowTest.progress.some(
        (item) => item.status === "retrying"
      )
    );
    assert.ok(
      globalThis.alertWorkflowTest.progress.some(
        (item) => item.stage === "RCA" && item.report
      )
    );
    assert.equal(
      globalThis.alertWorkflowTest.progress.at(-1).status,
      "complete"
    );
    assert.equal(
      globalThis.alertWorkflowTest.progress.at(-1).completed.length,
      8
    );
    const manual = await workflow.run(
      {
        instanceId: "manual-test",
        payload: { question: "Investigate", sinceSeconds: 1800 }
      },
      step
    );
    assert.equal(manual.report, undefined);
    assert.equal(globalThis.alertWorkflowTest.published.length, 1);
    const disabled = await workflow.run(
      {
        instanceId: "without-memory-test",
        timestamp: new Date(),
        payload: {
          alert,
          agentName: "default",
          sinceSeconds: 1800,
          memoryEnabled: false
        }
      },
      step
    );
    assert.equal(JSON.parse(disabled.historicalContext).disabled, true);
    assert.equal(globalThis.alertWorkflowTest.memoryCalls, 1);
  } finally {
    delete globalThis.alertWorkflowTest;
  }
});
