import type {
  ComputeResourceV2,
  CustomComputeResource,
  CustomNodeConfig,
  CustomNodeUsage,
  GuiProjectFile,
  ProfileStandardVariantRef,
  StandardComputeCandidate,
  StandardComputeResource
} from "@tinder/nextstep";
import { profileResourceBranchId } from "@tinder/nextstep";
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
  /** When true, the custom executes AFTER the anchor instead of before. */
  afterAnchor: boolean;
  /** Original builtin_core_chain anchor when it no longer exists in CHAIN_CATALOG. */
  missingAnchorChainId?: string;
  resourceDisplayName?: string;
  branchId?: string;
  branchDisplayName?: string;
  nodeNotes?: string;
  handlerFunction?: string;
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
  branchDisplayName: string;
  activeCandidateId: string;
  activeCandidateDisplayName: string;
  activeCandidateFunctionName?: string;
  activeCandidateNotes?: string;
  candidates: Array<{
    candidateId: string;
    displayName: string;
    functionName?: string;
    notes?: string;
  }>;
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
 * - `profileResources` is the profile-effective v2 resource list. It already
 *   resolves selected branches and profile-local effective-candidate overrides.
 * - `customLeaves` is the flat list of custom leaves for usage display names.
 *
 * The function never reads from disk and is safe to call on every render.
 */
export function buildChainProjection(
  profile: GuiProjectFile,
  profileResources: ComputeResourceV2[],
  customLeaves: CustomNodeConfig[]
): ChainProjectionRow[] {
  const orderedNodes = CHAIN_CATALOG.orderedNodes;
  const validChainIds = new Set(orderedNodes.map((n) => n.nodeId));

  // Index active standard refs by the canonical node ids selected by their
  // branch-effective variant. Unselected candidates stay in resource metadata
  // but do not count as profile coverage.
  const activeStandardRefs = (profile.resources ?? []).filter(
    (r): r is ProfileStandardVariantRef => r.kind === "standard" && r.enabled
  );
  const standardById = standardResourceIndex(profileResources);
  const coverageByNodeId = new Map<string, ChainCoverage["resources"]>();
  for (const ref of activeStandardRefs) {
    const resource = standardById.get(ref.resource_instance_id);
    if (!resource) continue;
    const variantId = profileResourceBranchId(ref);
    for (const { nodeId } of effectiveStandardCandidates(resource, variantId)) {
      const list = coverageByNodeId.get(nodeId) ?? [];
      list.push({
        resourceId: ref.resource_instance_id,
        variantId,
        displayName: resource.display_name
      });
      coverageByNodeId.set(nodeId, list);
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
  const beforeByAnchor = new Map<string, IndexedUsage[]>();
  const afterByAnchor = new Map<string, IndexedUsage[]>();
  const tailUsages: IndexedUsage[] = [];
  const missingAnchorUsages: IndexedUsage[] = [];
  (profile.custom_node_usages ?? []).forEach((usage, arrayIndex) => {
    const indexed: IndexedUsage = { usage, arrayIndex };
    if (usage.insert_before && usage.insert_before.kind === "builtin_core_chain") {
      if (!validChainIds.has(usage.insert_before.chain_id)) {
        missingAnchorUsages.push(indexed);
        return;
      }
      const key = usage.insert_before.chain_id;
      const map = usage.insert_after_anchor ? afterByAnchor : beforeByAnchor;
      const list = map.get(key) ?? [];
      list.push(indexed);
      map.set(key, list);
    } else {
      tailUsages.push(indexed);
    }
  });
  for (const list of beforeByAnchor.values()) {
    list.sort((a, b) => a.usage.order - b.usage.order);
  }
  for (const list of afterByAnchor.values()) {
    list.sort((a, b) => a.usage.order - b.usage.order);
  }
  tailUsages.sort((a, b) => a.usage.order - b.usage.order);
  missingAnchorUsages.sort((a, b) => a.usage.order - b.usage.order);

  const customDisplayName = customDisplayNameResolver(
    profileResources,
    customLeaves
  );

  // Index groups by docSlug so we can label each node with its owning chain
  // doc (e.g. "平台基础链路"). Falls back to the slug if the catalog hasn't
  // registered a friendly title (shouldn't happen at runtime).
  const groupBySlug = new Map(
    CHAIN_CATALOG.groups.map((g) => [g.docSlug, g] as const)
  );

  const rows: ChainProjectionRow[] = [];
  for (const node of orderedNodes) {
    // "before" customs render before the chain node (insert_before semantics)
    for (const { usage, arrayIndex } of beforeByAnchor.get(node.nodeId) ?? []) {
      rows.push({
        kind: "custom",
        usage,
        arrayIndex,
        ...customUsageFields(usage, customDisplayName, profileResources, profile),
        anchorChainId: node.nodeId,
        afterAnchor: false
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
    // "after" customs render after the chain node (insert_after_anchor semantics)
    for (const { usage, arrayIndex } of afterByAnchor.get(node.nodeId) ?? []) {
      rows.push({
        kind: "custom",
        usage,
        arrayIndex,
        ...customUsageFields(usage, customDisplayName, profileResources, profile),
        anchorChainId: node.nodeId,
        afterAnchor: true
      });
    }
  }
  for (const { usage, arrayIndex } of tailUsages) {
    rows.push({
      kind: "custom",
      usage,
      arrayIndex,
      ...customUsageFields(usage, customDisplayName, profileResources, profile),
      anchorChainId: null,
      afterAnchor: !!usage.insert_after_anchor
    });
  }
  for (const { usage, arrayIndex } of missingAnchorUsages) {
    rows.push({
      kind: "custom",
      usage,
      arrayIndex,
      ...customUsageFields(usage, customDisplayName, profileResources, profile),
      anchorChainId: null,
      afterAnchor: !!usage.insert_after_anchor,
      missingAnchorChainId:
        usage.insert_before?.kind === "builtin_core_chain"
          ? usage.insert_before.chain_id
          : undefined
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
  profileResources: ComputeResourceV2[],
  customLeaves: CustomNodeConfig[]
): ExecutionRow[] {
  const orderedNodes = CHAIN_CATALOG.orderedNodes;
  const validChainIds = new Set(orderedNodes.map((n) => n.nodeId));

  const activeStandardRefs = (profile.resources ?? []).filter(
    (r): r is ProfileStandardVariantRef => r.kind === "standard" && r.enabled
  );
  const standardById = standardResourceIndex(profileResources);
  // For each canonical node id, the list of (ref, resource) pairs whose
  // effective_candidates select it. Order within the list follows the order
  // refs were added to the profile so re-orderings stay deterministic.
  const coverageByNodeId = new Map<
    string,
    Array<{
      ref: ProfileStandardVariantRef;
      resource: StandardComputeResource;
      variantId: string;
    }>
  >();
  for (const ref of activeStandardRefs) {
    const resource = standardById.get(ref.resource_instance_id);
    if (!resource) continue;
    const variantId = profileResourceBranchId(ref);
    for (const { nodeId } of effectiveStandardCandidates(resource, variantId)) {
      const list = coverageByNodeId.get(nodeId) ?? [];
      list.push({ ref, resource, variantId });
      coverageByNodeId.set(nodeId, list);
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
  const beforeByAnchor = new Map<string, IndexedUsage[]>();
  const afterByAnchor = new Map<string, IndexedUsage[]>();
  const tailUsages: IndexedUsage[] = [];
  const missingAnchorUsages: IndexedUsage[] = [];
  (profile.custom_node_usages ?? []).forEach((usage, arrayIndex) => {
    if (!usage.enabled) return;
    const indexed: IndexedUsage = { usage, arrayIndex };
    if (
      usage.insert_before &&
      usage.insert_before.kind === "builtin_core_chain"
    ) {
      if (!validChainIds.has(usage.insert_before.chain_id)) {
        missingAnchorUsages.push(indexed);
        return;
      }
      const key = usage.insert_before.chain_id;
      const map = usage.insert_after_anchor ? afterByAnchor : beforeByAnchor;
      const list = map.get(key) ?? [];
      list.push(indexed);
      map.set(key, list);
    } else {
      tailUsages.push(indexed);
    }
  });
  for (const list of beforeByAnchor.values()) {
    list.sort((a, b) => a.usage.order - b.usage.order);
  }
  for (const list of afterByAnchor.values()) {
    list.sort((a, b) => a.usage.order - b.usage.order);
  }
  tailUsages.sort((a, b) => a.usage.order - b.usage.order);
  missingAnchorUsages.sort((a, b) => a.usage.order - b.usage.order);

  const customDisplayName = customDisplayNameResolver(
    profileResources,
    customLeaves
  );

  const rows: ExecutionRow[] = [];
  for (const node of orderedNodes) {
    // "before" customs render before the chain node's standard rows
    for (const { usage, arrayIndex } of beforeByAnchor.get(node.nodeId) ?? []) {
      rows.push({
        kind: "custom",
        usage,
        arrayIndex,
        ...customUsageFields(usage, customDisplayName, profileResources, profile),
        anchorChainId: node.nodeId,
        afterAnchor: false
      });
    }
    const covers = coverageByNodeId.get(node.nodeId);
    if (covers && covers.length > 0) {
      const group = groupBySlug.get(node.docSlug);
      for (const { ref, resource, variantId } of covers) {
        const variant = resource.model_variants.find((v) => v.variant_id === variantId);
        const activeCandidateId = variant?.effective_candidates?.[node.nodeId] ?? "";
        const activeCandidate = activeCandidateId
          ? standardCandidateFor(resource, node.nodeId, activeCandidateId)
          : null;
        const candidates = standardCandidatesForNode(resource, node.nodeId);
        rows.push({
          kind: "exec-standard",
          chainNodeId: node.nodeId,
          chainDisplayName: node.displayName,
          order: node.order,
          docSlug: node.docSlug,
          docTitle: group?.title ?? node.docSlug,
          resourceId: ref.resource_instance_id,
          resourceDisplayName: resource.display_name,
          variantId,
          branchDisplayName: variant?.display_name ?? variantId,
          activeCandidateId,
          activeCandidateDisplayName:
            activeCandidate?.display_name ?? (activeCandidateId || node.displayName),
          activeCandidateFunctionName: activeCandidate?.function_name,
          activeCandidateNotes: activeCandidate?.notes,
          candidates: candidates.map((candidate, index) => ({
            candidateId: candidateIdentity(candidate, node.nodeId, index),
            displayName: candidate.display_name,
            functionName: candidate.function_name,
            notes: candidate.notes
          }))
        });
      }
    }
    // "after" customs render after the chain node's standard rows
    for (const { usage, arrayIndex } of afterByAnchor.get(node.nodeId) ?? []) {
      rows.push({
        kind: "custom",
        usage,
        arrayIndex,
        ...customUsageFields(usage, customDisplayName, profileResources, profile),
        anchorChainId: node.nodeId,
        afterAnchor: true
      });
    }
  }
  for (const { usage, arrayIndex } of tailUsages) {
    rows.push({
      kind: "custom",
      usage,
      arrayIndex,
      ...customUsageFields(usage, customDisplayName, profileResources, profile),
      anchorChainId: null,
      afterAnchor: !!usage.insert_after_anchor
    });
  }
  for (const { usage, arrayIndex } of missingAnchorUsages) {
    rows.push({
      kind: "custom",
      usage,
      arrayIndex,
      ...customUsageFields(usage, customDisplayName, profileResources, profile),
      anchorChainId: null,
      afterAnchor: !!usage.insert_after_anchor,
      missingAnchorChainId:
        usage.insert_before?.kind === "builtin_core_chain"
          ? usage.insert_before.chain_id
          : undefined
    });
  }
  return rows;
}

function customUsageFields(
  usage: CustomNodeUsage,
  customDisplayName: (usage: CustomNodeUsage) => string,
  profileResources: ComputeResourceV2[],
  profile: GuiProjectFile
): Pick<
  CustomUsageRow,
  "displayName" | "resourceDisplayName" | "branchId" | "branchDisplayName"
  | "nodeNotes" | "handlerFunction"
> {
  const resource = profileResources.find(
    (r) =>
      r.resource_kind === "custom" &&
      r.resource_instance_id === usage.resource_instance_id
  );
  const ref = (profile.resources ?? []).find(
    (r) =>
      r.kind === "custom" &&
      r.enabled &&
      r.resource_instance_id === usage.resource_instance_id
  );
  const branchId = ref ? profileResourceBranchId(ref) : undefined;
  const node =
    resource?.resource_kind === "custom"
      ? resource.custom_nodes.find((n) => n.node_id === usage.node_id)
      : undefined;
  return {
    displayName: customDisplayName(usage),
    resourceDisplayName: resource?.display_name ?? usage.resource_instance_id,
    branchId,
    branchDisplayName: branchId,
    nodeNotes: node?.notes,
    handlerFunction: node?.handler_function
  };
}

function standardResourceIndex(
  resources: ComputeResourceV2[]
): Map<string, StandardComputeResource> {
  const out = new Map<string, StandardComputeResource>();
  for (const resource of resources) {
    if (resource.resource_kind === "standard") {
      out.set(resource.resource_instance_id, resource);
    }
  }
  return out;
}

function standardCandidateFor(
  resource: StandardComputeResource,
  nodeId: string,
  candidateId: string
): StandardComputeResource["compute_nodes"][number] | null {
  const group = resource.compute_nodes.filter(
    (candidate) => candidate.node_id === nodeId
  );
  return (
    group.find((candidate, index) => {
      const ids = [
        candidate.candidate_id,
        candidate.node_id,
        `${nodeId}#${index}`
      ].filter((id): id is string => Boolean(id));
      return ids.includes(candidateId);
    }) ?? null
  );
}

function standardCandidatesForNode(
  resource: StandardComputeResource,
  nodeId: string
): StandardComputeCandidate[] {
  return resource.compute_nodes.filter(
    (candidate) =>
      candidate.node_id === nodeId && candidate.status !== "disabled"
  );
}

function candidateIdentity(
  candidate: StandardComputeCandidate,
  nodeId: string,
  index: number
): string {
  return candidate.candidate_id ?? candidate.node_id ?? `${nodeId}#${index}`;
}

function effectiveStandardCandidates(
  resource: StandardComputeResource,
  variantId: string
): Array<{ nodeId: string; candidateId: string }> {
  const variant = resource.model_variants.find((v) => v.variant_id === variantId);
  if (!variant) return [];
  return Object.entries(variant.effective_candidates ?? {})
    .filter(([nodeId, candidateId]) => {
      const candidate = standardCandidateFor(resource, nodeId, candidateId);
      return !!candidate && candidate.status !== "disabled";
    })
    .map(([nodeId, candidateId]) => ({ nodeId, candidateId }));
}

function customDisplayNameResolver(
  profileResources: ComputeResourceV2[],
  customLeaves: CustomNodeConfig[]
): (usage: CustomNodeUsage) => string {
  const customByResourceId = new Map<string, CustomComputeResource>();
  for (const resource of profileResources) {
    if (resource.resource_kind === "custom") {
      customByResourceId.set(resource.resource_instance_id, resource);
    }
  }

  const legacyCustomByResourceId = new Map<string, CustomNodeConfig>();
  for (const leaf of customLeaves) {
    legacyCustomByResourceId.set(
      leaf.resource_instance_id ?? leaf.custom_node_id,
      leaf
    );
  }

  return (usage: CustomNodeUsage): string => {
    const resource = customByResourceId.get(usage.resource_instance_id);
    const node = resource?.custom_nodes.find((n) => n.node_id === usage.node_id);
    if (node?.display_name) return node.display_name;
    if (resource?.display_name) {
      return `${resource.display_name}/${usage.node_id}`;
    }
    const leaf = legacyCustomByResourceId.get(usage.resource_instance_id);
    if (leaf?.display_name) return leaf.display_name;
    return `${usage.resource_instance_id}/${usage.node_id}`;
  };
}
