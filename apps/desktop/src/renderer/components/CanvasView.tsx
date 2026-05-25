import { Fragment, useCallback, useMemo, useState } from "react";
import { useCa } from "../state/ChainAssemblyContext";
import { useWorkspace } from "../state/WorkspaceContext";
import {
  collectProfileV2Resources,
  flattenLeaves
} from "../state/chainAssemblyStorage";
import {
  buildCanvasProjection,
  type CanvasCustomNode,
  type CanvasGroup,
  type CanvasNode,
  type CanvasSlotNode
} from "../state/canvasProjection";
import {
  useCanvasPersistedState,
  type CanvasSelection
} from "../state/canvasState";
import { canvasDragState } from "../state/canvasDrag";
import { profileResourceBranchId } from "@tinder/nextstep";
import { CanvasInspector } from "./CanvasInspector";
import { CanvasBatchCandidatePanel } from "./CanvasBatchCandidatePanel";
import { CanvasSharedBranchDialog } from "./CanvasSharedBranchDialog";
import { ContextMenu, useContextMenu, type ContextMenuItem } from "./ContextMenu";

/**
 * Phase 3 canvas: same read-only projection as Phase 2 plus a real
 * inspector panel (dockable right ↔ bottom, collapsible) backed by
 * canvas.json (C15), click-to-select with persisted selection (C11),
 * right-click activate/deactivate menus on cards (C24b), and the C21
 * code-edit / C13-style jump-out for opening the full ResourceBranchView
 * tab outside canvas mode.
 *
 * Library pin interactivity (C25) lives in CanvasLibrary; this file
 * stays focused on canvas-area rendering + inspector orchestration.
 */
export function CanvasView() {
  const { canvasProfileId, exitCanvasMode, openResourceBranch } = useWorkspace();
  const ca = useCa();
  const { disk } = ca;
  const cm = useContextMenu();
  const [batchOpen, setBatchOpen] = useState(false);
  // Shared-branch guard pending state — non-null while the dialog
  // is open. Carries the requested jump target so accepting either
  // action knows what was originally requested.
  const [sharedGuard, setSharedGuard] = useState<{
    target: {
      resourceKind: "standard" | "custom";
      resourceInstanceId: string;
      branchId: string;
    };
    usageCount: number;
  } | null>(null);

  const profile = useMemo(() => {
    if (!canvasProfileId || !disk) return null;
    return disk.profiles.find((p) => p.id === canvasProfileId) ?? null;
  }, [canvasProfileId, disk]);

  const tinderDir = disk?.paths.tinderDir ?? null;
  const { state, setState, loaded } = useCanvasPersistedState(
    tinderDir,
    profile?.id ?? null
  );

  const v2Resources = useMemo(
    () =>
      disk && profile ? collectProfileV2Resources(disk, profile.project) : [],
    [disk, profile]
  );
  const flatCustom = useMemo(
    () => (disk ? flattenLeaves(disk.customTree) : []),
    [disk]
  );

  const projection = useMemo(() => {
    if (!profile) return null;
    return buildCanvasProjection(
      profile.project,
      v2Resources,
      flatCustom,
      state.coverageFilter
    );
  }, [profile, v2Resources, flatCustom, state.coverageFilter]);

  const collapsedGroupSet = useMemo(
    () => new Set(state.collapsedGroups),
    [state.collapsedGroups]
  );

  const toggleGroup = (docSlug: string) => {
    const next = collapsedGroupSet.has(docSlug)
      ? state.collapsedGroups.filter((s) => s !== docSlug)
      : [...state.collapsedGroups, docSlug];
    setState({ collapsedGroups: next });
  };

  const setSelection = useCallback(
    (next: CanvasSelection | null) => {
      setState({ selection: next });
    },
    [setState]
  );

  const onCardKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelection(null);
      }
    },
    [setSelection]
  );

  /**
   * Count how many profile slots (across all profiles) currently
   * reference (kind, resourceInstanceId, branchId). >1 means the
   * branch is shared and the C13 guard must intercept the jump.
   */
  const countBranchUsage = useCallback(
    (
      kind: "standard" | "custom",
      resourceInstanceId: string,
      branchId: string
    ): number => {
      if (!disk) return 0;
      let count = 0;
      for (const p of disk.profiles) {
        for (const ref of p.project.resources ?? []) {
          if (ref.kind !== kind) continue;
          if (ref.resource_instance_id !== resourceInstanceId) continue;
          if (profileResourceBranchId(ref) !== branchId) continue;
          count += 1;
        }
      }
      return count;
    },
    [disk]
  );

  /**
   * Execute the actual C21 jump-out: secondary confirmation, exit
   * canvas, open the ResourceBranchView tab. Shared branches go
   * through `onOpenFullEditor` first which routes them through the
   * C13 dialog before invoking this directly.
   */
  const proceedJumpToFullEditor = useCallback(
    (target: {
      resourceKind: "standard" | "custom";
      resourceInstanceId: string;
      branchId: string;
    }) => {
      const ok = window.confirm(
        `切换到「配置档案编辑」并打开 ${target.resourceInstanceId} / ${target.branchId} 的完整编辑器？\n` +
          `画布将退出，UI 状态 (聚焦 / 折叠 / scroll / inspector dock) 已保存，可下次回到画布恢复。`
      );
      if (!ok) return;
      exitCanvasMode();
      openResourceBranch({
        scope: "global",
        resourceId: target.resourceInstanceId,
        resourceKind: target.resourceKind,
        branchId: target.branchId,
        displayName: target.resourceInstanceId
      });
    },
    [exitCanvasMode, openResourceBranch]
  );

  /**
   * C21 jump entry point invoked from the inspector. Wraps the
   * actual jump with the C13 shared-branch guard: if the branch is
   * referenced by more than one profile slot, the dialog opens so
   * the user can either create a profile-local branch or proceed
   * with the global edit.
   */
  const onOpenFullEditor = useCallback(
    (target: {
      resourceKind: "standard" | "custom";
      resourceInstanceId: string;
      branchId: string;
    }) => {
      if (!profile) return;
      const usageCount = countBranchUsage(
        target.resourceKind,
        target.resourceInstanceId,
        target.branchId
      );
      if (usageCount > 1) {
        setSharedGuard({ target, usageCount });
        return;
      }
      proceedJumpToFullEditor(target);
    },
    [profile, countBranchUsage, proceedJumpToFullEditor]
  );

  const onCreateProfileBranchFromGuard = useCallback(async () => {
    if (!profile || !sharedGuard) return;
    const newBranchId = await ca.createProfileBranchFromCurrent(
      profile.id,
      sharedGuard.target.resourceKind,
      sharedGuard.target.resourceInstanceId
    );
    setSharedGuard(null);
    if (!newBranchId) return;
    // No jump — the user wanted to keep editing in canvas. Just
    // selecting the new coverage card on the canvas keeps the UX
    // coherent: future edits target the new branch automatically
    // via the pin transfer that createProfileBranchFromCurrent
    // performed internally.
  }, [profile, sharedGuard, ca]);

  const onJumpFromGuard = useCallback(() => {
    if (!sharedGuard) return;
    const target = sharedGuard.target;
    setSharedGuard(null);
    proceedJumpToFullEditor(target);
  }, [sharedGuard, proceedJumpToFullEditor]);

  // Profile not loaded: render the same minimal apologetic shell as
  // earlier phases so the back button is always reachable.
  if (!profile) {
    return (
      <div className="canvas-view">
        <div className="canvas-view-topbar">
          <button
            type="button"
            className="canvas-view-back-btn"
            onClick={exitCanvasMode}
            title="返回配置档案编辑"
          >
            ← 返回配置档案编辑
          </button>
          <span className="canvas-view-profile-label">画布编辑</span>
        </div>
        <div className="canvas-view-empty-hint">
          {canvasProfileId
            ? `找不到配置档案 ${canvasProfileId}（可能已删除）。`
            : "未指定配置档案。"}
        </div>
      </div>
    );
  }

  const bodyClass = [
    "canvas-view-body",
    `is-dock-${state.inspector.dock}`,
    state.inspector.collapsed ? "is-inspector-collapsed" : "is-inspector-expanded"
  ].join(" ");

  return (
    <div className="canvas-view" onKeyDown={onCardKeyDown} tabIndex={-1}>
      <div className="canvas-view-topbar">
        <button
          type="button"
          className="canvas-view-back-btn"
          onClick={exitCanvasMode}
          title="返回配置档案编辑（C3）"
        >
          ← 返回配置档案编辑
        </button>
        <span className="canvas-view-profile-label" title={profile.id}>
          画布编辑 · {profile.name}
        </span>
        <div className="canvas-view-topbar-actions">
          <button
            type="button"
            className={`canvas-view-action-btn${
              state.coverageFilter ? " is-active" : ""
            }`}
            onClick={() => setState({ coverageFilter: !state.coverageFilter })}
            title="切换未覆盖槽位的显示（C6 默认隐藏）"
          >
            {state.coverageFilter ? "未配置过滤: 开" : "未配置过滤: 关"}
          </button>
          <button
            type="button"
            className={`canvas-view-action-btn${
              state.flowLineVisible ? " is-active" : ""
            }`}
            onClick={() =>
              setState({ flowLineVisible: !state.flowLineVisible })
            }
            title="切换有向流程线的显示（C23 默认显示）"
          >
            {state.flowLineVisible ? "流程线: 开" : "流程线: 关"}
          </button>
          <button
            type="button"
            className="canvas-view-action-btn"
            onClick={() => setBatchOpen(true)}
            title="批量调整每个 chain node 的实现函数（C24c）"
          >
            批量候选
          </button>
          <button
            type="button"
            className="canvas-view-action-btn is-placeholder"
            disabled
            title="Phase 5: 新建自定义节点"
          >
            + 自定义节点
          </button>
        </div>
      </div>

      <div className={bodyClass}>
        <div
          className="canvas-view-main"
          onClick={(e) => {
            // Click on empty canvas background = clear selection. Only
            // fires when the click didn't land on (or bubble from) a
            // card; cards stop propagation in their own handlers.
            if (e.target === e.currentTarget) setSelection(null);
          }}
        >
          {!loaded ? (
            <div className="canvas-view-empty-hint">读取画布状态…</div>
          ) : (
            <CanvasBody
              projection={projection}
              flowLineVisible={state.flowLineVisible}
              collapsedGroups={collapsedGroupSet}
              onToggleGroup={toggleGroup}
              selection={state.selection}
              onSelectionChange={setSelection}
              onCardContextMenu={(e, items) => cm.open(e, items)}
              profileId={profile.id}
            />
          )}
        </div>
        <CanvasInspector
          profile={profile}
          projection={projection}
          selection={state.selection}
          collapsed={state.inspector.collapsed}
          dock={state.inspector.dock}
          onSelectionChange={setSelection}
          onToggleCollapsed={() =>
            setState({
              inspector: { ...state.inspector, collapsed: !state.inspector.collapsed }
            })
          }
          onToggleDock={() =>
            setState({
              inspector: {
                ...state.inspector,
                dock: state.inspector.dock === "right" ? "bottom" : "right"
              }
            })
          }
          onOpenFullEditor={onOpenFullEditor}
        />
      </div>

      {cm.state && (
        <ContextMenu
          x={cm.state.x}
          y={cm.state.y}
          items={cm.state.items}
          onClose={cm.close}
        />
      )}

      <CanvasBatchCandidatePanel
        profile={profile}
        open={batchOpen}
        onClose={() => setBatchOpen(false)}
      />

      <CanvasSharedBranchDialog
        open={!!sharedGuard}
        usageCount={sharedGuard?.usageCount ?? 0}
        resourceInstanceId={sharedGuard?.target.resourceInstanceId ?? ""}
        branchId={sharedGuard?.target.branchId ?? ""}
        onCreateProfileBranch={() => void onCreateProfileBranchFromGuard()}
        onJumpToGlobalEditor={onJumpFromGuard}
        onCancel={() => setSharedGuard(null)}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Body: group panels
// ──────────────────────────────────────────────────────────────────

interface CanvasBodyProps {
  projection: ReturnType<typeof buildCanvasProjection> | null;
  flowLineVisible: boolean;
  collapsedGroups: Set<string>;
  onToggleGroup: (docSlug: string) => void;
  selection: CanvasSelection | null;
  onSelectionChange: (next: CanvasSelection | null) => void;
  onCardContextMenu: (event: React.MouseEvent, items: ContextMenuItem[]) => void;
  profileId: string;
}

function CanvasBody({
  projection,
  flowLineVisible,
  collapsedGroups,
  onToggleGroup,
  selection,
  onSelectionChange,
  onCardContextMenu,
  profileId
}: CanvasBodyProps) {
  if (!projection) {
    return <div className="canvas-view-empty-hint">尚无可用数据。</div>;
  }

  const allGroups: CanvasGroup[] = projection.customOnly
    ? [...projection.groups, projection.customOnly]
    : projection.groups;

  const visibleGroups = allGroups.filter((g) => g.allNodes.length > 0);

  if (visibleGroups.length === 0) {
    return (
      <div className="canvas-view-empty-hint">
        此档案目前没有可显示的链路节点。<br />
        Phase 3 起可以在左侧库中 pin 标准资源以覆盖槽位，或拖入自定义节点。
      </div>
    );
  }

  return (
    <div className="canvas-groups">
      {visibleGroups.map((group) => (
        <GroupPanel
          key={group.docSlug}
          group={group}
          collapsed={collapsedGroups.has(group.docSlug)}
          flowLineVisible={flowLineVisible}
          onToggle={() => onToggleGroup(group.docSlug)}
          selection={selection}
          onSelectionChange={onSelectionChange}
          onCardContextMenu={onCardContextMenu}
          profileId={profileId}
        />
      ))}
    </div>
  );
}

function GroupPanel({
  group,
  collapsed,
  flowLineVisible,
  onToggle,
  selection,
  onSelectionChange,
  onCardContextMenu,
  profileId
}: {
  group: CanvasGroup;
  collapsed: boolean;
  flowLineVisible: boolean;
  onToggle: () => void;
  selection: CanvasSelection | null;
  onSelectionChange: (next: CanvasSelection | null) => void;
  onCardContextMenu: (event: React.MouseEvent, items: ContextMenuItem[]) => void;
  profileId: string;
}) {
  return (
    <section
      className={`canvas-group${group.isCustomOnly ? " is-custom-only" : ""}`}
    >
      <button
        type="button"
        className="canvas-group-header"
        onClick={onToggle}
        title={group.docSlug}
      >
        <span
          className={`codicon canvas-group-chevron codicon-${
            collapsed ? "chevron-right" : "chevron-down"
          }`}
          aria-hidden="true"
        />
        <span className="canvas-group-title">{group.docTitle}</span>
        {!group.isCustomOnly && (
          <span className="canvas-group-counts">
            覆盖 {group.coveredSlotCount} / {group.totalSlotCount}
            {group.hiddenSlotCount > 0 && (
              <> · 隐藏 {group.hiddenSlotCount}</>
            )}
          </span>
        )}
      </button>
      {!collapsed && (
        <div className="canvas-group-track">
          <FlowTrack
            nodes={group.visibleNodes}
            flowLineVisible={flowLineVisible}
            selection={selection}
            onSelectionChange={onSelectionChange}
            onCardContextMenu={onCardContextMenu}
            profileId={profileId}
          />
        </div>
      )}
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────
// Flow track: nodes + edges
// ──────────────────────────────────────────────────────────────────

function FlowTrack({
  nodes,
  flowLineVisible,
  selection,
  onSelectionChange,
  onCardContextMenu,
  profileId
}: {
  nodes: CanvasNode[];
  flowLineVisible: boolean;
  selection: CanvasSelection | null;
  onSelectionChange: (next: CanvasSelection | null) => void;
  onCardContextMenu: (event: React.MouseEvent, items: ContextMenuItem[]) => void;
  profileId: string;
}) {
  const ca = useCa();
  const [dragOverEdgeIdx, setDragOverEdgeIdx] = useState<number | null>(null);

  if (nodes.length === 0) {
    return <div className="canvas-flow-empty">（空）</div>;
  }

  /**
   * Resolve the drop position from an "edge index" — the edge BETWEEN
   * nodes[idx-1] and nodes[idx]. The anchor is the chain id of the
   * first slot at or after nodes[idx] (or null when there's no
   * trailing slot in this group). The before-custom hint is set when
   * nodes[idx] is a custom in the same anchor bucket — preserves
   * precise within-bucket positioning for reorder.
   */
  const positionForEdge = (
    edgeIdx: number
  ): {
    anchorChainId: string | null;
    beforeCustomArrayIndex?: number;
  } => {
    let anchorChainId: string | null = null;
    for (let i = edgeIdx; i < nodes.length; i++) {
      const n = nodes[i]!;
      if (n.kind === "slot") {
        anchorChainId = n.nodeId;
        break;
      }
      if (n.kind === "custom" && n.anchorChainId) {
        anchorChainId = n.anchorChainId;
        break;
      }
    }
    const nextNode = nodes[edgeIdx];
    if (nextNode?.kind === "custom") {
      return {
        anchorChainId,
        beforeCustomArrayIndex: nextNode.arrayIndex
      };
    }
    return { anchorChainId };
  };

  const onEdgeDragOver = (edgeIdx: number) => (e: React.DragEvent) => {
    if (!canvasDragState.value) return;
    e.preventDefault();
    e.dataTransfer.dropEffect =
      canvasDragState.value.kind === "library-custom-node" ? "copy" : "move";
    setDragOverEdgeIdx(edgeIdx);
  };
  const onEdgeDragLeave = () => {
    setDragOverEdgeIdx((cur) => (cur != null ? null : cur));
  };
  const onEdgeDrop = (edgeIdx: number) => async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverEdgeIdx(null);
    const payload = canvasDragState.value;
    canvasDragState.value = null;
    if (!payload) return;
    const position = positionForEdge(edgeIdx);
    const anchor = position.anchorChainId
      ? ({
          kind: "builtin_core_chain" as const,
          chain_id: position.anchorChainId
        })
      : null;
    if (payload.kind === "library-custom-node") {
      // Auto-pin (no-op if already pinned) then append the new
      // usage to the target anchor's bucket. Precise within-bucket
      // positioning is a Phase 4+ follow-up.
      const pinned = await ca.pinBranch(
        profileId,
        "custom",
        payload.resourceInstanceId,
        payload.branchId
      );
      if (!pinned) return;
      await ca.addCustomUsage(
        profileId,
        payload.resourceInstanceId,
        payload.nodeId,
        anchor
      );
      return;
    }
    // canvas-custom: re-anchor / reorder.
    await ca.moveCustomUsage(profileId, payload.arrayIndex, {
      anchorChainId: position.anchorChainId,
      beforeCustomArrayIndex: position.beforeCustomArrayIndex
    });
  };

  return (
    <div className="canvas-flow-track">
      {nodes.map((node, idx) => {
        const prev = idx > 0 ? nodes[idx - 1] : null;
        const edgeDashed = !!prev && (isDisabledCustom(prev) || isDisabledCustom(node));
        const isDragOver = dragOverEdgeIdx === idx;
        return (
          <Fragment key={canvasNodeKey(node, idx)}>
            {prev && (
              <span
                className={`canvas-edge${edgeDashed ? " is-dashed" : ""}${
                  isDragOver ? " is-drop-over" : ""
                }${!flowLineVisible && !isDragOver ? " is-line-hidden" : ""}`}
                aria-hidden="true"
                onDragOver={onEdgeDragOver(idx)}
                onDragLeave={onEdgeDragLeave}
                onDrop={onEdgeDrop(idx)}
              >
                {flowLineVisible || isDragOver ? "══►" : ""}
              </span>
            )}
            {node.kind === "slot" ? (
              <SlotCard
                node={node}
                selection={selection}
                onSelectionChange={onSelectionChange}
                onCardContextMenu={onCardContextMenu}
                profileId={profileId}
              />
            ) : (
              <CustomCard
                node={node}
                selection={selection}
                onSelectionChange={onSelectionChange}
                onCardContextMenu={onCardContextMenu}
                profileId={profileId}
              />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

function isDisabledCustom(node: CanvasNode): boolean {
  return node.kind === "custom" && !node.enabled;
}

function canvasNodeKey(node: CanvasNode, idx: number): string {
  if (node.kind === "slot") return `slot:${node.nodeId}`;
  return `cus:${node.arrayIndex}:${idx}`;
}

// ──────────────────────────────────────────────────────────────────
// Slot card (with stacked standard coverage cards)
// ──────────────────────────────────────────────────────────────────

function SlotCard({
  node,
  selection,
  onSelectionChange,
  onCardContextMenu,
  profileId
}: {
  node: CanvasSlotNode;
  selection: CanvasSelection | null;
  onSelectionChange: (next: CanvasSelection | null) => void;
  onCardContextMenu: (e: React.MouseEvent, items: ContextMenuItem[]) => void;
  profileId: string;
}) {
  const ca = useCa();
  const cov = node.coverage;
  const STACK_LIMIT = 3;
  const [overflowOpen, setOverflowOpen] = useState(false);
  const visible = overflowOpen
    ? cov.resources
    : cov.resources.slice(0, STACK_LIMIT);
  const overflow = cov.resources.length - visible.length;
  const slotSelected =
    selection?.kind === "slot" && selection.chainNodeId === node.nodeId;
  const slotClass = [
    "canvas-slot",
    cov.count === 0 ? "is-uncovered" : "",
    cov.count > 1 ? "is-multi" : "",
    slotSelected ? "is-selected" : ""
  ]
    .filter(Boolean)
    .join(" ");

  const onSlotClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectionChange({ kind: "slot", chainNodeId: node.nodeId });
  };

  return (
    <div className={slotClass} title={`${node.nodeId} · order ${node.order}`}>
      <header
        className="canvas-slot-header"
        onClick={onSlotClick}
        role="button"
        tabIndex={0}
      >
        <span className="canvas-slot-order">{node.order}</span>
        <span className="canvas-slot-name">{node.displayName}</span>
      </header>
      <div className="canvas-slot-cards">
        {cov.count === 0 ? (
          <div className="canvas-slot-empty">未覆盖</div>
        ) : (
          <>
            {visible.map((r, idx) => {
              const coverageSelected =
                selection?.kind === "coverage" &&
                selection.chainNodeId === node.nodeId &&
                selection.resourceInstanceId === r.resourceId &&
                selection.variantId === r.variantId;
              const onCoverageClick = (e: React.MouseEvent) => {
                e.stopPropagation();
                onSelectionChange({
                  kind: "coverage",
                  chainNodeId: node.nodeId,
                  resourceInstanceId: r.resourceId,
                  variantId: r.variantId
                });
              };
              const onCoverageContextMenu = (e: React.MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                onCardContextMenu(e, [
                  {
                    id: "deactivate",
                    label: "停用此覆盖",
                    run: () =>
                      void ca.setProfileResourceEnabled(
                        profileId,
                        {
                          id: `canvas::${r.resourceId}`,
                          label: r.displayName,
                          kind: "standard",
                          source: "binding",
                          resourceId: r.resourceId,
                          branchId: r.variantId,
                          enabled: true
                        },
                        false
                      )
                  },
                  { separator: true },
                  {
                    id: "remove",
                    label: "从档案中移除",
                    run: () =>
                      void ca.unpinFamily(profileId, "standard", r.resourceId)
                  }
                ]);
              };
              return (
                <div
                  key={`${r.resourceId}:${r.variantId}:${idx}`}
                  className={`canvas-coverage-card${
                    coverageSelected ? " is-selected" : ""
                  }`}
                  title={`${r.resourceId} · ${r.variantId}`}
                  onClick={onCoverageClick}
                  onContextMenu={onCoverageContextMenu}
                  role="button"
                  tabIndex={0}
                >
                  <span className="canvas-coverage-marker" aria-hidden="true">
                    ⊞
                  </span>
                  <span className="canvas-coverage-label">
                    {r.displayName}
                    <span className="canvas-coverage-branch"> · {r.variantId}</span>
                  </span>
                </div>
              );
            })}
            {overflow > 0 && (
              <button
                type="button"
                className="canvas-coverage-overflow"
                onClick={(e) => {
                  e.stopPropagation();
                  setOverflowOpen(true);
                }}
                title={cov.resources
                  .slice(STACK_LIMIT)
                  .map((r) => `${r.displayName} · ${r.variantId}`)
                  .join("\n")}
              >
                +{overflow}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Custom node card (lives between slots on the flow line)
// ──────────────────────────────────────────────────────────────────

function CustomCard({
  node,
  selection,
  onSelectionChange,
  onCardContextMenu,
  profileId
}: {
  node: CanvasCustomNode;
  selection: CanvasSelection | null;
  onSelectionChange: (next: CanvasSelection | null) => void;
  onCardContextMenu: (e: React.MouseEvent, items: ContextMenuItem[]) => void;
  profileId: string;
}) {
  const ca = useCa();
  const isSelected =
    selection?.kind === "custom" && selection.usageArrayIndex === node.arrayIndex;
  const cls = [
    "canvas-custom",
    node.enabled ? "is-enabled" : "is-disabled",
    isSelected ? "is-selected" : ""
  ]
    .filter(Boolean)
    .join(" ");
  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectionChange({
      kind: "custom",
      usageArrayIndex: node.arrayIndex
    });
  };
  const onDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    canvasDragState.value = {
      kind: "canvas-custom",
      arrayIndex: node.arrayIndex
    };
    e.dataTransfer.effectAllowed = "move";
    try {
      e.dataTransfer.setData(
        "application/x-tinder-canvas-custom",
        String(node.arrayIndex)
      );
    } catch {
      /* ignore */
    }
  };
  const onDragEnd = () => {
    canvasDragState.value = null;
  };
  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onCardContextMenu(e, [
      node.enabled
        ? {
            id: "deactivate",
            label: "停用",
            run: () =>
              void ca.setCustomUsageEnabled(profileId, node.arrayIndex, false)
          }
        : {
            id: "activate",
            label: "激活",
            run: () =>
              void ca.setCustomUsageEnabled(profileId, node.arrayIndex, true)
          },
      { separator: true },
      {
        id: "remove",
        label: "移出链路",
        run: () => void ca.removeCustomUsage(profileId, node.arrayIndex)
      }
    ]);
  };
  return (
    <div
      className={cls}
      onClick={onClick}
      onContextMenu={onContextMenu}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      role="button"
      tabIndex={0}
      title={
        node.enabled
          ? `${node.resourceDisplayName ?? ""} / ${node.usage.node_id} · 拖动以重新定位`
          : `${node.resourceDisplayName ?? ""} / ${node.usage.node_id} · 停用`
      }
    >
      <span className="canvas-custom-marker" aria-hidden="true">
        ⌬
      </span>
      <span className="canvas-custom-label">{node.displayName}</span>
      {node.branchId && (
        <span className="canvas-custom-branch">· {node.branchId}</span>
      )}
    </div>
  );
}
