import { useMemo } from "react";
import { useCommand, useCommandRegistry } from "./CommandRegistry";
import { useWorkspace, type ActivityView } from "./WorkspaceContext";
import { useRun } from "./RunContext";
import { useUI } from "./UIContext";
import { runEditorAction } from "../monaco/registry";

/**
 * Registers Tinder's built-in commands. Mounted once near the top of the tree
 * so that all required contexts are available.
 */
export function BuiltInCommands() {
  const {
    folder,
    openFolder,
    saveActive,
    documents,
    saveDocument,
    setActiveView,
    closeActiveFile,
    cycleTab
  } = useWorkspace();
  const { runs, kill, start } = useRun();
  const {
    toggleSidebar,
    togglePanel,
    openQuickOpen,
    showSidebar,
    openAbout,
    openThemePicker,
    openSettings
  } = useUI();
  const { openPalette } = useCommandRegistry();

  // ---- File ----
  useCommand(
    {
      id: "file.openFolder",
      category: "文件",
      title: "打开文件夹…",
      keybinding: "Ctrl+K Ctrl+O",
      run: () => openFolder()
    },
    [openFolder]
  );

  useCommand(
    {
      id: "file.save",
      category: "文件",
      title: "保存当前文件",
      keybinding: "Ctrl+S",
      run: async () => {
        await saveActive();
      }
    },
    [saveActive]
  );

  useCommand(
    {
      id: "file.saveAll",
      category: "文件",
      title: "全部保存",
      keybinding: "Ctrl+K S",
      run: async () => {
        for (const doc of documents) {
          if (doc.dirty) await saveDocument(doc.uri);
        }
      }
    },
    [documents, saveDocument]
  );

  useCommand(
    {
      id: "file.closeTab",
      category: "文件",
      title: "关闭当前标签",
      keybinding: "Ctrl+W",
      run: () => closeActiveFile()
    },
    [closeActiveFile]
  );

  useCommand(
    {
      id: "file.nextTab",
      category: "文件",
      title: "切换到下一个标签",
      keybinding: "Ctrl+Tab",
      run: () => cycleTab(1)
    },
    [cycleTab]
  );

  useCommand(
    {
      id: "file.prevTab",
      category: "文件",
      title: "切换到上一个标签",
      keybinding: "Ctrl+Shift+Tab",
      run: () => cycleTab(-1)
    },
    [cycleTab]
  );

  // ---- Edit ----
  useCommand(
    {
      id: "edit.find",
      category: "编辑",
      title: "查找",
      keybinding: "Ctrl+F",
      run: () => {
        if (!runEditorAction("actions.find")) {
          // No active editor — nothing to find in. Silently no-op; the
          // global search view (Ctrl+Shift+F) covers the workspace case.
        }
      }
    },
    []
  );

  useCommand(
    {
      id: "edit.findReplace",
      category: "编辑",
      title: "查找和替换",
      keybinding: "Ctrl+H",
      run: () => {
        runEditorAction("editor.action.startFindReplaceAction");
      }
    },
    []
  );

  useCommand(
    {
      id: "edit.gotoLine",
      category: "转到",
      title: "跳转到行…",
      keybinding: "Ctrl+G",
      run: () => {
        runEditorAction("editor.action.gotoLine");
      }
    },
    []
  );

  useCommand(
    {
      id: "edit.toggleLineComment",
      category: "编辑",
      title: "切换行注释",
      keybinding: "Ctrl+/",
      run: () => {
        runEditorAction("editor.action.commentLine");
      }
    },
    []
  );

  useCommand(
    {
      id: "edit.formatDocument",
      category: "编辑",
      title: "格式化文档",
      keybinding: "Shift+Alt+F",
      run: () => {
        runEditorAction("editor.action.formatDocument");
      }
    },
    []
  );

  // ---- Preferences ----
  useCommand(
    {
      id: "preferences.colorTheme",
      category: "首选项",
      title: "颜色主题…",
      keybinding: "Ctrl+K Ctrl+T",
      run: () => openThemePicker()
    },
    [openThemePicker]
  );

  // ---- Help ----
  useCommand(
    {
      id: "help.about",
      category: "帮助",
      title: "关于 Tinder Compiler",
      run: () => openAbout()
    },
    [openAbout]
  );

  // ---- View ----
  useView("explorer", "view.showExplorer", "显示资源管理器", "Ctrl+Shift+E", setActiveView, showSidebar);
  useView("search", "view.showSearch", "显示搜索", "Ctrl+Shift+F", setActiveView, showSidebar);
  useView("run", "view.showRun", "显示运行与构建", "Ctrl+Shift+D", setActiveView, showSidebar);
  useView("ai", "view.showAi", "显示 AI 助手", undefined, setActiveView, showSidebar);

  useCommand(
    {
      id: "preferences.openSettings",
      category: "首选项",
      title: "打开设置",
      keybinding: "Ctrl+,",
      run: () => openSettings()
    },
    [openSettings]
  );

  useCommand(
    {
      id: "view.toggleSidebar",
      category: "视图",
      title: "切换侧边栏可见性",
      keybinding: "Ctrl+B",
      run: () => toggleSidebar()
    },
    [toggleSidebar]
  );

  useCommand(
    {
      id: "view.togglePanel",
      category: "视图",
      title: "切换面板可见性",
      keybinding: "Ctrl+J",
      run: () => togglePanel()
    },
    [togglePanel]
  );

  useCommand(
    {
      id: "view.commandPalette",
      category: "视图",
      title: "命令面板",
      keybinding: "Ctrl+Shift+P",
      run: () => openPalette()
    },
    [openPalette]
  );

  useCommand(
    {
      id: "view.quickOpen",
      category: "视图",
      title: "转到文件…",
      keybinding: "Ctrl+P",
      run: () => openQuickOpen()
    },
    [openQuickOpen]
  );

  // ---- Run ----
  const runningTaskCount = useMemo(() => runs.filter((r) => r.status === "running").length, [runs]);

  useCommand(
    {
      id: "run.dev",
      category: "运行",
      title: "以 dev 模式运行",
      when: () => Boolean(folder),
      run: async () => {
        if (!folder) return;
        await start({
          command: "pnpm",
          args: ["dev"],
          cwd: folder.path,
          label: "dev 模式"
        });
      }
    },
    [folder, start]
  );

  useCommand(
    {
      id: "run.killAll",
      category: "运行",
      title: "停止所有运行中的任务",
      when: () => runningTaskCount > 0,
      run: async () => {
        for (const r of runs) {
          if (r.status === "running") await kill(r.id);
        }
      }
    },
    [runs, runningTaskCount, kill]
  );

  return null;
}

function useView(
  id: ActivityView,
  cmdId: string,
  title: string,
  keybinding: string | undefined,
  setActiveView: (view: ActivityView) => void,
  showSidebar: () => void
) {
  useCommand(
    {
      id: cmdId,
      category: "视图",
      title,
      keybinding,
      run: () => {
        setActiveView(id);
        showSidebar();
      }
    },
    [setActiveView, id, showSidebar]
  );
}
