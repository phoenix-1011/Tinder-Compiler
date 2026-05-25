import { useMemo, useState } from "react";
import type { ChainContractRow, ChainNodeEntry } from "@tinder/nextstep";
import { branchKey } from "@tinder/nextstep";
import { ContextMenu, useContextMenu, type ContextMenuItem } from "./ContextMenu";
import { useCa } from "../state/ChainAssemblyContext";
import { useWorkspace } from "../state/WorkspaceContext";
import {
  collectProfileV2Resources,
  collectProjectV2Resources,
  flattenLeaves
} from "../state/chainAssemblyStorage";
import {
  buildChainProjection,
  buildExecutionProjection,
  type ChainProjectionRow,
  type ExecutionRow
} from "../state/chainProjection";
import {
  buildRuntimeConfig,
  buildRuntimeReport,
  type RuntimeReport
} from "../state/runtimeReport";
import { RuntimeReportModal } from "./RuntimeReportModal";
import { CHAIN_CATALOG } from "../help/chain-catalog.generated";
import { MarkdownInline } from "../help/Markdown";

/**
 * Main-pane chain editor for the active profile. Opens when the user clicks
 * `链路` under a profile in the chain assembly sidebar.
 *
 * Layout: header (profile name + close button) over the projection table
 * showing canonical chain coverage plus active custom node placements.
 */
interface ChainEditorViewProps {
  profileId: string;
  /** Synthetic tab uri — used by the close button to call closeFile. */
  tabUri: string;
}

type ChainEditorMode = "full" | "execution";

const chainEditorModeByUri = new Map<string, ChainEditorMode>();
const CUSTOM_GROUP_FILTER = "__custom__";

export function ChainEditorView({ profileId, tabUri }: ChainEditorViewProps) {
  const ca = useCa();
  const { openHelpDoc, openResourceBranch, closeFile, enterCanvasMode } =
    useWorkspace();
  const cm = useContextMenu();
  const [reportState, setReportState] = useState<{
    report: RuntimeReport;
    exportPath: string;
  } | null>(null);
  const [nodeInfo, setNodeInfo] = useState<{
    nodeId: string;
    kind: ChainNodeInfoKind;
  } | null>(null);
  const [methodInfo, setMethodInfo] = useState<MethodInfoState | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  /**
   * Two distinct views:
   *
   * - `full`: the 81 canonical chain nodes in canonical order, one row
   *   each, regardless of whether a resource covers them. This is the
   *   reference view for understanding chain shape.
   * - `execution`: one row per active compute node — driven by what's
   *   wired up. A canonical chain node with two covering resources gets
   *   two rows; one with no coverage gets none. There's no `缺失`
   *   concept by construction.
   */
  const [chainMode, setChainMode] = useState<ChainEditorMode>(
    () => chainEditorModeByUri.get(tabUri) ?? "execution"
  );
  /**
   * Optional chain-doc group filter. `all` shows everything; otherwise
   * the value is a chain doc slug (e.g. `10-platform-chain`) and only
   * nodes owned by that doc render. Custom rows whose anchor falls
   * outside the selected group are hidden too so the projection stays
   * coherent.
   */
  const [groupFilter, setGroupFilter] = useState<string>("all");

  const profile = useMemo(() => {
    if (!ca.disk || !profileId) return null;
    return ca.disk.profiles.find((p) => p.id === profileId) ?? null;
  }, [ca.disk, profileId]);

  const flatCustom = useMemo(
    () => (ca.disk ? flattenLeaves(ca.disk.customTree) : []),
    [ca.disk]
  );
  /**
   * v2 form of every compute resource — includes legacy single-file
   * resources via the on-read migration. Used by runtime report/config
   * builders so the export reflects implementation.runtime_artifact and
   * variant-resolved effective candidates.
   */
  const v2Resources = useMemo(
    () =>
      ca.disk && profile
        ? collectProfileV2Resources(ca.disk, profile.project)
        : [],
    [ca.disk, profile]
  );
  const projectV2Resources = useMemo(
    () => (ca.disk ? collectProjectV2Resources(ca.disk) : []),
    [ca.disk]
  );

  const fullProjection = useMemo(
    () =>
      profile
        ? buildChainProjection(profile.project, v2Resources, flatCustom)
        : [],
    [profile, v2Resources, flatCustom]
  );
  const executionProjection = useMemo(
    () =>
      profile
        ? buildExecutionProjection(profile.project, v2Resources, flatCustom)
        : [],
    [profile, v2Resources, flatCustom]
  );

  const visibleFull = useMemo(() => {
    if (groupFilter === CUSTOM_GROUP_FILTER) {
      return fullProjection.filter((row) => row.kind === "custom");
    }
    const visibleChainIds = new Set<string>();
    for (const row of fullProjection) {
      if (row.kind !== "chain-node") continue;
      if (groupFilter !== "all" && row.docSlug !== groupFilter) continue;
      visibleChainIds.add(row.nodeId);
    }
    return fullProjection.filter((row) => {
      if (row.kind === "chain-node") {
        return groupFilter === "all" || row.docSlug === groupFilter;
      }
      if (groupFilter === "all") return true;
      return row.anchorChainId ? visibleChainIds.has(row.anchorChainId) : false;
    });
  }, [fullProjection, groupFilter]);

  const visibleExecution = useMemo(() => {
    if (groupFilter === CUSTOM_GROUP_FILTER) {
      return executionProjection.filter((row) => row.kind === "custom");
    }
    const visibleChainIds = new Set<string>();
    for (const row of executionProjection) {
      if (row.kind !== "exec-standard") continue;
      if (groupFilter !== "all" && row.docSlug !== groupFilter) continue;
      visibleChainIds.add(row.chainNodeId);
    }
    return executionProjection.filter((row) => {
      if (row.kind === "exec-standard") {
        return groupFilter === "all" || row.docSlug === groupFilter;
      }
      if (groupFilter !== "all") {
        if (!row.anchorChainId) return false;
        return visibleChainIds.has(row.anchorChainId);
      }
      return true;
    });
  }, [executionProjection, groupFilter]);
  const [draggedCustomIndex, setDraggedCustomIndex] = useState<number | null>(null);
  const [fullDropTarget, setFullDropTarget] = useState<FullDropTarget | null>(null);

  if (!profile) {
    return (
      <div className="chain-editor-empty">
        <p className="sidebar-hint">未选中可编辑的配置档案。</p>
        <button
          type="button"
          className="primary-button"
          onClick={() => closeFile(tabUri)}
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
  const fullDragEnabled = chainMode === "full" && groupFilter === "all";
  const finishFullDrop = (target: FullDropTarget): void => {
    if (draggedCustomIndex === null) return;
    if (target.kind === "custom" && target.arrayIndex === draggedCustomIndex) {
      setDraggedCustomIndex(null);
      setFullDropTarget(null);
      return;
    }
    const next =
      target.kind === "custom"
        ? { anchorChainId: null, beforeCustomArrayIndex: target.arrayIndex }
        : { anchorChainId: target.kind === "chain" ? target.chainId : null };
    void ca.moveCustomUsage(profile.id, draggedCustomIndex, next);
    setDraggedCustomIndex(null);
    setFullDropTarget(null);
  };
  const fullDrag: FullDragConfig = {
    enabled: fullDragEnabled,
    draggedCustomIndex,
    dropTarget: fullDropTarget,
    onDragStart: (arrayIndex) => {
      setDraggedCustomIndex(arrayIndex);
      setFullDropTarget(null);
    },
    onDragOver: (target, e) => {
      if (!fullDragEnabled || draggedCustomIndex === null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setFullDropTarget(target);
    },
    onDrop: finishFullDrop,
    onDragEnd: () => {
      setDraggedCustomIndex(null);
      setFullDropTarget(null);
    }
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
      v2Resources,
      projectV2Resources
    );
    setReportState({ report, exportPath: runtimeExportPath });
  };

  const onExport = async () => {
    if (!reportState) return;
    const config = buildRuntimeConfig(profile.project, v2Resources);
    await window.tinder.writeText(
      reportState.exportPath,
      JSON.stringify(config, null, 2)
    );
    setReportState(null);
  };

  const setPersistedChainMode = (next: ChainEditorMode) => {
    chainEditorModeByUri.set(tabUri, next);
    setChainMode(next);
  };

  const openMethodCode = async (
    row: Extract<ExecutionRow, { kind: "exec-standard" }>
  ) => {
    const base = {
      kind: "code" as const,
      title: row.activeCandidateDisplayName,
      functionName: row.activeCandidateFunctionName,
      resourceId: row.resourceId,
      branchId: row.variantId
    };
    setMethodInfo(base);
    const result = await loadMethodSource({
      disk: ca.disk,
      resourceId: row.resourceId,
      branchId: row.variantId,
      functionName: row.activeCandidateFunctionName
    });
    setMethodInfo({ ...base, ...result });
  };

  const openCustomMethodCode = async (
    row: Extract<ExecutionRow, { kind: "custom" }>
  ) => {
    const branchId = row.branchId ?? "default";
    const base = {
      kind: "code" as const,
      title: row.displayName,
      functionName: row.handlerFunction,
      resourceId: row.usage.resource_instance_id,
      branchId
    };
    setMethodInfo(base);
    const result = await loadCustomMethodSource({
      disk: ca.disk,
      resourceId: row.usage.resource_instance_id,
      branchId
    });
    setMethodInfo({ ...base, ...result });
  };

  return (
    <div className="chain-editor" title={profile.id}>
      <div className="chain-editor-toolbar">
        <select
          className="chain-editor-mode-select"
          value={chainMode}
          onChange={(e) => setPersistedChainMode(e.target.value as ChainEditorMode)}
          title="切换视图"
          aria-label="视图模式"
        >
          <option value="full">完整链路节点</option>
          <option value="execution">实际执行链路</option>
        </select>
        <select
          className="chain-editor-group-select"
          value={groupFilter}
          onChange={(e) => setGroupFilter(e.target.value)}
          title="按链路文档分类筛选"
          aria-label="按分类筛选"
        >
          <option value="all">全部分类</option>
          <option value={CUSTOM_GROUP_FILTER}>自定义</option>
          {CHAIN_CATALOG.groups.map((g) => (
            <option key={g.docSlug} value={g.docSlug}>
              {g.title}
            </option>
          ))}
        </select>
        <div className="chain-editor-toolbar-actions">
          <button
            type="button"
            className="chain-editor-action-btn"
            onClick={() => enterCanvasMode(profile.id)}
            title="进入画布编辑（C3 / Phase 1 入口）"
          >
            画布
          </button>
          <button
            type="button"
            className="chain-editor-action-btn"
            onClick={() => void onSave()}
            disabled={saveStatus === "saving"}
            title="保存当前 profile JSON"
          >
            {saveStatus === "saved" ? "已保存" : "保存编辑"}
          </button>
          <button
            type="button"
            className="chain-editor-action-btn is-primary"
            onClick={onGenerate}
            title="预检并导出运行配置"
          >
            生成运行配置
          </button>
        </div>
      </div>

      <div
        className={`chain-editor-list is-mode-${chainMode}`}
      >
        <div className="chain-editor-list-header">
          {chainMode === "full" ? (
            <>
              <span>#</span>
              <span>链路节点</span>
              <span>节点类型</span>
              <span>计算节点数量</span>
              <span>信息</span>
            </>
          ) : (
            <>
              <span>#</span>
              <span>计算方法</span>
              <span>所属资源</span>
              <span>链路节点</span>
              <span>节点类型</span>
              <span>信息</span>
            </>
          )}
        </div>
        {chainMode === "full" ? (
          visibleFull.length === 0 ? (
            <div className="chain-editor-empty-list">
              当前分类下没有节点。
            </div>
          ) : (
            visibleFull.map((row, idx) =>
              renderFullRow(row, idx, setNodeInfo, openHelpDoc, customMenu, fullDrag)
            )
          )
        ) : visibleExecution.length === 0 ? (
          <div className="chain-editor-empty-list">
            当前档案没有有效计算实例。先把标准资源加入档案，或切换回「完整链路节点」。
          </div>
        ) : (
          visibleExecution.map((row, idx) =>
            renderExecutionRow(
              row,
              idx,
              setNodeInfo,
              setMethodInfo,
              openMethodCode,
              openCustomMethodCode,
              openHelpDoc,
              (candidate) =>
                void ca.setProfileStandardEffectiveCandidate(
                  profile.id,
                  candidate.resourceId,
                  candidate.nodeId,
                  candidate.candidateId
                ),
              (resource) =>
                openResourceBranch({
                  scope: "profile",
                  profileId: profile.id,
                  profileDisplayName: profile.name,
                  resourceId: resource.resourceId,
                  resourceKind: resource.resourceKind,
                  branchId: resource.branchId,
                  displayName: resource.displayName
                }),
              customMenu
            )
          )
        )}
        {chainMode === "full" && fullDragEnabled && draggedCustomIndex !== null && (
          <div
            className={`chain-editor-tail-drop${
              fullDropTarget?.kind === "tail" ? " is-over" : ""
            }`}
            onDragOver={(e) => fullDrag.onDragOver({ kind: "tail" }, e)}
            onDrop={() => fullDrag.onDrop({ kind: "tail" })}
          >
            移到链路末尾
          </div>
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
      {nodeInfo && (
        <ChainNodeInfoModal
          nodeId={nodeInfo.nodeId}
          kind={nodeInfo.kind}
          onClose={() => setNodeInfo(null)}
        />
      )}
      {methodInfo && (
        <MethodInfoModal info={methodInfo} onClose={() => setMethodInfo(null)} />
      )}
    </div>
  );
}

type CustomMenuOpener = (
  e: React.MouseEvent,
  row: ChainProjectionRow & { kind: "custom" }
) => void;

type FullDropTarget =
  | { kind: "chain"; chainId: string }
  | { kind: "custom"; arrayIndex: number }
  | { kind: "tail" };

type FullDragConfig = {
  enabled: boolean;
  draggedCustomIndex: number | null;
  dropTarget: FullDropTarget | null;
  onDragStart: (arrayIndex: number) => void;
  onDragOver: (target: FullDropTarget, e: React.DragEvent<HTMLElement>) => void;
  onDrop: (target: FullDropTarget) => void;
  onDragEnd: () => void;
};

type ChainNodeInfoKind = "summary" | "responsibility" | "io";

type NodeInfoOpener = (next: { nodeId: string; kind: ChainNodeInfoKind }) => void;

type MethodInfoState =
  | {
      kind: "notes";
      title: string;
      body?: string;
    }
  | {
      kind: "code";
      title: string;
      functionName?: string;
      resourceId: string;
      branchId: string;
      filePath?: string;
      language?: string;
      source?: string;
      startLine?: number;
      error?: string;
    };

type MethodInfoOpener = (next: MethodInfoState) => void;

type MethodCodeOpener = (
  row: Extract<ExecutionRow, { kind: "exec-standard" }>
) => void;

type CustomMethodCodeOpener = (
  row: Extract<ExecutionRow, { kind: "custom" }>
) => void;

type EffectiveCandidateSetter = (next: {
  resourceId: string;
  nodeId: string;
  candidateId: string;
}) => void;

type ActiveResourceOpener = (resource: {
  resourceId: string;
  resourceKind: "standard" | "custom";
  branchId: string;
  displayName: string;
}) => void;

/**
 * `完整链路节点` row layout. Columns: order/doc · 名称 · 类型 · 分类 · 状态.
 */
function renderFullRow(
  row: ChainProjectionRow,
  idx: number,
  openNodeInfo: NodeInfoOpener,
  openHelpDoc: (nodeId: string) => void,
  customMenu: CustomMenuOpener,
  drag: FullDragConfig
) {
  if (row.kind === "custom") {
    const isDragging = drag.draggedCustomIndex === row.arrayIndex;
    const isDropTarget =
      drag.dropTarget?.kind === "custom" &&
      drag.dropTarget.arrayIndex === row.arrayIndex &&
      !isDragging;
    return (
      <div
        key={`custom-${idx}-${row.arrayIndex}`}
        className={`chain-editor-row is-custom${row.usage.enabled ? "" : " is-disabled"}${
          isDragging ? " is-dragging" : ""
        }${isDropTarget ? " is-drop-target" : ""}`}
        draggable={drag.enabled}
        onDragStart={(e) => {
          if (!drag.enabled) return;
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", String(row.arrayIndex));
          drag.onDragStart(row.arrayIndex);
        }}
        onDragOver={(e) =>
          drag.onDragOver({ kind: "custom", arrayIndex: row.arrayIndex }, e)
        }
        onDrop={() => drag.onDrop({ kind: "custom", arrayIndex: row.arrayIndex })}
        onDragEnd={drag.onDragEnd}
        onContextMenu={(e) => customMenu(e, row)}
        title={
          row.usage.enabled
            ? `${row.usage.resource_instance_id}/${row.usage.node_id}`
            : `${row.usage.resource_instance_id}/${row.usage.node_id} · 停用`
        }
      >
        <div className="chain-editor-row-order-cell">
          <span
            className="chain-editor-row-drag-handle"
            title={drag.enabled ? "拖动调整调用时机" : undefined}
          >
            ⋮⋮
          </span>
        </div>
        <span className="chain-editor-row-label">{row.displayName}</span>
        <span className="chain-editor-row-label" title={row.anchorChainId ?? undefined}>
          自定义节点
        </span>
        <span className="chain-editor-row-type is-custom">自定义</span>
        <span className="chain-editor-row-info-actions" />
      </div>
    );
  }
  return (
    <div
      key={`chain-${row.nodeId}`}
      className={`chain-editor-row is-chain is-${row.coverage.status}${
        drag.dropTarget?.kind === "chain" && drag.dropTarget.chainId === row.nodeId
          ? " is-drop-target"
          : ""
      }`}
      onDragOver={(e) => drag.onDragOver({ kind: "chain", chainId: row.nodeId }, e)}
      onDrop={() => drag.onDrop({ kind: "chain", chainId: row.nodeId })}
      title={
        row.coverage.status === "multi"
          ? `${row.nodeId} · 多实现 ×${row.coverage.count}`
          : row.nodeId
      }
    >
      <div className="chain-editor-row-order-cell">
        <span className="chain-editor-row-order">{row.order}</span>
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
      </div>
      <span className="chain-editor-row-label">{row.displayName}</span>
      <span className="chain-editor-row-type" title={row.docSlug}>
        {row.docTitle}
      </span>
      <span className="chain-editor-row-count">{row.coverage.count}</span>
      {renderNodeInfoButtons(row.nodeId, openNodeInfo)}
    </div>
  );
}

/**
 * `实际执行链路` row layout. Columns: order/doc · 链路节点 · 计算实例 · 类型 · 分类.
 * Standard rows render once per covering resource; custom rows interleave
 * with the same layout shape (resource column doubles as the custom usage's
 * resource_instance_id for visual continuity).
 */
function renderExecutionRow(
  row: ExecutionRow,
  idx: number,
  openNodeInfo: NodeInfoOpener,
  openMethodInfo: MethodInfoOpener,
  openMethodCode: MethodCodeOpener,
  openCustomMethodCode: CustomMethodCodeOpener,
  openHelpDoc: (nodeId: string) => void,
  setEffectiveCandidate: EffectiveCandidateSetter,
  openActiveResource: ActiveResourceOpener,
  customMenu: CustomMenuOpener
) {
  const executionOrder = idx + 1;
  if (row.kind === "custom") {
    const branchId = row.branchId ?? "default";
    return (
      <div
        key={`exec-custom-${idx}-${row.arrayIndex}`}
        className={`chain-editor-row is-custom${row.usage.enabled ? "" : " is-disabled"}`}
        onContextMenu={(e) => customMenu(e, row)}
        title={`${row.usage.resource_instance_id}/${row.usage.node_id}`}
      >
        <div className="chain-editor-row-order-cell">
          <span className="chain-editor-row-order">{executionOrder}</span>
        </div>
        <span className="chain-editor-row-label">{row.displayName}</span>
        {renderActiveResourceButton({
          resourceId: row.usage.resource_instance_id,
          resourceKind: "custom",
          branchId,
          resourceDisplayName: row.resourceDisplayName ?? row.usage.resource_instance_id,
          branchDisplayName: row.branchDisplayName ?? branchId,
          openActiveResource
        })}
        <span className="chain-editor-row-label" title={row.anchorChainId ?? undefined}>
          自定义节点
        </span>
        <span className="chain-editor-row-type is-custom">自定义</span>
        {renderCustomExecutionInfoButtons(row, openMethodInfo, openCustomMethodCode)}
      </div>
    );
  }
  return (
    <div
      key={`exec-${idx}-${row.chainNodeId}-${row.resourceId}-${row.variantId}`}
      className="chain-editor-row is-chain is-covered"
      title={row.chainNodeId}
    >
      <div className="chain-editor-row-order-cell">
        <span className="chain-editor-row-order">{executionOrder}</span>
      </div>
      {renderEffectiveMethodControl(row, setEffectiveCandidate)}
      {renderActiveResourceButton({
        resourceId: row.resourceId,
        resourceKind: "standard",
        branchId: row.variantId,
        resourceDisplayName: row.resourceDisplayName,
        branchDisplayName: row.branchDisplayName,
        openActiveResource
      })}
      <span className="chain-editor-row-label" title={row.chainNodeId}>
        {row.chainDisplayName}
      </span>
      <span className="chain-editor-row-type" title={row.docSlug}>
        {row.docTitle}
      </span>
      {renderExecutionInfoButtons(row, openMethodInfo, openMethodCode, openNodeInfo)}
    </div>
  );
}

function renderEffectiveMethodControl(
  row: Extract<ExecutionRow, { kind: "exec-standard" }>,
  setEffectiveCandidate: EffectiveCandidateSetter
) {
  if (row.candidates.length <= 1) {
    return (
      <span className="chain-editor-row-method" title={row.activeCandidateId}>
        {row.activeCandidateDisplayName}
      </span>
    );
  }
  return (
    <select
      className="chain-editor-row-method-select"
      value={row.activeCandidateId}
      title={row.activeCandidateFunctionName ?? row.activeCandidateId}
      onChange={(e) =>
        setEffectiveCandidate({
          resourceId: row.resourceId,
          nodeId: row.chainNodeId,
          candidateId: e.target.value
        })
      }
    >
      {row.candidates.map((candidate) => (
        <option key={candidate.candidateId} value={candidate.candidateId}>
          {candidate.displayName}
        </option>
      ))}
    </select>
  );
}

function renderExecutionInfoButtons(
  row: Extract<ExecutionRow, { kind: "exec-standard" }>,
  openMethodInfo: MethodInfoOpener,
  openMethodCode: MethodCodeOpener,
  openNodeInfo: NodeInfoOpener
) {
  return (
    <span className="chain-editor-row-info-actions">
      <button
        type="button"
        className="chain-editor-row-info-btn"
        onClick={(e) => {
          e.stopPropagation();
          openMethodInfo({
            kind: "notes",
            title: row.activeCandidateDisplayName,
            body: row.activeCandidateNotes
          });
        }}
      >
        方法说明
      </button>
      <button
        type="button"
        className="chain-editor-row-info-btn"
        onClick={(e) => {
          e.stopPropagation();
          openMethodCode(row);
        }}
      >
        代码
      </button>
      <button
        type="button"
        className="chain-editor-row-info-btn"
        onClick={(e) => {
          e.stopPropagation();
          openNodeInfo({ nodeId: row.chainNodeId, kind: "io" });
        }}
      >
        输入输出
      </button>
    </span>
  );
}

function renderCustomExecutionInfoButtons(
  row: Extract<ExecutionRow, { kind: "custom" }>,
  openMethodInfo: MethodInfoOpener,
  openCustomMethodCode: CustomMethodCodeOpener
) {
  return (
    <span className="chain-editor-row-info-actions">
      <button
        type="button"
        className="chain-editor-row-info-btn"
        onClick={(e) => {
          e.stopPropagation();
          openMethodInfo({
            kind: "notes",
            title: row.displayName,
            body: row.nodeNotes
          });
        }}
      >
        方法说明
      </button>
      <button
        type="button"
        className="chain-editor-row-info-btn"
        onClick={(e) => {
          e.stopPropagation();
          openCustomMethodCode(row);
        }}
      >
        代码
      </button>
    </span>
  );
}

function renderActiveResourceButton({
  resourceId,
  resourceKind,
  branchId,
  resourceDisplayName,
  branchDisplayName,
  openActiveResource
}: {
  resourceId: string;
  resourceKind: "standard" | "custom";
  branchId: string;
  resourceDisplayName: string;
  branchDisplayName: string;
  openActiveResource: ActiveResourceOpener;
}) {
  return (
    <button
      type="button"
      className="chain-editor-row-resource is-link"
      title={`${resourceId} / ${branchId}`}
      onClick={(e) => {
        e.stopPropagation();
        openActiveResource({
          resourceId,
          resourceKind,
          branchId,
          displayName: resourceDisplayName
        });
      }}
    >
      <span>{resourceDisplayName}</span>
      <code>{branchDisplayName}</code>
    </button>
  );
}

function renderNodeInfoButtons(nodeId: string, openNodeInfo: NodeInfoOpener) {
  return (
    <span className="chain-editor-row-info-actions">
      {[
        ["summary", "摘要"],
        ["responsibility", "职责"],
        ["io", "输入输出"]
      ].map(([kind, label]) => (
        <button
          key={kind}
          type="button"
          className="chain-editor-row-info-btn"
          onClick={(e) => {
            e.stopPropagation();
            openNodeInfo({ nodeId, kind: kind as ChainNodeInfoKind });
          }}
        >
          {label}
        </button>
      ))}
    </span>
  );
}

async function loadMethodSource({
  disk,
  resourceId,
  branchId,
  functionName
}: {
  disk: ReturnType<typeof useCa>["disk"];
  resourceId: string;
  branchId: string;
  functionName?: string;
}): Promise<Pick<Extract<MethodInfoState, { kind: "code" }>, "filePath" | "language" | "source" | "startLine" | "error">> {
  const trimmed = functionName?.trim();
  if (!trimmed) {
    return { error: "当前生效方法没有配置 function_name，无法定位源码。" };
  }
  if (!disk) return { error: "当前没有加载链路数据。" };
  const family = disk.resourceIndex.familyByKey.get(`standard:${resourceId}`);
  const branch = disk.resourceIndex.branchByKey.get(
    branchKey("standard", resourceId, branchId)
  );
  if (!family || !branch) {
    return { error: `未找到资源分支：${resourceId} / ${branchId}` };
  }

  for (const ref of branch.branch.implementation.source_files) {
    const abs =
      ref.storage === "managed"
        ? await window.tinder.joinPath(branch.branchDir, ref.path)
        : ref.path;
    let text: string;
    try {
      text = await window.tinder.readText(abs);
    } catch {
      continue;
    }
    const hit = findFunctionInSource(text, trimmed);
    if (!hit) continue;
    return {
      filePath: abs,
      language: ref.language,
      source: hit.source,
      startLine: hit.startLine
    };
  }

  return {
    error: `在 ${family.family.display_name} / ${branch.branch.display_name} 的源码文件中未找到函数 ${trimmed}。`
  };
}

async function loadCustomMethodSource({
  disk,
  resourceId,
  branchId
}: {
  disk: ReturnType<typeof useCa>["disk"];
  resourceId: string;
  branchId: string;
}): Promise<Pick<Extract<MethodInfoState, { kind: "code" }>, "filePath" | "language" | "source" | "startLine" | "error">> {
  if (!disk) return { error: "当前没有加载链路数据。" };
  const family = disk.resourceIndex.familyByKey.get(`custom:${resourceId}`);
  const branch = disk.resourceIndex.branchByKey.get(
    branchKey("custom", resourceId, branchId)
  );
  if (!family || !branch) {
    return { error: `未找到自定义资源分支：${resourceId} / ${branchId}` };
  }
  const refs = branch.branch.implementation.source_files;
  if (refs.length === 0) {
    return { error: "当前自定义资源没有关联源码文件。" };
  }

  const chunks: string[] = [];
  let firstPath: string | undefined;
  let firstLanguage: string | undefined;
  for (const ref of refs) {
    const abs =
      ref.storage === "managed"
        ? await window.tinder.joinPath(branch.branchDir, ref.path)
        : ref.path;
    let text: string;
    try {
      text = await window.tinder.readText(abs);
    } catch {
      continue;
    }
    firstPath ??= abs;
    firstLanguage ??= ref.language;
    chunks.push(
      refs.length > 1 ? `# ${abs}\n${text}` : text
    );
  }

  if (chunks.length === 0) {
    return { error: "无法读取当前自定义资源关联的源码文件。" };
  }
  return {
    filePath: firstPath,
    language: firstLanguage,
    source: chunks.join("\n\n"),
    startLine: 1
  };
}

function findFunctionInSource(
  text: string,
  functionName: string
): { source: string; startLine: number } | null {
  const esc = functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pyRe = new RegExp(
    `^([ \\t]*)(?:async[ \\t]+)?def[ \\t]+${esc}[ \\t]*\\(`,
    "m"
  );
  const genericRe = new RegExp(`(?:^|[\\s*&:])${esc}\\s*\\(`, "m");
  const pyMatch = pyRe.exec(text);
  const genericMatch = pyMatch ? null : genericRe.exec(text);
  const match = pyMatch ?? genericMatch;
  if (!match) return null;

  const lineStart = text.lastIndexOf("\n", match.index) + 1;
  const startLine = text.slice(0, lineStart).split(/\r?\n/).length;
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const startIdx = Math.max(0, startLine - 1);

  if (pyMatch) {
    const indent = pyMatch[1]?.length ?? 0;
    let endIdx = lines.length;
    for (let i = startIdx + 1; i < lines.length; i++) {
      const line = lines[i]!;
      if (!line.trim()) continue;
      const currentIndent = line.match(/^[ \t]*/)?.[0].length ?? 0;
      if (
        currentIndent <= indent &&
        /^(?:async\s+def|def|class)\s+/.test(line.trim())
      ) {
        endIdx = i;
        break;
      }
    }
    return { source: lines.slice(startIdx, endIdx).join("\n"), startLine };
  }

  const from = Math.max(0, startIdx - 8);
  const to = Math.min(lines.length, startIdx + 80);
  return { source: lines.slice(from, to).join("\n"), startLine: from + 1 };
}

function ChainNodeInfoModal({
  nodeId,
  kind,
  onClose
}: {
  nodeId: string;
  kind: ChainNodeInfoKind;
  onClose(): void;
}) {
  const node = CHAIN_CATALOG.nodes[nodeId];
  const doc = node ? CHAIN_CATALOG.docs[node.docSlug] : undefined;
  const title = kind === "summary" ? "摘要" : kind === "responsibility" ? "职责" : "输入输出";

  return (
    <div className="chain-node-info-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="chain-node-info-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`${node?.displayName ?? nodeId} ${title}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="chain-node-info-header">
          <div>
            <h2>{node?.displayName ?? nodeId}</h2>
            <code>{nodeId}</code>
          </div>
          <button type="button" className="chain-node-info-close" onClick={onClose}>
            关闭
          </button>
        </header>
        <div className="chain-node-info-source">
          来源：{doc?.title ?? node?.docSlug ?? "未找到链路文档"}
        </div>
        <div className="chain-node-info-body">
          {node ? <ChainNodeInfoContent node={node} kind={kind} /> : <p>未找到该节点的文档信息。</p>}
        </div>
      </section>
    </div>
  );
}

function MethodInfoModal({
  info,
  onClose
}: {
  info: MethodInfoState;
  onClose(): void;
}) {
  return (
    <div className="chain-node-info-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="chain-node-info-modal chain-node-method-modal"
        role="dialog"
        aria-modal="true"
        aria-label={info.title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="chain-node-info-icon-close"
          onClick={onClose}
          aria-label="关闭"
          title="关闭"
        >
          <span className="codicon codicon-close" aria-hidden="true" />
        </button>
        <div className="chain-node-info-body">
          {info.kind === "notes" ? (
            info.body?.trim() ? (
              <p className="chain-node-info-readonly-text">{info.body}</p>
            ) : (
              <div className="chain-node-info-empty">当前生效方法暂无备注。</div>
            )
          ) : (
            <div className="chain-node-info-stack">
              {info.error ? (
                <div className="chain-node-info-empty">{info.error}</div>
              ) : info.source ? (
                <section className="chain-node-info-code-section">
                  <pre className="chain-node-info-code" data-lang={info.language}>
                    <code>{info.source}</code>
                  </pre>
                </section>
              ) : (
                <div className="chain-node-info-empty">正在读取源码...</div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function ChainNodeInfoContent({
  node,
  kind
}: {
  node: ChainNodeEntry;
  kind: ChainNodeInfoKind;
}) {
  if (kind === "summary") {
    return (
      <div className="chain-node-info-stack">
        <InfoField title="目的">
          {node.purpose ? <MarkdownInline source={node.purpose} /> : "文档中暂无目的摘要。"}
        </InfoField>
        <InfoMetaGrid
          rows={[
            ["执行序号", node.order ? String(node.order) : "-"],
            ["分类", CHAIN_CATALOG.docs[node.docSlug]?.title ?? node.docSlug],
            ["Fallback", node.fallback ?? "-"]
          ]}
        />
      </div>
    );
  }

  if (kind === "responsibility") {
    return (
      <div className="chain-node-info-stack">
        <InfoField title="运行时契约">
          {node.runtimeContract && node.runtimeContract.length > 0 ? (
            <ul className="chain-node-info-list">
              {node.runtimeContract.map((line, i) => (
                <li key={i}>
                  <MarkdownInline source={line} />
                </li>
              ))}
            </ul>
          ) : (
            "文档中暂无运行时契约。"
          )}
        </InfoField>
        <InfoField title="状态与保留">
          {node.state ? <MarkdownInline source={node.state} /> : "文档中暂无状态与保留说明。"}
        </InfoField>
      </div>
    );
  }

  return (
    <div className="chain-node-info-io">
      <ContractInfoTable title="输入" rows={node.inputs ?? []} kind="input" />
      <ContractInfoTable title="输出" rows={node.outputs ?? []} kind="output" />
    </div>
  );
}

function InfoField({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="chain-node-info-field">
      <h3>{title}</h3>
      <div>{children}</div>
    </section>
  );
}

function InfoMetaGrid({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="chain-node-info-meta-grid">
      {rows.map(([label, value]) => (
        <div key={label} className="chain-node-info-meta-row">
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function ContractInfoTable({
  title,
  rows,
  kind
}: {
  title: string;
  rows: ChainContractRow[];
  kind: "input" | "output";
}) {
  return (
    <section className="chain-node-info-field">
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <div className="chain-node-info-empty">文档中暂无{title} contract。</div>
      ) : (
        <table className="chain-node-info-table">
          <thead>
            <tr>
              <th>Contract</th>
              <th>{kind === "input" ? "来源" : "目标"}</th>
              <th>{kind === "input" ? "必需" : "生命周期"}</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <td>
                  <MarkdownInline source={row.contract} />
                </td>
                <td>
                  <MarkdownInline source={row.endpoint} />
                </td>
                <td>
                  <MarkdownInline source={row.qualifier ?? ""} />
                </td>
                <td>
                  <MarkdownInline source={row.note ?? ""} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
