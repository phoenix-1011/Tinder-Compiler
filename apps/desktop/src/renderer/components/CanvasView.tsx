import { Fragment, useMemo } from "react";
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
import { useCanvasPersistedState } from "../state/canvasState";

/**
 * Phase 2 read-only canvas.
 *
 * Replaces the Phase 1 stub with:
 * - working coverage filter (C6) + flow-line toggle (C23) backed by
 *   `.tinder/state/canvas.json` (C15)
 * - collapsible group panels by CHAIN_CATALOG.groups (C5)
 * - slot cards stacking standard coverage cards (C7)
 * - custom nodes between slots (C22) with disabled-state muting + the
 *   dashed grey adjacent-edge treatment (C17)
 *
 * Interactivity (pin, drag, candidate selection, inspector) is still
 * absent — Phase 3 / Phase 4 wire those in. Per C1 this view is a
 * pure projection of profile JSON.
 */
export function CanvasView() {
  const { canvasProfileId, exitCanvasMode } = useWorkspace();
  const { disk } = useCa();

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

  // Profile not loaded: render the same minimal apologetic shell as
  // Phase 1 so the back button is always reachable.
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

  return (
    <div className="canvas-view">
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
            className="canvas-view-action-btn is-placeholder"
            disabled
            title="Phase 4: 批量候选面板"
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

      <div className="canvas-view-body">
        <div className="canvas-view-main">
          {!loaded ? (
            <div className="canvas-view-empty-hint">读取画布状态…</div>
          ) : (
            <CanvasBody
              projection={projection}
              flowLineVisible={state.flowLineVisible}
              collapsedGroups={collapsedGroupSet}
              onToggleGroup={toggleGroup}
            />
          )}
        </div>
        <aside className="canvas-view-inspector-rail" aria-label="Inspector（折叠）">
          <span className="canvas-view-inspector-rail-icon" aria-hidden="true">
            ⟩
          </span>
        </aside>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Body: group panels
// ──────────────────────────────────────────────────────────────────

function CanvasBody({
  projection,
  flowLineVisible,
  collapsedGroups,
  onToggleGroup
}: {
  projection: ReturnType<typeof buildCanvasProjection> | null;
  flowLineVisible: boolean;
  collapsedGroups: Set<string>;
  onToggleGroup: (docSlug: string) => void;
}) {
  if (!projection) {
    return <div className="canvas-view-empty-hint">尚无可用数据。</div>;
  }

  const allGroups: CanvasGroup[] = projection.customOnly
    ? [...projection.groups, projection.customOnly]
    : projection.groups;

  // Hide entirely-empty groups outright. The user has no reason to
  // see a group panel with zero nodes (no slots and no customs); the
  // coverage filter has already trimmed uncovered slots, and a group
  // can be empty either because its chain has no covered/anchored
  // content in this profile, or (rare) the catalog defines a slug
  // with no nodes at all.
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
        />
      ))}
    </div>
  );
}

function GroupPanel({
  group,
  collapsed,
  flowLineVisible,
  onToggle
}: {
  group: CanvasGroup;
  collapsed: boolean;
  flowLineVisible: boolean;
  onToggle: () => void;
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
          />
        </div>
      )}
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────
// Flow track: nodes + edges
// ──────────────────────────────────────────────────────────────────

/**
 * Phase 2 renders the flow line as inline DOM edges between nodes
 * rather than an SVG overlay. Tradeoffs:
 * - Simpler hit-testing in Phase 4 (drop targets are real DOM elements)
 * - Wrapping behaviour comes for free from CSS flex-wrap
 * - When the track wraps to a new row, the leading edge of the wrapped
 *   row visually "disappears" — accepted as a Phase 2 limitation;
 *   future visual polish can stamp continuation arrows at row ends
 *
 * Edges adjacent to a disabled custom (either side) render dashed
 * grey per C17.
 */
function FlowTrack({
  nodes,
  flowLineVisible
}: {
  nodes: CanvasNode[];
  flowLineVisible: boolean;
}) {
  if (nodes.length === 0) {
    return <div className="canvas-flow-empty">（空）</div>;
  }
  return (
    <div className="canvas-flow-track">
      {nodes.map((node, idx) => {
        const prev = idx > 0 ? nodes[idx - 1] : null;
        const edgeDashed = !!prev && (isDisabledCustom(prev) || isDisabledCustom(node));
        return (
          <Fragment key={canvasNodeKey(node, idx)}>
            {prev && flowLineVisible && (
              <span
                className={`canvas-edge${edgeDashed ? " is-dashed" : ""}`}
                aria-hidden="true"
              >
                ══►
              </span>
            )}
            {prev && !flowLineVisible && (
              <span className="canvas-edge-spacer" aria-hidden="true" />
            )}
            {node.kind === "slot" ? (
              <SlotCard node={node} />
            ) : (
              <CustomCard node={node} />
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

function SlotCard({ node }: { node: CanvasSlotNode }) {
  const cov = node.coverage;
  const STACK_LIMIT = 3;
  const visible = cov.resources.slice(0, STACK_LIMIT);
  const overflow = cov.resources.length - visible.length;
  const slotClass = [
    "canvas-slot",
    cov.count === 0 ? "is-uncovered" : "",
    cov.count > 1 ? "is-multi" : ""
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={slotClass} title={`${node.nodeId} · order ${node.order}`}>
      <header className="canvas-slot-header">
        <span className="canvas-slot-order">{node.order}</span>
        <span className="canvas-slot-name">{node.displayName}</span>
      </header>
      <div className="canvas-slot-cards">
        {cov.count === 0 ? (
          <div className="canvas-slot-empty">未覆盖</div>
        ) : (
          <>
            {visible.map((r, idx) => (
              <div
                key={`${r.resourceId}:${r.variantId}:${idx}`}
                className="canvas-coverage-card"
                title={`${r.resourceId} · ${r.variantId}`}
              >
                <span className="canvas-coverage-marker" aria-hidden="true">
                  ⊞
                </span>
                <span className="canvas-coverage-label">
                  {r.displayName}
                  <span className="canvas-coverage-branch"> · {r.variantId}</span>
                </span>
              </div>
            ))}
            {overflow > 0 && (
              <div
                className="canvas-coverage-overflow"
                title={cov.resources
                  .slice(STACK_LIMIT)
                  .map((r) => `${r.displayName} · ${r.variantId}`)
                  .join("\n")}
              >
                +{overflow}
              </div>
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

function CustomCard({ node }: { node: CanvasCustomNode }) {
  const cls = [
    "canvas-custom",
    node.enabled ? "is-enabled" : "is-disabled"
  ].join(" ");
  return (
    <div
      className={cls}
      title={
        node.enabled
          ? `${node.resourceDisplayName ?? ""} / ${node.usage.node_id}`
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
