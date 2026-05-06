import { useWorkspace } from "../state/WorkspaceContext";
import { ExplorerView } from "./ExplorerView";
import { SearchView } from "./SearchView";
import { RunView } from "./RunView";

export function SideBar() {
  const { activeView, folder, openFolder } = useWorkspace();

  let body;
  if (activeView === "explorer") {
    body = folder ? (
      <ExplorerView />
    ) : (
      <div className="sidebar-empty">
        <p>尚未打开任何文件夹。</p>
        <button className="primary-button" onClick={openFolder}>
          打开文件夹
        </button>
      </div>
    );
  } else if (activeView === "search") {
    body = <SearchView />;
  } else if (activeView === "run") {
    body = <RunView />;
  } else {
    body = (
      <div className="sidebar-empty">
        <p className="sidebar-hint">AI 助手对话将显示在此处。</p>
      </div>
    );
  }

  const heading = (
    {
      explorer: folder?.name ?? "资源管理器",
      search: "搜索",
      run: "运行与构建",
      ai: "AI 助手"
    } as const
  )[activeView];

  return (
    <aside className="sidebar" aria-label="侧边栏">
      <div className="sidebar-header">{heading}</div>
      <div className="sidebar-body">{body}</div>
    </aside>
  );
}
