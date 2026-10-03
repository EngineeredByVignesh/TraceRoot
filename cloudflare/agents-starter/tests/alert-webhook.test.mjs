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
      (name === "./investigation-progress"
        ? await loadSource("../src/investigation-progress.ts")
        : name === "./config"
          ? await loadSource("../src/config.ts")
          : import.meta.resolve(name));
    resolved = resolved.replaceAll(`from "${name}"`, `from "${url}"`);
  }
  return `data:text/javascript;base64,${Buffer.from(resolved).toString("base64")}`;
}

const { handleAlertWebhook, alertWorkflowId } = await import(
  await loadSource("../src/alert-webhook.ts", {
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
test("alert admission correlates active incidents, deduplicates retries, and fails open", async () => {
  const moduleUrl = (source) =>
    `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const correlationUrl = await loadSource("../src/alert-correlation.ts", {
    ai: moduleUrl(
      "export const generateObject = async () => { globalThis.correlationTest.calls++; if (globalThis.correlationTest.error) throw new Error('unavailable'); return {object: globalThis.correlationTest.result}; };"
    ),
    "./model-provider": moduleUrl("export const createChatModel = () => ({});")
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

test("automatic Workflow retries model failure and publishes a report; manual mode stays evidence-only", async () => {
  const moduleUrl = (source) =>
    `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const overrides = {
    "cloudflare:workers": moduleUrl(
      "export class WorkflowEntrypoint { constructor(env) { this.env = env; } }"
    ),
    "./incident-tools": moduleUrl(
      "export const getAlerts = async () => []; export const getDeployments = async () => ({image: 'v2'}); export const queryLogs = async () => ({logs: ['500 error']}); export const queryMetrics = async () => ({value: 0.5});"
    ),
    "./incident-memory": moduleUrl(
      "export const searchSimilarIncidents = async () => { throw new Error('memory offline'); };"
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
  globalThis.alertWorkflowTest = { modelCalls: 0, published: [], progress: [] };
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
    const workflow = new InvestigationWorkflow({});
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
  } finally {
    delete globalThis.alertWorkflowTest;
  }
});
