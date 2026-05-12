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
- Support build/check workflows and show build output/diagnostics.
- Show which configuration profiles use the resource.

## Non-Goals

- Do not make `.py`, `.dll`, `.cpp`, or `.h` files draggable profile resources.
- Do not store code file paths, build commands, or implementation details in configuration profile refs.
- Do not make configuration profile activation a prerequisite for editing a resource.
- Do not implement a full native build system manager in MVP if command-based build integration is sufficient.

## Primary Decisions

- `计算实例` can be edited before `加入档案`.
- `加入档案` creates or updates a profile reference; it is not the resource edit entry condition.
- Implementation files are associated through the resource editor.
- Build configuration belongs to the compute resource.
- Runtime export consumes the validated resource metadata and effective implementation path/output, but profile files do not duplicate build configuration.

## Editor Tabs

### 概要

Resource-level metadata:

- `resource_instance_id`
- `display_name`
- `description`
- `resource_kind: standard | custom`
- `implementation.kind: python_script | cpp_library`
- resource-level `status`
- tags/notes
- implementation source summary
- runtime artifact summary

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

Custom resource:

- `custom_nodes[]`
- required node description/summary
- `action_index`
- `handler_function`
- `default_parameters`
- node capability `status`
- generate/update interface actions

### 实现文件

Implementation file management:

- associate existing file
- create new file from template
- open file in editor
- detect generated markers
- detect handler presence
- detect signature compatibility
- show pending/conflict state

Supported source associations:

- Python: `.py`
- C++: `.cpp`, `.cc`, `.cxx`, `.h`, `.hpp`
- Runtime output: `.dll` or other project-defined dynamic library outputs

### 构建与产物

Build/check management:

- build mode: script check, external command, native library output
- command
- working directory
- include/library paths where needed
- environment variables where needed
- runtime artifact path
- latest build/check status
- build log
- output existence and timestamp status

MVP recommendation:

- Python supports syntax/import/entry checks.
- C++ supports user-configured build command execution and log capture.
- Direct CMake/MSBuild project management can be later.

### 文档与接口

Documentation and generated interface surface:

- linked chain node documentation
- generated signatures or TODO contracts
- generated-region preview
- action registry preview
- handler stub preview
- marker health
- conflict list

### 使用情况

Profile usage view:

- profile name/path
- active or disabled in that profile
- selected standard variant
- used custom nodes
- custom node chain placement
- last runtime export status when known

## Save Boundary

Resource file owns:

- resource identity and metadata
- reusable capabilities
- reusable variants
- `implementation.source_files[]`
- `implementation.build`
- `implementation.runtime_artifact`
- `implementation.status`
- generated interface/scaffold state

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
interface ComputeResourceImplementation {
  kind: "python_script" | "cpp_library";
  source_files: ImplementationFileRef[];
  runtime_artifact: RuntimeArtifactRef;
  build?: BuildConfig;
  status?: ImplementationStatus;
}
```

The target schema does not keep legacy implementation fields. New resource JSON must not use top-level `location`, top-level `impl_kind`, or build-output fallback fields.

Runtime export reads only `implementation.runtime_artifact.path` for the effective implementation reference.

Blocking export failures:

- `implementation.runtime_artifact.path` is empty
- runtime artifact is required and missing
- C++ runtime artifact is stale when policy requires a fresh build
- build/check failed and the runtime artifact depends on that build/check

Warnings:

- build/check status is unknown
- runtime artifact is older than one or more source files but policy allows export
- generated marker health is incomplete but runtime artifact is already valid
