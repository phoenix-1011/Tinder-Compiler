import { useEffect, useState } from "react";
import { useWorkspace } from "../state/WorkspaceContext";
import type { RecentFolder } from "../../preload";

export function WelcomeView() {
  const { openFolder, openFolderByPath } = useWorkspace();
  const [recents, setRecents] = useState<RecentFolder[]>([]);

  useEffect(() => {
    let cancelled = false;
    const recent = window.tinder?.recent;
    if (!recent) return;
    void recent.list().then((list) => {
      if (!cancelled) setRecents(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onRemove = async (path: string) => {
    const recent = window.tinder?.recent;
    if (!recent) return;
    const list = await recent.remove(path);
    setRecents(list);
  };

  return (
    <div className="welcome-view">
      <div className="welcome-header">
        <span className="codicon codicon-flame welcome-logo" aria-hidden="true" />
        <h1>Tinder Compiler</h1>
        <p className="welcome-tagline">面向项目的定制化编辑器 · 编译运行 · AI 辅助</p>
      </div>

      <div className="welcome-grid">
        <section className="welcome-section">
          <h2>开始</h2>
          <button className="welcome-action" onClick={openFolder}>
            <span className="codicon codicon-folder-opened" />
            <span>打开文件夹…</span>
          </button>
          <p className="welcome-hint">
            或使用 <kbd>Ctrl</kbd>+<kbd>K</kbd> <kbd>Ctrl</kbd>+<kbd>O</kbd> 打开文件夹，
            <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> 打开命令面板。
          </p>
        </section>

        <section className="welcome-section">
          <h2>最近</h2>
          {recents.length === 0 ? (
            <p className="welcome-hint">尚无最近打开记录。</p>
          ) : (
            <ul className="welcome-recents">
              {recents.map((r) => (
                <li key={r.path}>
                  <button
                    className="welcome-recent"
                    onClick={() => openFolderByPath(r.path)}
                    title={r.path}
                  >
                    <span className="welcome-recent-name">{r.name}</span>
                    <span className="welcome-recent-path">{r.path}</span>
                  </button>
                  <button
                    className="welcome-recent-remove"
                    title="从最近列表移除"
                    onClick={() => onRemove(r.path)}
                  >
                    <span className="codicon codicon-close" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
