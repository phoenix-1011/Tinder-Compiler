import { useEffect } from "react";
import { useWorkspace } from "./WorkspaceContext";
import { useCommandRegistry } from "./CommandRegistry";
import { useUI } from "./UIContext";
import { runEditorAction } from "../monaco/registry";
import { matchUserKeybinding } from "./UserKeybindings";

/**
 * Global keyboard shortcut bindings. Mounted once near the top of the tree.
 */
export function KeyboardShortcuts() {
  const { saveActive, setActiveView, closeActiveFile, cycleTab } = useWorkspace();
  const { openPalette, closePalette, isPaletteOpen, execute } = useCommandRegistry();
  const { toggleSidebar, togglePanel, showSidebar, openQuickOpen, openSettings } = useUI();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isMod = event.ctrlKey || event.metaKey;
      const isShift = event.shiftKey;
      const isAlt = event.altKey;
      const key = event.key;

      // User-supplied keybinding overrides take priority over built-ins.
      const userCmd = matchUserKeybinding({
        ctrl: event.ctrlKey,
        meta: event.metaKey,
        shift: event.shiftKey,
        alt: event.altKey,
        key
      });
      if (userCmd) {
        event.preventDefault();
        event.stopPropagation();
        void execute(userCmd);
        return;
      }

      // Ctrl+Shift+P / F1 → command palette
      if ((isMod && isShift && (key === "p" || key === "P")) || key === "F1") {
        event.preventDefault();
        event.stopPropagation();
        if (isPaletteOpen) closePalette();
        else openPalette();
        return;
      }

      // Ctrl+Shift+O → quick outline (symbol jump)
      if (isMod && isShift && (key === "o" || key === "O")) {
        event.preventDefault();
        event.stopPropagation();
        runEditorAction("editor.action.quickOutline");
        return;
      }

      // Ctrl+, → settings
      if (isMod && !isShift && !isAlt && key === ",") {
        event.preventDefault();
        event.stopPropagation();
        openSettings();
        return;
      }

      if (!isMod) return;

      // Ctrl+P → quick open file
      if (!isShift && (key === "p" || key === "P")) {
        event.preventDefault();
        event.stopPropagation();
        openQuickOpen();
        return;
      }

      // Ctrl+S → save
      if (!isShift && (key === "s" || key === "S")) {
        event.preventDefault();
        event.stopPropagation();
        void saveActive();
        return;
      }

      // Ctrl+B → toggle sidebar
      if (!isShift && (key === "b" || key === "B")) {
        event.preventDefault();
        event.stopPropagation();
        toggleSidebar();
        return;
      }

      // Ctrl+J → toggle panel
      if (!isShift && (key === "j" || key === "J")) {
        event.preventDefault();
        event.stopPropagation();
        togglePanel();
        return;
      }

      // Ctrl+W → close current tab
      if (!isShift && (key === "w" || key === "W")) {
        event.preventDefault();
        event.stopPropagation();
        closeActiveFile();
        return;
      }

      // Ctrl+Tab / Ctrl+Shift+Tab → cycle tabs
      if (key === "Tab") {
        event.preventDefault();
        event.stopPropagation();
        cycleTab(isShift ? -1 : 1);
        return;
      }

      // Ctrl+G → goto line
      if (!isShift && (key === "g" || key === "G")) {
        event.preventDefault();
        event.stopPropagation();
        runEditorAction("editor.action.gotoLine");
        return;
      }

      // Ctrl+Shift+E/F/D → switch sidebar view (and ensure sidebar is open)
      if (isShift && (key === "e" || key === "E")) {
        event.preventDefault();
        setActiveView("explorer");
        showSidebar();
        return;
      }
      if (isShift && (key === "f" || key === "F")) {
        event.preventDefault();
        setActiveView("search");
        showSidebar();
        return;
      }
      if (isShift && (key === "d" || key === "D")) {
        event.preventDefault();
        setActiveView("run");
        showSidebar();
        return;
      }
    };

    document.addEventListener("keydown", onKeyDown, { capture: true });
    return () => document.removeEventListener("keydown", onKeyDown, { capture: true } as any);
  }, [
    saveActive,
    setActiveView,
    openPalette,
    closePalette,
    isPaletteOpen,
    execute,
    toggleSidebar,
    togglePanel,
    showSidebar,
    openQuickOpen,
    openSettings,
    closeActiveFile,
    cycleTab
  ]);

  return null;
}
