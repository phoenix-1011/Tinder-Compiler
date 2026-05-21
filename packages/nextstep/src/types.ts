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

export type ProfileEffectiveCandidateOverride = string | null;

export interface ProfileStandardSlotOverrides {
  /**
   * Profile-local effective candidate overrides keyed by standard `node_id`.
   * A string selects that candidate for this profile slot only; `null`
   * explicitly clears a branch default for this profile slot.
   */
  effective_candidates?: Record<string, ProfileEffectiveCandidateOverride>;
}

export interface ProfileStandardVariantRef {
  kind: "standard";
  resource_instance_id: string;
  /**
   * Identifier of the resource variant participating in the profile. Older
   * standard resources without explicit variants migrate as `"default"`.
   */
  variant_id: string;
  /**
   * Branch selected by this profile slot. During the v2 -> branch transition
   * this mirrors `variant_id`; new branch-aware writers should populate it.
   */
  selected_branch_id?: string;
  /** Whether the variant appears under `活跃资源` (true) or `停用资源` (false). */
  enabled: boolean;
  /** Profile-local virtual folder path, e.g. "雷达/主雷达". */
  folder?: string;
  /** Profile-local usage overrides; does not mutate the compute branch. */
  overrides?: ProfileStandardSlotOverrides;
}

export interface ProfileCustomResourceRef {
  kind: "custom";
  resource_instance_id: string;
  /**
   * Branch selected by this profile slot. Legacy custom refs omit it and
   * normalize to `"default"`.
   */
  selected_branch_id?: string;
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

// ─────────────────────────────────────────────────────────────────────────────
// Compute resource v2 schema
//
// v2 lifts implementation details (source files, runtime artifact, generated
// region health) into a first-class `implementation` object on each compute
// resource. Profile refs only point at resources by id; they do not duplicate
// implementation state. See `dev-docs/active/compute-resource-editor-uiux`.
//
// v1 stored a single JSON per resource at `.tinder/resources/<kind>/<file>.json`
// with top-level `location` / `impl_kind`. v2 stores a package directory at
// `.tinder/resources/<kind>/<resource_instance_id>/resource.json` plus
// sibling `src/`, `include/`, `artifact/`. Both shapes coexist on disk during
// the transition; the v1 → v2 migration runs in memory on read.
// ─────────────────────────────────────────────────────────────────────────────

export type ImplementationKind = "python_script" | "cpp_library";
export type ImplementationFileStorage = "managed" | "external";
export type ImplementationFileRole = "primary" | "header" | "source" | "support";
export type ImplementationFileLanguage = "python" | "cpp" | "c" | "unknown";
export type GeneratedRegionStatus =
  | "unknown"
  | "ok"
  | "missing"
  | "malformed"
  | "conflict";
export type InterfaceStatus = "unknown" | "ok" | "pending" | "conflict";
export type RuntimeArtifactKind = "python_script" | "cpp_dylib";
export type ComputeResourceStatus = "draft" | "active" | "disabled";
export type ComputeResourceKind = "standard" | "custom";
export type ResourceCategory =
  | "blank"
  | "detector"
  | "strike"
  | "platform"
  | "environment"
  | "signal"
  | "service";

export interface ImplementationFileRef {
  file_id: string;
  /**
   * For `storage = "managed"` this is a path relative to the resource package
   * root (e.g. `src/main.cpp`). For `storage = "external"` this is an
   * absolute path or a project-relative path outside the resource package.
   */
  path: string;
  storage: ImplementationFileStorage;
  role: ImplementationFileRole;
  language: ImplementationFileLanguage;
  generated_region_status?: GeneratedRegionStatus;
}

export interface RuntimeArtifactRef {
  /**
   * Path consumed by runtime export. May be empty on draft resources; a
   * non-empty value is required before active/export validation passes.
   */
  path: string;
  kind: RuntimeArtifactKind;
  required_for_export: boolean;
}

/**
 * Reserved for the future build slice. Not edited by MVP UI; v2 readers must
 * accept resource JSON that omits this field entirely.
 */
export interface BuildConfig {
  mode: "none" | "python_check" | "external_command";
  working_directory?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface ImplementationStatus {
  artifact_exists?: boolean;
  generated_region_status?: GeneratedRegionStatus;
  interface_status?: InterfaceStatus;
  output_exists?: boolean;
}

export interface ComputeResourceImplementation {
  kind: ImplementationKind;
  source_files: ImplementationFileRef[];
  runtime_artifact: RuntimeArtifactRef;
  /** Future build slice; not written by MVP UI. */
  build?: BuildConfig;
  status?: ImplementationStatus;
}

export interface ResourceTemplateOrigin {
  template_id: string;
  template_version: string;
}

/**
 * One candidate version of a standard chain node provided by a standard
 * resource. Multiple candidates may target the same `node_id`; the resource
 * variant decides which is effective.
 */
export interface StandardComputeCandidate extends PlatformComputeNode {
  /**
   * Stable id for variant selection. When omitted, callers should fall back
   * to `node_id` so legacy single-candidate-per-node resources keep working.
   */
  candidate_id?: string;
  function_name?: string;
  base_function_name?: string;
  inactive_suffix?: string;
  status?: ComputeResourceStatus;
  /** Free-form note edited via the candidate row's note button. */
  notes?: string;
}

/**
 * Model/device variant of a standard resource. Selects exactly one effective
 * candidate per standard `node_id`.
 */
export interface ResourceModelVariant {
  variant_id: string;
  display_name: string;
  /** Map from standard `node_id` to the effective candidate id. */
  effective_candidates?: Record<string, string>;
  model_binding_required?: boolean;
  notes?: string;
}

export interface CustomComputeNodeDef {
  node_id: string;
  display_name: string;
  description: string;
  /**
   * Globally unique action index allocated by the resource editor. Left
   * undefined when the node still lacks the metadata required for allocation
   * (i.e. `description` is empty). Allocation runs on save so a draft with a
   * pending description does not consume a slot.
   */
  action_index?: number;
  handler_function?: string;
  default_parameters?: Record<string, string>;
  status?: ComputeResourceStatus;
  /** Free-form authoring notes shown alongside the node row. */
  notes?: string;
}

interface ComputeResourceCommonV2 {
  schema_version: 2;
  resource_instance_id: string;
  display_name: string;
  description?: string;
  tags?: string[];
  notes?: string;
  resource_category?: ResourceCategory;
  template_origin?: ResourceTemplateOrigin;
  status: ComputeResourceStatus;
  implementation: ComputeResourceImplementation;
  created_at?: string;
  updated_at?: string;
}

export interface StandardComputeResource extends ComputeResourceCommonV2 {
  resource_kind: "standard";
  compute_nodes: StandardComputeCandidate[];
  model_variants: ResourceModelVariant[];
}

export interface CustomComputeResource extends ComputeResourceCommonV2 {
  resource_kind: "custom";
  custom_nodes: CustomComputeNodeDef[];
}

export type ComputeResourceV2 = StandardComputeResource | CustomComputeResource;

// ─────────────────────────────────────────────────────────────────────────────
// Compute resource family / branch schema
//
// Branch-aware resources promote `计算实例` to a source-of-truth family and
// store every editable implementation version as a branch under that family.
// Current v2 packages are compatibility-read as a family plus one or more
// synthetic branches until explicit migration writes the branch layout.
// ─────────────────────────────────────────────────────────────────────────────

export interface ComputeResourceBranchSummary {
  branch_id: string;
  display_name: string;
  status: ComputeResourceStatus;
  updated_at?: string;
}

export interface ComputeResourceFamilyFile {
  schema_version: 3;
  resource_kind: ComputeResourceKind;
  resource_instance_id: string;
  display_name: string;
  description?: string;
  tags?: string[];
  default_branch_id: string;
  branches: ComputeResourceBranchSummary[];
  created_at?: string;
  updated_at?: string;
}

interface ComputeResourceBranchCommon {
  schema_version: 3;
  resource_kind: ComputeResourceKind;
  resource_instance_id: string;
  branch_id: string;
  display_name: string;
  description?: string;
  status: ComputeResourceStatus;
  implementation: ComputeResourceImplementation;
  notes?: string;
  created_from_branch_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface StandardComputeResourceBranch
  extends ComputeResourceBranchCommon {
  resource_kind: "standard";
  compute_nodes: StandardComputeCandidate[];
  /** Map from standard `node_id` to the effective candidate id. */
  effective_candidates: Record<string, string>;
}

export interface CustomComputeResourceBranch
  extends ComputeResourceBranchCommon {
  resource_kind: "custom";
  custom_nodes: CustomComputeNodeDef[];
}

export type ComputeResourceBranch =
  | StandardComputeResourceBranch
  | CustomComputeResourceBranch;

export type ProfileResourceSlot =
  | ProfileStandardBranchSlot
  | ProfileCustomBranchSlot;

export interface ProfileStandardBranchSlot {
  kind: "standard";
  resource_instance_id: string;
  selected_branch_id: string;
  enabled: boolean;
  folder?: string;
  overrides?: ProfileStandardSlotOverrides;
}

export interface ProfileCustomBranchSlot {
  kind: "custom";
  resource_instance_id: string;
  selected_branch_id: string;
  enabled: boolean;
  folder?: string;
}

/**
 * Project template emitted by `另存为项目模板`. Implementation source files,
 * runtime artifact paths, generated state, and profile usage are intentionally
 * excluded — use resource copy if those need to be preserved.
 */
export interface ComputeResourceTemplate {
  template_id: string;
  template_version: string;
  display_name: string;
  source?: "built_in" | "project";
  resource_kind: ComputeResourceKind;
  category: ResourceCategory;
  default_description?: string;
  default_tags?: string[];
  default_implementation_kind?: ImplementationKind;
  suggested_standard_node_ids?: string[];
  suggested_custom_actions?: Array<{
    display_name: string;
    description: string;
    default_parameters?: Record<string, string>;
  }>;
  suggested_variant?: {
    variant_name: string;
    model_binding_required: boolean;
  };
}
