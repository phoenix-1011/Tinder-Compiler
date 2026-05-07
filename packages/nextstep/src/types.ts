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
  display_name: string;
  description: string;
  module_id: string;
  impl_kind: Exclude<ImplKind, "builtin">;
  location: string;
  input: string;
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

export interface GuiProjectFile {
  version: number;
  project_name: string;
  resource_catalog_name?: string;
  builtin_node_configs: BuiltinNodeConfig[];
  ordered_execution_list: ExecutionItem[];
  custom_nodes: CustomNodeConfig[];
  platform_resources: PlatformResourceInstance[];
  platform_templates: PlatformTemplate[];
}

export interface RuntimeConfigFile {
  version: number;
  init_values: Record<string, string>;
  ordered_execution_list: ExecutionItem[];
  custom_nodes: CustomNodeConfig[];
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
