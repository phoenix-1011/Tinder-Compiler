import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  type Node,
  type NodeTypes,
  type Viewport
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  canvasNodeIdentity,
  type CanvasCustomNode,
  type CanvasGroup,
  type CanvasProjection,
  type CanvasSlotNode
} from "../state/canvasProjection";
import {
  DEFAULT_VIEWPORT,
  type CanvasPerProfileState,
  type CanvasSelection
} from "../state/canvasState";
import { useCa } from "../state/ChainAssemblyContext";
import { type ContextMenuItem } from "./ContextMenu";

// ──────────────────────────────────────────────────────────────────
// Layout constants (D2)
// ──────────────────────────────────────────────────────────────────

const NODE_COL_WIDTH = 148;
const NODE_COL_GAP = 8;
const CLUSTER_PAD = 12;
const CLUSTER_HEADER_HEIGHT = 34;
/** Slot header (order + name) + its margin-bottom (4px). */
const SLOT_HEADER_HEIGHT = 38;
/** Per-coverage-card height including internal gap (4px gap between cards). */
const COVERAGE_CARD_HEIGHT = 26;
const COVERAGE_CARD_GAP = 4;
/** Slot .canvas-slot padding-top + padding-bottom (6px + 6px). */
const SLOT_PADDING_V = 12;
/** Cluster border (1px top + 1px bottom). */
const CLUSTER_BORDER = 2;
const CLUSTER_GAP = 48;

// D11: AABB overlap check for cluster collision
function aabbOverlap(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function hasClusterOverlap(
  positions: Record<string, { x: number; y: number }>,
  groups: CanvasGroup[]
): boolean {
  const rects: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (const g of groups) {
    if (g.allNodes.length === 0) continue;
    const pos = positions[g.docSlug];
    if (!pos) continue;
    rects.push({
      x: pos.x, y: pos.y,
      w: estimateClusterWidth(g),
      h: estimateClusterHeight(g)
    });
  }
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i]!, b = rects[j]!;
      if (aabbOverlap(a.x, a.y, a.w, a.h, b.x, b.y, b.w, b.h)) {
        return true;
      }
    }
  }
  return false;
}

// ──────────────────────────────────────────────────────────────────
// Node data types
// ──────────────────────────────────────────────────────────────────

export interface CategoryGroupData {
  group: CanvasGroup;
  selection: CanvasSelection | null;
  lensTokens: Set<string> | null;
  onSelectionChange: (next: CanvasSelection | null) => void;
  onOpenFullEditor: OpenFullEditorFn;
  onCardContextMenu: (e: React.MouseEvent, items: ContextMenuItem[]) => void;
  profileId: string;
}

export interface CustomNodeData {
  node: CanvasCustomNode;
  selection: CanvasSelection | null;
  lensTokens: Set<string> | null;
  onSelectionChange: (next: CanvasSelection | null) => void;
  onOpenFullEditor: OpenFullEditorFn;
  onCardContextMenu: (e: React.MouseEvent, items: ContextMenuItem[]) => void;
  profileId: string;
}

type OpenFullEditorFn = (target: {
  resourceKind: "standard" | "custom";
  resourceInstanceId: string;
  branchId: string;
}) => void;

// ──────────────────────────────────────────────────────────────────
// Category group node (renders chain-node cards as children)
// ──────────────────────────────────────────────────────────────────

function CategoryGroupNodeComponent({ data }: { data: CategoryGroupData }) {
  const { group, selection, lensTokens, onSelectionChange, onOpenFullEditor, onCardContextMenu, profileId } = data;
  return (
    <div className="rf-category-group">
      <div className="rf-category-group-header">
        <span className="rf-category-group-title">{group.docTitle}</span>
        <span className="rf-category-group-count">
          {group.coveredSlotCount} / {group.totalSlotCount}
        </span>
      </div>
      <div className="rf-category-group-body">
        {group.allNodes.map((node) =>
          node.kind === "slot" ? (
            <SlotCardInline
              key={`slot:${node.nodeId}`}
              node={node}
              selection={selection}
              lensTokens={lensTokens}
              onSelectionChange={onSelectionChange}
              onOpenFullEditor={onOpenFullEditor}
              onCardContextMenu={onCardContextMenu}
              profileId={profileId}
            />
          ) : (
            <CustomCardInline
              key={`cus:${node.arrayIndex}`}
              node={node}
              selection={selection}
              lensTokens={lensTokens}
              onSelectionChange={onSelectionChange}
              onOpenFullEditor={onOpenFullEditor}
              onCardContextMenu={onCardContextMenu}
              profileId={profileId}
            />
          )
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Custom node (free-positioned on canvas)
// ──────────────────────────────────────────────────────────────────

function CustomNodeComponent({ data }: { data: CustomNodeData }) {
  const { node, selection, lensTokens, onSelectionChange, onOpenFullEditor, onCardContextMenu, profileId } = data;
  return (
    <CustomCardInline
      node={node}
      selection={selection}
      lensTokens={lensTokens}
      onSelectionChange={onSelectionChange}
      onOpenFullEditor={onOpenFullEditor}
      onCardContextMenu={onCardContextMenu}
      profileId={profileId}
    />
  );
}

// ──────────────────────────────────────────────────────────────────
// Inline card renderers (reused visual from old canvas)
// ──────────────────────────────────────────────────────────────────

function SlotCardInline({
  node,
  selection,
  lensTokens,
  onSelectionChange,
  onOpenFullEditor,
  onCardContextMenu,
  profileId
}: {
  node: CanvasSlotNode;
  selection: CanvasSelection | null;
  lensTokens: Set<string> | null;
  onSelectionChange: (next: CanvasSelection | null) => void;
  onOpenFullEditor: OpenFullEditorFn;
  onCardContextMenu: (e: React.MouseEvent, items: ContextMenuItem[]) => void;
  profileId: string;
}) {
  const ca = useCa();
  const cov = node.coverage;
  const STACK_LIMIT = 3;
  const visible = cov.resources.slice(0, STACK_LIMIT);
  const overflow = cov.resources.length - visible.length;

  const slotSelected =
    selection?.kind === "slot" && selection.chainNodeId === node.nodeId;
  const lensClass = lensTokens
    ? lensTokens.has(canvasNodeIdentity(node))
      ? "is-lens-near"
      : "is-lens-far"
    : "";
  const slotClass = [
    "canvas-slot rf-slot",
    cov.count === 0 ? "is-uncovered" : "",
    cov.count > 1 ? "is-multi" : "",
    slotSelected ? "is-selected" : "",
    lensClass
  ]
    .filter(Boolean)
    .join(" ");

  const onSlotClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectionChange({ kind: "slot", chainNodeId: node.nodeId });
  };
  const onSlotDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (cov.resources.length > 0) {
      const r = cov.resources[0]!;
      onOpenFullEditor({
        resourceKind: "standard",
        resourceInstanceId: r.resourceId,
        branchId: r.variantId
      });
    }
  };

  return (
    <div className={slotClass} title={`${node.nodeId} · order ${node.order}`}>
      <header
        className="canvas-slot-header"
        onClick={onSlotClick}
        onDoubleClick={onSlotDoubleClick}
        role="button"
        tabIndex={0}
        title="单击选中 · 双击打开编辑"
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
              const onCoverageDoubleClick = (e: React.MouseEvent) => {
                e.stopPropagation();
                onOpenFullEditor({
                  resourceKind: "standard",
                  resourceInstanceId: r.resourceId,
                  branchId: r.variantId
                });
              };
              const onCoverageContextMenu = (e: React.MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                const selectThis = () =>
                  onSelectionChange({
                    kind: "coverage",
                    chainNodeId: node.nodeId,
                    resourceInstanceId: r.resourceId,
                    variantId: r.variantId
                  });
                onCardContextMenu(e, [
                  {
                    id: "switch-branch",
                    label: "切换分支…（在左侧库中 pin 其它分支）",
                    run: selectThis
                  },
                  {
                    id: "switch-candidate",
                    label: "候选实现…",
                    run: selectThis
                  },
                  { separator: true },
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
                  title={`${r.resourceId} · ${r.variantId} · 双击打开完整编辑`}
                  onClick={onCoverageClick}
                  onDoubleClick={onCoverageDoubleClick}
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
              <span
                className="canvas-coverage-overflow"
                title={cov.resources
                  .slice(STACK_LIMIT)
                  .map((r) => `${r.displayName} · ${r.variantId}`)
                  .join("\n")}
              >
                +{overflow}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CustomCardInline({
  node,
  selection,
  lensTokens,
  onSelectionChange,
  onOpenFullEditor,
  onCardContextMenu,
  profileId
}: {
  node: CanvasCustomNode;
  selection: CanvasSelection | null;
  lensTokens: Set<string> | null;
  onSelectionChange: (next: CanvasSelection | null) => void;
  onOpenFullEditor: OpenFullEditorFn;
  onCardContextMenu: (e: React.MouseEvent, items: ContextMenuItem[]) => void;
  profileId: string;
}) {
  const ca = useCa();
  const isSelected =
    selection?.kind === "custom" && selection.usageArrayIndex === node.arrayIndex;
  const lensClass = lensTokens
    ? lensTokens.has(canvasNodeIdentity(node))
      ? "is-lens-near"
      : "is-lens-far"
    : "";
  const cls = [
    "canvas-custom rf-custom-card",
    node.enabled ? "is-enabled" : "is-disabled",
    isSelected ? "is-selected" : "",
    node.isOrphan ? "is-orphan" : "",
    lensClass
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
  const onDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!node.branchId) return;
    onOpenFullEditor({
      resourceKind: "custom",
      resourceInstanceId: node.usage.resource_instance_id,
      branchId: node.branchId
    });
  };
  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onCardContextMenu(e, [
      {
        id: "up",
        label: "上移",
        run: () => void ca.shiftCustomUsage(profileId, node.arrayIndex, -1)
      },
      {
        id: "down",
        label: "下移",
        run: () => void ca.shiftCustomUsage(profileId, node.arrayIndex, 1)
      },
      {
        id: "move",
        label: "移到段…",
        run: () => void ca.promptMoveCustomUsage(profileId, node.arrayIndex)
      },
      { separator: true },
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
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      role="button"
      tabIndex={0}
      title={
        node.branchId
          ? `${node.resourceDisplayName ?? ""} / ${node.usage.node_id} · 单击选中 · 双击打开`
          : `${node.resourceDisplayName ?? ""} / ${node.usage.node_id} · 单击选中`
      }
    >
      <span className="canvas-custom-marker" aria-hidden="true">
        ⌬
      </span>
      <span className="canvas-custom-label">{node.displayName}</span>
      {node.branchId && (
        <span className="canvas-custom-branch">· {node.branchId}</span>
      )}
      {node.isOrphan && (
        <span
          className="canvas-custom-orphan-chip"
          title="孤立 usage（C26 soft-orphan）"
        >
          ⚠
        </span>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Node type registry
// ──────────────────────────────────────────────────────────────────

const nodeTypes: NodeTypes = {
  categoryGroup: CategoryGroupNodeComponent,
  customNode: CustomNodeComponent
};

// ──────────────────────────────────────────────────────────────────
// Default layout computation (D2)
// ──────────────────────────────────────────────────────────────────

function estimateClusterWidth(group: CanvasGroup): number {
  const n = group.allNodes.length;
  if (n === 0) return NODE_COL_WIDTH + CLUSTER_PAD * 2;
  return CLUSTER_PAD * 2 + n * NODE_COL_WIDTH + (n - 1) * NODE_COL_GAP;
}

function estimateClusterHeight(group: CanvasGroup): number {
  let maxCards = 1;
  for (const node of group.allNodes) {
    if (node.kind === "slot") {
      maxCards = Math.max(maxCards, Math.max(1, Math.min(node.coverage.count, 3)));
    }
  }
  // Height = cluster border + cluster header + cluster-body padding
  //        + tallest column (slot padding + header + cards + gaps)
  const tallestCol =
    SLOT_PADDING_V +
    SLOT_HEADER_HEIGHT +
    maxCards * COVERAGE_CARD_HEIGHT +
    (maxCards > 1 ? (maxCards - 1) * COVERAGE_CARD_GAP : 0);
  return CLUSTER_BORDER + CLUSTER_HEADER_HEIGHT + CLUSTER_PAD * 2 + tallestCol;
}

function computeDefaultClusterPositions(
  groups: CanvasGroup[]
): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};
  let y = 0;
  for (const group of groups) {
    if (group.allNodes.length === 0) continue;
    positions[group.docSlug] = { x: 0, y };
    y += estimateClusterHeight(group) + CLUSTER_GAP;
  }
  return positions;
}

function computeDefaultCustomPosition(
  _node: CanvasCustomNode,
  clusterPositions: Record<string, { x: number; y: number }>,
  groups: CanvasGroup[]
): { x: number; y: number } {
  if (_node.anchorChainId) {
    for (const g of groups) {
      const pos = clusterPositions[g.docSlug];
      if (!pos) continue;
      const colIdx = g.allNodes.findIndex(
        (n) => n.kind === "slot" && n.nodeId === _node.anchorChainId
      );
      if (colIdx >= 0) {
        return {
          x: pos.x + CLUSTER_PAD + colIdx * (NODE_COL_WIDTH + NODE_COL_GAP),
          y: pos.y + estimateClusterHeight(g) + 16
        };
      }
    }
  }
  return { x: 0, y: 0 };
}

// ──────────────────────────────────────────────────────────────────
// Projection → react-flow nodes
// ──────────────────────────────────────────────────────────────────

function projectionToNodes(
  projection: CanvasProjection,
  canvasState: CanvasPerProfileState,
  selection: CanvasSelection | null,
  lensTokens: Set<string> | null,
  onSelectionChange: (next: CanvasSelection | null) => void,
  onOpenFullEditor: OpenFullEditorFn,
  onCardContextMenu: (e: React.MouseEvent, items: ContextMenuItem[]) => void,
  profileId: string
): Node[] {
  const defaultPositions = computeDefaultClusterPositions(projection.groups);
  let clusterPositions = { ...defaultPositions, ...canvasState.clusterPositions };

  // D11: if saved positions cause any cluster overlap (stale canvas.json
  // from a prior layout), fall back entirely to computed defaults.
  if (
    Object.keys(canvasState.clusterPositions).length > 0 &&
    hasClusterOverlap(clusterPositions, projection.groups)
  ) {
    clusterPositions = defaultPositions;
  }

  const nodes: Node[] = [];

  for (const group of projection.groups) {
    if (group.allNodes.length === 0) continue;
    const pos = clusterPositions[group.docSlug] ?? defaultPositions[group.docSlug] ?? { x: 0, y: 0 };
    nodes.push({
      id: `group:${group.docSlug}`,
      type: "categoryGroup",
      position: pos,
      data: {
        group,
        selection,
        lensTokens,
        onSelectionChange,
        onOpenFullEditor,
        onCardContextMenu,
        profileId
      } satisfies CategoryGroupData,
      draggable: true,
      selectable: false,
      style: { width: estimateClusterWidth(group) }
    });
  }

  if (projection.customOnly) {
    for (const node of projection.customOnly.allNodes) {
      if (node.kind !== "custom") continue;
      const pos =
        canvasState.customPositions[node.arrayIndex] ??
        computeDefaultCustomPosition(node, clusterPositions, projection.groups);
      nodes.push({
        id: `custom:${node.arrayIndex}`,
        type: "customNode",
        position: pos,
        data: {
          node,
          selection,
          lensTokens,
          onSelectionChange,
          onOpenFullEditor,
          onCardContextMenu,
          profileId
        } satisfies CustomNodeData,
        draggable: true,
        selectable: false
      });
    }
  }

  return nodes;
}

// ──────────────────────────────────────────────────────────────────
// Main freeform body component
// ──────────────────────────────────────────────────────────────────

interface CanvasFreeformBodyProps {
  projection: CanvasProjection | null;
  canvasState: CanvasPerProfileState;
  selection: CanvasSelection | null;
  lensTokens: Set<string> | null;
  onSelectionChange: (next: CanvasSelection | null) => void;
  onOpenFullEditor: OpenFullEditorFn;
  onCardContextMenu: (e: React.MouseEvent, items: ContextMenuItem[]) => void;
  profileId: string;
  onViewportChange: (viewport: Viewport) => void;
  onClusterDragEnd: (docSlug: string, position: { x: number; y: number }) => void;
  onCustomDragEnd: (arrayIndex: number, position: { x: number; y: number }) => void;
}

function CanvasFreeformBodyInner({
  projection,
  canvasState,
  selection,
  lensTokens,
  onSelectionChange,
  onOpenFullEditor,
  onCardContextMenu,
  profileId,
  onViewportChange,
  onClusterDragEnd,
  onCustomDragEnd
}: CanvasFreeformBodyProps) {
  if (!projection) {
    return <div className="canvas-view-empty-hint">尚无可用数据。</div>;
  }

  const rfNodes = useMemo(
    () =>
      projectionToNodes(
        projection,
        canvasState,
        selection,
        lensTokens,
        onSelectionChange,
        onOpenFullEditor,
        onCardContextMenu,
        profileId
      ),
    [projection, canvasState, selection, lensTokens, onSelectionChange, onOpenFullEditor, onCardContextMenu, profileId]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(rfNodes);

  const prevNodesRef = useRef(rfNodes);
  useEffect(() => {
    if (rfNodes !== prevNodesRef.current) {
      prevNodesRef.current = rfNodes;
      setNodes(rfNodes);
    }
  }, [rfNodes, setNodes]);

  // ─── Phase 2: drag tracking + D11 AABB collision ────────────
  const clusterDimensions = useMemo(() => {
    const map = new Map<string, { w: number; h: number }>();
    for (const g of projection.groups) {
      map.set(g.docSlug, {
        w: estimateClusterWidth(g),
        h: estimateClusterHeight(g)
      });
    }
    return map;
  }, [projection]);

  const dragStartPosRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  const handleNodeDragStart = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      dragStartPosRef.current.set(node.id, { x: node.position.x, y: node.position.y });
    },
    []
  );

  const handleNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node, allNodes: Node[]) => {
      const startPos = dragStartPosRef.current.get(node.id);
      dragStartPosRef.current.delete(node.id);

      if (node.id.startsWith("group:")) {
        const slug = node.id.slice("group:".length);
        const dragDim = clusterDimensions.get(slug);
        // C8: skip collision check when dimensions are unknown
        // rather than using arbitrary fallback values.
        if (!dragDim) {
          onClusterDragEnd(slug, { x: node.position.x, y: node.position.y });
          return;
        }

        let hasOverlap = false;
        for (const other of allNodes) {
          if (other.id === node.id || !other.id.startsWith("group:")) continue;
          const otherSlug = other.id.slice("group:".length);
          const otherDim = clusterDimensions.get(otherSlug);
          if (!otherDim) continue;

          if (
            aabbOverlap(
              node.position.x, node.position.y, dragDim.w, dragDim.h,
              other.position.x, other.position.y, otherDim.w, otherDim.h
            )
          ) {
            hasOverlap = true;
            break;
          }
        }

        if (hasOverlap && startPos) {
          setNodes(nds =>
            nds.map(n => (n.id === node.id ? { ...n, position: startPos } : n))
          );
        } else {
          onClusterDragEnd(slug, { x: node.position.x, y: node.position.y });
        }
      } else if (node.id.startsWith("custom:")) {
        const idx = parseInt(node.id.slice("custom:".length), 10);
        if (!isNaN(idx)) {
          onCustomDragEnd(idx, { x: node.position.x, y: node.position.y });
        }
      }
    },
    [clusterDimensions, onClusterDragEnd, onCustomDragEnd, setNodes]
  );

  const defaultViewport: Viewport = canvasState.viewport ?? DEFAULT_VIEWPORT;

  const onPaneClick = useCallback(() => {
    onSelectionChange(null);
  }, [onSelectionChange]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={[]}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onNodeDragStart={handleNodeDragStart}
      onNodeDragStop={handleNodeDragStop}
      onMove={(_event, viewport) => onViewportChange(viewport)}
      onPaneClick={onPaneClick}
      defaultViewport={defaultViewport}
      fitView={false}
      panOnScroll
      zoomOnScroll
      minZoom={0.15}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      <Background
        gap={16}
        size={1}
        color="var(--tc-canvas-grid-color, rgba(255,255,255,0.04))"
      />
      <Controls showInteractive={false} />
      <MiniMap
        pannable
        zoomable
        style={{ background: "var(--tc-canvas-bg, #1e1e1e)" }}
        maskColor="rgba(0,0,0,0.6)"
      />
    </ReactFlow>
  );
}

export function CanvasFreeformBody(props: CanvasFreeformBodyProps) {
  return (
    <ReactFlowProvider>
      <CanvasFreeformBodyInner {...props} />
    </ReactFlowProvider>
  );
}
