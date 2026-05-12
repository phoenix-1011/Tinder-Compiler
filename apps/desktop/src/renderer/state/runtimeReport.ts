import type {
  CustomNodeConfig,
  GuiProjectFile,
  PlatformResourceInstance,
  ProfileCustomResourceRef,
  ProfileStandardVariantRef
} from "@tinder/nextstep";
import { CHAIN_CATALOG } from "../help/chain-catalog.generated";

/**
 * Validation + export model for `生成运行配置`.
 *
 * The MVP report has three severity buckets per task package decisions
 * D32–D34: blocking failures prevent export, warnings allow export but
 * remain visible, info items summarise the run. Each item carries an
 * optional locator string so the UI can hint at where to fix it.
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
  ordered_execution_list: RuntimeOrderedItem[];
  custom_nodes: RuntimeCustomNodeExport[];
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

/**
 * Run validation only — no JSON is built. Useful for the report-only
 * preview path where the user just wants to see what's wrong.
 */
export function buildRuntimeReport(
  profile: GuiProjectFile,
  standardCatalog: PlatformResourceInstance[],
  customCatalog: CustomNodeConfig[]
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

  const standardById = new Map(
    standardCatalog.map((r) => [r.resource_instance_id, r] as const)
  );
  const customById = new Map(
    customCatalog.map((c) => [c.resource_instance_id ?? c.custom_node_id, c] as const)
  );
  const activeCustomRefIds = new Set(
    activeCustomRefs.map((r) => r.resource_instance_id)
  );
  const validChainIds = new Set(CHAIN_CATALOG.orderedNodes.map((n) => n.nodeId));

  // ── Blocking: missing standard / custom resources ─────────────────────
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

  // ── Blocking: custom usage references ───────────────────────────────────
  for (const usage of activeUsages) {
    if (!activeCustomRefIds.has(usage.resource_instance_id)) {
      blocking.push({
        id: `usage-no-active-ref-${usage.resource_instance_id}-${usage.node_id}`,
        title: `自定义节点用法对应资源未加入档案或被停用`,
        detail: `${usage.resource_instance_id}/${usage.node_id}`,
        locator: `usage:${usage.resource_instance_id}/${usage.node_id}`
      });
    }
    const anchor = usage.insert_before;
    if (anchor && anchor.kind === "builtin_core_chain") {
      if (!validChainIds.has(anchor.chain_id)) {
        blocking.push({
          id: `usage-unknown-anchor-${usage.resource_instance_id}-${usage.node_id}`,
          title: `自定义节点的链路锚点已不存在`,
          detail: `${usage.resource_instance_id}/${usage.node_id} → ${anchor.chain_id}`,
          locator: `chain:${anchor.chain_id}`
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

  return { blocking, warning, info };
}

/**
 * Build the flat runtime config JSON for the engine. Caller is expected
 * to have called `buildRuntimeReport` first and confirmed
 * `blocking.length === 0`. Disabled refs / usages are excluded.
 */
export function buildRuntimeConfig(
  profile: GuiProjectFile,
  standardCatalog: PlatformResourceInstance[],
  customCatalog: CustomNodeConfig[]
): RuntimeConfigV2 {
  void standardCatalog;
  const usages = (profile.custom_node_usages ?? []).filter((u) => u.enabled);
  const customById = new Map(
    customCatalog.map((c) => [c.resource_instance_id ?? c.custom_node_id, c] as const)
  );

  // Group usages by insert_before anchor key. The same grouping logic as the
  // sidebar projection so the exported order matches what the user sees.
  type KeyedUsage = { usage: (typeof usages)[number]; anchorChainId: string | null };
  const usagesByAnchor = new Map<string, KeyedUsage[]>();
  const tail: KeyedUsage[] = [];
  for (const usage of usages) {
    const a = usage.insert_before;
    if (a && a.kind === "builtin_core_chain") {
      const list = usagesByAnchor.get(a.chain_id) ?? [];
      list.push({ usage, anchorChainId: a.chain_id });
      usagesByAnchor.set(a.chain_id, list);
    } else {
      tail.push({ usage, anchorChainId: null });
    }
  }
  for (const list of usagesByAnchor.values()) {
    list.sort((a, b) => a.usage.order - b.usage.order);
  }
  tail.sort((a, b) => a.usage.order - b.usage.order);

  const ordered_execution_list: RuntimeOrderedItem[] = [];
  for (const node of CHAIN_CATALOG.orderedNodes) {
    for (const { usage } of usagesByAnchor.get(node.nodeId) ?? []) {
      ordered_execution_list.push({
        kind: "custom_invocation_node",
        custom_node_id: `${usage.resource_instance_id}.${usage.node_id}`
      });
    }
    ordered_execution_list.push({
      kind: "builtin_core_chain",
      chain_id: node.nodeId
    });
  }
  for (const { usage } of tail) {
    ordered_execution_list.push({
      kind: "custom_invocation_node",
      custom_node_id: `${usage.resource_instance_id}.${usage.node_id}`
    });
  }

  const custom_nodes: RuntimeCustomNodeExport[] = usages.map((usage) => {
    const leaf = customById.get(usage.resource_instance_id);
    return {
      custom_node_id: `${usage.resource_instance_id}.${usage.node_id}`,
      resource_instance_id: usage.resource_instance_id,
      node_id: usage.node_id,
      display_name: leaf?.display_name ?? usage.node_id,
      description: leaf?.description ?? "",
      module_id: leaf?.module_id ?? usage.resource_instance_id,
      impl_kind: leaf?.impl_kind ?? "python_script",
      location: leaf?.location ?? "",
      action_index: leaf?.action_index ?? 0,
      enabled: true
    };
  });

  return { version: 2, ordered_execution_list, custom_nodes };
}
