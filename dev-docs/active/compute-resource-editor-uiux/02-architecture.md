# 02 Architecture

## Resource Editor Boundary

```text
ComputeResourceEditor
  owns resource metadata editing
  owns implementation file associations
  owns build/check configuration
  owns reusable capability editing
  reads profile usage
  does not own profile activation/placement
```

## Target Resource Implementation Schema

```ts
interface ImplementationFileRef {
  file_id: string;
  path: string;
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
  last_checked_at?: string;
  check_status?: "never_run" | "running" | "passed" | "failed";
  build_status?: "never_run" | "running" | "passed" | "failed";
  last_exit_code?: number;
  log_path?: string;
  output_exists?: boolean;
  output_stale?: boolean;
}

interface ComputeResourceImplementation {
  kind: "python_script" | "cpp_library";
  source_files: ImplementationFileRef[];
  runtime_artifact: RuntimeArtifactRef;
  build?: BuildConfig;
  status?: ImplementationStatus;
}
```

Resource metadata owns exactly one primary implementation object in MVP:

```ts
interface ComputeResourceImplementationState {
  implementation: ComputeResourceImplementation;
}
```

No target-schema compatibility fields are kept for implementation. In particular, new resource JSON should not use top-level `location`, top-level `impl_kind`, or build output path fallbacks.

Runtime/export reads only:

```ts
resource.implementation.runtime_artifact.path
```

For Python resources, `runtime_artifact.path` usually points to the primary `.py` file. For C++ resources, it points to the generated `.dll` or project-defined dynamic library artifact.

## Tab Layout

### 概要

Compact form for identity and implementation summary.

### 能力节点

Resource capability editor:

- standard: candidates and variants
- custom: custom nodes, action index, handler functions

### 实现文件

File association/editor bridge:

- add existing file
- create from template
- open in editor
- inspect marker health
- generate/update interface

### 构建与产物

Build/check panel:

- command configuration
- run action
- current status
- logs
- artifact path and freshness

### 文档与接口

Documentation and scaffold preview:

- source chain docs
- generated actions/declarations/dispatch regions
- handler stub preview
- conflict report

### 使用情况

Read-only usage projection:

- profiles referencing this resource
- active/disabled state
- variants/custom node usages
- chain placement

## Key Ownership Rule

The resource editor can update resource JSON and implementation files. It must not silently update profile refs except through explicit profile actions such as `加入档案`.
