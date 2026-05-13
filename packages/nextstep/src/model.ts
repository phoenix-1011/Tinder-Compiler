import type {
  BuiltinNodeConfig,
  CatalogBuiltinNode,
  ComputeResourceImplementation,
  ComputeResourceV2,
  CustomComputeNodeDef,
  CustomComputeResource,
  CustomNodeConfig,
  ExecutionItem,
  GuiProjectFile,
  ImplementationFileLanguage,
  ImplementationFileRef,
  ImplementationKind,
  PlatformComputeNode,
  PlatformResourceInstance,
  PlatformTemplate,
  ProfileCustomResourceRef,
  ProfileResourceRef,
  ProfileStandardVariantRef,
  ResourceCatalogEntry,
  ResourceCatalogFile,
  ResourceModelVariant,
  RuntimeArtifactKind,
  RuntimeCustomNodeConfig,
  RuntimeConfigFile,
  StandardComputeCandidate,
  StandardComputeResource,
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

function legacyInputOrNull(text: string | undefined): CustomNodeInputConfig | null {
  if (!text) {
    return null;
  }
  const parsed = validateCustomNodeInput(text);
  return parsed.ok ? parsed.value : null;
}

export function customNodeActionIndex(node: CustomNodeConfig): number {
  if (
    typeof node.action_index === "number" &&
    Number.isInteger(node.action_index) &&
    node.action_index >= 0
  ) {
    return node.action_index;
  }
  return legacyInputOrNull(node.input)?.action_index ?? 0;
}

export function nextCustomActionIndex(nodes: CustomNodeConfig[]): number {
  const used = new Set(nodes.map((node) => customNodeActionIndex(node)));
  let next = 0;
  while (used.has(next)) {
    next += 1;
  }
  return next;
}

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
  return customNodes.map((node) => {
    const legacyInput = legacyInputOrNull(node.input);
    const actionIndex = customNodeActionIndex(node);
    return {
      ...node,
      resource_instance_id: node.resource_instance_id || node.custom_node_id,
      node_id: node.node_id || node.custom_node_id,
      description: node.description ?? "",
      module_id: node.module_id || node.custom_node_id,
      action_index: actionIndex,
      default_parameters: node.default_parameters ?? legacyInput?.parameters ?? {},
      input: node.input ?? "",
    };
  });
}

function runtimeCustomNode(node: CustomNodeConfig): RuntimeCustomNodeConfig {
  return {
    custom_node_id: node.custom_node_id,
    resource_instance_id: node.resource_instance_id || node.custom_node_id,
    node_id: node.node_id || node.custom_node_id,
    display_name: node.display_name,
    description: node.description ?? "",
    module_id: node.module_id || node.custom_node_id,
    impl_kind: node.impl_kind,
    location: node.location,
    action_index: customNodeActionIndex(node),
    input: node.input ?? "",
    enabled: node.enabled,
  };
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
    custom_nodes: project.custom_nodes.map(runtimeCustomNode),
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
  const seenActionIndexes = new Map<number, string>();
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

    const hasInvalidTopLevelActionIndex =
      customNode.action_index !== undefined &&
      (typeof customNode.action_index !== "number" ||
        !Number.isInteger(customNode.action_index) ||
        customNode.action_index < 0);
    const legacyInput = legacyInputOrNull(customNode.input);
    const hasNoActionIndex =
      customNode.action_index === undefined && legacyInput?.action_index === undefined;
    const actionIndex = customNodeActionIndex(customNode);
    if (hasInvalidTopLevelActionIndex || hasNoActionIndex) {
      issues.push({
        item_id: itemId,
        message: "action_index must be an integer greater than or equal to 0.",
      });
    }
    const previousActionOwner = seenActionIndexes.get(actionIndex);
    if (previousActionOwner) {
      issues.push({
        item_id: itemId,
        message: `action_index is duplicated with ${previousActionOwner}.`,
      });
    } else {
      seenActionIndexes.set(actionIndex, itemId);
    }
    for (const [key, value] of Object.entries(customNode.default_parameters ?? {})) {
      if (!key.trim()) {
        issues.push({ item_id: itemId, message: "default_parameters cannot contain an empty key." });
      }
      if (typeof value !== "string") {
        issues.push({ item_id: itemId, message: `default_parameters.${key} must be a string.` });
      }
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

// ──────────────────────────────────────────────────────────────────────────
// Profile v2: lazy migration and resource view helpers
// ──────────────────────────────────────────────────────────────────────────

/**
 * Default variant id assigned during migration. v1 standard resources have no
 * explicit variants; everything they declared participates under one
 * synthetic variant whose name is constant so future variant editors can
 * recognise it.
 */
export const DEFAULT_PROFILE_VARIANT_ID = "default";

/**
 * Pure migration from a v1 profile shape + its `profile-extras.json` entry to
 * the v2 in-memory shape.
 *
 * - v1 profiles already containing `resources[]` are passed through after
 *   ensuring both new arrays exist.
 * - v1 standard participation comes from two sources:
 *   1. `builtin_node_configs[].binding_resource_id`
 *   2. `profile-extras.json`'s `extraStandardIds`
 *   Both produce `ProfileStandardVariantRef` entries using the synthetic
 *   `DEFAULT_PROFILE_VARIANT_ID` variant and `enabled: true` (v1 had no
 *   disabled state).
 * - v1 `custom_nodes[]` each become a `ProfileCustomResourceRef` keyed by
 *   `custom_node_id`. v1 also had no placement, so `custom_node_usages[]`
 *   stays empty until the renderer authors it.
 *
 * The function never touches disk and never mutates its inputs.
 */
export function migrateProfileFromV1(
  profile: GuiProjectFile,
  extras: { extraStandardIds?: string[] } | null | undefined,
): GuiProjectFile {
  if (profile.resources && profile.custom_node_usages) {
    return profile;
  }
  const resources: ProfileResourceRef[] = profile.resources
    ? [...profile.resources]
    : [];
  const seen = new Set(
    resources.map((ref) => profileResourceRefKey(ref)),
  );

  const pushStandard = (resourceId: string) => {
    const ref: ProfileStandardVariantRef = {
      kind: "standard",
      resource_instance_id: resourceId,
      variant_id: DEFAULT_PROFILE_VARIANT_ID,
      enabled: true,
    };
    const key = profileResourceRefKey(ref);
    if (seen.has(key)) return;
    seen.add(key);
    resources.push(ref);
  };

  for (const cfg of profile.builtin_node_configs) {
    if (cfg.binding_resource_id) pushStandard(cfg.binding_resource_id);
  }
  for (const id of extras?.extraStandardIds ?? []) {
    pushStandard(id);
  }
  for (const custom of profile.custom_nodes) {
    const ref: ProfileCustomResourceRef = {
      kind: "custom",
      resource_instance_id: custom.custom_node_id,
      enabled: custom.enabled ?? true,
    };
    const key = profileResourceRefKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    resources.push(ref);
  }

  return {
    ...profile,
    resources,
    custom_node_usages: profile.custom_node_usages ?? [],
  };
}

/** Stable dedupe key for a profile resource ref. */
export function profileResourceRefKey(ref: ProfileResourceRef): string {
  return ref.kind === "standard"
    ? `standard:${ref.resource_instance_id}:${ref.variant_id}`
    : `custom:${ref.resource_instance_id}`;
}

/** Resource refs flagged active. Migration always runs on v1 profiles first. */
export function profileActiveResources(
  profile: GuiProjectFile,
): ProfileResourceRef[] {
  return (profile.resources ?? []).filter((ref) => ref.enabled);
}

export function profileDisabledResources(
  profile: GuiProjectFile,
): ProfileResourceRef[] {
  return (profile.resources ?? []).filter((ref) => !ref.enabled);
}

/**
 * Folder node used by the renderer to render `活跃资源` / `停用资源` as a
 * virtual folder tree keyed by `ProfileResourceRef.folder`.
 */
export interface ProfileResourceFolder {
  name: string;
  path: string;
  children: ProfileResourceFolder[];
  resources: ProfileResourceRef[];
}

/** Group refs into a nested folder structure based on `folder` segments. */
export function profileResourcesByFolder(
  refs: ProfileResourceRef[],
): ProfileResourceFolder {
  const root: ProfileResourceFolder = {
    name: "",
    path: "",
    children: [],
    resources: [],
  };
  for (const ref of refs) {
    const segments = (ref.folder ?? "")
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean);
    let cursor = root;
    let acc = "";
    for (const seg of segments) {
      acc = acc ? `${acc}/${seg}` : seg;
      let child = cursor.children.find((c) => c.name === seg);
      if (!child) {
        child = { name: seg, path: acc, children: [], resources: [] };
        cursor.children.push(child);
      }
      cursor = child;
    }
    cursor.resources.push(ref);
  }
  return root;
}

// ─────────────────────────────────────────────────────────────────────────────
// Compute resource v1 ↔ v2
//
// Existing single-file resource JSONs use the v1 shape (top-level `location`
// + `impl_kind`). The v2 schema lifts those into `implementation.*`. The
// migration runs in memory on read: on-disk shapes are only rewritten when
// the user explicitly saves through the resource editor.
//
// `projectToV1` exists so callers that still consume the legacy
// `PlatformResourceInstance` / `CustomNodeConfig` shape (sidebar tree, chain
// projection) keep working while the v2 storage layer rolls in.
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_RESOURCE_STATUS = "draft" as const;
export const DEFAULT_IMPLEMENTATION_KIND: ImplementationKind = "python_script";

/** Whether a parsed object is already in v2 shape. Cheap structural check. */
export function isComputeResourceV2(value: unknown): value is ComputeResourceV2 {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return (
    obj.schema_version === 2 &&
    typeof obj.resource_kind === "string" &&
    (obj.resource_kind === "standard" || obj.resource_kind === "custom") &&
    typeof obj.resource_instance_id === "string" &&
    typeof obj.implementation === "object" &&
    obj.implementation !== null
  );
}

function inferLanguageFromPath(path: string): ImplementationFileLanguage {
  const lower = path.toLowerCase();
  if (lower.endsWith(".py")) return "python";
  if (
    lower.endsWith(".cpp") ||
    lower.endsWith(".cc") ||
    lower.endsWith(".cxx") ||
    lower.endsWith(".hpp")
  ) {
    return "cpp";
  }
  if (lower.endsWith(".c") || lower.endsWith(".h")) return "c";
  return "unknown";
}

function inferImplementationKindFromLegacy(
  implKind: string | undefined,
  location: string | undefined,
): ImplementationKind {
  if (implKind === "python_script" || implKind === "cpp_dylib") {
    return implKind === "cpp_dylib" ? "cpp_library" : "python_script";
  }
  if (location && location.toLowerCase().endsWith(".py")) return "python_script";
  if (location && /\.(dll|so|dylib)$/i.test(location)) return "cpp_library";
  return DEFAULT_IMPLEMENTATION_KIND;
}

function runtimeArtifactKindFor(kind: ImplementationKind): RuntimeArtifactKind {
  return kind === "cpp_library" ? "cpp_dylib" : "python_script";
}

function emptyImplementation(kind: ImplementationKind): ComputeResourceImplementation {
  return {
    kind,
    source_files: [],
    runtime_artifact: {
      path: "",
      kind: runtimeArtifactKindFor(kind),
      required_for_export: true,
    },
    status: { interface_status: "unknown" },
  };
}

function legacyLocationToImplementation(
  location: string | undefined,
  implKind: string | undefined,
  fileIdSeed: string,
): ComputeResourceImplementation {
  const kind = inferImplementationKindFromLegacy(implKind, location);
  const impl = emptyImplementation(kind);
  if (location && location.trim().length > 0) {
    const language = inferLanguageFromPath(location);
    const ref: ImplementationFileRef = {
      file_id: `${fileIdSeed}:primary`,
      // Legacy single-file resources don't have a managed package root, so
      // any pre-existing location is treated as external until the user
      // re-saves into the new package layout.
      path: location,
      storage: "external",
      role: "primary",
      language,
    };
    impl.source_files = [ref];
    impl.runtime_artifact = {
      path: location,
      kind: runtimeArtifactKindFor(kind),
      required_for_export: true,
    };
  }
  return impl;
}

/**
 * Lift a legacy `PlatformResourceInstance` (one JSON per resource) to the v2
 * `StandardComputeResource` shape. Does not touch disk.
 */
export function migrateStandardResourceFromV1(
  v1: PlatformResourceInstance,
): StandardComputeResource {
  const implementation = legacyLocationToImplementation(
    v1.location,
    v1.impl_kind,
    v1.resource_instance_id,
  );
  const compute_nodes: StandardComputeCandidate[] = (v1.compute_nodes ?? []).map(
    (n) => ({ ...n }),
  );
  return {
    schema_version: 2,
    resource_kind: "standard",
    resource_instance_id: v1.resource_instance_id,
    display_name: v1.display_name,
    description: v1.description,
    status: DEFAULT_RESOURCE_STATUS,
    implementation,
    compute_nodes,
    model_variants: [],
  };
}

/**
 * Lift a legacy single-file `CustomNodeConfig` (one node per JSON) into a v2
 * `CustomComputeResource` containing exactly that one custom node.
 */
export function migrateCustomResourceFromV1(
  v1: CustomNodeConfig,
): CustomComputeResource {
  const implementation = legacyLocationToImplementation(
    v1.location,
    v1.impl_kind,
    v1.resource_instance_id ?? v1.custom_node_id,
  );
  const node: CustomComputeNodeDef = {
    node_id: v1.node_id ?? v1.custom_node_id,
    display_name: v1.display_name,
    description: v1.description,
    action_index: customNodeActionIndex(v1),
    default_parameters: v1.default_parameters,
  };
  return {
    schema_version: 2,
    resource_kind: "custom",
    resource_instance_id: v1.resource_instance_id ?? v1.custom_node_id,
    display_name: v1.display_name,
    description: v1.description,
    status: v1.enabled === false ? "disabled" : DEFAULT_RESOURCE_STATUS,
    implementation,
    custom_nodes: [node],
  };
}

/**
 * Down-project a v2 standard resource to the legacy shape consumed by the
 * existing sidebar tree and chain projection. Lossy on candidate metadata
 * and `model_variants` — fields the legacy code path never read anyway.
 */
export function projectStandardResourceToV1(
  v2: StandardComputeResource,
): PlatformResourceInstance {
  const compute_nodes: PlatformComputeNode[] = v2.compute_nodes.map((c) => ({
    node_id: c.node_id,
    display_name: c.display_name,
    node_type: c.node_type,
  }));
  return {
    resource_instance_id: v2.resource_instance_id,
    display_name: v2.display_name,
    description: v2.description,
    location: v2.implementation.runtime_artifact.path || undefined,
    impl_kind:
      v2.implementation.kind === "cpp_library" ? "cpp_dylib" : "python_script",
    compute_nodes,
  };
}

/**
 * Down-project a v2 custom resource to the legacy `CustomNodeConfig` used by
 * existing sidebar/chain code. v2 custom resources may carry multiple nodes;
 * the projection picks the first as the headline node since the legacy data
 * model only represented one node per file.
 */
export function projectCustomResourceToV1(
  v2: CustomComputeResource,
): CustomNodeConfig {
  const headline = v2.custom_nodes[0];
  const implKind: Exclude<CustomNodeConfig["impl_kind"], "builtin"> =
    v2.implementation.kind === "cpp_library" ? "cpp_dylib" : "python_script";
  return {
    custom_node_id: v2.resource_instance_id,
    resource_instance_id: v2.resource_instance_id,
    node_id: headline?.node_id ?? v2.resource_instance_id,
    display_name: v2.display_name,
    description: v2.description ?? headline?.description ?? "",
    module_id: v2.resource_instance_id,
    impl_kind: implKind,
    location: v2.implementation.runtime_artifact.path ?? "",
    action_index: headline?.action_index ?? 0,
    default_parameters: headline?.default_parameters,
    enabled: v2.status !== "disabled",
  };
}

/**
 * Return the smallest non-negative integer that is not present in `used`.
 * Used by the resource editor when allocating fresh `action_index` values
 * for newly added custom nodes.
 */
export function nextFreeIndex(used: Iterable<number>): number {
  const set = used instanceof Set ? used : new Set(used);
  let n = 0;
  while (set.has(n)) n += 1;
  return n;
}

/**
 * Allocate `action_index` for any custom nodes in the given v2 resource that
 * are eligible (non-empty `description`) but still missing one. Returns a
 * new resource object with the updated nodes; the original is not mutated.
 *
 * `usedExternally` should be the union of action indexes already taken by
 * other custom resources and profile-embedded custom nodes — callers pass
 * the global set so allocation stays globally unique.
 */
export function allocateCustomActionIndexes(
  resource: CustomComputeResource,
  usedExternally: Iterable<number>,
): CustomComputeResource {
  const taken = new Set<number>(usedExternally);
  for (const node of resource.custom_nodes) {
    if (typeof node.action_index === "number") taken.add(node.action_index);
  }
  let mutated = false;
  const next = resource.custom_nodes.map((node) => {
    if (typeof node.action_index === "number") return node;
    if (!node.description?.trim()) return node;
    const idx = nextFreeIndex(taken);
    taken.add(idx);
    mutated = true;
    return { ...node, action_index: idx };
  });
  return mutated ? { ...resource, custom_nodes: next } : resource;
}

/**
 * Parse the contents of a `resource.json` (or legacy single-file resource
 * JSON) and return the v2 shape, regardless of which schema the file uses
 * on disk. Throws on malformed JSON.
 */
export function parseComputeResource(
  text: string,
  hint: ComputeResourceV2["resource_kind"],
): ComputeResourceV2 {
  const parsed = JSON.parse(text) as unknown;
  if (isComputeResourceV2(parsed)) return parsed;
  if (hint === "standard") {
    return migrateStandardResourceFromV1(parsed as PlatformResourceInstance);
  }
  return migrateCustomResourceFromV1(parsed as CustomNodeConfig);
}

/**
 * Walk a standard resource's `compute_nodes[]` and assign a stable
 * `inactive_suffix` to candidates that don't already have one. Suffixes
 * are unique per `node_id` group so codegen can mangle disabled
 * functions without collision (e.g. two candidates for the same chain
 * node get `_v1` and `_v2`, not both `_inactive`).
 *
 * Returns a new resource object when any change was made; otherwise the
 * original reference.
 */
export function allocateInactiveSuffixes(
  resource: StandardComputeResource,
): StandardComputeResource {
  // Group existing candidates by node_id and record which suffixes are
  // already taken. We start from `_v1` (rather than the legacy
  // `_inactive`) so the allocation is regular and reversible.
  const groups = new Map<string, StandardComputeCandidate[]>();
  for (const cand of resource.compute_nodes) {
    const list = groups.get(cand.node_id);
    if (list) list.push(cand);
    else groups.set(cand.node_id, [cand]);
  }
  let mutated = false;
  const next = resource.compute_nodes.map((cand) => {
    if (cand.inactive_suffix && cand.inactive_suffix.trim() !== "") return cand;
    const group = groups.get(cand.node_id) ?? [];
    const taken = new Set(
      group
        .filter((c) => c !== cand && c.inactive_suffix)
        .map((c) => c.inactive_suffix as string),
    );
    let n = 1;
    while (taken.has(`_v${n}`)) n += 1;
    const suffix = `_v${n}`;
    taken.add(suffix);
    mutated = true;
    return { ...cand, inactive_suffix: suffix };
  });
  return mutated ? { ...resource, compute_nodes: next } : resource;
}

// Re-export so callers don't need to import the variant type just to satisfy
// `noUnusedLocals` in stricter tsconfigs.
export type { ResourceModelVariant };
