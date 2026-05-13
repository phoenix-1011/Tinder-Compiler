import { useCa } from "../state/ChainAssemblyContext";
import { useWorkspace } from "../state/WorkspaceContext";

export function ChainAssemblyHeaderActions() {
  const { pickDataRoot } = useCa();
  return (
    <div className="ca-header-actions">
      <button
        type="button"
        className="ca-action-btn"
        title="选择引擎 bin 目录"
        aria-label="选择引擎 bin 目录"
        onClick={pickDataRoot}
      >
        <span className="codicon codicon-folder-opened" aria-hidden="true" />
      </button>
    </div>
  );
}

export function ChainAssemblyPathStatus() {
  const { dataRoot } = useCa();
  const { activeView } = useWorkspace();
  if (activeView !== "chain-assembly" || !dataRoot) return null;
  return (
    <span className="statusbar-item ca-status-path" title={dataRoot}>
      <span className="codicon codicon-folder-opened" aria-hidden="true" />
      <span className="ca-status-path-text">{dataRoot}</span>
    </span>
  );
}
