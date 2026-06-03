import type {
  ComputeResourceV2,
  CustomComputeResource,
  CustomNodeUsage,
  GuiProjectFile,
  ProfilePlatformModelTarget,
  ProfileCustomResourceRef,
  ProfileStandardVariantRef,
  StandardComputeResource
} from "@tinder/nextstep";
import {
  computeObjectKey,
  platformObjectKey,
  profileResourceBranchId
} from "@tinder/nextstep";
import { CHAIN_CATALOG } from "../help/chain-catalog.generated";
import { isResourceBindableChainNode } from "../help/chainCatalogUi";

/**
 * Validation + export model for runtime config pre-check and export.
 *
 * The MVP report has three severity buckets: blocking failures prevent
 * export, warnings allow export but remain visible, info items summarise
 * the run. Each item carries an optional locator string so the UI can
 * hint at where to fix it.
 *
 * Slice 4 (Phase 4 A+B): consumes v2 `ComputeResourceV2` directly so the
 * exported config reflects `implementation.runtime_artifact`,
 * `model_variants[].effective_candidates`, and the actual per-node
 * `action_index` / `handler_function` from `custom_nodes[]` — rather than
 * the lossy v1 single-file projection.
 */
export interface RuntimeReportItem {
  id: string;
  title: string;
  detail?: string;
  /**
   * Free-form locator string (e.g. `resource:radar-main`, `chain:platform.entity.update`).
   * The UI surfaces it as a hint; programmatic jump comes later.
   */
  locator?: string;
}

export interface RuntimeReport {
  blocking: RuntimeReportItem[];
  warning: RuntimeReportItem[];
  info: RuntimeReportItem[];
}

/** Minimal v2 runtime config shape consumed by Model-P-v2. */
export interface RuntimeConfigV2 {
  version: 2;
  platform_model?: RuntimePlatformModelExport;
  compute_object_bindings?: RuntimeComputeObjectBindingExport[];
  ordered_execution_list: RuntimeOrderedItem[];
  standard_nodes: RuntimeStandardNodeExport[];
  custom_nodes: RuntimeCustomNodeExport[];
}

export interface RuntimePlatformModelExport {
  model_id: string;
  version: string;
  object_key: string;
  display_name?: string;
}

export interface RuntimeComputeObjectBindingExport {
  compute_object_key: string;
  compute_object_id: string;
  compute_object_version: string;
  display_name?: string;
  resource_kind: "standard" | "custom";
  resource_instance_id: string;
  branch_id: string;
}

export type RuntimeOrderedItem =
  | { kind: "builtin_core_chain"; chain_id: string }
  | { kind: "custom_invocation_node"; custom_node_id: string };

export interface RuntimeCustomNodeExport {
  custom_node_id: string;
  resource_instance_id: string;
  node_id: string;
  display_name: string;
  description: string;
  module_id: string;
  impl_kind: "python_script" | "cpp_dylib";
  location: string;
  action_index: number;
  enabled: boolean;
}

export interface RuntimeStandardNodeExport {
  standard_node_id: string;
  resource_instance_id: string;
  branch_id: string;
  candidate_id: string;
  display_name: string;
  module_id: string;
  impl_kind: "python_script" | "cpp_dylib";
  location: string;
  function_name?: string;
  base_function_name?: string;
  enabled: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function indexResources(resources: ComputeResourceV2[]) {
  const standardById = new Map<string, StandardComputeResource>();
  const customById = new Map<string, CustomComputeResource>();
  for (const r of resources) {
    if (r.resource_kind === "standard") {
      standardById.set(r.resource_instance_id, r);
    } else {
      customById.set(r.resource_instance_id, r);
    }
  }
  return { standardById, customById };
}

function implKindForExport(
  r: ComputeResourceV2
): "python_script" | "cpp_dylib" {
  return r.implementation.kind === "cpp_library" ? "cpp_dylib" : "python_script";
}

function customNodeFor(
  resource: CustomComputeResource,
  nodeId: string
): CustomComputeResource["custom_nodes"][number] | null {
  // CustomNodeUsage stores `node_id` referencing one entry in custom_nodes[].
  // Lookup is by exact match; node_id was assigned by the editor.
  return resource.custom_nodes.find((n) => n.node_id === nodeId) ?? null;
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

function selectedStandardVariant(
  resource: StandardComputeResource,
  selectedVariantId: string
): StandardComputeResource["model_variants"][number] | null {
  return (
    resource.model_variants.find((v) => v.variant_id === selectedVariantId) ??
    null
  );
}

/**
 * Has the resource shipped any source-file `generated_region_status` that
 * blocks export? "conflict" → blocking; "missing"/"malformed" → warning.
 */
function generatedStatusIssues(
  resource: ComputeResourceV2,
  blocking: RuntimeReportItem[],
  warning: RuntimeReportItem[]
): void {
  for (const ref of resource.implementation.source_files) {
    const status = ref.generated_region_status ?? "unknown";
    if (status === "conflict") {
      blocking.push({
        id: `gen-conflict-${resource.resource_instance_id}-${ref.file_id}`,
        title: `资源「${resource.display_name}」的源文件有生成区冲突`,
        detail: `${ref.path}: ${status}`,
        locator: `resource:${resource.resource_instance_id}`
      });
    } else if (status === "malformed") {
      warning.push({
        id: `gen-malformed-${resource.resource_instance_id}-${ref.file_id}`,
        title: `${ref.path}: 生成区标记损坏`,
        locator: `resource:${resource.resource_instance_id}`
      });
    } else if (status === "missing") {
      warning.push({
        id: `gen-missing-${resource.resource_instance_id}-${ref.file_id}`,
        title: `${ref.path}: 生成区标记缺失`,
        locator: `resource:${resource.resource_instance_id}`
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run validation only — no JSON is built. Useful for the report-only
 * preview path where the user just wants to see what's wrong.
 *
 * `v2Resources` is the v2 form of *every* compute resource discovered on
 * disk (`collectV2Resources(disk)`); both legacy single-file resources
 * and v2 package resources are included via the migration in `loadResourceTree`.
 */
export function buildRuntimeReport(
  profile: GuiProjectFile,
  v2Resources: ComputeResourceV2[],
  projectResourcesForGlobalValidation: ComputeResourceV2[] = v2Resources
): RuntimeReport {
  const blocking: RuntimeReportItem[] = [];
  const warning: RuntimeReportItem[] = [];
  const info: RuntimeReportItem[] = [];

  const refs = profile.resources ?? [];
  const usages = profile.custom_node_usages ?? [];

  const activeStandardRefs = refs.filter(
    (r): r is ProfileStandardVariantRef => r.kind === "standard" && r.enabled
  );
  const activeCustomRefs = refs.filter(
    (r): r is ProfileCustomResourceRef => r.kind === "custom" && r.enabled
  );
  const activeUsages = usages.filter((u) => u.enabled);

  const { standardById, customById } = indexResources(v2Resources);
  const activeCustomRefIds = new Set(
    activeCustomRefs.map((r) => r.resource_instance_id)
  );
  const validChainIds = new Set(CHAIN_CATALOG.orderedNodes.map((n) => n.nodeId));

  const actionOwners = new Map<number, string>();
  for (const resource of projectResourcesForGlobalValidation) {
    if (resource.resource_kind !== "custom") continue;
    for (const node of resource.custom_nodes) {
      if (typeof node.action_index !== "number") continue;
      const owner = `${resource.resource_instance_id}/${node.node_id}`;
      const previous = actionOwners.get(node.action_index);
      if (previous) {
        blocking.push({
          id: `duplicate-action-${node.action_index}-${resource.resource_instance_id}-${node.node_id}`,
          title: `自定义 action_index 重复`,
          detail: `action_index=${node.action_index} 同时被 ${previous} 和 ${owner} 使用`,
          locator: `resource:${resource.resource_instance_id}`
        });
      } else {
        actionOwners.set(node.action_index, owner);
      }
    }
  }

  // ── Blocking: missing resources in the v2 catalog ──────────────────────
  for (const ref of activeStandardRefs) {
    if (!standardById.has(ref.resource_instance_id)) {
      blocking.push({
        id: `missing-std-${ref.resource_instance_id}`,
        title: `活跃的标准资源未在计算实例库中找到`,
        detail: `resource_instance_id = ${ref.resource_instance_id}`,
        locator: `resource:${ref.resource_instance_id}`
      });
    }
  }
  for (const ref of activeCustomRefs) {
    if (!customById.has(ref.resource_instance_id)) {
      blocking.push({
        id: `missing-custom-${ref.resource_instance_id}`,
        title: `活跃的自定义资源未在计算实例库中找到`,
        detail: `resource_instance_id = ${ref.resource_instance_id}`,
        locator: `resource:${ref.resource_instance_id}`
      });
    }
  }

  // ── Blocking: per-resource activation / artifact / variant integrity ───
  for (const ref of activeStandardRefs) {
    const resource = standardById.get(ref.resource_instance_id);
    if (!resource) continue;
    validateResourceForExport(
      resource,
      blocking,
      warning,
      profileResourceBranchId(ref)
    );
    generatedStatusIssues(resource, blocking, warning);
  }
  for (const ref of activeCustomRefs) {
    const resource = customById.get(ref.resource_instance_id);
    if (!resource) continue;
    validateResourceForExport(resource, blocking, warning);
    generatedStatusIssues(resource, blocking, warning);
  }

  // ── Blocking: custom usage references ──────────────────────────────────
  for (const usage of activeUsages) {
    if (!activeCustomRefIds.has(usage.resource_instance_id)) {
      blocking.push({
        id: `usage-no-active-ref-${usage.resource_instance_id}-${usage.node_id}`,
        title: `自定义节点用法对应资源未加入档案或被停用`,
        detail: `${usage.resource_instance_id}/${usage.node_id}`,
        locator: `usage:${usage.resource_instance_id}/${usage.node_id}`
      });
    }
    // Validate that the usage's node_id actually exists in the v2 resource.
    const resource = customById.get(usage.resource_instance_id);
    if (resource && !customNodeFor(resource, usage.node_id)) {
      blocking.push({
        id: `usage-missing-node-${usage.resource_instance_id}-${usage.node_id}`,
        title: `自定义节点用法引用了不存在的 node_id`,
        detail: `${usage.resource_instance_id}/${usage.node_id} 不在资源的 custom_nodes[] 中`,
        locator: `resource:${usage.resource_instance_id}`
      });
    }
    if (resource) {
      const node = customNodeFor(resource, usage.node_id);
      if (node && typeof node.action_index !== "number") {
        blocking.push({
          id: `usage-unalloc-action-${usage.resource_instance_id}-${usage.node_id}`,
          title: `自定义节点未分配 action_index`,
          detail: `${usage.resource_instance_id}/${usage.node_id} (描述可能为空)`,
          locator: `resource:${usage.resource_instance_id}`
        });
      }
    }
    const anchor = usage.insert_before;
    if (anchor && anchor.kind === "builtin_core_chain") {
      if (!validChainIds.has(anchor.chain_id)) {
        blocking.push({
          id: `usage-unknown-anchor-${usage.resource_instance_id}-${usage.node_id}`,
          title: `自定义节点的链路锚点已不存在`,
          detail: `${usage.resource_instance_id}/${usage.node_id} → ${anchor.chain_id}`,
          locator: `usage:${usage.resource_instance_id}/${usage.node_id}`
        });
      }
    } else if (anchor && anchor.kind === "builtin_domain_node") {
      warning.push({
        id: `usage-domain-anchor-${usage.resource_instance_id}-${usage.node_id}`,
        title: `锚点为域节点（${anchor.domain}.${anchor.node_id}），导出按末尾插入处理`,
        locator: `usage:${usage.resource_instance_id}/${usage.node_id}`
      });
    } else {
      warning.push({
        id: `usage-tail-${usage.resource_instance_id}-${usage.node_id}`,
        title: `自定义节点将插入到末尾`,
        detail: `${usage.resource_instance_id}/${usage.node_id}`,
        locator: `usage:${usage.resource_instance_id}/${usage.node_id}`
      });
    }
  }

  // ── Info summary ───────────────────────────────────────────────────────
  info.push({
    id: "summary-counts",
    title: `${activeStandardRefs.length} 个标准资源，${activeCustomRefs.length} 个自定义资源，${activeUsages.length} 个自定义节点用法`
  });
  info.push({
    id: "summary-chain",
    title: `内建核心链路 ${CHAIN_CATALOG.orderedNodes.length} 个节点`
  });
  info.push({
    id: "t007-empty-handoff",
    title: "T-007 空 handoff 视为已执行提交",
    detail:
      "`runtime.signal.parameterized_facts` 与 `runtime.signal.digitized_observables` 即使为空也代表对应节点已执行。"
  });
  info.push({
    id: "t007-provenance",
    title: "T-007 provenance 使用 source_observable_ids",
    detail:
      "digitized observable 下游写入 `source_observable_ids`，不得混入 `source_candidate_ids`。"
  });

  return { blocking, warning, info };
}

/**
 * Per-resource activation gates: draft status, required runtime_artifact
 * presence, and (for standard) at least one effective candidate in the
 * selected variant.
 */
function validateResourceForExport(
  resource: ComputeResourceV2,
  blocking: RuntimeReportItem[],
  warning: RuntimeReportItem[],
  selectedVariantId?: string
): void {
  if (resource.status === "draft") {
    blocking.push({
      id: `draft-${resource.resource_instance_id}`,
      title: `资源「${resource.display_name}」仍为草稿`,
      detail: `状态须先置为 active 才能导出`,
      locator: `resource:${resource.resource_instance_id}`
    });
  } else if (resource.status === "disabled") {
    // Disabled at resource level is unusual when the profile reference is
    // active — treat as warning, not blocking, since the profile ref state
    // takes precedence at runtime.
    warning.push({
      id: `disabled-${resource.resource_instance_id}`,
      title: `资源「${resource.display_name}」在资源层标记为停用`,
      locator: `resource:${resource.resource_instance_id}`
    });
  }

  const artifact = resource.implementation.runtime_artifact;
  if (artifact.required_for_export && !artifact.path.trim()) {
    blocking.push({
      id: `no-artifact-${resource.resource_instance_id}`,
      title: `资源「${resource.display_name}」缺少运行时产物路径`,
      detail: `implementation.runtime_artifact.path 为空`,
      locator: `resource:${resource.resource_instance_id}`
    });
  }

  if (resource.resource_kind === "standard" && selectedVariantId) {
    const variant = selectedStandardVariant(resource, selectedVariantId);
    if (!variant) {
      blocking.push({
        id: `unknown-variant-${resource.resource_instance_id}-${selectedVariantId}`,
        title: `档案引用了不存在的资源变体`,
        detail: `资源「${resource.display_name}」没有 variant_id = ${selectedVariantId}`,
        locator: `resource:${resource.resource_instance_id}`
      });
    } else {
      const effectiveEntries = Object.entries(
        variant.effective_candidates ?? {}
      ).filter(([, candidateId]) => candidateId.trim().length > 0);
      const effectiveCount = effectiveEntries.length;
      if (effectiveCount === 0) {
        warning.push({
          id: `no-effective-${resource.resource_instance_id}-${selectedVariantId}`,
          title: `资源「${resource.display_name}」的变体「${variant.display_name}」未选择任何有效候选`,
          locator: `resource:${resource.resource_instance_id}`
        });
      }
      for (const [nodeId, candidateId] of effectiveEntries) {
        if (!isResourceBindableChainNode(nodeId)) {
          const catalogNode = CHAIN_CATALOG.nodes[nodeId];
          blocking.push({
            id: `builtin-only-effective-candidate-${resource.resource_instance_id}-${selectedVariantId}-${nodeId}`,
            title: `标准节点绑定到了内建结构节点`,
            detail: `资源「${resource.display_name}」分支「${variant.display_name}」选择了 ${catalogNode?.displayName ?? nodeId} (${nodeId})`,
            locator: `resource:${resource.resource_instance_id}`
          });
        }
        const candidate = standardCandidateFor(resource, nodeId, candidateId);
        if (!candidate) {
          blocking.push({
            id: `missing-effective-candidate-${resource.resource_instance_id}-${selectedVariantId}-${nodeId}`,
            title: `标准节点引用了不存在的生效候选`,
            detail: `资源「${resource.display_name}」分支「${variant.display_name}」的 ${nodeId} -> ${candidateId} 不存在`,
            locator: `resource:${resource.resource_instance_id}`
          });
          continue;
        }
        if (candidate.status === "disabled") {
          blocking.push({
            id: `disabled-effective-candidate-${resource.resource_instance_id}-${selectedVariantId}-${nodeId}`,
            title: `标准节点选择了已停用候选`,
            detail: `${nodeId} -> ${candidateId}`,
            locator: `resource:${resource.resource_instance_id}`
          });
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Config build
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the flat runtime config JSON for the engine. Caller is expected
 * to have called `buildRuntimeReport` first and confirmed
 * `blocking.length === 0`. Disabled refs / usages are excluded.
 *
 * Uses v2 resource state to populate per-export fields:
 * - `standard_nodes[]` from selected branch/variant effective candidates
 * - `impl_kind` from `resource.implementation.kind`
 * - `location` from `resource.implementation.runtime_artifact.path`
 * - `action_index` / `description` from the matching entry in
 *   `resource.custom_nodes[]` looked up by `usage.node_id`
 */
export function buildRuntimeConfig(
  profile: GuiProjectFile,
  v2Resources: ComputeResourceV2[],
  platformTarget?: ProfilePlatformModelTarget
): RuntimeConfigV2 {
  const usages = (profile.custom_node_usages ?? []).filter((u) => u.enabled);
  const activeStandardRefs = (profile.resources ?? []).filter(
    (r): r is ProfileStandardVariantRef => r.kind === "standard" && r.enabled
  );
  const { standardById, customById } = indexResources(v2Resources);

  // Group usages by insert_before anchor key. The same grouping logic as the
  // sidebar projection so the exported order matches what the user sees.
  // Usages with `insert_after_anchor` are placed AFTER their chain node.
  type KeyedUsage = { usage: CustomNodeUsage; anchorChainId: string | null };
  const validChainIds = new Set(CHAIN_CATALOG.orderedNodes.map((n) => n.nodeId));
  const beforeByAnchor = new Map<string, KeyedUsage[]>();
  const afterByAnchor = new Map<string, KeyedUsage[]>();
  const tail: KeyedUsage[] = [];
  for (const usage of usages) {
    const a = usage.insert_before;
    if (a && a.kind === "builtin_core_chain" && validChainIds.has(a.chain_id)) {
      const map = usage.insert_after_anchor ? afterByAnchor : beforeByAnchor;
      const list = map.get(a.chain_id) ?? [];
      list.push({ usage, anchorChainId: a.chain_id });
      map.set(a.chain_id, list);
    } else {
      tail.push({ usage, anchorChainId: null });
    }
  }
  for (const list of beforeByAnchor.values()) {
    list.sort((a, b) => a.usage.order - b.usage.order);
  }
  for (const list of afterByAnchor.values()) {
    list.sort((a, b) => a.usage.order - b.usage.order);
  }
  tail.sort((a, b) => a.usage.order - b.usage.order);

  const ordered_execution_list: RuntimeOrderedItem[] = [];
  for (const node of CHAIN_CATALOG.orderedNodes) {
    // "before" customs execute before the chain node
    for (const { usage } of beforeByAnchor.get(node.nodeId) ?? []) {
      ordered_execution_list.push({
        kind: "custom_invocation_node",
        custom_node_id: `${usage.resource_instance_id}.${usage.node_id}`
      });
    }
    ordered_execution_list.push({
      kind: "builtin_core_chain",
      chain_id: node.nodeId
    });
    // "after" customs execute after the chain node
    for (const { usage } of afterByAnchor.get(node.nodeId) ?? []) {
      ordered_execution_list.push({
        kind: "custom_invocation_node",
        custom_node_id: `${usage.resource_instance_id}.${usage.node_id}`
      });
    }
  }
  for (const { usage } of tail) {
    ordered_execution_list.push({
      kind: "custom_invocation_node",
      custom_node_id: `${usage.resource_instance_id}.${usage.node_id}`
    });
  }

  const standard_nodes: RuntimeStandardNodeExport[] = [];
  for (const ref of activeStandardRefs) {
    const resource = standardById.get(ref.resource_instance_id);
    if (!resource) continue;
    const branchId = profileResourceBranchId(ref);
    const variant = selectedStandardVariant(resource, branchId);
    if (!variant) continue;
    for (const [nodeId, candidateId] of Object.entries(
      variant.effective_candidates ?? {}
    )) {
      if (!candidateId.trim()) continue;
      if (!isResourceBindableChainNode(nodeId)) continue;
      const candidate = standardCandidateFor(resource, nodeId, candidateId);
      if (!candidate || candidate.status === "disabled") continue;
      standard_nodes.push({
        standard_node_id: nodeId,
        resource_instance_id: resource.resource_instance_id,
        branch_id: branchId,
        candidate_id: candidateId,
        display_name: candidate.display_name || nodeId,
        module_id: resource.resource_instance_id,
        impl_kind: implKindForExport(resource),
        location: resource.implementation.runtime_artifact.path,
        ...(candidate.function_name
          ? { function_name: candidate.function_name }
          : {}),
        ...(candidate.base_function_name
          ? { base_function_name: candidate.base_function_name }
          : {}),
        enabled: true
      });
    }
  }
  const chainOrder = new Map(
    CHAIN_CATALOG.orderedNodes.map((node) => [node.nodeId, node.order] as const)
  );
  standard_nodes.sort((a, b) => {
    const byOrder =
      (chainOrder.get(a.standard_node_id) ?? Number.MAX_SAFE_INTEGER) -
      (chainOrder.get(b.standard_node_id) ?? Number.MAX_SAFE_INTEGER);
    if (byOrder !== 0) return byOrder;
    const byResource = a.resource_instance_id.localeCompare(
      b.resource_instance_id
    );
    if (byResource !== 0) return byResource;
    return a.candidate_id.localeCompare(b.candidate_id);
  });

  const custom_nodes: RuntimeCustomNodeExport[] = usages.map((usage) => {
    const resource = customById.get(usage.resource_instance_id);
    const node = resource ? customNodeFor(resource, usage.node_id) : null;
    return {
      custom_node_id: `${usage.resource_instance_id}.${usage.node_id}`,
      resource_instance_id: usage.resource_instance_id,
      node_id: usage.node_id,
      display_name:
        node?.display_name ?? resource?.display_name ?? usage.node_id,
      description: node?.description ?? resource?.description ?? "",
      // Module id has no v2 equivalent; use the resource instance id which
      // is what export-time module loaders care about anyway.
      module_id: usage.resource_instance_id,
      impl_kind: resource
        ? implKindForExport(resource)
        : "python_script",
      location: resource?.implementation.runtime_artifact.path ?? "",
      action_index: typeof node?.action_index === "number" ? node.action_index : 0,
      enabled: true
    };
  });

  return {
    version: 2,
    ...(platformTarget
      ? {
          platform_model: {
            model_id: platformTarget.platform_model_id,
            version: platformTarget.platform_version,
            object_key: platformObjectKey(
              platformTarget.platform_model_id,
              platformTarget.platform_version
            ),
            display_name: platformTarget.display_name
          },
          compute_object_bindings: platformTarget.compute_object_bindings.map(
            (binding) => ({
              compute_object_key: computeObjectKey(
                binding.compute_object_id,
                binding.compute_object_version
              ),
              compute_object_id: binding.compute_object_id,
              compute_object_version: binding.compute_object_version,
              display_name: binding.display_name,
              resource_kind: binding.resource_kind,
              resource_instance_id: binding.resource_instance_id,
              branch_id: binding.selected_branch_id
            })
          )
        }
      : {}),
    ordered_execution_list,
    standard_nodes,
    custom_nodes
  };
}
