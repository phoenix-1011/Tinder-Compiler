# 02 Architecture

## Resource Editor Boundary

```text
ComputeResourceEditor
  owns resource metadata editing
  owns implementation file associations
  owns runtime artifact association
  owns reusable capability editing
  owns interface generation state and capability status editing
  reads profile usage
  does not own profile activation/placement
```

## Target Resource Implementation Schema

```ts
interface ImplementationFileRef {
  file_id: string;
  path: string;
  storage: "managed" | "external";
  role: "primary" | "header" | "source" | "support";
  language: "python" | "cpp" | "c" | "unknown";
  generated_region_status?: "unknown" | "ok" | "missing" | "malformed" | "conflict";
}

interface RuntimeArtifactRef {
  path: string;
  kind: "python_script" | "cpp_dylib";
  required_for_export: boolean;
}

interface BuildConfig {
  mode: "none" | "python_check" | "external_command";
  working_directory?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

interface ImplementationStatus {
  artifact_exists?: boolean;
  generated_region_status?: "unknown" | "ok" | "missing" | "malformed" | "conflict";
  interface_status?: "unknown" | "ok" | "pending" | "conflict";
  output_exists?: boolean;
}

interface ComputeResourceImplementation {
  kind: "python_script" | "cpp_library";
  source_files: ImplementationFileRef[];
  runtime_artifact: RuntimeArtifactRef;
  build?: BuildConfig; // future; not edited by MVP UI
  status?: ImplementationStatus;
}
```

Editor-local save state should be modeled separately from persisted resource data:

```ts
interface ResourceEditorSaveState {
  resource_config: "clean" | "dirty" | "saving" | "save_failed" | "externally_modified";
  active_code_file: "clean" | "dirty" | "saving" | "save_failed" | "externally_modified";
  interface_generation: "synced" | "pending" | "conflict" | "generating" | "failed";
}
```

This state is UI/session state. It should not be written directly into resource JSON except for durable interface health fields such as `implementation.status.interface_status`.

Creation templates are optional inputs to resource creation:

```ts
interface ComputeResourceTemplate {
  template_id: string;
  template_version: string;
  display_name: string;
  source?: "built_in" | "project";
  resource_kind: "standard" | "custom";
  category:
    | "blank"
    | "detector"
    | "strike"
    | "platform"
    | "environment"
    | "signal"
    | "service";
  default_description?: string;
  default_tags?: string[];
  default_implementation_kind?: "python_script" | "cpp_library";
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
```

Templates prefill resource fields and suggestions. They do not create a separate schema branch and do not bypass validation.

Template discovery in MVP:

```text
1. Load built-in templates.
2. Load project templates from .tinder/resource-templates/.
3. Resolve by template_id + template_version.
4. If a project template intentionally overrides a built-in template_id, keep the project template effective and show source = project in UI.
```

There is no user-template discovery path in MVP.

Project template files:

```text
.tinder/resource-templates/
  detector.basic.json
  strike.basic.json
  platform-service.default.json
```

Saving a compute resource as a template is a lossy structural export:

- include reusable metadata and suggestions
- include standard node IDs, custom action names/descriptions/default parameters, and suggested variant metadata
- exclude concrete implementation references and generated state
- exclude `implementation.source_files[]`
- exclude `implementation.runtime_artifact`
- exclude profile usage and activation state

When the user needs a new resource with the same implementation files or artifact association, use resource copy instead of template export.

Resource copy is an explicit resource operation, not a template operation:

```ts
interface CopyResourceOptions {
  new_display_name: string;
  copy_code_implementation: boolean; // default true
}
```

Copy invariants:

- always create a new `resource_instance_id`
- always set copied resource `status = draft`
- always clear profile usage
- always reassign custom `action_index` values
- never share `implementation.source_files[]` entries with the original resource

When `copy_code_implementation = true`, source files are copied into a new resource directory and `implementation.source_files[]` points to the copied files. `implementation.runtime_artifact.path` is cleared or set to an unverified suggested path. Interface generation is marked pending.

When `copy_code_implementation = false`, resource structure is copied but `implementation.source_files[]` is empty, `implementation.runtime_artifact.path` is cleared, and implementation status is reset to unknown/pending.

## Resource Package Layout

Resource files follow the existing `.tinder/resources` library convention used by Chain Assembly:

```text
.tinder/
  profiles/
    <profile_id>.json
  resources/
    standard/
      <resource_instance_id>/
        resource.json
        src/
        include/
        artifact/
    custom/
      <resource_instance_id>/
        resource.json
        src/
        include/
        artifact/
  resource-templates/
    <template_id>.json
```

Discovery remains compatible with:

```text
.tinder/resources/standard/**/*.json
.tinder/resources/custom/**/*.json
```

New managed resources should write the metadata leaf as `resource.json`. This keeps the global `计算实例` library under `.tinder/resources` and avoids introducing `.tinder/compute-resources`.

Path semantics:

- `storage: "managed"` means `path` is relative to the resource package root.
- `storage: "external"` means `path` is an associated external path.
- new source files default to managed paths under `src/` or `include/`
- generated interfaces may write managed files without extra location confirmation
- generated interfaces must prompt before writing external files
- copy with implementation copies both managed and external source files into the target resource package and rewrites them as managed refs
- copy without implementation clears all source refs and runtime artifact path

Runtime artifact paths are resource-owned. They are not stored in profile refs. In MVP, C++ artifact paths are user-associated or suggested/unverified because compilation is out of scope.

Resource metadata should record template origin when applicable:

```ts
interface ResourceTemplateOrigin {
  template_id: string;
  template_version: string;
}
```

Resource metadata owns exactly one primary implementation object in MVP:

```ts
interface ComputeResourceImplementationState {
  implementation: ComputeResourceImplementation;
}
```

Standard resources still own multiple model variants under that single implementation:

```ts
interface StandardComputeResource {
  resource_instance_id: string;
  display_name: string;
  implementation: ComputeResourceImplementation;
  compute_nodes: PlatformComputeNode[];
  model_variants: ResourceModelVariant[];
}
```

`implementation` answers: source files, runtime artifact, generated-region health, and future build/check state. `model_variants` answer: which reusable candidate compute node is effective for a device/model/service variant.

The target model does not support:

- `implementations[]`
- `default_implementation_id`
- per-variant implementation target overrides
- runtime export target selection
- later multi-implementation target routing

No target-schema compatibility fields are kept for implementation. In particular, new resource JSON should not use top-level `location`, top-level `impl_kind`, or build output path fallbacks.

Runtime/export reads only:

```ts
resource.implementation.runtime_artifact.path
```

For Python resources, `runtime_artifact.path` usually points to the primary `.py` file. For C++ resources, it points to the generated `.dll` or project-defined dynamic library artifact.

## Creation And Validation

New resource creation has three levels:

```text
draft save    -> resource_kind + display_name
profile add   -> allowed for drafts, but disabled by default
active/export -> all blocking validation must pass
```

System-generated resource fields:

- `resource_instance_id`
- `created_at`
- `updated_at`
- initial `status = draft`
- empty capability arrays
- empty `implementation.source_files[]`
- runtime artifact requirement defaults
- unknown/default implementation health

Template-prefilled fields are suggestions only. Suggested standard nodes still require effective candidate selection. Suggested custom actions can generate `action_index` only after display name and description exist.

## Tab Layout

The editor has two work modes:

```text
Resource edit mode -> tabs and forms
Code edit mode     -> active source file in the main work area
```

There is no nested left file tree in code edit mode. Use an active source-file dropdown or command menu scoped to `implementation.source_files[]`.

### 概要

Compact form for identity and implementation summary.

Also include a compact, read-only usage summary:

- usage count across configuration profiles
- optional expanded profile list
- active/disabled state in each profile
- selected standard variant or custom action count
- link to open the owning profile

The usage summary is for impact awareness. It must not mutate profile membership, active state, variant selection, custom-node placement, or chain order.

### 能力节点

Resource capability editor:

- standard: candidates and variants
- custom: custom nodes, action index, handler functions

Standard and custom resources share the same editor shell, but their capability editors have different domain objects.

Standard capability editor:

```text
resource variant -> standard node coverage -> effective candidate
```

- Use a variant switcher for `model_variants[]`.
- Show standard chain nodes covered by the selected variant.
- Allow multiple candidate versions to target the same standard `node_id`.
- Enforce at most one effective candidate for the same resource variant and standard `node_id`.
- Do not provide drag ordering for standard nodes; chain order is read from the standard chain/profile projection.

Custom capability editor:

```text
custom resource -> reusable custom actions -> profile placements
```

- Edit `custom_nodes[]`.
- Require display name and description/summary before generating `action_index`.
- Auto-generate globally unique `action_index`; duplicate/conflict states are blocking.
- Track `handler_function`, default parameters, and node capability `status`.
- Show profile usage and placement links, but do not own placement or execution order.

### 实现文件

File association/editor bridge:

- add existing file
- create from template
- open in code edit mode
- inspect marker health
- generate/update interface

### 构建与产物

Hidden in MVP as a top-level tab. Artifact state is surfaced in `概要` and `实现文件` instead:

- runtime artifact path
- artifact kind
- artifact associated/missing state

MVP does not expose build commands, build logs, automatic compilation, or artifact staleness analysis.

### 文档与接口

Documentation and scaffold preview:

- source chain docs
- generated actions/declarations/dispatch regions
- handler stub preview
- conflict report

MVP interface actions:

- generate/update generated regions
- add missing function/handler entries when safe
- write generated-region comments
- create handler stubs once with comments
- preserve existing handler bodies and comments
- edit resource/node capability `status`

## Code Edit Mode

Layout:

```text
Top bar: resource title, status, mode switch, save actions
Main area: code editor for active source file
Right panel: assistant context switcher
```

Right panel contexts:

- `文档`: linked chain-node documentation and current node summaries
- `接口`: generated region preview, handler/function status, action indexes, marker status
- `问题`: conflicts, pending generation, missing entries, dirty/save state
- `AI`: reserved UI surface for future LLM assistance

Save/action boundary:

- `保存资源配置` writes resource JSON.
- `保存代码文件` writes the active source file.
- `生成/更新接口` writes generated regions and missing stubs according to safe-write rules.

AI is not wired in this slice. The UI can reserve the panel and action labels, but no harness, automatic modification, or agent write path is defined here.

## Save Boundary And Conflict Handling

`保存资源配置`:

- writes resource JSON only
- saves identity, description, status, template origin, categories, capability metadata, variants, file associations, runtime artifact association, and durable interface/scaffold state
- does not write source-file content

`保存代码文件`:

- writes the active source file only
- does not update resource JSON

`生成/更新接口`:

- is the only MVP action allowed to update both resource JSON and source files
- requires preview or impact summary before writing
- writes only generated regions and missing stubs
- records which files and metadata changed

External modifications:

- resource JSON external modification should move `resource_config` to `externally_modified`
- active source external modification should move `active_code_file` to `externally_modified`
- external-file generated writes require per-generation preview confirmation
- long-term external-write authorization is not stored in MVP
- automatic overwrite and automatic merge are not part of MVP

Navigation guard:

- dirty resource configuration blocks silent resource switch/close
- dirty active source file blocks silent source/resource switch/close
- pending interface generation warns but does not block navigation
- interface conflicts block runtime export for affected active nodes, not editor navigation

## Key Ownership Rule

The resource editor can update resource JSON and implementation files. It must not silently update profile refs except through explicit profile actions such as `加入档案`.
