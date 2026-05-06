import { useEffect, useState } from "react";
import { TerminalPanel, type CommandState } from "./Terminal";
import { OutputView } from "./OutputView";
import { ProblemsView } from "./ProblemsView";
import { useWorkspace } from "../state/WorkspaceContext";
import { useRun } from "../state/RunContext";

const TABS = [
  { id: "problems", label: "问题" },
  { id: "output", label: "输出" },
  { id: "terminal", label: "终端" }
] as const;

type PanelTab = (typeof TABS)[number]["id"];

export function Panel() {
  const [active, setActive] = useState<PanelTab>("terminal");
  const [terminalMounted, setTerminalMounted] = useState<boolean>(true);
  const [cmdState, setCmdState] = useState<CommandState | null>(null);
  const { folder } = useWorkspace();
  const { runs } = useRun();

  // Switch to "output" automatically when a new run starts.
  const [lastRunId, setLastRunId] = useState<number | null>(null);
  useEffect(() => {
    if (runs.length === 0) return;
    const newest = runs[runs.length - 1]!;
    if (newest.id !== lastRunId) {
      setLastRunId(newest.id);
      setActive("output");
    }
  }, [runs, lastRunId]);

  return (
    <section className="panel" aria-label="面板">
      <div className="panel-tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active === tab.id}
            className={`panel-tab${active === tab.id ? " is-active" : ""}`}
            onClick={() => {
              if (tab.id === "terminal") setTerminalMounted(true);
              setActive(tab.id);
            }}
          >
            {tab.label}
          </button>
        ))}
        <div className="panel-tabs-spacer" />
        {active === "terminal" && cmdState && (
          <div
            className={`panel-cmd-status${cmdState.running ? " is-running" : ""}${
              !cmdState.running && cmdState.lastExitCode !== 0 ? " is-failed" : ""
            }`}
            title={cmdState.running ? "命令运行中" : `上次退出码: ${cmdState.lastExitCode}`}
          >
            {cmdState.running ? (
              <>
                <span className="codicon codicon-loading codicon-modifier-spin" />
                <span className="panel-cmd-label">运行中</span>
              </>
            ) : cmdState.lastCommand ? (
              <>
                <span
                  className={`codicon codicon-${
                    cmdState.lastExitCode === 0 ? "check" : "error"
                  }`}
                />
                <span className="panel-cmd-label">
                  {cmdState.lastExitCode === 0 ? "已完成" : `退出码 ${cmdState.lastExitCode}`}
                </span>
              </>
            ) : null}
          </div>
        )}
        {active === "terminal" && (
          <button
            className="panel-action"
            title="重启终端"
            onClick={() => {
              setTerminalMounted(false);
              setCmdState(null);
              requestAnimationFrame(() => setTerminalMounted(true));
            }}
          >
            <span className="codicon codicon-refresh" />
          </button>
        )}
      </div>
      <div className="panel-body">
        <div
          className="panel-tab-pane"
          style={{ display: active === "problems" ? "block" : "none" }}
        >
          <ProblemsView />
        </div>
        <div
          className="panel-tab-pane"
          style={{ display: active === "output" ? "block" : "none" }}
        >
          <OutputView />
        </div>
        <div
          className="panel-terminal-wrap"
          style={{ display: active === "terminal" ? "block" : "none" }}
        >
          {terminalMounted && (
            <TerminalPanel cwd={folder?.path} onStateChange={setCmdState} />
          )}
        </div>
      </div>
    </section>
  );
}
