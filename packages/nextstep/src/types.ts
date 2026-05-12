export type Layer3Category = "environment" | "platform" | "signal" | "custom";
export type ImplKind = "cpp_dylib" | "python_script" | "builtin";
export type PlatformNodeType =
  | "pathway"
  | "switch"
  | "extend"
  | "emit_beam"
  | "strike"
  | "discharge"
  | "dispatch"
  | "inform";
export type NodeState =
  | "default_unconfigured"
  | "configured_partial"
  | "configured_pending_binding"
  | "explicit_disabled"
  | "enabled_and_bound"
  | "readonly_builtin"
  | "custom_enabled"
  | "custom_disabled";

export interface CatalogBuiltinNode {
  domain: Exclude<Layer3Category, "custom">;
  node_id: string;
  display_name?: string;
}

export interface ResourceCatalogEntry {
  resource_id: string;
  display_name: string;
  layer3_category: Layer3Category;
  impl_kind: ImplKind;
  location: string;
  bindable_node_refs: string[];
}

export interface ResourceCatalogFile {
  version: number;
  builtin_nodes: CatalogBuiltinNode[];
  resources: ResourceCatalogEntry[];
}

export interface BuiltinNodeConfig {
  domain: Exclude<Layer3Category, "custom">;
  node_id: string;
  enabled?: boolean;
  binding_resource_id?: string;
  failure_policy?: "skip" | "degrade";
}

export interface CustomNodeConfig {
  custom_node_id: string;
  resource_instance_id?: string;
  node_id?: string;
  display_name: string;
  description: string;
  module_id: string;
  impl_kind: Exclude<ImplKind, "builtin">;
  location: string;
  /**
   * @deprecated Legacy payload used by the old GUI. New Model-P-v2 runtime
   * reads action_index as a top-level field and injects parameters by resource.
   */
  input?: string;
  action_index?: number;
  default_parameters?: Record<string, string>;
  enabled: boolean;
}

export interface RuntimeCustomNodeConfig {
  custom_node_id: string;
  resource_instance_id: string;
  node_id: string;
  display_name: string;
  description: string;
  module_id: string;
  impl_kind: Exclude<ImplKind, "builtin">;
  location: string;
  action_index: number;
  /**
   * @deprecated Preserved only for Model-P-v2 legacy input fallback.
   */
  input?: string;
  enabled: boolean;
}

export interface PlatformComputeNode {
  node_id: string;
  display_name: string;
  node_type: PlatformNodeType;
}

export interface PlatformResourceInstance {
  resource_instance_id: string;
  display_name: string;
  description?: string;
  location?: string;
  impl_kind?: "python_script" | "cpp_dylib";
  compute_nodes: PlatformComputeNode[];
}

export interface PlatformTemplate {
  template_id: string;
  display_name: string;
  resources: Array<{
    display_name: string;
    compute_nodes: PlatformComputeNode[];
  }>;
}

export interface BuiltinDomainExecutionItem {
  kind: "builtin_domain_node";
  domain: Exclude<Layer3Category, "custom">;
  node_id: string;
}

export interface BuiltinCoreExecutionItem {
  kind: "builtin_core_chain";
  chain_id: string;
}

export interface CustomExecutionItem {
  kind: "custom_invocation_node";
  custom_node_id: string;
}

export type ExecutionItem =
  | BuiltinDomainExecutionItem
  | BuiltinCoreExecutionItem
  | CustomExecutionItem;

/**
 * Profile-managed resource reference. Version-2 profiles own participation
 * through `resources[]` instead of the legacy mix of `builtin_node_configs`
 * bindings and `profile-extras.json`.
 */
export type ProfileResourceRef =
  | ProfileStandardVariantRef
  | ProfileCustomResourceRef;

export interface ProfileStandardVariantRef {
  kind: "standard";
  resource_instance_id: string;
  /**
   * Identifier of the resource variant participating in the profile. Older
   * standard resources without explicit variants migrate as `"default"`.
   */
  variant_id: string;
  /** Whether the variant appears under `活跃资源` (true) or `停用资源` (false). */
  enabled: boolean;
  /** Profile-local virtual folder path, e.g. "雷达/主雷达". */
  folder?: string;
}

export interface ProfileCustomResourceRef {
  kind: "custom";
  resource_instance_id: string;
  enabled: boolean;
  folder?: string;
}

/**
 * Authoring placement for one custom compute node. Profile owns placement;
 * the custom resource file owns the node definition.
 */
export interface CustomNodeUsage {
  resource_instance_id: string;
  /** Node id inside the custom resource's `custom_nodes[]`. */
  node_id: string;
  enabled: boolean;
  /**
   * Anchor specifying which built-in execution item this custom node should
   * be inserted before. `null` means append after the last built-in item.
   */
  insert_before?: BuiltinExecutionAnchor | null;
  /** Sort key among custom usages sharing the same anchor. */
  order: number;
}

export type BuiltinExecutionAnchor =
  | { kind: "builtin_domain_node"; domain: string; node_id: string }
  | { kind: "builtin_core_chain"; chain_id: string };

export interface GuiProjectFile {
  /**
   * Schema version. v1 (legacy) profiles encode standard participation via
   * `builtin_node_configs[].binding_resource_id` plus `profile-extras.json`.
   * v2 profiles use `resources[]` and `custom_node_usages[]` directly.
   */
  version: number;
  project_name: string;
  resource_catalog_name?: string;
  builtin_node_configs: BuiltinNodeConfig[];
  ordered_execution_list: ExecutionItem[];
  custom_nodes: CustomNodeConfig[];
  platform_resources: PlatformResourceInstance[];
  platform_templates: PlatformTemplate[];
  /**
   * v2 primary participation store. Optional during the migration period so
   * the field is absent on disk for legacy profiles; the in-memory shape
   * after `migrateProfileFromV1` always populates it.
   */
  resources?: ProfileResourceRef[];
  /**
   * v2 custom-node placement. Empty after migrating a v1 profile because v1
   * did not store placement separately.
   */
  custom_node_usages?: CustomNodeUsage[];
}

export interface RuntimeConfigFile {
  version: number;
  init_values: Record<string, string>;
  ordered_execution_list: ExecutionItem[];
  custom_nodes: RuntimeCustomNodeConfig[];
  /**
   * @deprecated Legacy GUI-only fields accepted on import for backward compatibility.
   */
  platform_resources?: PlatformResourceInstance[];
  /**
   * @deprecated Legacy GUI-only fields accepted on import for backward compatibility.
   */
  platform_templates?: PlatformTemplate[];
}

export interface ValidationIssue {
  item_id: string;
  message: string;
}
