import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  useNodesState,
  useReactFlow,
  type Node,
  type Edge,
  type NodeTypes,
  type Viewport
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
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
import { canvasDragState } from "../state/canvasDrag";
import { useCa } from "../state/ChainAssemblyContext";
import { profileResourceBranchId } from "@tinder/nextstep";
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
/**
 * Phase 5: flow-space distance threshold (px) for deciding
 * near-cluster snap vs far-from-cluster floating drop.
 */
const SNAP_THRESHOLD_PX = 80;

// ──────────────────────────────────────────────────────────────────
// Cluster color palette — deterministic, progression-ordered.
//
// Hue arc mirrors the OODA kill-chain: cold blues (infrastructure) →
// purple (electronic warfare) → teal (perception) → amber (decision)
// → orange-red (action/strike) → cool return (sustainment).
// ──────────────────────────────────────────────────────────────────

const CLUSTER_PALETTE: Record<string, string> = {
  /* ── Phase: 基础 / 环境 (cold blues) ──────────────────────────── */
  "10-platform-chain":           "#5B93D5",  // steel blue
  "20-device-chain":             "#7280B8",  // cool slate
  "30-signal-environment-chain": "#8570C7",  // blue-violet

  /* ── Phase: 对抗 (rose — purple reserved for custom nodes) ──── */
  "31-softkill":                 "#E05577",  // rose-red (active jamming)
  "32-signature":                "#C74E6C",  // dark rose (passive signature)

  /* ── Phase: 感知 (teal) ──────────────────────────────────────── */
  "40-sense-chain":              "#14B8A6",  // turquoise

  /* ── Phase: 决策 / 控制 (amber) ──────────────────────────────── */
  "45-control-chain":            "#CA9B08",  // dark gold
  "50-navigation-chain":         "#E8B830",  // bright gold

  /* ── Phase: 行动 (orange → red) ──────────────────────────────── */
  "60-target-action-chain":      "#E87A3A",  // tangerine
  "61-cooperation":              "#D99050",  // sandy
  "62-inventory":                "#C46A20",  // burnt orange
  "65-strike-chain":             "#DC4040",  // crimson

  /* ── Phase: 保障 (cool return) ───────────────────────────────── */
  "70-maintenance-chain":        "#2BA88E",  // jade
  "75-communication-chain":      "#3B8FCA",  // cerulean

  /* ── Special — purple = custom node identity ─────────────────── */
  "custom-only":                 "#A855F7",  // vivid purple (matches custom-node UI)
};

/** Fall back for any unknown slug — should not happen in practice. */
const PALETTE_FALLBACK = "#858585";

function clusterColor(slug: string): string {
  return CLUSTER_PALETTE[slug] ?? PALETTE_FALLBACK;
}

/** Auto-pan: distance (screen px) from viewport edge to start panning. */
const AUTOPAN_EDGE_PX = 40;
/** Auto-pan: viewport translation speed per rAF tick (screen px). */
const AUTOPAN_SPEED = 8;

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
  /** Deterministic palette color for this cluster (hex). */
  accentColor: string;
}

type OpenFullEditorFn = (target: {
  resourceKind: "standard" | "custom";
  resourceInstanceId: string;
  branchId: string;
}) => void;

// ──────────────────────────────────────────────────────────────────
// Category group node (cluster with cards as DOM children + L/R handles)
// ──────────────────────────────────────────────────────────────────

function CategoryGroupNodeComponent({ data }: { data: CategoryGroupData }) {
  const { group, selection, lensTokens, onSelectionChange, onOpenFullEditor, onCardContextMenu, profileId, accentColor } = data;
  return (
    <div
      className="rf-category-group"
      role="group"
      aria-label={`簇: ${group.docTitle}`}
      style={{ borderLeftColor: accentColor }}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="tgt"
        className="rf-invisible-handle"
        isConnectable={false}
      />
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
              canvasDraggable
            />
          )
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="src"
        className="rf-invisible-handle"
        isConnectable={false}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Floating custom node (unanchored, free-positioned — Phase 5)
// ──────────────────────────────────────────────────────────────────

interface FloatingCustomNodeData {
  node: CanvasCustomNode;
  selection: CanvasSelection | null;
  lensTokens: Set<string> | null;
  onSelectionChange: (next: CanvasSelection | null) => void;
  onOpenFullEditor: OpenFullEditorFn;
  onCardContextMenu: (e: React.MouseEvent, items: ContextMenuItem[]) => void;
  profileId: string;
}

function FloatingCustomNodeComponent({ data }: { data: FloatingCustomNodeData }) {
  return (
    <div className="rf-floating-custom" role="group" aria-label={`未锚定节点: ${data.node.displayName}`}>
      <CustomCardInline
        node={data.node}
        selection={data.selection}
        lensTokens={data.lensTokens}
        onSelectionChange={data.onSelectionChange}
        onOpenFullEditor={data.onOpenFullEditor}
        onCardContextMenu={data.onCardContextMenu}
        profileId={data.profileId}
      />
      <div className="rf-floating-custom-badge" title="未锚定 — 拖到簇上以锚定">
        ⚐ 未锚定
      </div>
    </div>
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
  profileId,
  canvasDraggable = false
}: {
  node: CanvasCustomNode;
  selection: CanvasSelection | null;
  lensTokens: Set<string> | null;
  onSelectionChange: (next: CanvasSelection | null) => void;
  onOpenFullEditor: OpenFullEditorFn;
  onCardContextMenu: (e: React.MouseEvent, items: ContextMenuItem[]) => void;
  profileId: string;
  /** Phase 5: when true, the card is an HTML5 drag source for re-anchor / float. */
  canvasDraggable?: boolean;
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
    // "nodrag" prevents react-flow from starting a cluster drag when
    // the user grabs a draggable custom card (HTML5 DnD takes over).
    canvasDraggable ? "nodrag" : "",
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
  // Phase 5: HTML5 DnD for re-anchor / float (in-cluster customs only)
  const onCardDragStart = canvasDraggable
    ? (e: React.DragEvent) => {
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
      }
    : undefined;
  const onCardDragEnd = canvasDraggable
    ? () => {
        canvasDragState.value = null;
      }
    : undefined;

  return (
    <div
      className={cls}
      draggable={canvasDraggable || undefined}
      onDragStart={onCardDragStart}
      onDragEnd={onCardDragEnd}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      role="button"
      tabIndex={0}
      title={
        node.branchId
          ? `${node.resourceDisplayName ?? ""} / ${node.usage.node_id} · 拖拽移动 · 单击选中 · 双击打开`
          : `${node.resourceDisplayName ?? ""} / ${node.usage.node_id} · 拖拽移动 · 单击选中`
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
  floatingCustom: FloatingCustomNodeComponent
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

// ──────────────────────────────────────────────────────────────────
// Phase 5: nearest-cluster resolution for library drop
// ──────────────────────────────────────────────────────────────────

/**
 * Find the nearest cluster to a flow-space position using AABB
 * distance. Returns the cluster's docSlug and the signed distance
 * (0 = inside the cluster rectangle).
 */
function findNearestCluster(
  flowPos: { x: number; y: number },
  groups: CanvasGroup[],
  clusterPositions: Record<string, { x: number; y: number }>
): { docSlug: string | null; distance: number } {
  let bestSlug: string | null = null;
  let bestDistance = Infinity;
  for (const group of groups) {
    if (group.allNodes.length === 0) continue;
    const pos = clusterPositions[group.docSlug];
    if (!pos) continue;
    const w = estimateClusterWidth(group);
    const h = estimateClusterHeight(group);
    // Distance from point to AABB (0 when inside)
    const dx = Math.max(pos.x - flowPos.x, 0, flowPos.x - (pos.x + w));
    const dy = Math.max(pos.y - flowPos.y, 0, flowPos.y - (pos.y + h));
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < bestDistance) {
      bestDistance = dist;
      bestSlug = group.docSlug;
    }
  }
  return { docSlug: bestSlug, distance: bestDistance };
}

/** Find the first slot node in a group — used as the default anchor for near-cluster drops. */
function findFirstSlotInGroup(group: CanvasGroup): string | null {
  for (const node of group.allNodes) {
    if (node.kind === "slot") return node.nodeId;
  }
  return null;
}

/**
 * Phase 5 bug-fix: resolve which column gap the mouse is closest to
 * based on the relative X offset inside the cluster body.
 * Returns an insertion index in [0, nodeCount].
 */
function resolveInsertionIndex(relX: number, nodeCount: number): number {
  for (let i = 0; i < nodeCount; i++) {
    const center = CLUSTER_PAD + i * (NODE_COL_WIDTH + NODE_COL_GAP) + NODE_COL_WIDTH / 2;
    if (relX < center) return i;
  }
  return nodeCount;
}

/**
 * Find the first slot node at or after `insertIdx` in the group's
 * allNodes array, used to anchor a drop at a specific column position.
 * Falls back to last slot before insertIdx, then null.
 */
function resolveDropAnchor(
  group: CanvasGroup,
  insertIdx: number
): string | null {
  // Nodes in allNodes are in column order. Walk forward from insertIdx.
  let lastSlotBefore: string | null = null;
  for (let i = 0; i < group.allNodes.length; i++) {
    const n = group.allNodes[i]!;
    if (n.kind === "slot") {
      if (i >= insertIdx) return n.nodeId;
      lastSlotBefore = n.nodeId;
    }
  }
  return lastSlotBefore;
}

/**
 * Compute the CSS left offset (px) for the insertion line at a given
 * column insertion index (0 = before first column, N = after last).
 */
function insertLineX(insertIdx: number): number {
  if (insertIdx === 0) return CLUSTER_PAD / 2;
  return CLUSTER_PAD + insertIdx * (NODE_COL_WIDTH + NODE_COL_GAP) - NODE_COL_GAP / 2;
}

// ──────────────────────────────────────────────────────────────────
// Phase 3: Cluster-to-cluster directed edges (canonical order)
// ──────────────────────────────────────────────────────────────────

function rgbaStr(r: number, g: number, b: number, a: number): string {
  return `rgba(${r},${g},${b},${a.toFixed(3)})`;
}

/**
 * Find the react-flow node ID of the cluster that contains the
 * currently selected canvas entity, or null if nothing is selected.
 * Floating customs are excluded — they live outside clusters.
 */
function selectedClusterRfId(
  projection: CanvasProjection,
  selection: CanvasSelection | null,
  floatingCustomIdxs: Set<number>
): string | null {
  if (!selection) return null;
  for (const group of projection.groups) {
    for (const node of group.allNodes) {
      if (
        (selection.kind === "slot" || selection.kind === "coverage") &&
        node.kind === "slot" &&
        node.nodeId === selection.chainNodeId
      ) {
        return `group:${group.docSlug}`;
      }
      if (
        selection.kind === "custom" &&
        node.kind === "custom" &&
        node.arrayIndex === selection.usageArrayIndex &&
        !floatingCustomIdxs.has(node.arrayIndex)
      ) {
        return `group:${group.docSlug}`;
      }
    }
  }
  return null;
}

/**
 * Compute directed cluster-to-cluster edges. Each cluster's position
 * in the execution chain is determined by the minimum canonical
 * `order` value among its slot nodes. Clusters without any valid
 * nodes (covered slots or customs) are skipped.
 *
 * "常亮但低调" opacity (baked into color for arrow marker parity):
 *   - no selection  → 35 %
 *   - incident      → 90 %
 *   - non-incident  → 10 %
 */
function computeCanvasEdges(
  projection: CanvasProjection,
  selection: CanvasSelection | null,
  floatingCustomIdxs: Set<number>
): Edge[] {
  // ── Build ordered cluster list in VISUAL (docSlug) order ──────
  // `projection.groups` is already sorted by docSlug number via
  // `applyUiGroupOverrides`. Using this order instead of per-slot
  // `minOrder` avoids edge zig-zags caused by UI_GROUP_OVERRIDES
  // extracting sub-ranges whose canonical orders don't match the
  // docSlug position (e.g. "65-strike" has minOrder 19 but sits
  // visually after "50-navigation" with minOrder 27).
  //
  // Floating (unanchored) customs are excluded — they live outside
  // clusters and must not contribute to cluster validity.
  const validClusters: string[] = [];

  for (const group of projection.groups) {
    if (group.allNodes.length === 0) continue;
    let hasValid = false;
    for (const node of group.allNodes) {
      if (node.kind === "slot") {
        if (node.coverage.count > 0) hasValid = true;
      } else if (node.kind === "custom") {
        if (!floatingCustomIdxs.has(node.arrayIndex)) {
          hasValid = true;
        }
      }
      if (hasValid) break;
    }
    if (!hasValid) continue;
    validClusters.push(`group:${group.docSlug}`);
  }

  // No sort — projection.groups is already in display order.

  // ── Create edges ───────────────────────────────────────────────
  const selCluster = selectedClusterRfId(projection, selection, floatingCustomIdxs);
  const edges: Edge[] = [];

  for (let i = 0; i < validClusters.length - 1; i++) {
    const curr = validClusters[i]!;
    const next = validClusters[i + 1]!;

    let opacity: number;
    if (!selCluster) {
      opacity = 0.35;
    } else if (curr === selCluster || next === selCluster) {
      opacity = 0.9;
    } else {
      opacity = 0.1;
    }

    const color = rgbaStr(142, 142, 142, opacity);

    edges.push({
      id: `e:${curr}→${next}`,
      source: curr,
      sourceHandle: "src",
      target: next,
      targetHandle: "tgt",
      type: "smoothstep",
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 12,
        height: 12,
        color
      },
      style: {
        stroke: color,
        strokeWidth: 1.5
      }
    });
  }

  return edges;
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
  profileId: string,
  floatingCustomIdxs: Set<number>
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

    // Filter out floating customs from the cluster's DOM children
    const displayGroup =
      floatingCustomIdxs.size > 0
        ? {
            ...group,
            allNodes: group.allNodes.filter(
              (n) =>
                n.kind !== "custom" ||
                !floatingCustomIdxs.has(n.arrayIndex)
            )
          }
        : group;

    if (displayGroup.allNodes.length === 0) continue;

    const pos = clusterPositions[group.docSlug] ?? defaultPositions[group.docSlug] ?? { x: 0, y: 0 };

    nodes.push({
      id: `group:${group.docSlug}`,
      type: "categoryGroup",
      position: pos,
      data: {
        group: displayGroup,
        selection,
        lensTokens,
        onSelectionChange,
        onOpenFullEditor,
        onCardContextMenu,
        profileId,
        accentColor: clusterColor(group.docSlug)
      } satisfies CategoryGroupData,
      draggable: true,
      selectable: false,
      style: { width: estimateClusterWidth(displayGroup) }
    });
  }

  // Phase 5: floating custom nodes (unanchored with explicit position)
  for (const group of projection.groups) {
    for (const node of group.allNodes) {
      if (node.kind === "custom" && floatingCustomIdxs.has(node.arrayIndex)) {
        const pos = canvasState.customPositions[node.arrayIndex]!;
        nodes.push({
          id: `floating:${node.arrayIndex}`,
          type: "floatingCustom",
          position: pos,
          data: {
            node,
            selection,
            lensTokens,
            onSelectionChange,
            onOpenFullEditor,
            onCardContextMenu,
            profileId
          } satisfies FloatingCustomNodeData,
          draggable: true,
          selectable: false,
          style: { width: NODE_COL_WIDTH }
        });
      }
    }
  }

  return nodes;
}

// ──────────────────────────────────────────────────────────────────
// Imperative handle — exposed to CanvasView for toolbar actions
// ──────────────────────────────────────────────────────────────────

export interface CanvasFreeformHandle {
  /** Fit all clusters + floating customs into view with padding. */
  fitAll(): void;
  /** Fit only the selected entity's cluster (or the node itself) into view. */
  fitSelection(): void;
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
  /** Imperative handle for toolbar actions (fit-all, fit-selection). */
  freeformRef?: React.Ref<CanvasFreeformHandle>;
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
  onCustomDragEnd,
  freeformRef
}: CanvasFreeformBodyProps) {
  // Phase 5: hooks must be called unconditionally (before the early return)
  const ca = useCa();
  const rf = useReactFlow();

  // Phase 6: overlap warning — flash the colliding cluster red momentarily.
  // Uses direct DOM manipulation (like drop highlight) to avoid triggering
  // react-flow node re-computation.
  const overlapTimerRef = useRef<number | null>(null);

  // Phase 6: minimap toggle — local state (no persistence needed).
  const [minimapVisible, setMinimapVisible] = useState(true);

  // Phase 6: imperative handle MUST be called before the early return so
  // hook call order is stable regardless of `projection` being null.
  useImperativeHandle(
    freeformRef,
    () => ({
      fitAll() {
        rf.fitView({ padding: 0.12, duration: 300 });
      },
      fitSelection() {
        if (!selection || !projection) {
          // No selection or no data — fall back to fit-all
          rf.fitView({ padding: 0.12, duration: 300 });
          return;
        }
        // Resolve which react-flow node(s) to focus
        const nodeIds: string[] = [];
        // Identify floating customs for the current state
        const floatingIdxs = new Set<number>();
        for (const group of projection.groups) {
          for (const n of group.allNodes) {
            if (n.kind === "custom" && n.anchorChainId === null && canvasState.customPositions[n.arrayIndex]) {
              floatingIdxs.add(n.arrayIndex);
            }
          }
        }
        if (selection.kind === "custom" && floatingIdxs.has(selection.usageArrayIndex)) {
          nodeIds.push(`floating:${selection.usageArrayIndex}`);
        } else {
          // Find the cluster that contains the selection
          for (const group of projection.groups) {
            for (const node of group.allNodes) {
              if (
                (selection.kind === "slot" || selection.kind === "coverage") &&
                node.kind === "slot" && node.nodeId === selection.chainNodeId
              ) {
                nodeIds.push(`group:${group.docSlug}`);
              }
              if (
                selection.kind === "custom" &&
                node.kind === "custom" &&
                node.arrayIndex === selection.usageArrayIndex
              ) {
                nodeIds.push(`group:${group.docSlug}`);
              }
            }
          }
        }
        if (nodeIds.length === 0) {
          rf.fitView({ padding: 0.12, duration: 300 });
          return;
        }
        rf.fitView({ nodes: nodeIds.map((id) => ({ id })), padding: 0.25, duration: 300 });
      }
    }),
    [rf, selection, projection, canvasState.customPositions]
  );

  // Cleanup overlap flash timer on unmount
  useEffect(() => {
    return () => {
      if (overlapTimerRef.current != null) window.clearTimeout(overlapTimerRef.current);
    };
  }, []);

  // Phase 5 bug-fix: use a ref instead of useState for the drop target
  // to avoid triggering rfNodes re-computation (which caused screen flash).
  // Highlight/insertion-line are toggled via direct DOM manipulation.
  const dropRef = useRef<{
    slug: string;
    anchorChainId: string | null;
    insertLineXPx: number;
  } | null>(null);

  if (!projection) {
    return <div className="canvas-view-empty-hint">尚无可用数据。</div>;
  }

  // Phase 5: effective cluster positions for drop-target resolution.
  // Duplicates the computation inside projectionToNodes intentionally
  // so the drop handler can use it without coupling to the node builder.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const effectiveClusterPositions = useMemo(() => {
    const defaults = computeDefaultClusterPositions(projection.groups);
    const merged = { ...defaults, ...canvasState.clusterPositions };
    if (
      Object.keys(canvasState.clusterPositions).length > 0 &&
      hasClusterOverlap(merged, projection.groups)
    ) {
      return defaults;
    }
    return merged;
  }, [projection, canvasState.clusterPositions]);

  // Phase 5: identify floating customs (unanchored + have explicit position).
  // Shared across rfNodes + rfEdges so both agree on which customs are floating.
  const floatingCustomIdxs = useMemo(() => {
    const set = new Set<number>();
    for (const group of projection.groups) {
      for (const node of group.allNodes) {
        if (
          node.kind === "custom" &&
          node.anchorChainId === null &&
          canvasState.customPositions[node.arrayIndex]
        ) {
          set.add(node.arrayIndex);
        }
      }
    }
    return set;
  }, [projection, canvasState.customPositions]);

  // Precompute the RF node ID that contains the current selection
  // (for minimap stroke highlight — avoids casting n.data inside the callback).
  const selectedRfNodeId = useMemo(() => {
    if (!selection) return null;
    if (selection.kind === "custom" && floatingCustomIdxs.has(selection.usageArrayIndex)) {
      return `floating:${selection.usageArrayIndex}`;
    }
    for (const group of projection.groups) {
      for (const node of group.allNodes) {
        if (
          (selection.kind === "slot" || selection.kind === "coverage") &&
          node.kind === "slot" && node.nodeId === selection.chainNodeId
        ) return `group:${group.docSlug}`;
        if (
          selection.kind === "custom" &&
          node.kind === "custom" && node.arrayIndex === selection.usageArrayIndex
        ) return `group:${group.docSlug}`;
      }
    }
    return null;
  }, [selection, projection, floatingCustomIdxs]);

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
        profileId,
        floatingCustomIdxs
      ),
    [projection, canvasState, selection, lensTokens, onSelectionChange, onOpenFullEditor, onCardContextMenu, profileId, floatingCustomIdxs]
  );

  // Phase 3: cluster-to-cluster canonical-order edges. Floating customs
  // are excluded from cluster validity so they don't cause spurious edges.
  const rfEdges = useMemo(
    () => computeCanvasEdges(projection, selection, floatingCustomIdxs),
    [projection, selection, floatingCustomIdxs]
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

  const defaultViewport: Viewport = canvasState.viewport ?? DEFAULT_VIEWPORT;

  const onPaneClick = useCallback(() => {
    onSelectionChange(null);
  }, [onSelectionChange]);

  const handleMove = useCallback(
    (_event: unknown, viewport: Viewport) => onViewportChange(viewport),
    [onViewportChange]
  );

  // ─── Phase 5: drop highlight DOM helpers ─────────────────────────
  // Avoid React state to prevent full node-tree re-computation
  // (screen flash fix). Toggled via direct DOM class manipulation.

  const applyDropHighlight = useCallback((slug: string, lineXPx: number) => {
    const el = document.querySelector(`[data-id="group:${slug}"] .rf-category-group`) as HTMLElement | null;
    if (!el) return;
    el.classList.add("is-drop-target");
    const body = el.querySelector(".rf-category-group-body") as HTMLElement | null;
    if (body) body.style.setProperty("--insert-x", `${lineXPx}px`);
  }, []);

  const clearDropHighlight = useCallback((slug: string) => {
    const el = document.querySelector(`[data-id="group:${slug}"] .rf-category-group`) as HTMLElement | null;
    if (!el) return;
    el.classList.remove("is-drop-target");
    const body = el.querySelector(".rf-category-group-body") as HTMLElement | null;
    if (body) body.style.removeProperty("--insert-x");
  }, []);

  // ─── handleNodeDragStop (after DOM helpers so clearDropHighlight is in scope) ──

  const handleNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node, allNodes: Node[]) => {
      const startPos = dragStartPosRef.current.get(node.id);
      dragStartPosRef.current.delete(node.id);

      // Phase 5: floating custom drag stop — reposition or re-anchor
      if (node.id.startsWith("floating:")) {
        // Clear drop highlight that was shown during the drag
        const prevDrop = dropRef.current;
        if (prevDrop) {
          clearDropHighlight(prevDrop.slug);
          dropRef.current = null;
        }

        const arrayIndex = parseInt(node.id.slice("floating:".length), 10);
        if (isNaN(arrayIndex)) return;
        // If dragged close to a cluster, auto-anchor into it
        const { docSlug, distance } = findNearestCluster(
          node.position, projection!.groups, effectiveClusterPositions
        );
        if (distance <= SNAP_THRESHOLD_PX && docSlug) {
          const group = projection!.groups.find((g) => g.docSlug === docSlug);
          if (group) {
            const clusterPos = effectiveClusterPositions[docSlug];
            const relX = clusterPos
              ? node.position.x - clusterPos.x
              : 0;
            const insertIdx = resolveInsertionIndex(relX, group.allNodes.length);
            const anchorId = resolveDropAnchor(group, insertIdx);
            void ca.moveCustomUsage(profileId, arrayIndex, {
              anchorChainId: anchorId
            });
          } else {
            void ca.moveCustomUsage(profileId, arrayIndex, {
              anchorChainId: null
            });
          }
        } else {
          // Stay floating — persist new position
          onCustomDragEnd(arrayIndex, { x: node.position.x, y: node.position.y });
        }
        return;
      }

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
          // Phase 6: revert position AND flash the dragged cluster red
          setNodes(nds =>
            nds.map(n => (n.id === node.id ? { ...n, position: startPos } : n))
          );
          // DOM flash — add/remove .is-overlap-flash on the cluster element
          const flashEl = document.querySelector(
            `[data-id="${CSS.escape(node.id)}"] .rf-category-group`
          ) as HTMLElement | null;
          if (flashEl) {
            flashEl.classList.add("is-overlap-flash");
            if (overlapTimerRef.current != null) window.clearTimeout(overlapTimerRef.current);
            overlapTimerRef.current = window.setTimeout(() => {
              flashEl.classList.remove("is-overlap-flash");
              overlapTimerRef.current = null;
            }, 600);
          }
        } else {
          onClusterDragEnd(slug, { x: node.position.x, y: node.position.y });
        }
      }
    },
    [clusterDimensions, onClusterDragEnd, onCustomDragEnd, setNodes,
     projection, effectiveClusterPositions, ca, profileId, clearDropHighlight]
  );

  // ─── Auto-pan during HTML5 DnD (library / in-cluster custom drag) ──
  // A rAF loop keeps panning while the cursor sits near the viewport edge,
  // even when the mouse is stationary (HTML5 dragover stops firing then).
  const autoPanRef = useRef<{ dx: number; dy: number; rafId: number | null }>({
    dx: 0, dy: 0, rafId: null
  });

  const startAutoPan = useCallback(() => {
    if (autoPanRef.current.rafId != null) return;
    const tick = () => {
      const { dx, dy } = autoPanRef.current;
      if (dx === 0 && dy === 0) {
        autoPanRef.current.rafId = null;
        return;
      }
      const vp = rf.getViewport();
      rf.setViewport({ x: vp.x + dx, y: vp.y + dy, zoom: vp.zoom });
      autoPanRef.current.rafId = requestAnimationFrame(tick);
    };
    autoPanRef.current.rafId = requestAnimationFrame(tick);
  }, [rf]);

  const stopAutoPan = useCallback(() => {
    autoPanRef.current.dx = 0;
    autoPanRef.current.dy = 0;
    if (autoPanRef.current.rafId != null) {
      cancelAnimationFrame(autoPanRef.current.rafId);
      autoPanRef.current.rafId = null;
    }
  }, []);

  // Cleanup rAF on unmount
  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const { rafId } = autoPanRef.current;
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, []);

  // ─── Shared helper: update drop highlight for a flow-space position ──
  // Used by both handleDragOver (HTML5 DnD) and handleNodeDrag (react-flow).
  const updateDropHighlight = useCallback(
    (flowPos: { x: number; y: number }) => {
      if (!projection) return;
      const { docSlug, distance } = findNearestCluster(
        flowPos, projection.groups, effectiveClusterPositions
      );
      const isNear = distance <= SNAP_THRESHOLD_PX && !!docSlug;

      let lineXPx = CLUSTER_PAD / 2;
      if (isNear && docSlug) {
        const group = projection.groups.find((g) => g.docSlug === docSlug);
        if (group) {
          const clusterPos = effectiveClusterPositions[docSlug];
          const relX = clusterPos ? flowPos.x - clusterPos.x : 0;
          const insertIdx = resolveInsertionIndex(relX, group.allNodes.length);
          lineXPx = insertLineX(insertIdx);
        }
      }

      const prev = dropRef.current;
      const targetSlug = isNear ? docSlug : null;

      if (prev && prev.slug !== targetSlug) {
        clearDropHighlight(prev.slug);
      }

      if (targetSlug) {
        const group = projection.groups.find((g) => g.docSlug === targetSlug);
        const clusterPos = effectiveClusterPositions[targetSlug!];
        const relX = clusterPos ? flowPos.x - clusterPos.x : 0;
        const insertIdx = group ? resolveInsertionIndex(relX, group.allNodes.length) : 0;
        const anchorChainId = group ? resolveDropAnchor(group, insertIdx) : null;
        dropRef.current = { slug: targetSlug, anchorChainId, insertLineXPx: lineXPx };
        applyDropHighlight(targetSlug, lineXPx);
      } else {
        dropRef.current = null;
      }
    },
    [projection, effectiveClusterPositions, applyDropHighlight, clearDropHighlight]
  );

  // ─── React-flow node drag: show highlight for floating customs ────
  const handleNodeDrag = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (!node.id.startsWith("floating:")) return;
      updateDropHighlight(node.position);
    },
    [updateDropHighlight]
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent) => {
      const payload = canvasDragState.value;
      if (!payload) return;
      if (payload.kind !== "library-custom-node" && payload.kind !== "canvas-custom") return;
      event.preventDefault();
      event.dataTransfer.dropEffect = payload.kind === "library-custom-node" ? "copy" : "move";

      if (!projection) return;
      const flowPos = rf.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      updateDropHighlight(flowPos);

      // Auto-pan when cursor is near viewport edges
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      let dx = 0, dy = 0;
      if (event.clientY > rect.bottom - AUTOPAN_EDGE_PX) dy = -AUTOPAN_SPEED;
      else if (event.clientY < rect.top + AUTOPAN_EDGE_PX) dy = AUTOPAN_SPEED;
      if (event.clientX > rect.right - AUTOPAN_EDGE_PX) dx = -AUTOPAN_SPEED;
      else if (event.clientX < rect.left + AUTOPAN_EDGE_PX) dx = AUTOPAN_SPEED;
      autoPanRef.current.dx = dx;
      autoPanRef.current.dy = dy;
      if (dx !== 0 || dy !== 0) startAutoPan();
    },
    [projection, rf, updateDropHighlight, startAutoPan]
  );

  const handleDragLeave = useCallback(() => {
    stopAutoPan();
    const prev = dropRef.current;
    if (prev) {
      clearDropHighlight(prev.slug);
      dropRef.current = null;
    }
  }, [clearDropHighlight, stopAutoPan]);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      stopAutoPan();

      // Clear DOM highlight
      const dropInfo = dropRef.current;
      if (dropInfo) {
        clearDropHighlight(dropInfo.slug);
      }
      dropRef.current = null;

      const payload = canvasDragState.value;
      canvasDragState.value = null;
      if (!payload || !projection) return;
      if (payload.kind !== "library-custom-node" && payload.kind !== "canvas-custom") return;

      const flowPos = rf.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const { docSlug, distance } = findNearestCluster(
        flowPos, projection.groups, effectiveClusterPositions
      );

      // ── Resolve anchor from position within the nearest cluster ──
      const isNear = distance <= SNAP_THRESHOLD_PX && !!docSlug;
      let nearAnchorId: string | null = null;
      if (isNear && docSlug) {
        const nearGroup = projection.groups.find((g) => g.docSlug === docSlug);
        if (nearGroup) {
          const clusterPos = effectiveClusterPositions[docSlug];
          const relX = clusterPos ? flowPos.x - clusterPos.x : 0;
          const insertIdx = resolveInsertionIndex(relX, nearGroup.allNodes.length);
          nearAnchorId = resolveDropAnchor(nearGroup, insertIdx);
        }
      }

      void (async () => {
        if (payload.kind === "canvas-custom") {
          // ── Re-anchor / float an existing custom node ────────────
          if (isNear) {
            await ca.moveCustomUsage(profileId, payload.arrayIndex, {
              anchorChainId: nearAnchorId
            });
          } else {
            onCustomDragEnd(payload.arrayIndex, flowPos);
            await ca.moveCustomUsage(profileId, payload.arrayIndex, {
              anchorChainId: null
            });
          }
          return;
        }

        // ── Library drop: add new custom usage ─────────────────────
        const prof = ca.disk?.profiles.find((p) => p.id === profileId);
        if (!prof) return;

        // Auto-pin: silently pin the branch if the family isn't pinned
        // to this branch yet (C26 carried).
        const refs = prof.project.resources ?? [];
        const existingRef = refs.find(
          (r) =>
            r.kind === "custom" &&
            r.resource_instance_id === payload.resourceInstanceId
        );
        if (
          !existingRef ||
          profileResourceBranchId(existingRef) !== payload.branchId
        ) {
          const ok = await ca.pinBranch(
            profileId, "custom",
            payload.resourceInstanceId, payload.branchId
          );
          if (!ok) return; // pinBranch failed (showed dialog)
        }

        if (isNear) {
          // ── Near cluster: anchor at the resolved insertion position ──
          const anchor = nearAnchorId
            ? { kind: "builtin_core_chain" as const, chain_id: nearAnchorId }
            : null;
          await ca.addCustomUsage(
            profileId, payload.resourceInstanceId, payload.nodeId, anchor
          );
        } else {
          // ── Far from cluster: add unanchored + save position ──────
          const freshProf = ca.disk?.profiles.find((p) => p.id === profileId);
          const nextIdx = (freshProf?.project.custom_node_usages ?? []).length;
          onCustomDragEnd(nextIdx, flowPos);
          await ca.addCustomUsage(
            profileId, payload.resourceInstanceId, payload.nodeId, null
          );
        }
      })();
    },
    [projection, effectiveClusterPositions, rf, ca, profileId, onCustomDragEnd, clearDropHighlight, stopAutoPan]
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={rfEdges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onNodeDragStart={handleNodeDragStart}
      onNodeDrag={handleNodeDrag}
      onNodeDragStop={handleNodeDragStop}
      onMove={handleMove}
      onPaneClick={onPaneClick}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragLeave={handleDragLeave}
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
      <Controls showInteractive={false} aria-label="画布缩放控件">
        {/* Minimap toggle — rendered inside Controls so it shares the
            same container border / width, no manual alignment needed. */}
        <button
          type="button"
          className="react-flow__controls-button rf-minimap-toggle"
          onClick={() => setMinimapVisible((v) => !v)}
          title={minimapVisible ? "隐藏小地图" : "显示小地图"}
          aria-label={minimapVisible ? "隐藏小地图" : "显示小地图"}
          aria-pressed={minimapVisible}
        >
          <span className="codicon codicon-map" aria-hidden="true" />
        </button>
      </Controls>
      {minimapVisible && (
        <MiniMap
          pannable
          zoomable
          style={{ background: "var(--tc-canvas-bg, #1e1e1e)" }}
          maskColor="rgba(0,0,0,0.6)"
          nodeColor={(n) => {
            if (n.id.startsWith("floating:")) return "var(--tc-accent, #007acc)";
            const slug = n.id.replace(/^group:/, "");
            return clusterColor(slug);
          }}
          nodeStrokeColor={(n) => {
            if (!selection) return "transparent";
            // Precompute: which RF node ID contains the selection?
            return n.id === selectedRfNodeId ? clusterColor(n.id.replace(/^group:/, "")) : "transparent";
          }}
          nodeStrokeWidth={3}
          aria-label="画布小地图"
        />
      )}
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

export type { CanvasFreeformBodyProps };
