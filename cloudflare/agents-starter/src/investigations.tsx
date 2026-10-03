import { useEffect, useState } from "react";
import {
  CheckCircleIcon,
  CircleIcon,
  SpinnerIcon,
  WarningCircleIcon
} from "@phosphor-icons/react";
import { Streamdown } from "streamdown";
import {
  investigationStages,
  type InvestigationProgress
} from "./investigation-progress";

export function Investigations({
  investigations,
  connected
}: {
  investigations: InvestigationProgress[];
  connected: boolean;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (!investigations.length) return null;
  const active = investigations.filter(
    (item) => item.status === "running" || item.status === "retrying"
  ).length;
  return (
    <section
      aria-label="Investigations"
      className="border-b border-kumo-line bg-kumo-base px-5 py-3"
    >
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-2">
          <h2 className="text-sm font-semibold">
            Investigations{" "}
            {active > 0 && (
              <span className="text-kumo-brand">({active} active)</span>
            )}
          </h2>
          <span className="text-xs text-kumo-subtle">
            {connected ? "Live" : "Disconnected"}
          </span>
        </div>
        <div className="max-h-72 overflow-y-auto space-y-2">
          {investigations.map((item) => {
            const running =
              item.status === "running" || item.status === "retrying";
            const seconds = Math.max(
              0,
              Math.floor(
                ((running ? now : Date.parse(item.updatedAt)) -
                  Date.parse(item.startedAt)) /
                  1000
              )
            );
            return (
              <details
                key={item.id}
                open={running}
                className="border border-kumo-line rounded-md p-3"
              >
                <summary className="cursor-pointer flex flex-wrap items-center gap-2 text-sm">
                  {running ? (
                    <SpinnerIcon
                      className="animate-spin text-kumo-brand shrink-0"
                      size={16}
                    />
                  ) : item.status === "complete" ? (
                    <CheckCircleIcon
                      className="text-kumo-success shrink-0"
                      size={16}
                    />
                  ) : (
                    <WarningCircleIcon
                      className="text-kumo-danger shrink-0"
                      size={16}
                    />
                  )}
                  <span className="font-medium break-all">
                    {item.alertName}
                  </span>
                  <span className="text-xs text-kumo-subtle">
                    {item.status === "complete"
                      ? "Complete"
                      : item.status === "failed"
                        ? "Failed"
                        : `${item.stage}${item.status === "retrying" ? " - retrying" : ""}`}
                  </span>
                  <span className="text-xs text-kumo-subtle ml-auto tabular-nums">
                    {Math.floor(seconds / 60)}m {seconds % 60}s
                  </span>
                </summary>
                <ol
                  className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-xs"
                  aria-label="Investigation stages"
                >
                  {investigationStages.map((stage) => (
                    <li
                      key={stage}
                      className="flex items-center gap-1.5 min-w-0"
                    >
                      {item.completed.includes(stage) ? (
                        <CheckCircleIcon
                          size={14}
                          className="text-kumo-success shrink-0"
                        />
                      ) : stage === item.stage && running ? (
                        <SpinnerIcon
                          size={14}
                          className="animate-spin text-kumo-brand shrink-0"
                        />
                      ) : (
                        <CircleIcon
                          size={14}
                          className="text-kumo-subtle shrink-0"
                        />
                      )}
                      {stage}
                    </li>
                  ))}
                </ol>
                {item.detail && (
                  <output className="text-xs text-kumo-danger mt-2 break-words">
                    {item.detail}
                  </output>
                )}
                {item.report && (
                  <div className="text-sm mt-3 border-t border-kumo-line pt-3 break-words">
                    <Streamdown>{item.report}</Streamdown>
                  </div>
                )}
                <p className="text-[11px] text-kumo-subtle mt-2 break-all">
                  {item.id}
                </p>
              </details>
            );
          })}
        </div>
      </div>
    </section>
  );
}
