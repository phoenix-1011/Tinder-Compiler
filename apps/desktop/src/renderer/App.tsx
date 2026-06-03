import { useEffect } from "react";
import { TitleBar } from "./components/TitleBar";
import { ActivityBar } from "./components/ActivityBar";
import { SideBar } from "./components/SideBar";
import { EditorArea } from "./components/EditorArea";
import { CanvasView } from "./components/CanvasView";
import { Panel } from "./components/Panel";
import { AIPanel } from "./components/AIPanel";
import { StatusBar } from "./components/StatusBar";
import { CommandPalette } from "./components/CommandPalette";
import { QuickOpen } from "./components/QuickOpen";
import { Splitter } from "./components/Splitter";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AboutModal } from "./components/AboutModal";
import { ThemePicker } from "./components/ThemePicker";
import { SettingsView } from "./components/SettingsView";
import { ThemeProvider } from "./state/ThemeContext";
import { SettingsProvider } from "./state/SettingsContext";
import { ProjectProvider } from "./state/ProjectContext";
import { AutoSave } from "./state/AutoSave";
import { UserKeybindingsLoader } from "./state/UserKeybindings";
import { WorkspaceProvider, useWorkspace } from "./state/WorkspaceContext";
import { RunProvider } from "./state/RunContext";
import { CommandRegistryProvider } from "./state/CommandRegistry";
import { UIProvider, useUI } from "./state/UIContext";
import { KeyboardShortcuts } from "./state/KeyboardShortcuts";
import { BuiltInCommands } from "./state/BuiltInCommands";
import { LspBootstrap } from "./state/LspBootstrap";
import { ChainAssemblyProvider } from "./state/ChainAssemblyContext";
import { ModelLibraryProvider } from "./state/ModelLibraryContext";
import { ChainHelpProvider } from "./help/ChainHelpContext";
import { ChainHelpView } from "./help/ChainHelpView";

function Workbench() {
  const {
    sidebarWidth,
    setSidebarWidth,
    panelHeight,
    setPanelHeight,
    sidebarVisible,
    panelVisible,
    aiPanelVisible,
    aiPanelWidth,
    setAiPanelWidth,
    isAboutOpen,
    closeAbout,
    isThemePickerOpen,
    closeThemePicker,
    isSettingsOpen
  } = useUI();
  const { activeView, appMode, setActive } = useWorkspace();

  useEffect(() => {
    if (activeView === "model-library") {
      setActive(null);
    }
  }, [activeView, setActive]);

  // Body grid: activity bar | [optional sidebar + 0-width splitter overlay] |
  // main | [optional 0-width AI splitter overlay + AI panel]. Splitters
  // are absolute-positioned overlays (`.splitter-hit` extends ±3px from
  // the cell origin) so the panels themselves stay flush — no parent-
  // colored seam shows between them.
  //
  // UX3: canvas mode enforces a 240px minimum sidebar width so the
  // user can't accidentally drag the splitter so far left that the
  // library disappears (the "where did my library go?" foot-gun).
  // List view modes can still shrink the sidebar arbitrarily.
  const CANVAS_MIN_SIDEBAR_WIDTH = 240;
  const effectiveSidebarWidth =
    appMode === "canvas"
      ? Math.max(sidebarWidth, CANVAS_MIN_SIDEBAR_WIDTH)
      : sidebarWidth;
  const cols: string[] = ["var(--tc-activitybar-w)"];
  if (sidebarVisible) cols.push(`${effectiveSidebarWidth}px`, "0");
  cols.push("1fr");
  if (aiPanelVisible) cols.push("0", `${aiPanelWidth}px`);
  const bodyTemplate = cols.join(" ");

  const mainTemplate = panelVisible
    ? `1fr 0 ${panelHeight}px`
    : `1fr`;

  return (
    <div className="workbench">
      <TitleBar />
      <div className="workbench-body" style={{ gridTemplateColumns: bodyTemplate }}>
        <ActivityBar />
        {sidebarVisible && <SideBar />}
        {sidebarVisible && (
          <Splitter
            orientation="vertical"
            value={effectiveSidebarWidth}
            onChange={(next) =>
              setSidebarWidth(
                appMode === "canvas"
                  ? Math.max(next, CANVAS_MIN_SIDEBAR_WIDTH)
                  : next
              )
            }
          />
        )}
        <div className="workbench-main" style={{ gridTemplateRows: mainTemplate }}>
          {isSettingsOpen ? (
            <SettingsView />
          ) : appMode === "canvas" ? (
            // Canvas mode (C2 hard switch) takes over the main area
            // entirely. Settings remains a higher-priority overlay
            // above it so users can still reach preferences. The
            // sidebar stays unchanged in Phase 1; Phase 2 narrows it
            // to library-only.
            <CanvasView />
          ) : activeView === "help" ? (
            <ChainHelpView />
          ) : (
            <EditorArea />
          )}
          {panelVisible && (
            <Splitter
              orientation="horizontal"
              value={panelHeight}
              onChange={setPanelHeight}
              invert
            />
          )}
          {panelVisible && <Panel />}
        </div>
        {aiPanelVisible && (
          <Splitter
            orientation="vertical"
            value={aiPanelWidth}
            onChange={setAiPanelWidth}
            invert
          />
        )}
        {aiPanelVisible && <AIPanel />}
      </div>
      <StatusBar />
      <CommandPalette />
      <QuickOpen />
      <AboutModal open={isAboutOpen} onClose={closeAbout} />
      <ThemePicker open={isThemePickerOpen} onClose={closeThemePicker} />
    </div>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <SettingsProvider>
        <ThemeProvider>
          <WorkspaceProvider>
            <ProjectProvider>
              <RunProvider>
                <UIProvider>
                  <CommandRegistryProvider>
                    <ChainAssemblyProvider>
                      <ModelLibraryProvider>
                        <ChainHelpProvider>
                          <BuiltInCommands />
                          <KeyboardShortcuts />
                          <LspBootstrap />
                          <AutoSave />
                          <UserKeybindingsLoader />
                          <Workbench />
                        </ChainHelpProvider>
                      </ModelLibraryProvider>
                    </ChainAssemblyProvider>
                  </CommandRegistryProvider>
                </UIProvider>
              </RunProvider>
            </ProjectProvider>
          </WorkspaceProvider>
        </ThemeProvider>
      </SettingsProvider>
    </ErrorBoundary>
  );
}
