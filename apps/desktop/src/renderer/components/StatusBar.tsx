import { useState } from "react";
import { useWorkspace } from "../state/WorkspaceContext";
import { useUI } from "../state/UIContext";
import { LanguagePicker } from "./LanguagePicker";
import { ChainAssemblyPathStatus } from "./ChainAssemblyChrome";

function formatStatus(
  status: ReturnType<typeof useWorkspace>["saveStatus"][string] | undefined,
  dirty: boolean
): string {
  if (!status || status.kind === "idle") return dirty ? "未保存" : "已保存";
  if (status.kind === "saving") return "保存中…";
  if (status.kind === "error") return `保存失败: ${status.message}`;
  return dirty ? "未保存" : "已保存";
}

export function StatusBar() {
  const { folder, documents, activeUri, saveStatus, setLanguage, setEol } = useWorkspace();
  const { toggleSidebar, togglePanel, openSettings } = useUI();
  const active = documents.find((d) => d.uri === activeUri);
  const status = active ? saveStatus[active.uri] : undefined;
  const isError = status?.kind === "error";
  const [pickingLang, setPickingLang] = useState(false);

  const toggleEol = () => {
    if (!active) return;
    setEol(active.uri, active.eol === "lf" ? "crlf" : "lf");
  };

  return (
    <>
      <footer className={`statusbar${isError ? " is-error" : ""}`} aria-label="状态栏">
        <div className="statusbar-left">
          <button
            className="statusbar-item statusbar-button"
            title="切换侧边栏 (Ctrl+B)"
            onClick={toggleSidebar}
          >
            <span className="codicon codicon-layout-sidebar-left" aria-hidden="true" />
          </button>
          <button
            className="statusbar-item statusbar-button"
            title="切换面板 (Ctrl+J)"
            onClick={togglePanel}
          >
            <span className="codicon codicon-layout-panel" aria-hidden="true" />
          </button>
          <span className="statusbar-item">
            <span className="codicon codicon-folder" aria-hidden="true" />
            {folder ? folder.name : "未打开文件夹"}
          </span>
          <span className="statusbar-item">
            <span className="codicon codicon-source-control" aria-hidden="true" />
            main
          </span>
          <ChainAssemblyPathStatus />
        </div>
        <div className="statusbar-right">
          {active && (
            <>
              <span
                className="statusbar-item"
                title={status?.kind === "error" ? status.message : undefined}
              >
                {formatStatus(status, active.dirty)}
              </span>
              <button
                className="statusbar-item statusbar-button"
                title="选择语言"
                onClick={() => setPickingLang(true)}
              >
                {active.language}
              </button>
              <span className="statusbar-item">UTF-8</span>
              <button
                className="statusbar-item statusbar-button"
                title="切换行尾符（LF / CRLF）"
                onClick={toggleEol}
              >
                {active.eol === "crlf" ? "CRLF" : "LF"}
              </button>
            </>
          )}
          <button
            className="statusbar-item statusbar-button"
            title="设置 (Ctrl+,)"
            onClick={openSettings}
          >
            <span className="codicon codicon-settings-gear" aria-hidden="true" />
          </button>
        </div>
      </footer>
      {pickingLang && active && (
        <LanguagePicker
          current={active.language}
          onPick={(lang) => setLanguage(active.uri, lang)}
          onClose={() => setPickingLang(false)}
        />
      )}
    </>
  );
}
