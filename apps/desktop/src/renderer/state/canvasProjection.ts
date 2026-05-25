import type {
  ComputeResourceV2,
  CustomNodeConfig,
  CustomNodeUsage,
  GuiProjectFile
} from "@tinder/nextstep";
import { CHAIN_CATALOG } from "../help/chain-catalog.generated";
import {
  buildChainProjection,
  type ChainNodeRow,
  type ChainProjectionRow,
  type CustomUsageRow
} from "./chainProjection";
import type { CanvasSelection } from "./canvasState";

/**
 * Canvas-side projection of a profile. The canvas (Phase 2+) renders
 * this; chainProjection.ts remains the reference list view (C18).
 *
 * Shape: groups of canonical doc slugs (C5), each group an ordered
 * sequence of slot / custom nodes (C22). Customs are first-class
 * nodes positioned between slot nodes, never inside.
 *
 * The coverage filter (C6) is applied as a post-process — see
 * `visibleNodes`. `allNodes` keeps the unfiltered sequence so the
 * filter toggle does not require a rebuild.
 *
 * Hidden-slot semantics (C6 + C22): a slot is hidden when
 *   coverage.count === 0  AND  no custom node has anchorChainId === this slot
 * When two visible slots become non-adjacent because of hidden slots
 * in between, the flow line spans the larger gap automatically — the
 * `visibleNodes` list simply omits the hidden slots, customs that
 * sat in front of them remain in sequence, and the canvas renderer
 * draws edges between consecutive entries.
 */

export type CanvasNode = CanvasSlotNode | CanvasCustomNode;

export interface CanvasSlotNode {
  kind: "slot";
  nodeId: string;
  displayName: string;
  /** Canonical 1-based execution order from CHAIN_CATALOG. */
  order: number;
  docSlug: string;
  docTitle: string;
  /** Coverage tally — drives multi-coverage stack and color treatment. */
  coverage: ChainNodeRow["coverage"];
}

export interface CanvasCustomNode {
  kind: "custom";
  usage: CustomNodeUsage;
  /** Index into profile.custom_node_usages — used by future drag/reorder. */
  arrayIndex: number;
  displayName: string;
  resourceDisplayName?: string;
  branchId?: string;
  /**
   * The chain node this custom is anchored at. null = unanchored tail
   * (renders in the `custom-only` virtual group per requirement.md).
   */
  anchorChainId: string | null;
  /** Mirror of usage.enabled for the canvas renderer (C17 dashed edges). */
  enabled: boolean;
  /**
   * True when the usage's `node_id` does not exist in the currently
   * pinned branch's `custom_nodes` — i.e., a soft-orphan left over
   * from a branch transfer (C26). The canvas renders these with a
   * warning treatment and the inspector exposes recovery actions.
   */
  isOrphan: boolean;
}

export interface CanvasGroup {
  docSlug: string;
  docTitle: string;
  /** Whether this is the synthetic `custom-only` group (tail customs). */
  isCustomOnly: boolean;
  /**
   * Unfiltered ordered sequence of slot + custom nodes. Custom nodes
   * anchored at chain node X appear immediately before X (matching
   * `chainProjection.ts`'s row order, which mirrors runtime sequencing).
   */
  allNodes: CanvasNode[];
  /**
   * Coverage-filtered sequence (per C6). Slots with no coverage and
   * no incident custom node are omitted; the remaining slot/custom
   * order is preserved so the renderer can map edges 1:1.
   */
  visibleNodes: CanvasNode[];
  /** Pre-computed counts shown in the panel header. */
  coveredSlotCount: number;
  totalSlotCount: number;
  /** Whether `visibleNodes` was non-trivially filtered. Drives UI hints. */
  hiddenSlotCount: number;
}

export interface CanvasProjection {
  groups: CanvasGroup[];
  /**
   * Synthetic `custom-only` group at the end, holding tail customs
   * (unanchored or anchored to non-chain anchors). Null if empty so
   * the canvas can skip rendering an empty trailing panel.
   */
  customOnly: CanvasGroup | null;
}

/**
 * Build a canvas projection for `profile`.
 *
 * `coverageFilter` is read here (not in the renderer) so `visibleNodes`
 * is always consistent with `allNodes`. When `false`, every slot is
 * visible regardless of coverage.
 */
export function buildCanvasProjection(
  profile: GuiProjectFile,
  profileResources: ComputeResourceV2[],
  customLeaves: CustomNodeConfig[],
  coverageFilter: boolean
): CanvasProjection {
  // Pre-compute orphan-usage set (C26): a usage is orphan when its
  // `node_id` isn't declared by the currently pinned branch's
  // `custom_nodes`. `profileResources` already resolves to the
  // pinned branch's content per `collectProfileV2Resources`, so a
  // missing `custom_nodes` match here means the branch transferred
  // away from a definition that previously existed.
  const orphanArrayIndexes = new Set<number>();
  (profile.custom_node_usages ?? []).forEach((usage, idx) => {
    const resource = profileResources.find(
      (r) =>
        r.resource_kind === "custom" &&
        r.resource_instance_id === usage.resource_instance_id
    );
    if (!resource || resource.resource_kind !== "custom") {
      // No resolved resource — treat as orphan so the user sees a
      // recoverable warning instead of a silently-broken usage.
      orphanArrayIndexes.add(idx);
      return;
    }
    const declared = resource.custom_nodes.some(
      (n) => n.node_id === usage.node_id
    );
    if (!declared) orphanArrayIndexes.add(idx);
  });
  const rowToNodeWithOrphans = (row: ChainProjectionRow): CanvasNode =>
    rowToNode(row, orphanArrayIndexes);

  // Reuse the list projection so canvas + list stay perfectly
  // aligned on row ordering, coverage tallying, and custom display
  // names. Differences are limited to *grouping* and the visibility
  // filter; the source-of-truth ordering is shared.
  const rows = buildChainProjection(profile, profileResources, customLeaves);
  const groupBySlug = new Map(
    CHAIN_CATALOG.groups.map((g) => [g.docSlug, g] as const)
  );

  // Bucket rows by docSlug. Chain-node rows have their own docSlug;
  // custom rows belong to the docSlug of their anchor (or the
  // synthetic custom-only group when anchorChainId is null).
  const orderedSlugs: string[] = [];
  const buckets = new Map<string, ChainProjectionRow[]>();
  const customOnlyRows: CustomUsageRow[] = [];

  // Pre-seed buckets in canonical group order so empty groups still
  // appear (some chain doc slugs may have no covered/anchored content
  // — we let the renderer decide whether to collapse them).
  for (const g of CHAIN_CATALOG.groups) {
    orderedSlugs.push(g.docSlug);
    buckets.set(g.docSlug, []);
  }

  // Index chain-node rows by id so custom rows can find their
  // anchor's docSlug without a second pass.
  const chainNodeSlugById = new Map<string, string>();
  for (const row of rows) {
    if (row.kind !== "chain-node") continue;
    chainNodeSlugById.set(row.nodeId, row.docSlug);
  }

  for (const row of rows) {
    if (row.kind === "chain-node") {
      const list = buckets.get(row.docSlug);
      if (list) list.push(row);
      continue;
    }
    // custom row
    if (row.anchorChainId) {
      const slug = chainNodeSlugById.get(row.anchorChainId);
      if (slug) {
        const list = buckets.get(slug);
        if (list) {
          list.push(row);
          continue;
        }
      }
    }
    // Unanchored or anchored to an unknown chain id → custom-only.
    customOnlyRows.push(row);
  }

  const groups: CanvasGroup[] = orderedSlugs.map((slug) => {
    const meta = groupBySlug.get(slug);
    const title = meta?.title ?? slug;
    const rowsInGroup = buckets.get(slug) ?? [];
    const allNodes = rowsInGroup.map(rowToNodeWithOrphans);

    const slotsInGroup = allNodes.filter(
      (n): n is CanvasSlotNode => n.kind === "slot"
    );
    const customsBySlotAnchor = customAnchorSet(allNodes);

    const visibleNodes = coverageFilter
      ? filterVisible(allNodes, customsBySlotAnchor)
      : allNodes;

    const coveredSlotCount = slotsInGroup.reduce(
      (acc, s) => (s.coverage.count > 0 ? acc + 1 : acc),
      0
    );
    const visibleSlotCount = visibleNodes.filter(
      (n) => n.kind === "slot"
    ).length;

    return {
      docSlug: slug,
      docTitle: title,
      isCustomOnly: false,
      allNodes,
      visibleNodes,
      coveredSlotCount,
      totalSlotCount: slotsInGroup.length,
      hiddenSlotCount: slotsInGroup.length - visibleSlotCount
    };
  });

  const customOnly =
    customOnlyRows.length > 0
      ? {
          docSlug: "__custom_only__",
          docTitle: "Custom-only anchors",
          isCustomOnly: true,
          allNodes: customOnlyRows.map(rowToNodeWithOrphans),
          visibleNodes: customOnlyRows.map(rowToNodeWithOrphans),
          coveredSlotCount: 0,
          totalSlotCount: 0,
          hiddenSlotCount: 0
        }
      : null;

  return { groups, customOnly };
}

// ──────────────────────────────────────────────────────────────────────
// Internals
// ──────────────────────────────────────────────────────────────────────

function rowToNode(
  row: ChainProjectionRow,
  orphanArrayIndexes: Set<number>
): CanvasNode {
  if (row.kind === "chain-node") {
    return {
      kind: "slot",
      nodeId: row.nodeId,
      displayName: row.displayName,
      order: row.order,
      docSlug: row.docSlug,
      docTitle: row.docTitle,
      coverage: row.coverage
    };
  }
  return {
    kind: "custom",
    usage: row.usage,
    arrayIndex: row.arrayIndex,
    displayName: row.displayName,
    resourceDisplayName: row.resourceDisplayName,
    branchId: row.branchId,
    anchorChainId: row.anchorChainId,
    enabled: row.usage.enabled,
    isOrphan: orphanArrayIndexes.has(row.arrayIndex)
  };
}

/** Set of chain node ids that have at least one custom anchored at them. */
function customAnchorSet(nodes: CanvasNode[]): Set<string> {
  const out = new Set<string>();
  for (const n of nodes) {
    if (n.kind === "custom" && n.anchorChainId) out.add(n.anchorChainId);
  }
  return out;
}

/**
 * Apply the C6 coverage filter:
 * - keep custom nodes always
 * - drop slot nodes that are uncovered AND have no incident custom
 *
 * Customs whose anchor slot just got dropped stay in the list; they
 * implicitly "merge" onto the longer edge formed by the remaining
 * neighbors (C22 hidden-slot collapse rule).
 */
function filterVisible(
  nodes: CanvasNode[],
  customsBySlotAnchor: Set<string>
): CanvasNode[] {
  return nodes.filter((n) => {
    if (n.kind === "custom") return true;
    if (n.coverage.count > 0) return true;
    if (customsBySlotAnchor.has(n.nodeId)) return true;
    return false;
  });
}

// ──────────────────────────────────────────────────────────────────
// Locked focus filter (C10)
// ──────────────────────────────────────────────────────────────────

/**
 * Apply the locked-focus window to a projection. Returns a NEW
 * projection where:
 *   - the ±N neighborhood around `target` is rendered as the only
 *     visible nodes (groups outside the window collapse to title
 *     strips — the caller decides whether to honor that via UI)
 *   - groups containing in-window nodes keep only the in-window
 *     portion in `visibleNodes`
 *   - groups with no in-window node have empty `visibleNodes`; the
 *     UI is expected to treat them as collapsed-to-title (a Phase 5
 *     UI concern, not a projection concern).
 *
 * Per Resolved Edge Cases:
 *   - radius counts ALL nodes (slot + custom), not slots only
 *   - cross-group span is allowed
 *   - coverage filter has already been applied by buildCanvasProjection;
 *     this filter operates on the post-coverage-filter list so the
 *     ±N window is interpreted in "visible space"
 *
 * If `target` is null or can't be located in the projection, returns
 * the projection unchanged.
 */
export function applyLockedFocus(
  projection: CanvasProjection,
  target: CanvasSelection | null,
  radius: number
): CanvasProjection {
  if (!target) return projection;
  // Flatten visible nodes across groups (plus custom-only) in
  // canonical order so we can compute the window in one pass. The
  // flat-index → group mapping lets us split the window back into
  // per-group slices afterwards.
  const flat: Array<{ node: CanvasNode; groupIndex: number }> = [];
  projection.groups.forEach((g, gi) => {
    for (const n of g.visibleNodes) {
      flat.push({ node: n, groupIndex: gi });
    }
  });
  if (projection.customOnly) {
    for (const n of projection.customOnly.visibleNodes) {
      flat.push({ node: n, groupIndex: projection.groups.length });
    }
  }

  const centerIdx = flat.findIndex(({ node }) =>
    nodeMatchesSelection(node, target)
  );
  if (centerIdx < 0) {
    // Target was filtered out by the coverage filter, or selection
    // points at something not present (e.g. just-deleted custom). No
    // window to compute — return unchanged.
    return projection;
  }

  const minIdx = Math.max(0, centerIdx - radius);
  const maxIdx = Math.min(flat.length - 1, centerIdx + radius);

  // Build a Set of "(groupIndex, nodeKey)" tokens for fast in-window
  // checks per group's visibleNodes. nodeKey is the canonical
  // identity used elsewhere.
  const inWindow = new Set<string>();
  for (let i = minIdx; i <= maxIdx; i++) {
    const entry = flat[i]!;
    inWindow.add(`${entry.groupIndex}::${nodeIdentity(entry.node)}`);
  }

  const filterGroup = (g: CanvasGroup, gi: number): CanvasGroup => {
    const filtered = g.visibleNodes.filter((n) =>
      inWindow.has(`${gi}::${nodeIdentity(n)}`)
    );
    if (filtered.length === g.visibleNodes.length) return g;
    return { ...g, visibleNodes: filtered };
  };

  return {
    groups: projection.groups.map((g, gi) => filterGroup(g, gi)),
    customOnly: projection.customOnly
      ? filterGroup(projection.customOnly, projection.groups.length)
      : null
  };
}

function nodeMatchesSelection(
  node: CanvasNode,
  sel: CanvasSelection
): boolean {
  if (sel.kind === "slot") {
    return node.kind === "slot" && node.nodeId === sel.chainNodeId;
  }
  if (sel.kind === "coverage") {
    // The slot containing the coverage is the center — coverage
    // cards live inside slots, they don't have their own canvas
    // position.
    return node.kind === "slot" && node.nodeId === sel.chainNodeId;
  }
  return (
    node.kind === "custom" && node.arrayIndex === sel.usageArrayIndex
  );
}

function nodeIdentity(node: CanvasNode): string {
  return node.kind === "slot"
    ? `slot:${node.nodeId}`
    : `custom:${node.arrayIndex}`;
}

/**
 * Lens-highlight neighbor set (C10 light layer). Given a selection
 * and the projection, returns a set of node-identity tokens that
 * represent the selection + its first-degree neighbors in canonical
 * visible order. Callers compare each rendered node's identity
 * against this set to decide between `is-lens-near` and
 * `is-lens-far` classes.
 *
 * When no selection: returns null (caller should not apply any
 * fade — the default rendering already shows all nodes at full
 * opacity).
 */
export function lensNeighborTokens(
  projection: CanvasProjection,
  selection: CanvasSelection | null
): Set<string> | null {
  if (!selection) return null;
  const flat: CanvasNode[] = [
    ...projection.groups.flatMap((g) => g.visibleNodes),
    ...(projection.customOnly?.visibleNodes ?? [])
  ];
  const centerIdx = flat.findIndex((n) =>
    nodeMatchesSelection(n, selection)
  );
  if (centerIdx < 0) return null;
  const tokens = new Set<string>();
  for (let i = Math.max(0, centerIdx - 1); i <= Math.min(flat.length - 1, centerIdx + 1); i++) {
    tokens.add(nodeIdentity(flat[i]!));
  }
  return tokens;
}

/** Same identity function the focus filter uses — exported for callers. */
export function canvasNodeIdentity(node: CanvasNode): string {
  return nodeIdentity(node);
}
