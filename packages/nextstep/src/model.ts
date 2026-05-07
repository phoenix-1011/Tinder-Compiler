import type {
  BuiltinNodeConfig,
  CatalogBuiltinNode,
  CustomNodeConfig,
  ExecutionItem,
  GuiProjectFile,
  PlatformResourceInstance,
  PlatformTemplate,
  ResourceCatalogEntry,
  ResourceCatalogFile,
  RuntimeConfigFile,
  ValidationIssue,
} from "./types";

export interface CustomNodeInputConfig {
  action_index: number;
  parameters: Record<string, string>;
}

export const DEFAULT_CUSTOM_NODE_INPUT: CustomNodeInputConfig = {
  action_index: 0,
  parameters: {},
};

export const DEFAULT_CUSTOM_NODE_INPUT_TEXT = JSON.stringify(DEFAULT_CUSTOM_NODE_INPUT, null, 2);

export const CORE_CHAIN_IDS = [
  "P-01",
  "P-03",
  "P-04",
  "P-05",
  "P-06",
  "P-07",
  "P-08",
  "P-09",
  "P-10",
  "P-11",
  "P-13",
  "P-14",
  "P-15",
  "P-16",
  "P-17",
  "P-12",
  "P-02",
  "D-01",
  "D-02",
  "S-GEN-01",
  "S-01",
  "S-03",
  "S-02",
  "S-04",
] as const;

export function buildNodeRef(domain: string, nodeId: string): string {
  return `${domain}.${nodeId}`;
}

export function buildDefaultExecutionList(
  builtinNodes: CatalogBuiltinNode[],
  customNodes: CustomNodeConfig[] = [],
): ExecutionItem[] {
  const orderedDomainNodes = builtinNodes.map<ExecutionItem>((node) => ({
    kind: "builtin_domain_node",
    domain: node.domain,
    node_id: node.node_id,
  }));

  return [
    ...orderedDomainNodes,
    ...customNodes.map<ExecutionItem>((node) => ({
      kind: "custom_invocation_node",
      custom_node_id: node.custom_node_id,
    })),
    ...CORE_CHAIN_IDS.map<ExecutionItem>((chainId) => ({
      kind: "builtin_core_chain",
      chain_id: chainId,
    })),
  ];
}

export function createEmptyProject(catalog: ResourceCatalogFile | null): GuiProjectFile {
  const builtinNodes = catalog?.builtin_nodes ?? [];
  return {
    version: 1,
    project_name: "nextstep-project",
    resource_catalog_name: "nextstep-resource-catalog.json",
    builtin_node_configs: builtinNodes.map((node) => ({
      domain: node.domain,
      node_id: node.node_id,
    })),
    ordered_execution_list: buildDefaultExecutionList(builtinNodes),
    custom_nodes: [],
    platform_resources: [],
    platform_templates: [],
  };
}

export function parseCatalog(text: string): ResourceCatalogFile {
  const parsed = JSON.parse(text) as ResourceCatalogFile;
  if (!Array.isArray(parsed.builtin_nodes) || !Array.isArray(parsed.resources)) {
    throw new Error("Resource catalog must contain builtin_nodes and resources arrays.");
  }
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function validateCustomNodeInput(text: string):
  | { ok: true; value: CustomNodeInputConfig }
  | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "Custom input must be valid JSON." };
  }

  if (!isRecord(parsed) || Array.isArray(parsed)) {
    return { ok: false, error: "Custom input must be a JSON object." };
  }

  if (!("action_index" in parsed)) {
    return { ok: false, error: "Missing action_index." };
  }
  if (!("parameters" in parsed)) {
    return { ok: false, error: "Missing parameters." };
  }

  const actionIndex = parsed.action_index;
  if (typeof actionIndex !== "number" || !Number.isInteger(actionIndex) || actionIndex < 0) {
    return { ok: false, error: "action_index must be an integer greater than or equal to 0." };
  }

  const parameters = parsed.parameters;
  if (!isRecord(parameters) || Array.isArray(parameters)) {
    return { ok: false, error: "parameters must be an object, for example {}." };
  }

  for (const [key, value] of Object.entries(parameters)) {
    if (!key.trim()) {
      return { ok: false, error: "parameters cannot contain an empty key." };
    }
    if (typeof value !== "string") {
      return { ok: false, error: `parameters.${key} must be a string.` };
    }
  }

  return {
    ok: true,
    value: {
      action_index: actionIndex,
      parameters: Object.fromEntries(
        Object.entries(parameters).map(([key, value]) => [key, String(value)]),
      ),
    },
  };
}

function normalizeCustomNodes(customNodes: CustomNodeConfig[]): CustomNodeConfig[] {
  return customNodes.map((node) => ({
    ...node,
    description: node.description ?? "",
    module_id: node.module_id || node.custom_node_id,
  }));
}

function normalizePlatformResources(
  resources: PlatformResourceInstance[] | undefined,
): PlatformResourceInstance[] {
  return (resources ?? []).map((resource) => ({
    resource_instance_id: resource.resource_instance_id,
    display_name: resource.display_name,
    description: resource.description ?? "",
    location: resource.location ?? "",
    impl_kind: resource.impl_kind,
    compute_nodes: (resource.compute_nodes ?? []).map((node) => ({
      node_id: node.node_id,
      display_name: node.display_name,
      node_type: node.node_type,
    })),
  }));
}

function normalizePlatformTemplates(
  templates: PlatformTemplate[] | undefined,
): PlatformTemplate[] {
  return (templates ?? []).map((template) => ({
    template_id: template.template_id,
    display_name: template.display_name,
    resources: (template.resources ?? []).map((resource) => ({
      display_name: resource.display_name,
      compute_nodes: (resource.compute_nodes ?? []).map((node) => ({
        node_id: node.node_id,
        display_name: node.display_name,
        node_type: node.node_type,
      })),
    })),
  }));
}

function ensureBuiltinConfig(
  configs: BuiltinNodeConfig[],
  byRef: Map<string, BuiltinNodeConfig>,
  domain: BuiltinNodeConfig["domain"],
  nodeId: string,
): BuiltinNodeConfig {
  const ref = buildNodeRef(domain, nodeId);
  const existing = byRef.get(ref);
  if (existing) {
    return existing;
  }

  const created: BuiltinNodeConfig = {
    domain,
    node_id: nodeId,
  };
  configs.push(created);
  byRef.set(ref, created);
  return created;
}

function isRuntimeConfigShape(value: unknown): value is RuntimeConfigFile {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isRecord(value.init_values) &&
    Array.isArray(value.ordered_execution_list) &&
    Array.isArray(value.custom_nodes)
  );
}

function isBuiltinDomainText(value: string): value is BuiltinNodeConfig["domain"] {
  return value === "environment" || value === "platform" || value === "signal";
}

export function runtimeConfigToProject(
  runtimeConfig: RuntimeConfigFile,
  catalog: ResourceCatalogFile | null,
): GuiProjectFile {
  const base = createEmptyProject(catalog);
  const configs = [...base.builtin_node_configs];
  const byRef = new Map(
    configs.map((config) => [buildNodeRef(config.domain, config.node_id), config] as const),
  );

  for (const [key, value] of Object.entries(runtimeConfig.init_values)) {
    const enableMatch = key.match(/^l3\.control\.enable\.(environment|platform|signal)\.(.+)$/);
    const bindMatch = key.match(/^l3\.control\.bind\.(environment|platform|signal)\.(.+)$/);
    const failureMatch = key.match(/^l3\.control\.failure\.(environment|platform|signal)\.(.+)$/);

    if (enableMatch) {
      if (!isBuiltinDomainText(enableMatch[1]!)) continue;
      const config = ensureBuiltinConfig(configs, byRef, enableMatch[1]!, enableMatch[2]!);
      config.enabled = value === "true";
    }
    if (bindMatch) {
      if (!isBuiltinDomainText(bindMatch[1]!)) continue;
      const config = ensureBuiltinConfig(configs, byRef, bindMatch[1]!, bindMatch[2]!);
      config.binding_resource_id = value;
    }
    if (failureMatch) {
      if (!isBuiltinDomainText(failureMatch[1]!)) continue;
      const config = ensureBuiltinConfig(configs, byRef, failureMatch[1]!, failureMatch[2]!);
      config.failure_policy = value === "degrade" ? "degrade" : "skip";
    }
  }

  return {
    ...base,
    builtin_node_configs: configs,
    ordered_execution_list: runtimeConfig.ordered_execution_list,
    custom_nodes: normalizeCustomNodes(runtimeConfig.custom_nodes),
    platform_resources: normalizePlatformResources(runtimeConfig.platform_resources),
    platform_templates: normalizePlatformTemplates(runtimeConfig.platform_templates),
  };
}

export function parseImportedProjectFile(
  text: string,
  catalog: ResourceCatalogFile | null,
): { project: GuiProjectFile; source: "gui_project" | "runtime_config" } {
  const parsed = JSON.parse(text) as unknown;
  if (isRuntimeConfigShape(parsed)) {
    return {
      project: runtimeConfigToProject(parsed, catalog),
      source: "runtime_config",
    };
  }
  const incoming = parsed as GuiProjectFile;
  return {
    project: {
      ...incoming,
      custom_nodes: normalizeCustomNodes((incoming.custom_nodes ?? []) as CustomNodeConfig[]),
      platform_resources: normalizePlatformResources(incoming.platform_resources),
      platform_templates: normalizePlatformTemplates(incoming.platform_templates),
    },
    source: "gui_project",
  };
}

export function projectToRuntimeConfig(project: GuiProjectFile): RuntimeConfigFile {
  const initValues: Record<string, string> = {};
  for (const config of project.builtin_node_configs) {
    const ref = `${config.domain}.${config.node_id}`;
    if (config.enabled !== undefined) {
      initValues[`l3.control.enable.${ref}`] = config.enabled ? "true" : "false";
    }
    if (config.binding_resource_id) {
      initValues[`l3.control.bind.${ref}`] = config.binding_resource_id;
    }
    if (config.failure_policy) {
      initValues[`l3.control.failure.${ref}`] = config.failure_policy;
    }
  }
  return {
    version: 1,
    init_values: initValues,
    ordered_execution_list: project.ordered_execution_list,
    custom_nodes: project.custom_nodes,
  };
}

export function findBuiltinConfig(
  project: GuiProjectFile,
  domain: BuiltinNodeConfig["domain"],
  nodeId: string,
): BuiltinNodeConfig | undefined {
  return project.builtin_node_configs.find(
    (config) => config.domain === domain && config.node_id === nodeId,
  );
}

export function findResourcesForNode(
  catalog: ResourceCatalogFile | null,
  domain: BuiltinNodeConfig["domain"],
  nodeId: string,
): ResourceCatalogEntry[] {
  if (!catalog) {
    return [];
  }
  const ref = buildNodeRef(domain, nodeId);
  return catalog.resources.filter((resource) => resource.bindable_node_refs.includes(ref));
}

export function validateProject(
  project: GuiProjectFile,
  catalog: ResourceCatalogFile | null,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seenCustomIds = new Set<string>();
  const sequencedCustomIds = new Set<string>();

  for (const config of project.builtin_node_configs) {
    const itemId = buildNodeRef(config.domain, config.node_id);
    if (config.enabled && !config.binding_resource_id) {
      issues.push({
        item_id: itemId,
        message: "Enabled builtin node is missing a resource binding.",
      });
    }

    if (config.binding_resource_id && catalog) {
      const resource = catalog.resources.find(
        (entry) => entry.resource_id === config.binding_resource_id,
      );
      if (!resource) {
        issues.push({
          item_id: itemId,
          message: "Bound resource does not exist in the current catalog.",
        });
      } else if (!resource.bindable_node_refs.includes(itemId)) {
        issues.push({
          item_id: itemId,
          message: "Selected resource cannot bind to this node.",
        });
      }
    }
  }

  for (const customNode of project.custom_nodes) {
    const itemId = `custom.${customNode.custom_node_id}`;
    if (seenCustomIds.has(customNode.custom_node_id)) {
      issues.push({
        item_id: itemId,
        message: "Custom node ID is duplicated.",
      });
    } else {
      seenCustomIds.add(customNode.custom_node_id);
    }

    if (!customNode.module_id) {
      issues.push({ item_id: itemId, message: "Missing module ID." });
    }
    if (!customNode.location) {
      issues.push({ item_id: itemId, message: "Missing file location." });
    }

    const inputValidation = validateCustomNodeInput(customNode.input);
    if (!inputValidation.ok) {
      issues.push({
        item_id: itemId,
        message: `Invalid custom input payload: ${inputValidation.error}`,
      });
    }

    if (
      customNode.enabled &&
      !project.ordered_execution_list.some(
        (item) =>
          item.kind === "custom_invocation_node" &&
          item.custom_node_id === customNode.custom_node_id,
      )
    ) {
      issues.push({
        item_id: itemId,
        message: "Enabled custom node is not present in the execution list.",
      });
    }
  }

  const customIds = new Set(project.custom_nodes.map((node) => node.custom_node_id));
  for (const item of project.ordered_execution_list) {
    if (item.kind !== "custom_invocation_node") {
      continue;
    }
    const itemId = `custom.${item.custom_node_id}`;
    if (!customIds.has(item.custom_node_id)) {
      issues.push({
        item_id: itemId,
        message: "Execution list references an undefined custom node.",
      });
      continue;
    }
    if (sequencedCustomIds.has(item.custom_node_id)) {
      issues.push({
        item_id: itemId,
        message: "Execution list cannot reference the same custom node more than once.",
      });
      continue;
    }
    sequencedCustomIds.add(item.custom_node_id);
  }

  return issues;
}

export function executionItemLabel(
  item: ExecutionItem,
  catalog: ResourceCatalogFile | null,
): string {
  if (item.kind === "builtin_core_chain") {
    return item.chain_id;
  }
  if (item.kind === "custom_invocation_node") {
    return `自定义 / ${item.custom_node_id}`;
  }
  return (
    catalog?.builtin_nodes.find(
      (node) => node.domain === item.domain && node.node_id === item.node_id,
    )?.display_name ?? `${item.domain}.${item.node_id}`
  );
}
