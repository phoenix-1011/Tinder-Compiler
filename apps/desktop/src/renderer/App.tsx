import { TitleBar } from "./components/TitleBar";
import { ActivityBar } from "./components/ActivityBar";
import { SideBar } from "./components/SideBar";
import { EditorArea } from "./components/EditorArea";
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
  const { activeView } = useWorkspace();

  // Body grid: activity bar | [optional sidebar + 0-width splitter overlay] |
  // main | [optional 0-width AI splitter overlay + AI panel]. Splitters
  // are absolute-positioned overlays (`.splitter-hit` extends ±3px from
  // the cell origin) so the panels themselves stay flush — no parent-
  // colored seam shows between them.
  const cols: string[] = ["var(--tc-activitybar-w)"];
  if (sidebarVisible) cols.push(`${sidebarWidth}px`, "0");
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
            value={sidebarWidth}
            onChange={setSidebarWidth}
          />
        )}
        <div className="workbench-main" style={{ gridTemplateRows: mainTemplate }}>
          {isSettingsOpen ? (
            <SettingsView />
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
                      <ChainHelpProvider>
                        <BuiltInCommands />
                        <KeyboardShortcuts />
                        <LspBootstrap />
                        <AutoSave />
                        <UserKeybindingsLoader />
                        <Workbench />
                      </ChainHelpProvider>
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
