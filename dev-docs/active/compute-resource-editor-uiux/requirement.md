# Compute Resource Editor UIUX Requirement

## Background

The current Chain Assembly foundation already has `计算实例/标准` and `计算实例/自定义` trees. The next UX layer should let users edit compute resources before or after they are added to a configuration profile.

Compute resources should be able to reference real implementation files such as `.py`, `.cpp`, `.h`, `.hpp`, `.cc`, and generated/native build outputs. Their non-code metadata must also be editable.

## Goals

- Provide a first-class compute resource editor.
- Allow editing resource metadata independent of a specific configuration profile.
- Allow standard resources to edit reusable `compute_nodes[]` and `model_variants[]`.
- Allow custom resources to edit reusable `custom_nodes[]`, `action_index`, `handler_function`, and default parameter metadata.
- Allow resources to associate, create, open, and validate implementation files.
- Support interface generation with safe marker boundaries.
- Support automatic interface entry generation, generated comments, handler/function entry maintenance, and generated-region status display.
- Support editing resource and node capability `status`.
- Show which configuration profiles use the resource.

## Non-Goals

- Do not make `.py`, `.dll`, `.cpp`, or `.h` files draggable profile resources.
- Do not store code file paths, build commands, or implementation details in configuration profile refs.
- Do not make configuration profile activation a prerequisite for editing a resource.
- Do not discuss or implement compilation/build workflows in this UIUX slice.
- Do not expose build command editing, build logs, automatic compilation, or stale artifact analysis in MVP.

## Primary Decisions

- `计算实例` can be edited before `加入档案`.
- `加入档案` creates or updates a profile reference; it is not the resource edit entry condition.
- New resources can be saved as drafts with only `resource_kind` and `display_name`.
- Draft resources can be added to a profile only as disabled; active/exported runtime config still requires blocking validation to pass.
- Optional built-in and project templates can prefill category, description, tags, implementation kind, suggested standard nodes, suggested custom actions, and suggested variants.
- MVP does not define a separate user-template source.
- A compute resource can be saved as a project template, but the template must not include concrete implementation files, runtime artifacts, generated state, or profile usage.
- Copying a compute resource uses one `复制计算实例` entry with a `复制代码实现` option.
- Copying must not produce two resources that point to the same implementation source files.
- Managed compute resources are stored under `.tinder/resources/<kind>/<resource_instance_id>/resource.json`.
- Source file refs distinguish `managed` resource-package files from `external` file associations.
- `构建与产物` is hidden as a top-level MVP tab; artifact state is summarized in `概要` and `实现文件`.
- External file writes require explicit confirmation in every interface generation preview; MVP does not remember long-term external-write authorization.
- Each compute resource has exactly one primary `implementation`; multi-implementation targets are not planned as a future upgrade.
- Implementation files are associated through the resource editor.
- Runtime artifact association belongs to the compute resource.
- MVP focuses on source file association, runtime artifact association, interface generation, generated comments, handler/function entry maintenance, and capability status editing.
- Runtime export consumes the validated resource metadata and effective runtime artifact path, but profile files do not duplicate implementation details.

## Create Resource Flow

First screen:

- choose `resource_kind: standard | custom`
- choose optional template, for example `空白`, `探测设备`, `打击设备`, `平台服务`, `环境服务`, or `信号服务`
- enter `display_name`
- create draft

Creation-time required fields:

- `resource_kind`
- `display_name`

System-generated fields:

- `resource_instance_id`
- timestamps such as `created_at` and `updated_at`
- `status = draft`
- empty `implementation.source_files[]`
- `implementation.runtime_artifact.required_for_export = true`
- `implementation.status` with unknown/default health

Default values:

- `description = ""`
- `tags = []`
- `notes = ""`
- `compute_nodes = []` for standard resources
- `model_variants = []` for standard resources
- `custom_nodes = []` for custom resources

Template-prefilled values:

- resource category
- default description
- default tags
- default `implementation.kind`
- suggested standard node IDs
- suggested custom actions
- suggested first variant

Templates create drafts or suggestions. They must not create a fully effective runtime resource without the same validation required for manually created resources.

Template sources:

- built-in templates are read-only and shipped with the application/project package
- project templates are stored under `.tinder/resource-templates/`
- templates are grouped by source in the creation UI
- project templates can override a built-in template with the same `template_id`, but the UI must show the selected template source
- there is no user-template layer in MVP

Save as template:

- saves the current resource structure as a project template
- includes resource kind, category, description, tags, suggested standard nodes, suggested custom actions, and suggested variant metadata
- excludes `resource_instance_id`, `implementation.source_files[]`, `implementation.runtime_artifact`, `implementation.status`, generated-region state, concrete handler/source paths, and profile usage
- if implementation files or runtime artifacts should be preserved, use copy resource instead of save as template

## Copy Resource Flow

`复制计算实例` opens one dialog with:

- new display name
- `复制代码实现`: yes/no

Default:

- `复制代码实现 = yes`

Common copy behavior:

- generate new `resource_instance_id`
- generate new `created_at` and `updated_at`
- set copied resource `status = draft`
- copy description, tags, category, and template origin
- copy standard `compute_nodes[]` and `model_variants[]`, or custom `custom_nodes[]`
- clear profile usage
- do not automatically add the copied resource to a profile

When `复制代码实现 = yes`:

- copy source files into the new resource package directory
- create new `implementation.source_files[]` references to the copied files
- do not reference original source files
- clear `implementation.runtime_artifact.path`, or set it to a suggested path marked unverified
- mark interface generation as pending
- reassign custom `action_index` values
- show a copy result summary, including copied files, skipped files, and naming conflicts

When `复制代码实现 = no`:

- copy only resource structure
- keep `implementation.kind`
- set `implementation.source_files[] = []`
- clear `implementation.runtime_artifact.path`
- reset implementation status to unknown/pending
- reassign custom `action_index` values
- leave the resource as a structure draft that needs implementation association before export

Copy constraints:

- never create shared source-file references between original and copied resources
- never overwrite files in the target resource directory silently
- if a target file already exists, require user choice: rename, skip, or cancel
- do not auto-fix generated marker conflicts
- copied resources remain draft until validation passes

## Resource Package Layout

Resource packages follow the same library family as configuration-profile resources:

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
    detector.basic.json
```

Compatibility:

- resource discovery still scans `.tinder/resources/standard/**/*.json` and `.tinder/resources/custom/**/*.json`
- `resource.json` is the canonical resource metadata file for a resource package
- existing single-file resource JSONs may be read as migration input, but new managed resources should use package directories

Managed files:

- live under the owning resource package
- use paths relative to the resource package, such as `src/radar.cpp` or `include/radar.h`
- can be created, copied, renamed, and safely targeted by interface generation
- are the default output for new source files and copied code implementation

External files:

- are associated by reference and may live outside `.tinder/resources`
- must be marked as external in `implementation.source_files[]`
- are not draggable profile resources
- require explicit write confirmation before interface generation or save overwrites them
- when copying with `复制代码实现 = yes`, external files are copied into the new resource package and become managed refs
- when copying with `复制代码实现 = no`, external refs are cleared with all other source refs

Runtime artifacts:

- Python resources may use the primary managed `.py` file as the runtime artifact
- C++ artifacts are user-associated in MVP because compilation is out of scope
- copied resources clear `implementation.runtime_artifact.path`, or set a suggested package-relative artifact path marked unverified
- artifact paths should not be stored in profile refs

Do not introduce `.tinder/compute-resources`; it would duplicate the existing `.tinder/resources` library semantics.

Validation layers:

- draft save: requires only `resource_kind` and `display_name`
- add to profile: allowed for drafts, but drafts are added disabled by default
- active/export: requires effective variant/action selection, valid interface state, and valid `implementation.runtime_artifact.path`

## Editor Tabs

The compute resource editor has two work modes:

- `资源编辑`: form and resource capability editing.
- `代码编辑`: source editing in the main work area.

Do not add a nested left file tree inside the compute resource editor. Source-file switching in code mode should use a compact dropdown or command menu limited to the current resource's `implementation.source_files[]`.

Top-level actions should keep save scopes explicit:

- `保存资源配置`
- `保存代码文件`
- `生成/更新接口`

These actions must show separate state and explanation text so users can distinguish resource metadata, source files, and generated interface changes.

### 概要

Resource-level metadata:

- `resource_instance_id`
- `display_name`
- `description`
- `resource_kind: standard | custom`
- `template_id` / `template_version` if created from a template
- `resource_category`
- `implementation.kind: python_script | cpp_library`
- resource-level `status`
- tags/notes
- implementation source summary
- runtime artifact summary
- read-only usage summary

Usage summary:

- show usage count, for example `被 3 个配置档案使用`
- optional expansion with profile name/path
- active or disabled in that profile
- selected standard variant or custom action count
- open-profile link
- no profile mutation from this area

### 能力节点

Standard resource:

- `compute_nodes[]`
- `model_variants[]`
- candidate `status`
- `function_name`
- `base_function_name`
- `inactive_suffix`
- variant switcher
- `复制变体`
- variant-scoped effective selection for standard `node_id`
- one effective candidate per resource variant and standard `node_id`

Custom resource:

- `custom_nodes[]`
- required node description/summary
- `action_index`
- `handler_function`
- `default_parameters`
- node capability `status`
- generate/update interface actions
- generated action registry and dispatch mapping
- profile usage links for placement review

Standard resource semantics:

- The editor answers which reusable capability covers which standard chain node for a model/variant.
- The editor may keep multiple candidate versions for the same standard chain node.
- For the same resource variant and standard `node_id`, only one candidate can be effective.
- Standard resource editing does not provide free execution ordering.

Custom resource semantics:

- The editor answers which custom actions this resource exposes.
- Each custom node/action must have a user-facing name and required description before `action_index` allocation.
- `action_index` is generated automatically and must be globally unique.
- `handler_function` is a resource-local implementation helper, not a runtime entrypoint.
- Custom action placement and execution order are edited in the configuration profile chain, not inside the resource editor.

### 实现文件

Implementation file management:

- associate existing file
- create new file from template
- open file in code editing mode
- show file storage: `项目托管` / `外部关联`
- detect generated markers
- detect handler presence
- detect signature compatibility
- show pending/conflict state

Supported source associations:

- Python: `.py`
- C++: `.cpp`, `.cc`, `.cxx`, `.h`, `.hpp`
- Runtime output: `.dll` or other project-defined dynamic library outputs

### 构建与产物

Hidden in MVP as a top-level tab. Artifact state appears in `概要` and `实现文件`:

- runtime artifact path
- artifact kind: `python_script | cpp_dylib`
- artifact association state
- artifact exists/missing state when cheap to inspect

MVP constraints:

- Do not show build command editing.
- Do not run compilation.
- Do not show build logs.
- Do not judge artifact staleness.
- Do not show a separate `构建与产物` tab in MVP.

### 文档与接口

Documentation and generated interface surface:

- linked chain node documentation
- generated signatures or TODO contracts
- generated-region preview
- action registry preview
- handler stub preview
- marker health
- conflict list

## Save And Dirty States

The editor must display three independent state groups:

```text
资源配置：未保存 / 已保存 / 保存失败 / 外部已修改
代码文件：未保存 / 已保存 / 保存失败 / 外部已修改
接口生成：待生成 / 有冲突 / 已同步 / 生成失败
```

Action boundaries:

- `保存资源配置` writes only resource JSON.
- `保存代码文件` writes only the active source file.
- `生成/更新接口` may write generated regions, missing stubs, and resource interface/scaffold metadata.

`生成/更新接口` requirements:

- show a preview or impact summary before writing
- list which resource metadata and source files may change
- write only generated regions and missing stubs according to safe-write rules
- preserve existing user-owned handler/function bodies and comments
- report which files were changed and whether they are already saved

Navigation prompts:

- If resource configuration is dirty when switching resources or closing the editor, prompt: save resource config, discard resource config changes, or cancel.
- If the active code file is dirty when switching files/resources or closing the editor, prompt: save code file, discard code changes, or cancel.
- If interface generation is pending, show a warning but do not force generation.
- If interface generation has blocking conflicts, allow navigation but keep the issue state; runtime export remains blocked for affected active nodes.

External modification handling:

- If resource JSON changes on disk while open, mark resource configuration as externally modified and prompt reload or save as a separate copy.
- If a source file changes on disk while open, mark code file as externally modified and do not overwrite automatically.
- If an external source file would be modified by interface generation, list it in the preview and require explicit confirmation before writing.
- Do not remember long-term external-write authorization in MVP; confirmation is per generation action.
- Do not auto-merge in MVP.

## Code Editing Mode

Code editing mode uses the main work area for the active source file. It should not include a second left-side file directory.

Header controls:

- mode switch: `资源编辑` / `代码编辑`
- active source file dropdown
- `保存代码文件`
- `保存资源配置`
- `生成/更新接口`

Right assistant panel:

- `文档`: linked chain-node documentation and summaries
- `接口`: generated regions, handler/function status, action indexes, marker status
- `问题`: conflicts, pending writes, missing handlers, dirty/save state
- `AI`: UI placeholder for future LLM assistance

AI placeholder constraints:

- This package does not define AI harness, execution, or write behavior.
- AI panel may show planned actions such as explaining the current file, generating implementation suggestions, checking interface issues, or answering assembly questions.
- Any future AI write path must use preview/diff/confirmation and the same safe-write rules as interface generation.

## Save Boundary

Resource file owns:

- resource identity and metadata
- reusable capabilities
- reusable variants
- `implementation.source_files[]`
- `implementation.runtime_artifact`
- `implementation.status`
- generated interface/scaffold state

Resource save does not write source-file contents. Code save does not write resource JSON.

Profile file owns:

- resource participation
- active/disabled state
- profile-local folder
- selected standard variant reference
- custom node usage and placement

Runtime export owns:

- engine-consumed runtime JSON
- effective flattened custom nodes
- ordered execution list
- implementation references read from `implementation.runtime_artifact.path`

## Implementation Schema Requirements

Target resource JSON must use a first-class `implementation` object:

```ts
interface ImplementationFileRef {
  file_id: string;
  path: string;
  storage: "managed" | "external";
  role: "primary" | "header" | "source" | "support";
  language: "python" | "cpp" | "c" | "unknown";
  generated_region_status?: "unknown" | "ok" | "missing" | "malformed" | "conflict";
}

interface ComputeResourceImplementation {
  kind: "python_script" | "cpp_library";
  source_files: ImplementationFileRef[];
  runtime_artifact: RuntimeArtifactRef;
  build?: BuildConfig; // future; not edited by MVP UI
  status?: ImplementationStatus;
}
```

Each compute resource has exactly one primary `implementation`. Multiple source files may belong to that implementation, but there is only one runtime artifact path used by export.

Standard compute resources still support multiple `model_variants` under the same implementation. Model variants select effective compute-node candidates; they do not select different source/build/runtime targets.

The product must not introduce `implementations[]`, `default_implementation_id`, per-variant implementation overrides, runtime export target selection, or a later multi-implementation target model.

The target schema does not keep legacy implementation fields. New resource JSON must not use top-level `location`, top-level `impl_kind`, or build-output fallback fields.

Runtime export reads only `implementation.runtime_artifact.path` for the effective implementation reference.

Blocking export failures:

- active resource is still `draft`
- `implementation.runtime_artifact.path` is empty
- runtime artifact is required and missing
- generated interface conflict affects active exported nodes

Warnings:

- generated marker health is incomplete but runtime artifact is already valid
- C++ source files are associated but build support is not enabled in this MVP
