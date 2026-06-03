import { useWorkspace, type ActivityView } from "../state/WorkspaceContext";
import { useUI } from "../state/UIContext";

const TOP_ITEMS: Array<{ id: ActivityView; label: string; icon: string }> = [
  { id: "explorer", label: "资源管理器  Ctrl+Shift+E", icon: "files" },
  { id: "search", label: "搜索  Ctrl+Shift+F", icon: "search" },
  { id: "run", label: "运行与构建  Ctrl+Shift+D", icon: "play" },
  { id: "chain-assembly", label: "计算链路组装", icon: "type-hierarchy" },
  { id: "model-library", label: "模型库", icon: "database" },
  { id: "help", label: "链路文档", icon: "book" },
  { id: "ai", label: "AI 助手", icon: "sparkle" }
];

export function ActivityBar() {
  const { activeView, setActiveView } = useWorkspace();
  const { sidebarVisible, toggleSidebar, showSidebar, isSettingsOpen, toggleSettings } = useUI();

  const onViewClick = (id: ActivityView) => {
    if (id === activeView && sidebarVisible && !isSettingsOpen) {
      toggleSidebar();
      return;
    }
    setActiveView(id);
    showSidebar();
  };

  return (
    <nav className="activitybar" aria-label="活动栏">
      <div className="activitybar-section">
        {TOP_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`activitybar-item${activeView === item.id && sidebarVisible && !isSettingsOpen ? " is-active" : ""}`}
            title={item.label}
            aria-label={item.label}
            onClick={() => onViewClick(item.id)}
          >
            <span className={`codicon codicon-${item.icon}`} aria-hidden="true" />
          </button>
        ))}
      </div>
      <div className="activitybar-section activitybar-section-bottom">
        <button
          className={`activitybar-item${isSettingsOpen ? " is-active" : ""}`}
          title="设置"
          aria-label="设置"
          onClick={() => toggleSettings()}
        >
          <span className="codicon codicon-settings-gear" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
