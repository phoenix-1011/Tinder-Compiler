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
    const allNodes = rowsInGroup.map(rowToNode);

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
          allNodes: customOnlyRows.map(rowToNode),
          visibleNodes: customOnlyRows.map(rowToNode),
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

function rowToNode(row: ChainProjectionRow): CanvasNode {
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
    enabled: row.usage.enabled
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
