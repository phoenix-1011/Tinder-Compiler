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
  /** When true, this custom executes AFTER its anchor (sorts with +0.5). */
  afterAnchor: boolean;
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

/**
 * A contiguous run of execution orders within a group.  When the
 * group's slot orders have gaps (caused by UI_GROUP_OVERRIDES or the
 * canonical chain structure), the group is split into multiple
 * sub-sections at each gap.
 *
 * `routeEdges` distinguishes interleave-type gaps (small span, edges
 * connect at sub-section level) from bookend-type gaps (large span,
 * only a visual divider is shown).
 */
export interface CanvasSubSection {
  /** Ordinal within the group: "0", "1", … */
  subId: string;
  /** Start index into allNodes (inclusive). */
  startIdx: number;
  /** End index into allNodes (exclusive). */
  endIdx: number;
  /** Minimum slot execution order in this sub-section. */
  minOrder: number;
  /** Maximum slot execution order in this sub-section. */
  maxOrder: number;
  /**
   * When `true`, the cross-cluster edge routing operates at this
   * sub-section's granularity (interleave-type split).  When `false`,
   * edges stay at the whole-cluster level (bookend-type split — the
   * sub-section is visual-only).
   */
  routeEdges: boolean;
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
  /**
   * Sub-sections derived from execution-order gaps in `allNodes`.
   * A group with no gaps has a single sub-section spanning all nodes.
   * Multiple sub-sections indicate the cluster's internal execution is
   * non-contiguous — other clusters' nodes execute in between.
   */
  subSections: CanvasSubSection[];
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

// ──────────────────────────────────────────────────────────────────
// UI group overrides — canvas-only split of large canonical groups.
// The chain-catalog and chain-contract docs stay at 10 canonical
// groups; this table re-buckets specific nodeIds into smaller visual
// clusters for the freeform canvas.  Slug numbering (31, 32, 61, 62)
// controls sort position relative to canonical slugs.
// ──────────────────────────────────────────────────────────────────

const UI_GROUP_OVERRIDES: ReadonlyArray<{
  uiSlug: string;
  uiTitle: string;
  nodeIds: ReadonlyArray<string>;
}> = [
  {
    // Orders 64-66 (contiguous). Extracted from 30-signal-environment-chain.
    uiSlug: "31-softkill",
    uiTitle: "软杀效果",
    nodeIds: [
      "softkill.propagation.resolve",
      "platform.softkill.effect.resolve",
      "device.softkill.effect.process"
    ]
  },
  {
    // Orders 67-70 (contiguous). 67-69 from 30-signal, 70 from 40-sense.
    uiSlug: "32-signature",
    uiTitle: "特征传播",
    nodeIds: [
      "environment.signature.generate",
      "environment.signature.lifecycle.manage",
      "environment.signature.propagation.resolve",
      "device.signature.receive.process"
    ]
  },
  {
    // Orders 32-35 (contiguous). Extracted from 60-target-action-chain.
    uiSlug: "61-cooperation",
    uiTitle: "协同与通信",
    nodeIds: [
      "platform.cooperation.message_sync",
      "platform.cooperation.leader_update",
      "platform.cooperation.member_update",
      "platform.cooperation.communication_record"
    ]
  },
  {
    // Orders 36-43 (contiguous). Extracted from 60-target-action-chain.
    uiSlug: "62-inventory",
    uiTitle: "库存与监督",
    nodeIds: [
      "platform.decoy_inventory.update",
      "platform.bullet_inventory.update",
      "platform.missile_inventory.update",
      "platform.ammunitor_inventory.update",
      "platform.carriee_inventory.update",
      "platform.supervise_carriee.update",
      "platform.supervise_missile.update",
      "platform.supervise_canonball.update"
    ]
  },
  {
    // Orders 44-50 (contiguous). Canonical 70-maintenance nodes (44-48)
    // plus homeport/tunnel supervision (49-50) reclassified from
    // 60-target-action-chain to eliminate interleaving.
    uiSlug: "70-maintenance-chain",
    uiTitle: "维护与监督",
    nodeIds: [
      "platform.tracking_request.maintain",
      "platform.tracking_target_key.maintain",
      "platform.tracking_device.resolve",
      "platform.tracking_fact.resolve",
      "platform.supervise_tracking.update",
      "platform.homeport.update",
      "platform.supervise_tunnel.update"
    ]
  }
];

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
    // Unanchored or anchored to an unknown chain id — collect and
    // merge into the last occupied cluster below (no free-floating
    // custom-only group).
    customOnlyRows.push(row);
  }

  // Merge unanchored customs into the last non-empty canonical
  // bucket so every custom lives inside a real cluster.
  if (customOnlyRows.length > 0) {
    let lastSlug: string | null = null;
    for (const slug of orderedSlugs) {
      if ((buckets.get(slug)?.length ?? 0) > 0) lastSlug = slug;
    }
    if (lastSlug) {
      const target = buckets.get(lastSlug)!;
      for (const row of customOnlyRows) target.push(row);
    }
    // else: entire chain is empty — silently drop the customs.
  }

  const groups: CanvasGroup[] = orderedSlugs.map((slug) => {
    const meta = groupBySlug.get(slug);
    const title = meta?.title ?? slug;
    const rowsInGroup = buckets.get(slug) ?? [];
    const rawNodes = rowsInGroup.map(rowToNodeWithOrphans);
    const allNodes = sortNodesByOrder(rawNodes);

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
      hiddenSlotCount: slotsInGroup.length - visibleSlotCount,
      subSections: detectSubSections(allNodes)
    };
  });

  const finalGroups = applyUiGroupOverrides(groups, coverageFilter);

  // customOnly is always null — unanchored customs have been merged
  // into the last cluster above. The field is kept for back-compat
  // with callers that check `projection.customOnly`.
  return { groups: finalGroups, customOnly: null };
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
    afterAnchor: row.afterAnchor,
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

/**
 * Sort a group's allNodes by canonical execution order.
 * - Slot nodes sort by their `order` field.
 * - Custom nodes with `afterAnchor === false` sort at anchor − 0.5
 *   (immediately BEFORE the slot, matching `insert_before` semantics).
 * - Custom nodes with `afterAnchor === true` sort at anchor + 0.5
 *   (immediately AFTER the slot, for end-of-cluster placement).
 * - Unanchored customs go last.
 */
function sortNodesByOrder(nodes: CanvasNode[]): CanvasNode[] {
  const orderById = new Map<string, number>();
  for (const n of nodes) {
    if (n.kind === "slot") orderById.set(n.nodeId, n.order);
  }
  return [...nodes].sort((a, b) => {
    const oa = customSortKey(a, orderById);
    const ob = customSortKey(b, orderById);
    return oa - ob;
  });
}

function customSortKey(
  node: CanvasNode,
  orderById: Map<string, number>
): number {
  if (node.kind === "slot") return node.order;
  if (!node.anchorChainId) return Infinity;
  const anchor = orderById.get(node.anchorChainId);
  if (anchor == null) return Infinity;
  return node.afterAnchor ? anchor + 0.5 : anchor - 0.5;
}

/** Minimum slot execution order in a group (Infinity if no slots). */
function minSlotOrder(group: CanvasGroup): number {
  let min = Infinity;
  for (const n of group.allNodes) {
    if (n.kind === "slot" && n.order < min) min = n.order;
  }
  return min;
}

// ──────────────────────────────────────────────────────────────────────
// Sub-section detection
// ──────────────────────────────────────────────────────────────────────

/**
 * Execution-order gap threshold.  Gaps of this size or larger are
 * classified as "bookend" (visual divider only, edges stay at cluster
 * level).  Smaller gaps are "interleave" (sub-section-level edges).
 */
const BOOKEND_GAP_THRESHOLD = 10;

/**
 * Detect execution-order gaps in a sorted `allNodes` sequence and
 * split into sub-sections.  Each sub-section is a contiguous run of
 * slot execution orders with no gaps.
 *
 * Custom nodes are assigned to the sub-section of their anchor slot.
 * If a custom has no anchor, it joins the last sub-section.
 */
function detectSubSections(allNodes: CanvasNode[]): CanvasSubSection[] {
  // Collect slot indices + orders.
  const slotEntries: Array<{ idx: number; order: number }> = [];
  for (let i = 0; i < allNodes.length; i++) {
    const n = allNodes[i]!;
    if (n.kind === "slot") slotEntries.push({ idx: i, order: n.order });
  }
  if (slotEntries.length === 0) {
    // All-custom group: single sub-section.
    return [{
      subId: "0",
      startIdx: 0,
      endIdx: allNodes.length,
      minOrder: Infinity,
      maxOrder: -Infinity,
      routeEdges: false
    }];
  }

  // Find gap positions between consecutive slots.
  interface GapInfo { afterSlotIdx: number; gap: number }
  const gaps: GapInfo[] = [];
  for (let s = 1; s < slotEntries.length; s++) {
    const gap = slotEntries[s]!.order - slotEntries[s - 1]!.order;
    if (gap > 1) {
      gaps.push({ afterSlotIdx: s - 1, gap });
    }
  }

  if (gaps.length === 0) {
    // Contiguous — single sub-section.
    return [{
      subId: "0",
      startIdx: 0,
      endIdx: allNodes.length,
      minOrder: slotEntries[0]!.order,
      maxOrder: slotEntries[slotEntries.length - 1]!.order,
      routeEdges: true
    }];
  }

  // Split at each gap.  The gap boundary is placed so that all
  // allNodes between the previous sub-section's last slot and the
  // current sub-section's first slot belong to the correct side.
  // Custom nodes BEFORE a slot (afterAnchor === false, sort key
  // anchor − 0.5) belong to that slot's sub-section — NOT the
  // preceding one. This ensures customs dropped to the right of a
  // sub-section divider render after the divider, next to their
  // anchor slot.
  // Customs AFTER a slot (afterAnchor === true) stay in that slot's
  // sub-section.
  const sections: CanvasSubSection[] = [];
  let subStart = 0;
  let slotRunStart = 0;

  for (const { afterSlotIdx, gap } of gaps) {
    const lastSlotNodeIdx = slotEntries[afterSlotIdx]!.idx;
    const nextSlotNodeIdx = slotEntries[afterSlotIdx + 1]!.idx;

    // Default boundary: the index of the next sub-section's first slot.
    let subEnd = nextSlotNodeIdx;

    // Pull the boundary backward to exclude customs that are anchored
    // BEFORE the next slot (afterAnchor === false) — those belong in
    // the next sub-section, not this one.
    const nextSlot = allNodes[nextSlotNodeIdx]!;
    if (nextSlot.kind === "slot") {
      while (subEnd > lastSlotNodeIdx + 1) {
        const prev = allNodes[subEnd - 1]!;
        if (
          prev.kind === "custom" &&
          prev.anchorChainId === nextSlot.nodeId &&
          !prev.afterAnchor
        ) {
          subEnd--;
        } else {
          break;
        }
      }
    }

    const routeEdges = gap < BOOKEND_GAP_THRESHOLD;
    sections.push({
      subId: String(sections.length),
      startIdx: subStart,
      endIdx: subEnd,
      minOrder: slotEntries[slotRunStart]!.order,
      maxOrder: slotEntries[afterSlotIdx]!.order,
      routeEdges
    });
    subStart = subEnd;
    slotRunStart = afterSlotIdx + 1;
  }

  // Final sub-section: slotRunStart..end.
  const lastGap = gaps[gaps.length - 1]!;
  sections.push({
    subId: String(sections.length),
    startIdx: subStart,
    endIdx: allNodes.length,
    minOrder: slotEntries[slotRunStart]!.order,
    maxOrder: slotEntries[slotEntries.length - 1]!.order,
    routeEdges: lastGap.gap < BOOKEND_GAP_THRESHOLD
  });

  return sections;
}

function buildGroupFromNodes(
  docSlug: string,
  docTitle: string,
  allNodes: CanvasNode[],
  coverageFilter: boolean
): CanvasGroup {
  // Sort by execution order so canvas rendering matches the runtime chain.
  const sorted = sortNodesByOrder(allNodes);
  const slotsInGroup = sorted.filter(
    (n): n is CanvasSlotNode => n.kind === "slot"
  );
  const anchors = customAnchorSet(sorted);
  const visibleNodes = coverageFilter
    ? filterVisible(sorted, anchors)
    : sorted;
  const coveredSlotCount = slotsInGroup.reduce(
    (acc, s) => (s.coverage.count > 0 ? acc + 1 : acc),
    0
  );
  const visibleSlotCount = visibleNodes.filter(
    (n) => n.kind === "slot"
  ).length;
  return {
    docSlug,
    docTitle,
    isCustomOnly: false,
    allNodes: sorted,
    visibleNodes,
    coveredSlotCount,
    totalSlotCount: slotsInGroup.length,
    hiddenSlotCount: slotsInGroup.length - visibleSlotCount,
    subSections: detectSubSections(sorted)
  };
}

function applyUiGroupOverrides(
  groups: CanvasGroup[],
  coverageFilter: boolean
): CanvasGroup[] {
  if (UI_GROUP_OVERRIDES.length === 0) return groups;

  // C7: validate override nodeIds against the canonical groups so
  // typos / stale ids surface during development instead of silently
  // producing smaller-than-expected override clusters.
  if (process.env.NODE_ENV !== "production") {
    const allSlotIds = new Set<string>();
    for (const g of groups) {
      for (const n of g.allNodes) {
        if (n.kind === "slot") allSlotIds.add(n.nodeId);
      }
    }
    for (const ov of UI_GROUP_OVERRIDES) {
      for (const id of ov.nodeIds) {
        if (!allSlotIds.has(id)) {
          console.warn(
            `[canvasProjection] UI_GROUP_OVERRIDES: nodeId "${id}" ` +
            `in override "${ov.uiSlug}" not found in any canonical group`
          );
        }
      }
    }
  }

  const nodeIdTarget = new Map<string, string>();
  for (const ov of UI_GROUP_OVERRIDES) {
    for (const id of ov.nodeIds) {
      nodeIdTarget.set(id, ov.uiSlug);
    }
  }
  const extracted = new Map<string, CanvasNode[]>();
  for (const ov of UI_GROUP_OVERRIDES) {
    extracted.set(ov.uiSlug, []);
  }
  const stripped = groups.map((group) => {
    const keep: CanvasNode[] = [];
    for (const node of group.allNodes) {
      let target: string | undefined;
      if (node.kind === "slot") {
        target = nodeIdTarget.get(node.nodeId);
      } else if (node.anchorChainId) {
        target = nodeIdTarget.get(node.anchorChainId);
      }
      if (target) {
        extracted.get(target)!.push(node);
      } else {
        keep.push(node);
      }
    }
    if (keep.length === group.allNodes.length) return group;
    return buildGroupFromNodes(
      group.docSlug,
      group.docTitle,
      keep,
      coverageFilter
    );
  });
  const overrideGroups = UI_GROUP_OVERRIDES.map((ov) =>
    buildGroupFromNodes(
      ov.uiSlug,
      ov.uiTitle,
      extracted.get(ov.uiSlug) ?? [],
      coverageFilter
    )
  );
  const all = [...stripped, ...overrideGroups].filter(
    (g) => g.allNodes.length > 0
  );
  // Sort groups by their earliest slot execution order so the canvas
  // and connection lines match the actual runtime sequence.
  all.sort((a, b) => minSlotOrder(a) - minSlotOrder(b));
  return all;
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
