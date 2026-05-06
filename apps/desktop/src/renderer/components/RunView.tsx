import { useState, type FormEvent } from "react";
import { useWorkspace } from "../state/WorkspaceContext";
import { useRun } from "../state/RunContext";
import { useProject, type ProjectTask } from "../state/ProjectContext";

export function RunView() {
  const { folder } = useWorkspace();
  const { start, runs, recentCommands, kill, clear, setActiveRun } = useRun();
  const { config, exists, save, error } = useProject();
  const [command, setCommand] = useState("");

  const projectTasks = config.tasks ?? [];

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!folder) return;
    const trimmed = command.trim();
    if (trimmed.length === 0) return;
    await start({ command: trimmed, cwd: folder.path, label: trimmed });
    setCommand("");
  };

  const runProjectTask = async (task: ProjectTask) => {
    if (!folder) return;
    const cwd = task.cwd ? await window.tinder.joinPath(folder.path, task.cwd) : folder.path;
    await start({
      command: task.command,
      args: task.args,
      cwd,
      label: task.label
    });
  };

  const seedProjectFile = async () => {
    if (!folder) return;
    await save({
      name: folder.name,
      buildSystem: "custom",
      tasks: [
        { id: "build", label: "构建", command: "echo", args: ["replace me with your build command"] },
        { id: "test", label: "测试", command: "echo", args: ["replace me with your test command"] }
      ]
    });
  };

  if (!folder) {
    return (
      <div className="sidebar-empty">
        <p className="sidebar-hint">先打开一个文件夹。</p>
      </div>
    );
  }

  return (
    <div className="run-view">
      <form className="run-form" onSubmit={onSubmit}>
        <input
          className="sidebar-input"
          placeholder="输入命令，例如 npm run build"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          spellCheck={false}
        />
        <button type="submit" className="primary-button" disabled={command.trim().length === 0}>
          运行
        </button>
      </form>

      {error && (
        <div className="run-error">
          <span className="codicon codicon-error" /> {error}
        </div>
      )}

      {projectTasks.length > 0 && (
        <div className="run-section">
          <div className="run-section-title">项目任务</div>
          {projectTasks.map((t) => (
            <button
              key={t.id}
              className="run-recent"
              title={`${t.command}${t.args?.length ? " " + t.args.join(" ") : ""}`}
              onClick={() => runProjectTask(t)}
            >
              <span className="codicon codicon-play" />
              <span className="run-recent-text">{t.label}</span>
            </button>
          ))}
        </div>
      )}

      {!exists && projectTasks.length === 0 && (
        <div className="run-section">
          <div className="run-section-title">项目任务</div>
          <p className="sidebar-hint">
            尚未创建 <code>.tinder/project.json</code>。
          </p>
          <button className="primary-button run-seed" onClick={seedProjectFile}>
            生成示例配置
          </button>
        </div>
      )}

      {recentCommands.length > 0 && (
        <div className="run-section">
          <div className="run-section-title">最近</div>
          {recentCommands.map((c) => (
            <button
              key={c}
              className="run-recent"
              title="再次运行"
              onClick={() => start({ command: c, cwd: folder.path, label: c })}
            >
              <span className="codicon codicon-history" />
              <span className="run-recent-text">{c}</span>
            </button>
          ))}
        </div>
      )}

      {runs.length > 0 && (
        <div className="run-section">
          <div className="run-section-title">任务</div>
          {runs.map((r) => (
            <div
              key={r.id}
              className={`run-task is-${r.status}`}
              onClick={() => setActiveRun(r.id)}
            >
              <span
                className={`codicon ${
                  r.status === "running"
                    ? "codicon-loading codicon-modifier-spin"
                    : r.status === "success"
                      ? "codicon-check"
                      : r.status === "killed"
                        ? "codicon-debug-stop"
                        : "codicon-error"
                }`}
              />
              <span
                className="run-task-label"
                title={[r.command, ...r.args].join(" ")}
              >
                {r.label ?? [r.command, ...r.args].join(" ")}
              </span>
              {r.status === "running" ? (
                <button
                  className="run-task-action"
                  title="停止"
                  onClick={(e) => {
                    e.stopPropagation();
                    void kill(r.id);
                  }}
                >
                  <span className="codicon codicon-debug-stop" />
                </button>
              ) : (
                <button
                  className="run-task-action"
                  title="清除"
                  onClick={(e) => {
                    e.stopPropagation();
                    clear(r.id);
                  }}
                >
                  <span className="codicon codicon-close" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
