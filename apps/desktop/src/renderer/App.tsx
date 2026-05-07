import { TitleBar } from "./components/TitleBar";
import { ActivityBar } from "./components/ActivityBar";
import { SideBar } from "./components/SideBar";
import { EditorArea } from "./components/EditorArea";
import { Panel } from "./components/Panel";
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
import { WorkspaceProvider } from "./state/WorkspaceContext";
import { RunProvider } from "./state/RunContext";
import { CommandRegistryProvider } from "./state/CommandRegistry";
import { UIProvider, useUI } from "./state/UIContext";
import { KeyboardShortcuts } from "./state/KeyboardShortcuts";
import { BuiltInCommands } from "./state/BuiltInCommands";
import { LspBootstrap } from "./state/LspBootstrap";
import { ChainAssemblyProvider } from "./state/ChainAssemblyContext";

function Workbench() {
  const {
    sidebarWidth,
    setSidebarWidth,
    panelHeight,
    setPanelHeight,
    sidebarVisible,
    panelVisible,
    isAboutOpen,
    closeAbout,
    isThemePickerOpen,
    closeThemePicker,
    isSettingsOpen
  } = useUI();

  const bodyTemplate = sidebarVisible
    ? `var(--tc-activitybar-w) ${sidebarWidth}px 4px 1fr`
    : `var(--tc-activitybar-w) 1fr`;

  const mainTemplate = panelVisible
    ? `1fr 4px ${panelHeight}px`
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
          {isSettingsOpen ? <SettingsView /> : <EditorArea />}
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
                      <BuiltInCommands />
                      <KeyboardShortcuts />
                      <LspBootstrap />
                      <AutoSave />
                      <UserKeybindingsLoader />
                      <Workbench />
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
