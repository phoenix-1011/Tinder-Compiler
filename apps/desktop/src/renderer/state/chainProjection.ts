import type {
  CustomNodeConfig,
  CustomNodeUsage,
  GuiProjectFile,
  PlatformResourceInstance,
  ProfileStandardVariantRef
} from "@tinder/nextstep";
import { CHAIN_CATALOG } from "../help/chain-catalog.generated";

/**
 * One row in the `链路` view's projection.
 *
 * - `chain-node`: a canonical core-chain node from the generated catalog,
 *   annotated with active coverage.
 * - `custom`: a custom node usage from the profile, placed before its
 *   anchor or appended at the tail when unanchored.
 */
export type ChainProjectionRow = ChainNodeRow | CustomUsageRow;

export interface ChainNodeRow {
  kind: "chain-node";
  nodeId: string;
  displayName: string;
  /** 1-based canonical execution order from `02-ordered-execution.md`. */
  order: number;
  /** Owning chain doc slug, e.g. `10-platform-chain`. Stable filter key. */
  docSlug: string;
  /** Owning chain doc title, e.g. `平台基础链路`. Display only. */
  docTitle: string;
  coverage: ChainCoverage;
}

export interface CustomUsageRow {
  kind: "custom";
  usage: CustomNodeUsage;
  /** Index in the source `profile.custom_node_usages[]` — used by edit actions. */
  arrayIndex: number;
  /** Resolved display name for the usage. Falls back to ids when unknown. */
  displayName: string;
  /** Position relative to its anchor: anchor's node id, or `null` for tail. */
  anchorChainId: string | null;
}

export interface ChainCoverage {
  /** Count of active standard refs that own a compute_node for this canonical id. */
  count: number;
  /** Status derived from `count` so the renderer doesn't recompute. */
  status: "missing" | "covered" | "multi";
  /** Owning resource summaries for tooltip / sub-row display. */
  resources: Array<{
    resourceId: string;
    variantId: string;
    displayName: string;
  }>;
}

// ──────────────────────────────────────────────────────────────────────────
// Execution projection — one row per active compute node
// ──────────────────────────────────────────────────────────────────────────

/**
 * Row produced by `buildExecutionProjection` for an active standard
 * resource. Unlike the full-chain projection, multiple rows can share a
 * canonical chain node when several resources cover it, and canonical
 * nodes with no coverage produce zero rows.
 */
export interface ExecutionStandardRow {
  kind: "exec-standard";
  /** Canonical chain node id this resource runs for. */
  chainNodeId: string;
  /** Canonical chain node display name. */
  chainDisplayName: string;
  /** Canonical execution order from `02-ordered-execution.md`. */
  order: number;
  /** Owning chain doc slug + title (for filtering / category display). */
  docSlug: string;
  docTitle: string;
  /** The resource running this node. */
  resourceId: string;
  resourceDisplayName: string;
  variantId: string;
}

export type ExecutionRow = ExecutionStandardRow | CustomUsageRow;

/**
 * Build the ordered row list shown under `链路`.
 *
 * The view consumes this exclusively — no derived state stays in the
 * component. Inputs:
 *
 * - `profile.resources[]` filtered to active standard refs gives coverage.
 * - `profile.custom_node_usages[]` (enabled only) provides custom placements,
 *   sorted by `order` within each anchor.
 * - `standardCatalog` is the flat list of standard resource leaves so we can
 *   look up `compute_nodes[]` and display names.
 * - `customLeaves` is the flat list of custom leaves for usage display names.
 *
 * The function never reads from disk and is safe to call on every render.
 */
export function buildChainProjection(
  profile: GuiProjectFile,
  standardCatalog: PlatformResourceInstance[],
  customLeaves: CustomNodeConfig[]
): ChainProjectionRow[] {
  const orderedNodes = CHAIN_CATALOG.orderedNodes;

  // Index active standard refs by which canonical node ids their resources
  // cover. The current MVP treats every compute_node on a resource as
  // covering (no model_variants[] filtering yet — that's owned by the
  // resource-editor task package).
  const activeStandardRefs = (profile.resources ?? []).filter(
    (r): r is ProfileStandardVariantRef => r.kind === "standard" && r.enabled
  );
  const standardById = new Map<string, PlatformResourceInstance>();
  for (const r of standardCatalog) {
    standardById.set(r.resource_instance_id, r);
  }
  const coverageByNodeId = new Map<string, ChainCoverage["resources"]>();
  for (const ref of activeStandardRefs) {
    const resource = standardById.get(ref.resource_instance_id);
    if (!resource) continue;
    for (const cn of resource.compute_nodes) {
      const list = coverageByNodeId.get(cn.node_id) ?? [];
      list.push({
        resourceId: ref.resource_instance_id,
        variantId: ref.variant_id,
        displayName: resource.display_name
      });
      coverageByNodeId.set(cn.node_id, list);
    }
  }

  // Group all custom usages (enabled or not) by `insert_before` anchor. Only
  // `builtin_core_chain` anchors are honoured here; other anchor kinds and
  // unanchored usages flow into the tail bucket. We carry the array index
  // alongside each usage so edit actions can target the source position.
  // Disabled usages stay in the projection so the user can re-enable them
  // without leaving 链路; the renderer is responsible for muting them.
  interface IndexedUsage {
    usage: CustomNodeUsage;
    arrayIndex: number;
  }
  const usagesByAnchor = new Map<string, IndexedUsage[]>();
  const tailUsages: IndexedUsage[] = [];
  (profile.custom_node_usages ?? []).forEach((usage, arrayIndex) => {
    const indexed: IndexedUsage = { usage, arrayIndex };
    if (usage.insert_before && usage.insert_before.kind === "builtin_core_chain") {
      const key = usage.insert_before.chain_id;
      const list = usagesByAnchor.get(key) ?? [];
      list.push(indexed);
      usagesByAnchor.set(key, list);
    } else {
      tailUsages.push(indexed);
    }
  });
  for (const list of usagesByAnchor.values()) {
    list.sort((a, b) => a.usage.order - b.usage.order);
  }
  tailUsages.sort((a, b) => a.usage.order - b.usage.order);

  // Custom leaf lookup for display names. In the current pre-multi-node
  // codebase one leaf == one node, keyed by `custom_node_id`.
  const customByResourceId = new Map<string, CustomNodeConfig>();
  for (const leaf of customLeaves) {
    customByResourceId.set(
      leaf.resource_instance_id ?? leaf.custom_node_id,
      leaf
    );
  }
  const customDisplayName = (usage: CustomNodeUsage): string => {
    const leaf = customByResourceId.get(usage.resource_instance_id);
    if (leaf?.display_name) return leaf.display_name;
    return `${usage.resource_instance_id}/${usage.node_id}`;
  };

  // Index groups by docSlug so we can label each node with its owning chain
  // doc (e.g. "平台基础链路"). Falls back to the slug if the catalog hasn't
  // registered a friendly title (shouldn't happen at runtime).
  const groupBySlug = new Map(
    CHAIN_CATALOG.groups.map((g) => [g.docSlug, g] as const)
  );

  const rows: ChainProjectionRow[] = [];
  for (const node of orderedNodes) {
    for (const { usage, arrayIndex } of usagesByAnchor.get(node.nodeId) ?? []) {
      rows.push({
        kind: "custom",
        usage,
        arrayIndex,
        displayName: customDisplayName(usage),
        anchorChainId: node.nodeId
      });
    }
    const cov = coverageByNodeId.get(node.nodeId) ?? [];
    const group = groupBySlug.get(node.docSlug);
    rows.push({
      kind: "chain-node",
      nodeId: node.nodeId,
      displayName: node.displayName,
      order: node.order,
      docSlug: node.docSlug,
      docTitle: group?.title ?? node.docSlug,
      coverage: {
        count: cov.length,
        status:
          cov.length === 0 ? "missing" : cov.length === 1 ? "covered" : "multi",
        resources: cov
      }
    });
  }
  for (const { usage, arrayIndex } of tailUsages) {
    rows.push({
      kind: "custom",
      usage,
      arrayIndex,
      displayName: customDisplayName(usage),
      anchorChainId: null
    });
  }
  return rows;
}

/**
 * Build the row list shown under `实际执行链路`. Driven by compute resources:
 *
 * - For each canonical chain node in order, emit one `exec-standard` row
 *   per active standard ref whose resource covers that node id (via
 *   `compute_nodes[].node_id`). If no resource covers it, no row.
 * - Enabled custom usages interleave at their anchor (same algorithm as the
 *   full projection). Disabled usages are dropped since they wouldn't run.
 * - Tail (unanchored) custom usages append last.
 *
 * Result: zero standard rows when nothing's wired up, multiple rows per
 * canonical node when several resources cover it. There's no `缺失` state
 * in this view by construction.
 */
export function buildExecutionProjection(
  profile: GuiProjectFile,
  standardCatalog: PlatformResourceInstance[],
  customLeaves: CustomNodeConfig[]
): ExecutionRow[] {
  const orderedNodes = CHAIN_CATALOG.orderedNodes;

  const activeStandardRefs = (profile.resources ?? []).filter(
    (r): r is ProfileStandardVariantRef => r.kind === "standard" && r.enabled
  );
  const standardById = new Map<string, PlatformResourceInstance>();
  for (const r of standardCatalog) {
    standardById.set(r.resource_instance_id, r);
  }
  // For each canonical node id, the list of (ref, resource) pairs whose
  // compute_nodes touch it. Order within the list follows the order refs
  // were added to the profile so re-orderings stay deterministic.
  const coverageByNodeId = new Map<
    string,
    Array<{ ref: ProfileStandardVariantRef; resource: PlatformResourceInstance }>
  >();
  for (const ref of activeStandardRefs) {
    const resource = standardById.get(ref.resource_instance_id);
    if (!resource) continue;
    for (const cn of resource.compute_nodes) {
      const list = coverageByNodeId.get(cn.node_id) ?? [];
      list.push({ ref, resource });
      coverageByNodeId.set(cn.node_id, list);
    }
  }

  const groupBySlug = new Map(
    CHAIN_CATALOG.groups.map((g) => [g.docSlug, g] as const)
  );

  // Custom usage grouping mirrors the full projection but excludes disabled.
  interface IndexedUsage {
    usage: CustomNodeUsage;
    arrayIndex: number;
  }
  const usagesByAnchor = new Map<string, IndexedUsage[]>();
  const tailUsages: IndexedUsage[] = [];
  (profile.custom_node_usages ?? []).forEach((usage, arrayIndex) => {
    if (!usage.enabled) return;
    const indexed: IndexedUsage = { usage, arrayIndex };
    if (
      usage.insert_before &&
      usage.insert_before.kind === "builtin_core_chain"
    ) {
      const key = usage.insert_before.chain_id;
      const list = usagesByAnchor.get(key) ?? [];
      list.push(indexed);
      usagesByAnchor.set(key, list);
    } else {
      tailUsages.push(indexed);
    }
  });
  for (const list of usagesByAnchor.values()) {
    list.sort((a, b) => a.usage.order - b.usage.order);
  }
  tailUsages.sort((a, b) => a.usage.order - b.usage.order);

  const customByResourceId = new Map<string, CustomNodeConfig>();
  for (const leaf of customLeaves) {
    customByResourceId.set(
      leaf.resource_instance_id ?? leaf.custom_node_id,
      leaf
    );
  }
  const customDisplayName = (usage: CustomNodeUsage): string =>
    customByResourceId.get(usage.resource_instance_id)?.display_name ??
    `${usage.resource_instance_id}/${usage.node_id}`;

  const rows: ExecutionRow[] = [];
  for (const node of orderedNodes) {
    // Custom usages anchored at this chain node render before its standard rows.
    for (const { usage, arrayIndex } of usagesByAnchor.get(node.nodeId) ?? []) {
      rows.push({
        kind: "custom",
        usage,
        arrayIndex,
        displayName: customDisplayName(usage),
        anchorChainId: node.nodeId
      });
    }
    const covers = coverageByNodeId.get(node.nodeId);
    if (!covers || covers.length === 0) continue;
    const group = groupBySlug.get(node.docSlug);
    for (const { ref, resource } of covers) {
      rows.push({
        kind: "exec-standard",
        chainNodeId: node.nodeId,
        chainDisplayName: node.displayName,
        order: node.order,
        docSlug: node.docSlug,
        docTitle: group?.title ?? node.docSlug,
        resourceId: ref.resource_instance_id,
        resourceDisplayName: resource.display_name,
        variantId: ref.variant_id
      });
    }
  }
  for (const { usage, arrayIndex } of tailUsages) {
    rows.push({
      kind: "custom",
      usage,
      arrayIndex,
      displayName: customDisplayName(usage),
      anchorChainId: null
    });
  }
  return rows;
}
