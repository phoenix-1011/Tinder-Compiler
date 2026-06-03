import { useWorkspace } from "../state/WorkspaceContext";
import { ExplorerView } from "./ExplorerView";
import { SearchView } from "./SearchView";
import { RunView } from "./RunView";
import { ChainAssemblyView } from "./ChainAssemblyView";
import { ChainAssemblyHeaderActions } from "./ChainAssemblyChrome";
import { CanvasLibrary } from "./CanvasLibrary";
import { ChainHelpSidebar } from "../help/ChainHelpSidebar";
import { ModelLibraryHeaderTabs, ModelLibrarySidebar } from "./ModelLibraryView";
import { useModelLibrary } from "../state/ModelLibraryContext";

export function SideBar() {
  const { activeView, folder, openFolder, appMode, setActiveModelLibraryTab } = useWorkspace();
  const {
    setSelectedCategoryId,
    setSelectedFamilyId,
    setSelectedVersionKey,
    setSearchQuery
  } = useModelLibrary();

  // Canvas mode (C2 / C4) replaces the sidebar contents with the
  // library-only view, regardless of which activitybar item the user
  // last had selected. ActivityBar stays functional but only governs
  // the profile-tree-mode sidebar.
  if (appMode === "canvas") {
    return (
      <aside className="sidebar" aria-label="侧边栏（画布模式）">
        <div className="sidebar-header">
          <span className="sidebar-header-title">计算实例库</span>
        </div>
        <div className="sidebar-body">
          <CanvasLibrary />
        </div>
      </aside>
    );
  }

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
  } else if (activeView === "chain-assembly") {
    body = <ChainAssemblyView />;
  } else if (activeView === "model-library") {
    body = <ModelLibrarySidebar />;
  } else if (activeView === "help") {
    body = <ChainHelpSidebar />;
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
      "chain-assembly": "计算链路组装",
      "model-library": "模型库",
      help: "链路文档",
      ai: "AI 助手"
    } as const
  )[activeView];

  const headerActions =
    activeView === "chain-assembly" ? (
      <ChainAssemblyHeaderActions />
    ) : activeView === "model-library" ? (
      <ModelLibraryHeaderTabs />
    ) : null;

  return (
    <aside className="sidebar" aria-label="侧边栏">
      <div className={`sidebar-header${headerActions ? " has-actions" : ""}${activeView === "model-library" ? " is-model-library" : ""}`}>
        {activeView === "model-library" ? (
          <button
            type="button"
            className="sidebar-header-title sidebar-header-title-btn"
            title="返回模型库主页"
            onClick={() => {
              setActiveModelLibraryTab(null);
              setSelectedCategoryId(null);
              setSelectedFamilyId(null);
              setSelectedVersionKey(null);
              setSearchQuery("");
            }}
          >
            {heading}
          </button>
        ) : (
          <span className="sidebar-header-title">{heading}</span>
        )}
        {headerActions}
      </div>
      <div className="sidebar-body">{body}</div>
    </aside>
  );
}
