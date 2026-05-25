import { useMemo } from "react";
import type { ProfileEntry } from "../state/chainAssemblyStorage";
import type { CanvasSelection } from "../state/canvasState";
import type {
  CanvasCustomNode,
  CanvasNode,
  CanvasProjection,
  CanvasSlotNode
} from "../state/canvasProjection";
import { useCa } from "../state/ChainAssemblyContext";

/**
 * Canvas-mode inspector panel (Phase 3).
 *
 * - Dockable: parent CanvasView sets `dock-right` / `dock-bottom` via
 *   layout; this component renders the panel contents only.
 * - Collapsible: when `collapsed`, renders the narrow rail with the
 *   expand chevron and dock toggle.
 * - Content router by selection kind:
 *     slot     → chain node metadata + covering resources + per-row
 *                candidate (实现函数) dropdown — C24c single-slot variant
 *     coverage → skinny branch metadata + open-in-tab link (C21 jump)
 *     custom   → usage details + enable toggle + open-in-tab link
 *     null     → profile overview (counts + branch issues placeholder)
 *
 * Per C12 the inspector embeds ResourceBranchView content for
 * coverage / custom selections. Phase 3 uses a **skinny embed** —
 * key fields + open-in-full-tab link — instead of a literal embedded
 * ResourceBranchView; the full embed is a Phase 3 follow-up that
 * requires extracting a headerless mode from ResourceBranchView.
 */
interface CanvasInspectorProps {
  profile: ProfileEntry;
  projection: CanvasProjection | null;
  selection: CanvasSelection | null;
  collapsed: boolean;
  dock: "right" | "bottom";
  /** Selection setter — passed through to clear + edit actions. */
  onSelectionChange: (next: CanvasSelection | null) => void;
  onToggleCollapsed: () => void;
  onToggleDock: () => void;
  /** Triggers C21 jump (exit canvas + open ResourceBranchView tab). */
  onOpenFullEditor: (target: {
    resourceKind: "standard" | "custom";
    resourceInstanceId: string;
    branchId: string;
  }) => void;
}

export function CanvasInspector(props: CanvasInspectorProps) {
  if (props.collapsed) {
    return (
      <aside
        className={`canvas-inspector is-collapsed is-dock-${props.dock}`}
        aria-label="Inspector（折叠）"
      >
        <button
          type="button"
          className="canvas-inspector-rail-btn"
          onClick={props.onToggleCollapsed}
          title="展开 Inspector"
        >
          {props.dock === "right" ? "⟨" : "⌃"}
        </button>
      </aside>
    );
  }
  return (
    <aside
      className={`canvas-inspector is-expanded is-dock-${props.dock}`}
      aria-label="Inspector"
    >
      <header className="canvas-inspector-header">
        <span className="canvas-inspector-title">{titleForSelection(props.selection)}</span>
        <div className="canvas-inspector-header-actions">
          <button
            type="button"
            className="canvas-inspector-icon-btn"
            onClick={props.onToggleDock}
            title={
              props.dock === "right"
                ? "切换到底部 dock"
                : "切换到右侧 dock"
            }
          >
            {props.dock === "right" ? "⤓" : "⤖"}
          </button>
          <button
            type="button"
            className="canvas-inspector-icon-btn"
            onClick={props.onToggleCollapsed}
            title="折叠 Inspector"
          >
            ×
          </button>
        </div>
      </header>
      <div className="canvas-inspector-body">
        <InspectorBody
          profile={props.profile}
          projection={props.projection}
          selection={props.selection}
          onSelectionChange={props.onSelectionChange}
          onOpenFullEditor={props.onOpenFullEditor}
        />
      </div>
    </aside>
  );
}

function titleForSelection(selection: CanvasSelection | null): string {
  if (!selection) return "档案概览";
  if (selection.kind === "slot") return "链路节点";
  if (selection.kind === "coverage") return "覆盖（计算资源 / 分支）";
  return "自定义节点放置";
}

// ──────────────────────────────────────────────────────────────────
// Body router
// ──────────────────────────────────────────────────────────────────

function InspectorBody({
  profile,
  projection,
  selection,
  onSelectionChange,
  onOpenFullEditor
}: {
  profile: ProfileEntry;
  projection: CanvasProjection | null;
  selection: CanvasSelection | null;
  onSelectionChange: (next: CanvasSelection | null) => void;
  onOpenFullEditor: CanvasInspectorProps["onOpenFullEditor"];
}) {
  if (!selection) {
    return <ProfileOverviewInspector profile={profile} projection={projection} />;
  }
  // Resolve the selected node (slot or custom) by walking the
  // projection. Coverage selection refers to a slot + a specific
  // covering resource on it; the SlotInspector resolves the inner
  // coverage card for the "coverage" kind path.
  const node = projection ? findNodeBySelection(projection, selection) : null;

  if (selection.kind === "slot" || selection.kind === "coverage") {
    const slotNode =
      node?.kind === "slot"
        ? node
        : projection
          ? findSlotByChainNodeId(projection, selectionChainNodeId(selection))
          : null;
    if (!slotNode) {
      return (
        <p className="canvas-inspector-hint">
          所选槽位已不在当前画布中（可能被 coverage filter 隐藏，或档案已变更）。
          <ClearSelectionLink onSelectionChange={onSelectionChange} />
        </p>
      );
    }
    return (
      <SlotInspector
        profile={profile}
        slot={slotNode}
        selection={selection}
        onSelectionChange={onSelectionChange}
        onOpenFullEditor={onOpenFullEditor}
      />
    );
  }

  if (selection.kind === "custom") {
    const customNode = node?.kind === "custom" ? node : null;
    if (!customNode) {
      return (
        <p className="canvas-inspector-hint">
          所选自定义节点不存在（可能已删除）。
          <ClearSelectionLink onSelectionChange={onSelectionChange} />
        </p>
      );
    }
    return (
      <CustomInspector
        profile={profile}
        node={customNode}
        onOpenFullEditor={onOpenFullEditor}
      />
    );
  }

  return null;
}

function ClearSelectionLink({
  onSelectionChange
}: {
  onSelectionChange: (next: CanvasSelection | null) => void;
}) {
  return (
    <button
      type="button"
      className="canvas-inspector-link-btn"
      onClick={() => onSelectionChange(null)}
    >
      清除选中
    </button>
  );
}

function selectionChainNodeId(selection: CanvasSelection): string {
  if (selection.kind === "slot") return selection.chainNodeId;
  if (selection.kind === "coverage") return selection.chainNodeId;
  return "";
}

// ──────────────────────────────────────────────────────────────────
// Empty selection — profile overview
// ──────────────────────────────────────────────────────────────────

function ProfileOverviewInspector({
  profile,
  projection
}: {
  profile: ProfileEntry;
  projection: CanvasProjection | null;
}) {
  const stats = useMemo(() => {
    if (!projection) return null;
    let covered = 0;
    let total = 0;
    let customs = 0;
    let disabledCustoms = 0;
    for (const g of projection.groups) {
      covered += g.coveredSlotCount;
      total += g.totalSlotCount;
    }
    const allNodes: CanvasNode[] = projection.groups.flatMap((g) => g.allNodes);
    const tailNodes: CanvasNode[] = projection.customOnly?.allNodes ?? [];
    for (const n of [...allNodes, ...tailNodes]) {
      if (n.kind !== "custom") continue;
      customs += 1;
      if (!n.enabled) disabledCustoms += 1;
    }
    return { covered, total, customs, disabledCustoms };
  }, [projection]);

  return (
    <div className="canvas-inspector-overview">
      <div className="canvas-inspector-section-title">{profile.name}</div>
      <div className="canvas-inspector-kv">
        <span>档案路径</span>
        <code>{profile.id}</code>
      </div>
      {stats && (
        <>
          <div className="canvas-inspector-kv">
            <span>覆盖节点</span>
            <span>{stats.covered} / {stats.total}</span>
          </div>
          <div className="canvas-inspector-kv">
            <span>自定义放置</span>
            <span>
              {stats.customs}
              {stats.disabledCustoms > 0 && (
                <> · 停用 {stats.disabledCustoms}</>
              )}
            </span>
          </div>
        </>
      )}
      <p className="canvas-inspector-hint">
        点击画布上的槽位 / 覆盖卡片 / 自定义节点以查看详情。
      </p>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Slot / coverage inspector
// ──────────────────────────────────────────────────────────────────

function SlotInspector({
  profile,
  slot,
  selection,
  onSelectionChange,
  onOpenFullEditor
}: {
  profile: ProfileEntry;
  slot: CanvasSlotNode;
  selection: CanvasSelection;
  onSelectionChange: (next: CanvasSelection | null) => void;
  onOpenFullEditor: CanvasInspectorProps["onOpenFullEditor"];
}) {
  const ca = useCa();

  // The "coverage" selection variant pre-targets a specific covering
  // resource on this slot. When selected, scroll the matching row to
  // the top via CSS (.is-active in this list).
  const activeCoverageKey =
    selection.kind === "coverage"
      ? `${selection.resourceInstanceId}::${selection.variantId}`
      : null;

  return (
    <div className="canvas-inspector-slot">
      <div className="canvas-inspector-section-title">
        {slot.displayName}
      </div>
      <div className="canvas-inspector-kv">
        <span>chain node id</span>
        <code>{slot.nodeId}</code>
      </div>
      <div className="canvas-inspector-kv">
        <span>执行顺序</span>
        <span>{slot.order}</span>
      </div>
      <div className="canvas-inspector-kv">
        <span>所属分类</span>
        <span>{slot.docTitle}</span>
      </div>
      <div className="canvas-inspector-divider" />
      <div className="canvas-inspector-section-title">
        覆盖资源（{slot.coverage.count}）
      </div>
      {slot.coverage.count === 0 ? (
        <p className="canvas-inspector-hint">
          此槽位当前未被任何标准资源覆盖。在左侧库中 pin 一个覆盖此 chain node 的分支以激活。
        </p>
      ) : (
        <div className="canvas-inspector-coverage-list">
          {slot.coverage.resources.map((r, idx) => {
            const key = `${r.resourceId}::${r.variantId}::${idx}`;
            const active = `${r.resourceId}::${r.variantId}` === activeCoverageKey;
            return (
              <div
                key={key}
                className={`canvas-inspector-coverage-row${
                  active ? " is-active" : ""
                }`}
              >
                <button
                  type="button"
                  className="canvas-inspector-link-btn"
                  onClick={() =>
                    onSelectionChange({
                      kind: "coverage",
                      chainNodeId: slot.nodeId,
                      resourceInstanceId: r.resourceId,
                      variantId: r.variantId
                    })
                  }
                  title="选中此覆盖"
                >
                  {r.displayName}
                </button>
                <span className="canvas-inspector-coverage-branch">
                  · {r.variantId}
                </span>
                <CandidateDropdown
                  profile={profile}
                  resourceInstanceId={r.resourceId}
                  variantId={r.variantId}
                  chainNodeId={slot.nodeId}
                />
                <button
                  type="button"
                  className="canvas-inspector-icon-btn"
                  title="在新 tab 中打开完整编辑（C21 跳出）"
                  onClick={() =>
                    onOpenFullEditor({
                      resourceKind: "standard",
                      resourceInstanceId: r.resourceId,
                      branchId: r.variantId
                    })
                  }
                >
                  ↗
                </button>
                <button
                  type="button"
                  className="canvas-inspector-icon-btn"
                  title="停用此覆盖（C24b）"
                  onClick={() =>
                    void ca.setProfileResourceEnabled(
                      profile.id,
                      {
                        id: `inspector::${r.resourceId}`,
                        label: r.displayName,
                        kind: "standard",
                        source: "binding",
                        resourceId: r.resourceId,
                        branchId: r.variantId,
                        enabled: true
                      },
                      false
                    )
                  }
                >
                  ⊘
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Per-chain-node candidate (`实现函数`) dropdown (C24c single-slot
 * variant). Reads `effective_candidates[nodeId]` from the covering
 * standard branch (or profile-level override) and writes through
 * `setProfileStandardEffectiveCandidate`.
 */
function CandidateDropdown({
  profile,
  resourceInstanceId,
  variantId,
  chainNodeId
}: {
  profile: ProfileEntry;
  resourceInstanceId: string;
  variantId: string;
  chainNodeId: string;
}) {
  const ca = useCa();
  const { disk } = ca;

  // Resolve candidates declared by the covering branch's
  // compute_nodes filtered to this chain node. Without v2 family
  // data we can't surface candidates — render a disabled select with
  // a note.
  const data = useMemo(() => {
    if (!disk) return null;
    const family = disk.resourceIndex.familyByKey.get(
      `standard:${resourceInstanceId}`
    );
    const branch = family?.branches.find(
      (b) => b.branch.branch_id === variantId
    );
    if (!branch || branch.branch.resource_kind !== "standard") return null;
    const standardBranch = branch.branch;
    const candidates = standardBranch.compute_nodes.filter(
      (c) => c.node_id === chainNodeId
    );
    if (candidates.length === 0) return null;
    return {
      candidates,
      defaultCandidateId:
        standardBranch.effective_candidates?.[chainNodeId] ?? candidates[0]?.candidate_id ?? null
    };
  }, [disk, resourceInstanceId, variantId, chainNodeId]);

  // Profile-level override (overrides.effective_candidates) wins over
  // branch defaults for this slot. `undefined` falls back to default,
  // `null` explicitly disables; we surface the active selection.
  const profileOverride = useMemo(() => {
    const ref = (profile.project.resources ?? []).find(
      (r) =>
        r.kind === "standard" && r.resource_instance_id === resourceInstanceId
    );
    if (!ref || ref.kind !== "standard") return undefined;
    return ref.overrides?.effective_candidates?.[chainNodeId];
  }, [profile, resourceInstanceId, chainNodeId]);

  if (!data) {
    return (
      <span
        className="canvas-inspector-candidate-na"
        title="此分支未为该 chain node 声明候选实现"
      >
        —
      </span>
    );
  }

  const selectedId =
    profileOverride === undefined ? data.defaultCandidateId : profileOverride;

  const onChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value;
    const candidateId = next === "__default__" ? undefined : next;
    void ca.setProfileStandardEffectiveCandidate(
      profile.id,
      resourceInstanceId,
      chainNodeId,
      candidateId ?? null
    );
  };

  return (
    <select
      className="canvas-inspector-candidate-select"
      value={selectedId ?? "__default__"}
      onChange={onChange}
      title="切换实现函数（C24c 单点变体）"
    >
      <option value="__default__">
        默认（{shortLabel(data.defaultCandidateId)}）
      </option>
      {data.candidates.map((c, idx) => {
        const id = c.candidate_id ?? `${chainNodeId}#${idx}`;
        const label = c.display_name || id;
        return (
          <option key={id} value={id}>
            {label}
          </option>
        );
      })}
    </select>
  );
}

function shortLabel(s: string | null | undefined): string {
  if (!s) return "—";
  return s.length > 16 ? `${s.slice(0, 14)}…` : s;
}

// ──────────────────────────────────────────────────────────────────
// Custom node inspector
// ──────────────────────────────────────────────────────────────────

function CustomInspector({
  profile,
  node,
  onOpenFullEditor
}: {
  profile: ProfileEntry;
  node: CanvasCustomNode;
  onOpenFullEditor: CanvasInspectorProps["onOpenFullEditor"];
}) {
  const ca = useCa();
  return (
    <div className="canvas-inspector-custom">
      <div className="canvas-inspector-section-title">
        {node.displayName}
      </div>
      <div className="canvas-inspector-kv">
        <span>资源</span>
        <span>{node.resourceDisplayName ?? node.usage.resource_instance_id}</span>
      </div>
      <div className="canvas-inspector-kv">
        <span>节点 id</span>
        <code>{node.usage.node_id}</code>
      </div>
      <div className="canvas-inspector-kv">
        <span>放置位置</span>
        <span>
          {node.anchorChainId
            ? `锚定 → ${node.anchorChainId}（order in array: ${node.usage.order}）`
            : `未锚定 / 尾部`}
        </span>
      </div>
      {node.branchId && (
        <div className="canvas-inspector-kv">
          <span>分支</span>
          <code>{node.branchId}</code>
        </div>
      )}
      <div className="canvas-inspector-kv">
        <span>状态</span>
        <span>{node.enabled ? "已激活" : "已停用"}</span>
      </div>

      <div className="canvas-inspector-action-row">
        <button
          type="button"
          className="canvas-inspector-action-btn"
          onClick={() =>
            void ca.setCustomUsageEnabled(
              profile.id,
              node.arrayIndex,
              !node.enabled
            )
          }
        >
          {node.enabled ? "停用" : "激活"}
        </button>
        <button
          type="button"
          className="canvas-inspector-action-btn"
          onClick={() => void ca.removeCustomUsage(profile.id, node.arrayIndex)}
        >
          移出链路
        </button>
        {node.branchId && (
          <button
            type="button"
            className="canvas-inspector-action-btn"
            title="在新 tab 中打开完整编辑（C21 跳出）"
            onClick={() =>
              onOpenFullEditor({
                resourceKind: "custom",
                resourceInstanceId: node.usage.resource_instance_id,
                branchId: node.branchId!
              })
            }
          >
            ↗ 打开完整编辑
          </button>
        )}
      </div>

      {/* Phase 3 omits per-usage parameter editing — CustomNodeUsage
          carries no `parameters` field today; the custom node def's
          `default_parameters` is read in the full ResourceBranchView
          (C12 / C26). Once usages gain per-placement overrides we
          can surface them here as an inline edit block. */}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Projection helpers — kept local to avoid coupling canvasProjection
// to a selection-by-coordinates lookup that only the inspector needs.
// ──────────────────────────────────────────────────────────────────

function findNodeBySelection(
  projection: CanvasProjection,
  selection: CanvasSelection
): CanvasNode | null {
  const all: CanvasNode[] = [
    ...projection.groups.flatMap((g) => g.allNodes),
    ...(projection.customOnly?.allNodes ?? [])
  ];
  for (const n of all) {
    if (selection.kind === "slot" && n.kind === "slot" && n.nodeId === selection.chainNodeId) {
      return n;
    }
    if (
      selection.kind === "custom" &&
      n.kind === "custom" &&
      n.arrayIndex === selection.usageArrayIndex
    ) {
      return n;
    }
    if (
      selection.kind === "coverage" &&
      n.kind === "slot" &&
      n.nodeId === selection.chainNodeId
    ) {
      return n;
    }
  }
  return null;
}

function findSlotByChainNodeId(
  projection: CanvasProjection,
  chainNodeId: string
): CanvasSlotNode | null {
  for (const g of projection.groups) {
    for (const n of g.allNodes) {
      if (n.kind === "slot" && n.nodeId === chainNodeId) return n;
    }
  }
  return null;
}

