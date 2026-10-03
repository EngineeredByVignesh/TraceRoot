import { useCallback, useEffect, useState } from "react";
import { useAgent } from "agents/react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowsClockwiseIcon,
  CheckCircleIcon,
  CircleIcon,
  SpinnerIcon,
  WarningCircleIcon
} from "@phosphor-icons/react";
import { Streamdown } from "streamdown";
import type { ChatAgent } from "./server";
import {
  investigationStages,
  newestInvestigations,
  type InvestigationProgress,
  type InvestigationState
} from "./investigation-progress";

export function investigationRoute(path: string): string | null | undefined {
  if (/^\/investigations\/?$/.test(path)) return null;
  const match = /^\/investigations\/([^/]+)\/?$/.exec(path);
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return undefined;
  }
}

function StatusIcon({ item }: { item: InvestigationProgress }) {
  if (item.status === "complete")
    return <CheckCircleIcon size={18} className="text-kumo-success shrink-0" />;
  if (item.status === "failed")
    return (
      <WarningCircleIcon size={18} className="text-kumo-danger shrink-0" />
    );
  return (
    <SpinnerIcon size={18} className="animate-spin text-kumo-brand shrink-0" />
  );
}

function elapsed(item: InvestigationProgress, now: number) {
  const active = item.status === "running" || item.status === "retrying";
  const seconds = Math.max(
    0,
    Math.floor(
      ((active ? now : Date.parse(item.updatedAt)) -
        Date.parse(item.startedAt)) /
        1000
    )
  );
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function InvestigationView({
  items,
  id,
  connected,
  loading,
  error,
  refresh
}: {
  items: InvestigationProgress[];
  id: string | null;
  connected: boolean;
  loading: boolean;
  error?: string;
  refresh: () => void;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const selected = items.find((item) => item.id === id);
  const filtered = newestInvestigations(items).filter(
    (item) =>
      (status === "all" || item.status === status) &&
      `${item.alertName} ${item.id}`
        .toLowerCase()
        .includes(search.toLowerCase())
  );
  return (
    <div className="min-h-screen bg-kumo-base text-kumo-default">
      <header className="border-b border-kumo-line px-5 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <a
            href={id ? "/investigations" : "/"}
            className="flex items-center gap-2 text-sm hover:underline"
          >
            <ArrowLeftIcon size={16} />
            {id ? "Investigations" : "Home"}
          </a>
          <span className="flex items-center gap-2 text-xs text-kumo-subtle">
            <CircleIcon
              size={8}
              weight="fill"
              className={connected ? "text-kumo-success" : "text-kumo-danger"}
            />
            {connected ? "Live" : "Disconnected"}
          </span>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-5 py-8">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold break-words">
              {id ? (selected?.alertName ?? "Investigation") : "Investigations"}
            </h1>
            <p className="text-xs text-kumo-subtle mt-2 break-all">
              {id ?? `${items.length} workflows`}
            </p>
          </div>
          <button
            type="button"
            onClick={refresh}
            title="Refresh investigations"
            aria-label="Refresh investigations"
            className="p-2 border border-kumo-line rounded-md shrink-0 hover:bg-kumo-elevated"
          >
            <ArrowsClockwiseIcon size={18} />
          </button>
        </div>
        {error && (
          <output className="block text-sm text-kumo-danger mb-4">
            {error}
          </output>
        )}
        {loading && !items.length ? (
          <p className="text-sm text-kumo-subtle flex gap-2 items-center">
            <SpinnerIcon size={16} className="animate-spin" />
            Loading investigations...
          </p>
        ) : id ? (
          selected ? (
            <>
              <div className="flex flex-wrap items-center gap-3 border-y border-kumo-line py-4 mb-6 text-sm">
                <StatusIcon item={selected} />
                <span className="capitalize font-medium">
                  {selected.status}
                </span>
                <span className="text-kumo-subtle">{selected.stage}</span>
                <span className="tabular-nums text-kumo-subtle">
                  {elapsed(selected, now)}
                </span>
                <time
                  dateTime={selected.startedAt}
                  className="text-xs text-kumo-subtle sm:ml-auto"
                >
                  Started {new Date(selected.startedAt).toLocaleString()}
                </time>
              </div>
              <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
                <section aria-label="Investigation stages">
                  <h2 className="text-sm font-semibold mb-4">Workflow</h2>
                  <ol className="space-y-4">
                    {investigationStages.map((stage) => {
                      const done = selected.completed.includes(stage);
                      const current = selected.stage === stage;
                      return (
                        <li
                          key={stage}
                          className="flex items-center gap-2 text-sm"
                        >
                          {done ? (
                            <CheckCircleIcon
                              size={16}
                              className="text-kumo-success"
                            />
                          ) : current ? (
                            <StatusIcon item={selected} />
                          ) : (
                            <CircleIcon
                              size={16}
                              className="text-kumo-subtle"
                            />
                          )}
                          <span
                            className={
                              current ? "font-semibold" : "text-kumo-subtle"
                            }
                          >
                            {stage}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                  {selected.detail && (
                    <output className="block text-xs text-kumo-danger mt-4 break-words">
                      {selected.detail}
                    </output>
                  )}
                </section>
                <section className="min-w-0" aria-label="Investigation report">
                  <h2 className="text-sm font-semibold mb-4">
                    Root Cause Analysis
                  </h2>
                  {selected.report ? (
                    <div className="text-sm break-words overflow-x-auto">
                      <Streamdown>{selected.report}</Streamdown>
                    </div>
                  ) : (
                    <p className="text-sm text-kumo-subtle">
                      {selected.status === "failed"
                        ? "No report was completed."
                        : "Awaiting report."}
                    </p>
                  )}
                </section>
              </div>
            </>
          ) : (
            <p className="text-sm text-kumo-subtle">
              {error
                ? "Investigation could not be loaded."
                : "Investigation not found."}
            </p>
          )
        ) : (
          <>
            <div className="flex flex-wrap gap-3 mb-4">
              <input
                type="search"
                aria-label="Search investigations"
                placeholder="Search alert or workflow ID"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="border border-kumo-line bg-kumo-base rounded-md px-3 py-2 text-sm min-w-0 flex-1"
              />
              <select
                aria-label="Filter by status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="border border-kumo-line bg-kumo-base rounded-md px-3 py-2 text-sm"
              >
                <option value="all">All statuses</option>
                <option value="running">Running</option>
                <option value="retrying">Retrying</option>
                <option value="complete">Complete</option>
                <option value="failed">Failed</option>
              </select>
            </div>
            {filtered.length ? (
              <ul className="border-t border-kumo-line">
                {filtered.map((item) => (
                  <li key={item.id} className="border-b border-kumo-line">
                    <a
                      href={`/investigations/${encodeURIComponent(item.id)}`}
                      className="grid grid-cols-[auto_minmax(0,1fr)_auto] sm:grid-cols-[auto_minmax(0,1fr)_130px_90px_auto] gap-3 items-center py-4 hover:bg-kumo-elevated focus-visible:outline-2 focus-visible:outline-kumo-brand"
                    >
                      <StatusIcon item={item} />
                      <div className="min-w-0">
                        <span className="text-sm font-medium break-words">
                          {item.alertName}
                        </span>
                        <p className="text-[11px] text-kumo-subtle break-all mt-1">
                          {item.id}
                        </p>
                        <p className="text-xs text-kumo-subtle mt-1">
                          {new Date(item.startedAt).toLocaleString()}
                        </p>
                        <span className="sm:hidden text-xs capitalize">
                          {item.status} - {item.stage}
                        </span>
                      </div>
                      <div className="hidden sm:block text-xs">
                        <span className="capitalize">{item.status}</span>
                        <p className="text-kumo-subtle mt-1">{item.stage}</p>
                      </div>
                      <span className="hidden sm:block text-xs tabular-nums text-kumo-subtle">
                        {elapsed(item, now)}
                      </span>
                      <ArrowRightIcon size={18} className="text-kumo-subtle" />
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-8 text-sm text-kumo-subtle">
                {items.length
                  ? "No matching investigations."
                  : error
                    ? "Investigations could not be loaded."
                    : "No investigations yet."}
              </p>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default function InvestigationPages({ id }: { id: string | null }) {
  const [items, setItems] = useState<InvestigationProgress[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const agent = useAgent<ChatAgent, InvestigationState>({
    agent: "ChatAgent",
    onOpen: useCallback(() => setConnected(true), []),
    onClose: useCallback(() => setConnected(false), []),
    onStateUpdate: useCallback((state) => {
      setItems(state?.investigations ?? []);
      setLoading(false);
      setError(undefined);
    }, []),
    onError: useCallback(() => {
      setLoading(false);
      setError("Unable to connect to investigations.");
    }, [])
  });
  const refresh = useCallback(async () => {
    try {
      setItems(await agent.stub.getInvestigations());
      setError(undefined);
    } catch {
      setError("Unable to refresh investigations. Reconnecting...");
    } finally {
      setLoading(false);
    }
  }, [agent]);
  useEffect(() => {
    if (!connected) return;
    let pending = false;
    const update = async () => {
      if (pending) return;
      pending = true;
      try {
        await refresh();
      } finally {
        pending = false;
      }
    };
    void update();
    const timer = setInterval(() => {
      void update();
    }, 5000);
    return () => clearInterval(timer);
  }, [connected, refresh]);
  return (
    <InvestigationView
      items={items}
      id={id}
      connected={connected}
      loading={loading}
      error={error}
      refresh={() => {
        void refresh();
      }}
    />
  );
}
