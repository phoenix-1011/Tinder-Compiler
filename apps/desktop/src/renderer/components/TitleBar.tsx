import { useCallback, useEffect, useState } from "react";
import { useWorkspace } from "../state/WorkspaceContext";
import { useUI } from "../state/UIContext";
import { TitleBarMenu, type MenuItem } from "./TitleBarMenu";
import type { RecentFolder } from "../../preload";

const FILE_BASE_MENU: MenuItem[] = [
  { command: "file.openFolder" },
  { command: null },
  { command: "file.save" },
  { command: "file.saveAll" },
  { command: null },
  { command: "file.closeTab" }
];

const EDIT_MENU: MenuItem[] = [
  { command: "edit.find" },
  { command: "edit.findReplace" },
  { command: null },
  { command: "edit.toggleLineComment" },
  { command: "edit.formatDocument" },
  { command: null },
  { command: "view.showSearch", label: "全局搜索", keybinding: "Ctrl+Shift+F" }
];

const VIEW_MENU: MenuItem[] = [
  { command: "view.commandPalette" },
  { command: "view.quickOpen" },
  { command: "edit.gotoLine" },
  { command: null },
  { command: "view.toggleSidebar" },
  { command: "view.togglePanel" },
  { command: null },
  { command: "view.showExplorer" },
  { command: "view.showSearch" },
  { command: "view.showRun" },
  { command: "view.showAi" }
];

const RUN_MENU: MenuItem[] = [{ command: "run.dev" }, { command: null }, { command: "run.killAll" }];

const HELP_MENU: MenuItem[] = [
  { command: "preferences.openSettings", label: "设置…" },
  { command: "preferences.colorTheme", label: "颜色主题…" },
  { command: null },
  { command: "help.about" }
];

export function TitleBar() {
  const { folder, openFolderByPath, canGoBack, canGoForward, goBack, goForward } =
    useWorkspace();
  const {
    panelVisible,
    togglePanel,
    aiPanelVisible,
    toggleAiPanel
  } = useUI();
  const [recents, setRecents] = useState<RecentFolder[]>([]);

  // Eagerly load recents so the menu is responsive when opened.
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
  }, [folder?.path]);

  const fileMenu = useCallback((): MenuItem[] => {
    const recentItems: MenuItem[] = recents.length
      ? [
          { command: null }, // separator
          { command: null, label: "最近", onClick: () => undefined } // header pseudo
        ]
      : [];
    if (recents.length) {
      // Replace the pseudo header with a non-clickable label using onClick that does nothing
      recentItems.pop();
      recentItems.push({
        command: null,
        // The label doubles as a small section title; clicking is a no-op.
        label: "—— 最近 ——",
        onClick: () => undefined
      });
      for (const r of recents.slice(0, 8)) {
        recentItems.push({
          command: null,
          label: r.name,
          keybinding: shortenPath(r.path),
          onClick: () => void openFolderByPath(r.path)
        });
      }
    }
    return [...FILE_BASE_MENU, ...recentItems];
  }, [recents, openFolderByPath]);

  const title = folder ? `${folder.name} — Tinder Compiler` : "Tinder Compiler";
  return (
    <div className="titlebar" role="banner">
      <div className="titlebar-brand">
        <span className="codicon codicon-flame titlebar-logo" aria-hidden="true" />
        <span className="titlebar-title">{title}</span>
      </div>
      <div className="titlebar-menus">
        <TitleBarMenu label="文件" items={fileMenu} />
        <TitleBarMenu label="编辑" items={EDIT_MENU} />
        <TitleBarMenu label="视图" items={VIEW_MENU} />
        <TitleBarMenu label="运行" items={RUN_MENU} />
        <TitleBarMenu label="帮助" items={HELP_MENU} />
      </div>
      <div className="titlebar-nav" role="group" aria-label="历史导航">
        <button
          type="button"
          className="titlebar-nav-btn"
          disabled={!canGoBack}
          onClick={() => goBack()}
          title="后退到上一个视图"
          aria-label="后退"
        >
          <span className="codicon codicon-arrow-left" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="titlebar-nav-btn"
          disabled={!canGoForward}
          onClick={() => goForward()}
          title="前进到下一个视图"
          aria-label="前进"
        >
          <span className="codicon codicon-arrow-right" aria-hidden="true" />
        </button>
      </div>
      <div className="titlebar-spacer" />
      <div className="titlebar-toggles" role="group" aria-label="面板切换">
        <button
          type="button"
          className={`titlebar-toggle-btn${panelVisible ? " is-active" : ""}`}
          onClick={togglePanel}
          title={`${panelVisible ? "关闭" : "打开"}终端面板 (Ctrl+J)`}
          aria-label="切换终端面板"
          aria-pressed={panelVisible}
        >
          <span className="codicon codicon-terminal" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`titlebar-toggle-btn${aiPanelVisible ? " is-active" : ""}`}
          onClick={toggleAiPanel}
          title={`${aiPanelVisible ? "关闭" : "打开"} AI 面板`}
          aria-label="切换 AI 面板"
          aria-pressed={aiPanelVisible}
        >
          <span className="codicon codicon-sparkle" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function shortenPath(p: string, max = 50): string {
  if (p.length <= max) return p;
  return "…" + p.slice(p.length - max + 1);
}
