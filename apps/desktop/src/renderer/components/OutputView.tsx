import { useEffect, useRef } from "react";
import { useRun } from "../state/RunContext";
import { AnsiText } from "./AnsiText";

/** Terminal-ish output panel that follows the active run. */
export function OutputView() {
  const { runs, activeRunId, setActiveRun } = useRun();
  const active = runs.find((r) => r.id === activeRunId) ?? runs[runs.length - 1] ?? null;
  const preRef = useRef<HTMLPreElement | null>(null);
  const stickRef = useRef<boolean>(true);

  // Auto-scroll to bottom when output grows for the active run, but only if
  // the user hasn't scrolled up — same UX as VS Code's output channel.
  useEffect(() => {
    const el = preRef.current;
    if (!el) return;
    if (stickRef.current) el.scrollTop = el.scrollHeight;
  }, [active?.output, active?.id]);

  const onScroll = () => {
    const el = preRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
    stickRef.current = distanceFromBottom < 32;
  };

  if (runs.length === 0) {
    return (
      <p className="panel-placeholder">
        [tinder] 输出面板。在「运行与构建」侧边栏输入命令即可开始一个任务。
      </p>
    );
  }

  return (
    <div className="output-view">
      <div className="output-tabs">
        {runs.map((r) => (
          <button
            key={r.id}
            className={`output-tab${active?.id === r.id ? " is-active" : ""} is-${r.status}`}
            onClick={() => setActiveRun(r.id)}
            title={[r.command, ...r.args].join(" ")}
          >
            <span
              className={`codicon ${
                r.status === "running"
                  ? "codicon-loading codicon-modifier-spin"
                  : r.status === "success"
                    ? "codicon-pass-filled"
                    : r.status === "killed"
                      ? "codicon-debug-stop"
                      : "codicon-error"
              }`}
            />
            <span className="output-tab-label">{r.label ?? r.command}</span>
          </button>
        ))}
      </div>
      <pre ref={preRef} className="output-stream" onScroll={onScroll}>
        {active && <AnsiText text={active.output} />}
        {active && active.status !== "running" && (
          <span className="output-exit"> {`\n[退出码 ${active.exitCode ?? "?"}]`}</span>
        )}
      </pre>
    </div>
  );
}
