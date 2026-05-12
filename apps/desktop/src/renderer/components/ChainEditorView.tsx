import { useMemo, useState } from "react";
import { ContextMenu, useContextMenu, type ContextMenuItem } from "./ContextMenu";
import { useCa } from "../state/ChainAssemblyContext";
import { useWorkspace } from "../state/WorkspaceContext";
import { flattenLeaves } from "../state/chainAssemblyStorage";
import {
  buildChainProjection,
  type ChainProjectionRow
} from "../state/chainProjection";
import {
  buildRuntimeConfig,
  buildRuntimeReport,
  type RuntimeReport
} from "../state/runtimeReport";
import { RuntimeReportModal } from "./RuntimeReportModal";

/**
 * Main-pane chain editor for the active profile. Opens when the user clicks
 * `链路` under a profile in the chain assembly sidebar.
 *
 * Layout: header (profile name + close button) over the projection table
 * showing canonical chain coverage plus active custom node placements.
 */
export function ChainEditorView() {
  const ca = useCa();
  const { openHelpDoc } = useWorkspace();
  const cm = useContextMenu();
  const [reportState, setReportState] = useState<{
    report: RuntimeReport;
    exportPath: string;
  } | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  const profileId =
    ca.mainPaneTarget?.kind === "chain-editor"
      ? ca.mainPaneTarget.profileId
      : null;
  const profile = useMemo(() => {
    if (!ca.disk || !profileId) return null;
    return ca.disk.profiles.find((p) => p.id === profileId) ?? null;
  }, [ca.disk, profileId]);

  const flatStandard = useMemo(
    () => (ca.disk ? flattenLeaves(ca.disk.standardTree) : []),
    [ca.disk]
  );
  const flatCustom = useMemo(
    () => (ca.disk ? flattenLeaves(ca.disk.customTree) : []),
    [ca.disk]
  );

  const projection = useMemo(
    () =>
      profile ? buildChainProjection(profile.project, flatStandard, flatCustom) : [],
    [profile, flatStandard, flatCustom]
  );

  if (!profile) {
    return (
      <div className="chain-editor-empty">
        <p className="sidebar-hint">未选中可编辑的配置档案。</p>
        <button
          type="button"
          className="primary-button"
          onClick={ca.closeMainPane}
        >
          关闭链路编辑
        </button>
      </div>
    );
  }

  const customMenu = (e: React.MouseEvent, row: ChainProjectionRow): void => {
    if (row.kind !== "custom") return;
    const items: ContextMenuItem[] = [
      {
        id: "up",
        label: "上移",
        run: () => ca.shiftCustomUsage(profile.id, row.arrayIndex, -1)
      },
      {
        id: "down",
        label: "下移",
        run: () => ca.shiftCustomUsage(profile.id, row.arrayIndex, 1)
      },
      {
        id: "move",
        label: "移到锚点…",
        run: () => ca.promptMoveCustomUsage(profile.id, row.arrayIndex)
      },
      { separator: true },
      row.usage.enabled
        ? {
            id: "disable",
            label: "停用",
            run: () => ca.setCustomUsageEnabled(profile.id, row.arrayIndex, false)
          }
        : {
            id: "enable",
            label: "激活",
            run: () => ca.setCustomUsageEnabled(profile.id, row.arrayIndex, true)
          },
      {
        id: "remove",
        label: "移出链路",
        run: () => ca.removeCustomUsage(profile.id, row.arrayIndex)
      }
    ];
    cm.open(e, items);
  };

  /**
   * Default runtime export path: sibling of the profile JSON with a
   * `.runtime.json` suffix. The engine-effective path detection described
   * by D31 is deferred — this is the staging default.
   */
  const runtimeExportPath = `${profile.id.replace(/\.json$/i, "")}.runtime.json`;

  const onSave = async () => {
    // The MVP authoring path already writes profile changes through to disk
    // on every action; this button re-serialises and writes the current
    // in-memory profile so users have an explicit save affordance and a
    // visible confirmation that nothing is pending.
    setSaveStatus("saving");
    try {
      await window.tinder.writeText(
        profile.id,
        JSON.stringify(profile.project, null, 2)
      );
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 1500);
    } catch {
      setSaveStatus("idle");
    }
  };

  const onGenerate = () => {
    const report = buildRuntimeReport(
      profile.project,
      flatStandard,
      flatCustom
    );
    setReportState({ report, exportPath: runtimeExportPath });
  };

  const onExport = async () => {
    if (!reportState) return;
    const config = buildRuntimeConfig(
      profile.project,
      flatStandard,
      flatCustom
    );
    await window.tinder.writeText(
      reportState.exportPath,
      JSON.stringify(config, null, 2)
    );
    setReportState(null);
  };

  const counts = projection.reduce(
    (acc, row) => {
      if (row.kind === "chain-node") {
        acc.total += 1;
        if (row.coverage.status === "covered") acc.covered += 1;
        else if (row.coverage.status === "multi") acc.multi += 1;
        else acc.missing += 1;
      } else if (row.usage.enabled) {
        acc.customActive += 1;
      } else {
        acc.customDisabled += 1;
      }
      return acc;
    },
    { total: 0, covered: 0, multi: 0, missing: 0, customActive: 0, customDisabled: 0 }
  );

  return (
    <div className="chain-editor">
      <header className="chain-editor-header">
        <div className="chain-editor-title">
          <span className="chain-editor-eyebrow">链路</span>
          <h1>{profile.name}</h1>
          <code className="chain-editor-path" title={profile.id}>
            {profile.id}
          </code>
        </div>
        <div className="chain-editor-actions">
          <button
            type="button"
            className="chain-editor-action-btn"
            onClick={() => void onSave()}
            disabled={saveStatus === "saving"}
            title="保存当前 profile JSON"
          >
            {saveStatus === "saved" ? "已保存" : "保存"}
          </button>
          <button
            type="button"
            className="chain-editor-action-btn is-primary"
            onClick={onGenerate}
            title="预检并导出运行配置"
          >
            生成运行配置
          </button>
          <button
            type="button"
            className="chain-editor-close"
            onClick={ca.closeMainPane}
            title="关闭链路编辑"
            aria-label="关闭链路编辑"
          >
            <span className="codicon codicon-close" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="chain-editor-summary">
        <span>共 {counts.total} 个标准节点</span>
        <span className="chain-editor-pill is-covered">已覆盖 {counts.covered}</span>
        {counts.multi > 0 && (
          <span className="chain-editor-pill is-multi">多实现 {counts.multi}</span>
        )}
        {counts.missing > 0 && (
          <span className="chain-editor-pill is-missing">缺失 {counts.missing}</span>
        )}
        <span className="chain-editor-pill is-custom">
          自定义 {counts.customActive}
          {counts.customDisabled > 0 ? ` · 停用 ${counts.customDisabled}` : ""}
        </span>
      </div>

      <div className="chain-editor-list">
        {projection.map((row, idx) =>
          renderRow(row, idx, openHelpDoc, customMenu)
        )}
      </div>

      {cm.state && (
        <ContextMenu x={cm.state.x} y={cm.state.y} items={cm.state.items} onClose={cm.close} />
      )}

      {reportState && (
        <RuntimeReportModal
          report={reportState.report}
          exportPath={reportState.exportPath}
          onExport={() => void onExport()}
          onClose={() => setReportState(null)}
        />
      )}
    </div>
  );
}

function renderRow(
  row: ChainProjectionRow,
  idx: number,
  openHelpDoc: (nodeId: string) => void,
  customMenu: (e: React.MouseEvent, row: ChainProjectionRow) => void
) {
  if (row.kind === "custom") {
    return (
      <div
        key={`custom-${idx}-${row.arrayIndex}`}
        className={`chain-editor-row is-custom${row.usage.enabled ? "" : " is-disabled"}`}
        onContextMenu={(e) => customMenu(e, row)}
      >
        <span className="chain-editor-row-actions" aria-hidden="true" />
        <span className="chain-editor-row-marker">⌬</span>
        <span className="chain-editor-row-label">{row.displayName}</span>
        <span className="chain-editor-row-id">
          {row.usage.resource_instance_id}/{row.usage.node_id}
        </span>
        <span className="chain-editor-row-status">
          {row.usage.enabled ? "已编排" : "停用"}
        </span>
      </div>
    );
  }
  const statusText =
    row.coverage.status === "missing"
      ? "缺失"
      : row.coverage.status === "covered"
        ? "已覆盖"
        : `多实现 ×${row.coverage.count}`;
  return (
    <div
      key={`chain-${row.nodeId}`}
      className={`chain-editor-row is-chain is-${row.coverage.status}`}
      title={row.nodeId}
    >
      <button
        type="button"
        className="chain-editor-row-doc"
        title="在新建标签页中查看链路文档"
        onClick={(e) => {
          e.stopPropagation();
          openHelpDoc(row.nodeId);
        }}
      >
        查看文档
      </button>
      <span className="chain-editor-row-order">{row.order}</span>
      <span className="chain-editor-row-label">{row.displayName}</span>
      <span className="chain-editor-row-id">{row.nodeId}</span>
      <span className="chain-editor-row-status">{statusText}</span>
    </div>
  );
}
