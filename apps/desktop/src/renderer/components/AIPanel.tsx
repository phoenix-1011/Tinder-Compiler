import { useUI } from "../state/UIContext";

/**
 * Window-level right sidebar reserved for future AI assistance. For now
 * the panel is a placeholder — it surfaces the planned capabilities so
 * the layout / toggle behaviour can be exercised without binding to any
 * harness or write path. Any actual AI write would still need to follow
 * the preview / diff / confirm safe-write rules used elsewhere.
 */
export function AIPanel() {
  const { toggleAiPanel } = useUI();
  return (
    <aside className="ai-panel" aria-label="AI 面板">
      <header className="ai-panel-header">
        <span className="ai-panel-title">
          <span className="codicon codicon-sparkle" aria-hidden="true" />
          AI 助手
        </span>
        <button
          type="button"
          className="ai-panel-close"
          onClick={toggleAiPanel}
          title="关闭 AI 面板"
          aria-label="关闭 AI 面板"
        >
          <span className="codicon codicon-close" aria-hidden="true" />
        </button>
      </header>
      <div className="ai-panel-body">
        <p className="sidebar-hint">AI 助手尚未接入。后续版本将支持：</p>
        <ul className="ai-panel-list">
          <li>解释当前文件 / 当前资源</li>
          <li>生成实现建议</li>
          <li>检查接口问题</li>
          <li>回答链路装配问题</li>
        </ul>
        <p className="sidebar-hint" style={{ fontSize: 11, marginTop: 12 }}>
          任何未来的 AI 写入仍会走 preview / diff / 确认的安全写规则。
        </p>
      </div>
    </aside>
  );
}
