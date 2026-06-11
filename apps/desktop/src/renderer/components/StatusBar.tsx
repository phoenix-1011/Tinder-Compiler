import { useState } from "react";
import { useWorkspace } from "../state/WorkspaceContext";
import { useUI } from "../state/UIContext";
import { LanguagePicker } from "./LanguagePicker";
import { ChainAssemblyPathStatus } from "./ChainAssemblyChrome";

/**
 * Strip the Electron IPC wrapper out of error messages and translate
 * common Node fs error codes to a one-line Chinese summary. Falls back
 * to the raw text (trimmed) when no pattern matches so we don't lose
 * information for novel errors.
 */
function friendlyError(raw: string): string {
  // "Error invoking remote method 'fs:writeText': Error: ENOENT: ..."
  // → "Error: ENOENT: ..."
  let msg = raw.replace(/^Error invoking remote method '[^']+':\s*/i, "");
  // Trim duplicated "Error: " prefixes.
  msg = msg.replace(/^(?:Error:\s*)+/i, "");
  const match = msg.match(/^(E[A-Z]+):\s*([^,]+)(?:,\s*\w+\s+'([^']+)')?/);
  if (match) {
    const [, code, , filepath] = match;
    const tail = filepath ? `（${filepath}）` : "";
    switch (code) {
      case "ENOENT":
        return `路径不存在或父目录缺失${tail}`;
      case "EACCES":
        return `没有权限${tail}`;
      case "EISDIR":
        return `目标是目录而非文件${tail}`;
      case "ENOTDIR":
        return `路径中包含非目录段${tail}`;
      case "EEXIST":
        return `目标已存在${tail}`;
      case "EBUSY":
        return `文件被占用${tail}`;
      default:
        return `${code}${tail}`;
    }
  }
  return msg.length > 120 ? `${msg.slice(0, 117)}…` : msg;
}

function formatStatus(
  status: ReturnType<typeof useWorkspace>["saveStatus"][string] | undefined,
  dirty: boolean
): string {
  if (!status || status.kind === "idle") return dirty ? "未保存" : "已保存";
  if (status.kind === "saving") return "保存中…";
  if (status.kind === "error") return `保存失败：${friendlyError(status.message)}`;
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
            onClick={() => openSettings()}
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
