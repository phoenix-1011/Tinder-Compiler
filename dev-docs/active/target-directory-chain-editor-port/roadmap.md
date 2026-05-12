# Computation Chain Assembly Roadmap

## Goal

Land the `计算链路组装` board in the current `Tinder-Compiler` Chain Assembly experience.

The board should provide a simple authoring workflow that creates project-usable resources:

- configuration profiles (`配置档案`)
- compute-instance metadata (`计算实例` JSON)
- dynamic-library/script scaffolds
- documentation-linked function/interface skeletons for selected compute nodes

The legacy target-directory chain editing workflow remains the behavior baseline for editing `PlatformResourceInstance.compute_nodes`, but the roadmap target is the complete assembly board rather than a narrow editor.

## Planning Baseline

| Source | Path/reference | Used for | Trust level | Notes |
|---|---|---|---|---|
| Current user request | current conversation | scope and task-package request | highest | create a complete package first |
| Current app code | `D:\Tinder\Tinder-Compiler` | landing points and storage model | high | Electron/React Chain Assembly is the target |
| Legacy GUI code | `D:\Tinder\Model\Model-P-v2\tools\nextstep-gui` | old chain editing behavior | high | behavior reference, not a copy target |
| Current chain docs/catalog | `docs/flowchat/chain-contract`, `chain-catalog.generated.ts` | canonical chain-node options, doc linkage, scaffold hints | high | should replace old hardcoded list where possible |
| Model inference | N/A | phase splitting and risk framing | low | used only to structure work |

## Scope

Affected areas expected in implementation:

- `apps/desktop/src/renderer/components/ChainAssemblyView.tsx`
- `apps/desktop/src/renderer/components/ChainResourceInspector.tsx` (new, proposed)
- `apps/desktop/src/renderer/components/ChainInstanceScaffoldPanel.tsx` (new, proposed)
- `apps/desktop/src/renderer/state/ChainAssemblyContext.tsx`
- `apps/desktop/src/renderer/state/chainAssemblyStorage.ts`
- `apps/desktop/src/renderer/styles/global.css`
- `packages/nextstep/src/model.ts`
- `packages/nextstep/src/types.ts`
- `packages/nextstep/src/chain-catalog.ts`
- `dev-docs/active/target-directory-chain-editor-port/*`

## Non-goals

- No wholesale old GUI migration.
- No standalone GUI package.
- Runtime C++ changes are not required for standard-resource editing; latest Model-P-v2 custom invocation already uses `action_index` and engine-injected parameters, with legacy `entrypoint` ignored.
- No guarantee that generated native scaffolds compile into a dynamic library until toolchain/build integration is explicitly implemented.
- No profile-file schema expansion unless needed by a later accepted design.
- No broad template marketplace or import/export expansion in the MVP.

## Decisions To Freeze

| ID | Topic | Proposed decision | Reason |
|---|---|---|---|
| D1 | Storage owner | Resource chain attachments live in standard resource JSON files. | Current app externalizes resources under `.tinder/resources/standard`. |
| D2 | Chain-node SSOT | Prefer generated chain catalog over old hardcoded `CORE_CHAIN_IDS`. | Current docs are the local chain contract SSOT. |
| D3 | UI landing | Integrate into Chain Assembly. | Current app already has data root, tree, dialogs, and disk IO. |
| D4 | MVP entity | Edit `PlatformResourceInstance.compute_nodes`. | This is the exact old GUI chain attachment model. |
| D5 | Profile relation | Profiles reference resources; they do not own resource chain metadata. | Prevents duplicated chain metadata across profiles. |
| D6 | Product workflow | Treat `配置档案 -> 计算实例 -> 链路节点 -> scaffold -> 保存` as the primary flow. | User goal is full chain assembly, not raw data editing. |
| D7 | Scaffold behavior | Adding a compute node should offer to add/update a function skeleton in the compute instance implementation file. | Keeps docs, config, and implementation synchronized. |
| D8 | Documentation linkage | Inspector must show doc-derived node details and use them for scaffold hints when reliable. | User asked for more than jump-to-doc behavior. |
| D9 | Profile sections | Configuration profile children are `链路`, `活跃资源`, `停用资源`, `使用与版本`. | Avoids an extra `资源` nesting level and makes resource state visible immediately. |
| D10 | Resource vs chain authority | `活跃资源` and `停用资源` are the primary edit surfaces and source of truth; `链路` is a compute-node projection plus shortcut entry. | Resource instances own enabled compute-node capabilities; chain view aggregates the result. |
| D11 | Activation model | Profile owns managed refs in `resources[]`; standard refs point to resource variants, custom refs point to custom resources. | Standard participation is variant-granular, while custom execution remains node-placement granular. |
| D12 | Config file format | Engine-consumed runtime config is canonical JSON, not YAML. | `unified_model_entry.cpp` already parses JSON; YAML would add parser and ambiguity cost. |
| D13 | Existing resource add action | Use `加入档案` for adding an existing resource to the current profile. | Clarifies this is profile membership, not runtime config export or new resource creation. |
| D14 | Resource drag/drop | Allow dragging resources from `计算实例` into `活跃资源` or `停用资源`. | Direct manipulation is faster for large resource sets; drop target determines default enabled state. |
| D15 | Compute instance scope | User-facing `计算实例` means resource-instance metadata JSON, not `.py`/`.dll` implementation files. | The GUI-managed draggable object is the resource instance, while implementation files are only loaded or associated. |
| D16 | Standard vs custom compute instances | `计算实例/标准` serves the current canonical `builtin_core_chain` node catalog; `计算实例/自定义` is the separate `custom_invocation_node` system. | Project docs/catalog and Model-P-v2 runtime implement standard chains and custom invocation nodes as different execution item kinds; the standard-chain count is not fixed. |
| D17 | Custom resources in profiles | `计算实例/自定义` entries must also be added to profile `活跃资源` / `停用资源` to become part of a complete configuration profile. | Custom invocation nodes are still resources selected by the profile; they only differ from standard resources in chain projection and runtime export shape. |
| D18 | Custom execution placement | Active custom compute nodes can be freely inserted before, between, or after built-in execution items. | Model-P-v2 `ordered_execution_list` accepts custom invocation items anywhere while requiring the built-in sequence to remain canonical and complete. |
| D19 | Custom multi-node resource | One custom compute instance can contain multiple custom compute nodes; the nodes, not the whole resource, are placed into the execution chain. | This matches the standard resource pattern and avoids forcing one implementation file/module per custom step. |
| D20 | Custom action schema | Runtime custom nodes use `resource_instance_id`, `node_id`, and `action_index`; legacy `entrypoint` fields are ignored. | Latest Model-P-v2 dispatches custom nodes through a resource runtime and action index rather than per-node function entrypoints. |
| D21 | Custom node editing UX | Custom node definition happens in the resource detail panel; chain placement happens in the `链路` view. | Keeps resource metadata, node capabilities, and execution order separated while still supporting drag/drop. |
| D22 | Standard resource editing UX | Standard resource editing uses a two-column default layout and a temporary three-column selector for add/bind flows. | Standard nodes are fixed catalog capabilities, not freely ordered execution nodes, so the normal editor should stay lighter than custom placement editing. |
| D23 | Standard multi-coverage policy | One standard chain node may be covered by multiple compute nodes across models/resources, but only one selected candidate per resource variant may be effective for the same standard node. | Runtime device IDs are assigned after simulation starts, so authoring binds variants to models or service scopes, not concrete device instances. |
| D24 | Standard model variants | Standard resources use model/variant configs to select which candidate compute node is effective for each standard chain node. | Similar device models can share one resource while selecting different candidates for only the nodes that differ. |
| D25 | Standard node provider levels | Standard chain nodes declare allowed provider/applicability levels. | L3 platform/environment/signal service nodes and L4 device-model nodes need different valid variant scopes. |
| D26 | Interface generation trigger | Adding any standard candidate node or custom compute node automatically generates/updates the implementation entry surface. | Interface automation is a core product goal; users should not need a separate manual step just to keep metadata and code in sync. |
| D27 | Scaffold write safety | Generators may add files, add missing entries, update generated regions, and maintain registries, but must not overwrite user-authored function bodies automatically. | Automatic generation is useful only if it never destroys implementation code. |
| D28 | Shared standard function names | Standard candidates may share one base function name; within one variant only one selected candidate may use the active base name, while inactive candidates use a deterministic inactive suffix. | This supports A/B model variants without making inactive implementations callable by the normal standard function name. |
| D29 | Custom call contract | Custom compute nodes use one minimal call contract: `void customizeFunction(int action_index, const std::map<std::string, std::string>& parameters)`. | Custom node behavior is selected by globally unique `action_index` plus declared/runtime parameters, not by one function per custom node. |
| D30 | Save vs runtime export | Saving authoring profile/resource metadata is separate from `生成运行配置`. | Authoring files and engine-consumed runtime JSON have different lifecycles and validation requirements. |
| D31 | Runtime export destination | Runtime export should offer the detected engine-effective path first, then a project default path, then custom path. | The effective path follows engine config (`runtime_config_file` / `nextstep.runtime_config_file`), so exporting elsewhere should be explicit and visibly non-effective. |
| D32 | Export validation severity | Blocking validation failures prevent runtime export; warnings do not block and are saved/displayed as an export report. | Runtime JSON should only be produced when it can be consumed safely by `UnifiedModelEntry`. |
| D33 | Export report UX | `生成运行配置` produces a navigable report grouped by Blocking / Warning / Info. | Users need to jump from an issue to the profile/resource/variant/node/chain placement that caused it. |
| D34 | Engine config path update | Runtime export does not automatically rewrite engine config paths in MVP. | `导出并设为生效配置` can be added later as an explicit action after path ownership is agreed. |

| D35 | Save boundary by reuse | Resource files store reusable capability definitions and reusable variant presets; profile files store participation, enablement, and chain orchestration. | This prevents profile-specific choices from polluting reusable resources and avoids duplicated resource metadata in profiles. |
| D36 | Resource capability status | Resource-internal candidate/custom-node availability uses `status`, not `enabled`; profile usage uses `enabled`. | `enabled` means active in the current profile, while `status` means reusable capability availability. |
| D37 | Variant derivation MVP | Standard resource variants are copied as independent snapshots; MVP does not support inheritance or override chains. | Explicit copies keep validation, export, and UI behavior understandable while preserving reuse at the resource-file level. |
| D38 | Custom action index allocation | New custom nodes require a user description and receive an automatically generated `action_index`; conflicts are never auto-repaired after save. | `action_index` is executable identity for the custom switch, so silent renumbering would break user code. |
| D39 | Custom internal dispatch | Runtime calls only `customizeFunction(action_index, parameters)`, while generated resource code may dispatch `action_index` to resource-local handler functions. | This preserves the minimal runtime contract while giving each custom node a clear implementation function and generated comment. |
| D40 | Scaffold marker boundary | Interface generators may rewrite marked generated regions and may create missing handler stubs once; they must not rewrite existing user-authored handler bodies. | This gives automation a safe maintenance surface without risking user implementation code. |
| D41 | Generated comments | Generators may update comments inside generated regions and write handler comments when a stub is first created; existing user-region comments are not auto-updated. | Documentation linkage remains useful while preserving user-maintained code comments. |

## Open Questions

- Should the global `计算实例` inspector allow editing resources before they are added to a profile, or should profile-local editing be the MVP-only path?
- Should chain-node display names default to catalog display names or the old `node-01` sequence?
- What is the preferred native scaffold shape: C++ source template first, or direct dynamic-library project layout?

## Assumptions Until Confirmed

- A1: The MVP's profile views edit resources that have been added to the active profile; global `计算实例` remains the source pool for `加入档案`.
- A2: Multiple active resources may cover the same standard chain node when their applicability/model scope differs.
- A3: A resource may contain multiple candidate versions for one standard chain node; model/variant configs select at most one effective candidate per standard `node_id`.
- A4: The MVP may edit `display_name`, `description`, `location`, `impl_kind`, and `compute_nodes`.
- A5: New compute-node display names default to catalog display name when available, otherwise `node-XX`.
- A6: Python scaffold generation lands first because it is easier to validate without a native toolchain.
- A7: Native dynamic-library support starts as source/template generation; compilation is a later integration slice.
- A8: Scaffold writes should use marked generated regions, idempotent function detection, and conflict review to avoid duplicating functions or overwriting user code.

## Frozen Product Semantics

### Standard And Custom Compute Instances

The current UI already has:

```text
计算实例
  标准
  自定义
```

This maps to two different runtime systems:

- `标准`
  - resource-instance metadata for the current canonical standard chain nodes documented under `docs/flowchat/chain-contract`
  - target execution item kind: `builtin_core_chain`
  - GUI capability field: `PlatformResourceInstance.compute_nodes[]`
  - each `compute_nodes[].node_id` must refer to one of the current canonical standard chain node IDs from the generated chain catalog
  - resource variants participate in profile `活跃资源` / `停用资源` through `resources[]`
- `自定义`
  - custom compute-instance metadata that can own multiple custom compute nodes
  - target execution item kind: `custom_invocation_node`
  - runtime config fields: `custom_nodes[]` plus matching `ordered_execution_list[]` items
  - invoked through Model-P-v2 `CustomInvocationNodeSpec`
  - resource-level fields include `resource_instance_id`, `module_id`, `impl_kind`, and `location`
  - node-level fields include `node_id`, `display_name`, `action_index`, optional/default parameters metadata, and reusable capability `status`
  - participates in profile `活跃资源` / `停用资源` through `resources[]`
  - each profile-enabled custom node usage can be freely inserted into the ordered execution plan before, between, or after built-in execution items, while builtin item order remains fixed

Important boundary:

- `自定义` is not a custom implementation of one of the standard chain nodes
- `自定义` does not populate `PlatformResourceInstance.compute_nodes[]`
- `自定义` resources expose `custom_nodes[]`; each node is the chain-placement unit
- standard chain coverage in `链路` is computed from `标准` resources only
- custom invocation coverage/order should be shown as a separate custom execution sequence or lane
- both `标准` and `自定义` entries must be profile-managed resources before they are included in the generated configuration artifacts
- free custom insertion is represented in authoring state as placement relative to generated built-in execution anchors, then expanded to runtime `ordered_execution_list`

### Custom Node Editing UX

Frozen UI responsibility split:

- `活跃资源` / `停用资源`
  - define and edit custom compute instances
  - show resource-level metadata: name, description, `module_id`, `impl_kind`, `location`, implementation-file status, and interface-generation status
  - show an expandable custom-node list under each custom resource
  - support node actions: add, duplicate, delete, change reusable capability status, edit name/description/action_index/default-parameter metadata, generate interface, place in chain, remove from chain
- `链路`
  - edits execution placement only
  - standard built-in items are read-only anchors
  - custom compute nodes can be dragged into slots or placed with a searchable "move to" command
  - custom nodes are grouped by source resource in the unplaced/available panel
- Detail panel
  - selected resource shows shared implementation metadata
  - selected custom node shows `action_index`, default-parameter metadata, placement state, interface-generation status, and validation issues

Custom node states:

- `未编排`: profile-enabled usage but no placement
- `已编排`: profile-enabled usage and has valid placement
- `停用`: profile-disabled usage or unavailable/deprecated resource capability excluded from runtime export
- `异常`: invalid action index/parameters/location/placement

### Standard Resource Editing UX

Frozen UI responsibility split:

- Standard resource normal edit uses two columns:
  - left: the selected resource's standard node capability list
  - right: selected node detail, chain documentation, validation, and interface-generation actions
- Resource-level fields stay in a compact header or right-panel resource section, not a separate permanent column:
  - name
  - description
  - `impl_kind`
  - `location`
  - implementation-file/interface-generation status
- Standard node capability list shows:
  - display name
  - canonical `node_id`
  - capability status
  - interface-generated state
  - current profile coverage status
- Standard node detail shows:
  - documentation summary from the generated catalog
  - `node_id`, display name, node type, and capability status
  - implementation function/interface status
  - actions: enable/disable, remove capability, generate/update interface
- Add/bind standard node flow can temporarily use three columns:
  - current resource capability list
  - searchable standard chain catalog / candidate nodes
  - selected catalog node documentation and interface preview
- `链路` view can use three columns because it is the cross-resource projection:
  - standard chain backbone and custom slots
  - resource coverage/candidates
  - details/documentation/actions

Boundary:

- standard node execution position is determined by the generated standard chain catalog
- users cannot reorder standard nodes inside a resource
- standard resource editing declares capability membership, version enablement, and applicability/model scope

### Standard Coverage And Applicability

Standard resources cannot bind to runtime device IDs during authoring because device IDs are assigned after simulation starts.

Authoring target:

```ts
interface ResourceApplicability {
  scope:
    | "device_model"
    | "platform_model"
    | "platform_instance"
    | "environment_service"
    | "signal_service"
    | "global";
  model_id?: string;
}
```

Standard resource target shape:

```ts
interface PlatformComputeNode {
  compute_node_id: string;
  node_id: string;
  display_name: string;
  node_type: PlatformNodeType;
  version_id?: string;
  function_name?: string;
  base_function_name?: string;
  inactive_suffix?: string;
  status?: "available" | "disabled" | "deprecated";
}

interface ResourceModelVariant {
  variant_id: string;
  display_name: string;
  applicability: ResourceApplicability;
  selections: Array<{
    node_id: string;
    compute_node_id: string;
  }>;
}
```

Rules:

- model variants can be created manually in the early phase; later imports may create/sync variants and run validation
- new standard resources may create an initial variant automatically, but every variant must bind an explicit applicability scope
- `复制变体` creates a new `variant_id` and deep-copies applicability and selections from the source variant
- copied variants are independent snapshots; editing the copy does not mutate the source and editing the source does not update the copy
- MVP does not support variant inheritance, parent pointers, delta overrides, or automatic upstream sync between variants
- copied variant names should be generated deterministically and remain user-editable after creation
- `default` is allowed only as an explicit service/global variant name; it is not an unbound variant
- one standard resource may point to multiple standard chain nodes
- one standard chain node may have multiple compute-node candidates across resources and models
- one resource may keep multiple candidate versions for the same standard chain node
- unselected candidates are legal and do not participate in runtime export
- candidate versions may share an implementation function name
- within one variant, at most one selected candidate can use the active shared base function name for a standard node
- inactive shared-function candidates use a deterministic inactive suffix such as `__inactive` / `__inactive_2`
- switching a selected candidate restores its active base function name and moves the previously selected candidate to an inactive suffixed function name, after conflict checks
- linking a resource to a standard chain node must carry the target model/variant config
- for a given resource variant, only one selected compute-node candidate may target the same standard `node_id`
- duplicate selected candidates for the same variant + `node_id` are validation errors, not warnings
- disabled candidates cannot be selected by a variant
- configuration profiles include only standard resource variants that participate in the profile; they do not automatically include every variant of a selected resource
- resource detail UI must support `复制变体`
- duplicate coverage across different models/scopes is allowed and shown as coverage multiplicity in `链路`
- concrete runtime device IDs are resolved later by simulation startup/runtime binding, not by the authoring profile

Standard catalog nodes should expose provider/applicability metadata:

```ts
type ApplicabilityScope =
  | "device_model"
  | "platform_model"
  | "platform_instance"
  | "environment_service"
  | "signal_service"
  | "global";

interface StandardChainNodeMeta {
  node_id: string;
  display_name: string;
  provider_level: "l3_service" | "platform_model" | "device_model" | "global";
  allowed_applicability_scopes: ApplicabilityScope[];
}
```

### Interface And Scaffold Generation

Generation is automatic when a compute node is added:

- adding a standard candidate compute node generates or updates the standard entry surface
- adding a custom compute node generates or updates the unified custom entry surface
- if the target implementation file does not exist, create a full scaffold
- if the file exists and the needed entry/registry item is missing, add it
- if the entry already exists, do not overwrite its body
- if the generator cannot prove the edit is safe, create a pending/conflict state for user confirmation

Minimum standard call contract:

```cpp
void standardFunction(const std::map<std::string, std::string>& parameters);
```

Minimum custom call contract:

```cpp
void customizeFunction(
    int action_index,
    const std::map<std::string, std::string>& parameters
);
```

Custom node shape:

```ts
interface CustomComputeNode {
  node_id: string;
  display_name: string;
  description: string;
  status?: "available" | "disabled" | "deprecated";
  action_index: number;
  handler_function?: string;
  default_parameters?: Record<string, string>;
}
```

Rules:

- new custom node creation asks the user for a display name and node description/summary before generating the node
- `action_index` is generated automatically during creation from the currently known custom action index set
- `action_index` must be globally unique across exported custom compute nodes
- duplicate `action_index` is a blocking validation issue and must not be automatically repaired or silently renumbered
- if a user explicitly edits `action_index`, conflicts are shown before save/export and require explicit user resolution
- `description` is used as generated comment text for the action registry/switch case and handler stub
- `handler_function` is a resource-local implementation helper, not a runtime entrypoint; runtime still calls only `customizeFunction(action_index, parameters)`
- generated custom scaffold may implement a switch/dispatch table from `action_index` to `handler_function`
- exported runtime `custom_nodes[]` does not rely on `entrypoint`; legacy entrypoint fields are ignored by Model-P-v2
- runtime invocation parameters are provided by engine initialization through `InitCustomResourceParameters(resource_instance_id, parameters)`
- authoring may store `default_parameters` as GUI/help/init-template metadata, but engine-effective parameters are resource-level runtime initialization data
- standard and custom generation must be deterministic and idempotent
- generated regions are safe to rewrite; user-authored function bodies are not
- generated-region comments and metadata may be rewritten on every generation pass
- handler stubs may be created once with description/doc comments from resource metadata
- once a handler exists, the generator must not rewrite its body or user-region comments
- if a resource description changes after handler creation, generated registries/comments may update but existing handler comments are left untouched
- supported generated region markers are `<tinder-generated:{region-name}>` and `</tinder-generated:{region-name}>`
- required region names include `custom-actions`, `custom-dispatch`, `custom-declarations`, `standard-actions`, `standard-declarations`, and `standard-dispatch`
- missing, unpaired, nested, or unknown generated markers in non-empty files are blocking/pending conflicts
- conflicts include signature mismatch, marker absence in non-empty files, standard function name collision, inactive suffix collision, and duplicate `action_index`

### Profile Child Views

Each configuration profile exposes four direct child views:

- `链路`
  - a compute-node-centric projection of current assembly state
  - shows which nodes are covered, missing, disabled, or implemented by multiple resources
  - can start shortcut actions such as "create resource for this node" or "bind existing resource"
  - shortcut edits still write back to resource/profile data, not a separate chain-owned store
- `活跃资源`
  - the primary edit surface for standard resource variants and custom resources enabled in the current profile
  - these refs participate in chain assembly, scaffold checks, and runtime config export
  - supports profile-local virtual subfolders
  - supports `加入档案`, new resource creation, and dragging existing `计算实例` entries into this section
  - right-click resources can be stopped, moved, renamed, opened, or deleted after confirmation
- `停用资源`
  - the primary edit surface for standard resource variants and custom resources managed by the current profile but not enabled
  - these refs do not participate in runtime config export
  - supports profile-local virtual subfolders
  - supports `加入档案`, new resource creation, and dragging existing `计算实例` entries into this section
  - right-click resources can be activated, moved, renamed, opened, or deleted after confirmation
- `使用与版本`
  - profile lifecycle and reuse view
  - shows file path, save/Save As targets, version/revision, usage by simulation objects, tags, and derivation/copy actions
  - does not own chain assembly state

### Activation Ownership

Activation is intentionally layered:

```text
profile.resources[] controls whether a standard resource variant or custom resource is managed by this profile and whether it is active
resource.compute_nodes[].status controls whether one reusable candidate capability is available
resource.custom_nodes[].status controls whether one reusable custom node capability is available
resource.model_variants[].selections controls which available candidate is effective for one applicability/model config
profile.custom_node_usages[] controls which custom node usages are active and where they are inserted in the chain
```

Canonical authoring profile shape:

```json
{
  "version": 2,
  "project_name": "default-profile",
  "resources": [
    {
      "kind": "standard",
      "resource_instance_id": "radar-main",
      "variant_id": "radar_a",
      "enabled": true,
      "folder": "雷达/主雷达"
    },
    {
      "kind": "standard",
      "resource_instance_id": "radar-backup",
      "variant_id": "radar_b",
      "enabled": false,
      "folder": "雷达/备用"
    }
  ],
  "custom_node_usages": [
    {
      "resource_instance_id": "preprocess-hook",
      "node_id": "normalize-input",
      "enabled": true,
      "insert_before": {
        "kind": "builtin_core_chain",
        "chain_id": "P-01"
      },
      "order": 0
    }
  ]
}
```

Tree placement:

- `resources[].enabled === true` renders under `活跃资源`
- `resources[].enabled === false` renders under `停用资源`
- `resources[].folder` is a profile-local virtual folder path under the selected top-level group
- global `计算实例` entries are not automatically shown under `停用资源`; they must be added into `resources[]` first
- `加入档案` adds an existing standard resource variant or custom resource ref into `resources[]` without creating or modifying the resource JSON
- dropping an existing standard variant or custom resource onto `活跃资源` adds it with `enabled: true`
- dropping an existing standard variant or custom resource onto `停用资源` adds it with `enabled: false`
- dropping onto a profile-local virtual subfolder also records that subfolder in `resources[].folder`
- draggable `计算实例` entries are resource metadata records from `.tinder/resources/**`
- custom node chain participation is stored in `custom_node_usages[]`; resource files store custom-node capability definitions only
- `custom_node_usages[].enabled` decides whether one custom node participates in runtime export for this profile
- `.py`, `.dll`, and source files are not draggable resources
- implementation files can be loaded or associated through explicit resource edit actions

Canonical resource capability shape:

```json
{
  "resource_instance_id": "radar-main",
  "display_name": "Radar Main",
  "impl_kind": "python_script",
  "location": "scripts/radar-main.py",
  "compute_nodes": [
    {
      "compute_node_id": "entity-update-v1",
      "node_id": "platform.entity.update",
      "display_name": "实体维护",
      "node_type": "switch",
      "status": "available"
    }
  ],
  "model_variants": [
    {
      "variant_id": "radar_a",
      "display_name": "Radar A",
      "applicability": {
        "scope": "device_model",
        "model_id": "radar_a"
      },
      "selections": [
        {
          "node_id": "platform.entity.update",
          "compute_node_id": "entity-update-v1"
        }
      ]
    }
  ]
}
```

Compatibility rule:

- missing `resources[].enabled` is treated as enabled
- missing `compute_nodes[].status` is treated as `available`
- legacy `compute_nodes[].enabled` may be read as a migration fallback, but new saves write `status`
- `profile-extras.json` remains a compatibility/migration source, not the new primary storage for profile resource refs

### Runtime Config Format

The engine-facing runtime config consumed by `unified_model_entry.cpp` is canonical JSON.

YAML is not a direct runtime input. If YAML is ever introduced for manual authoring, it must be converted into canonical JSON before runtime loading.

Recommended separation:

- authoring profile JSON: GUI-owned, reusable, includes resource activation and lifecycle metadata
- runtime config JSON: engine-owned, exported/generated for `UnifiedModelEntry`

Runtime export:

- `保存` writes authoring profile/resource/scaffold metadata only
- `生成运行配置` validates, flattens active refs, and writes engine-consumed runtime JSON
- compute-resource configuration is in scope for this decision round only where it affects authoring save, validation, scaffold status, or runtime export
- detailed engine runtime parameter initialization is out of scope except for recording that custom parameters are injected per `resource_instance_id`
- detected engine-effective path comes from `runtime_config_file` or `nextstep.runtime_config_file` when available
- exporting to a default/project/custom path that is not the detected effective path is allowed but shown as not currently effective
- exporting does not automatically update engine config path in MVP
- blocking validation failures prevent export
- warnings are displayed and saved with an export report, but do not block export
- info items are displayed in the export report as export summary, not validation risk

Current warning classes:

- engine-effective runtime path cannot be detected, so export uses the project default/custom path and the engine config still needs to be pointed at it
- exported runtime path is not the detected engine-effective path
- chain documentation/interface metadata is incomplete, so generated comments/hints are degraded
- non-participating candidates or variants exist and are hidden by filters/grouping
- export uses compatibility fallback data such as legacy `profile-extras.json` or legacy custom `input` parsing
- scaffold generation has non-participating pending work that does not affect exported active nodes

Export report UX:

- report groups issues as `Blocking`, `Warning`, and `Info`
- each report item should carry a target locator when possible: profile, resource, variant, compute node, or chain placement
- blocking items show `定位` / detail actions and disable final export
- warning items show `定位` / detail actions but allow final export
- info items summarize export count, target path, generated file path, participating standard variants, participating custom nodes, and chain placement count
- the report is shown after validation and saved beside or inside the export metadata for traceability

## Phase 0 - Task Package Baseline

Objective:

- Create the full planning package for this migration.

Deliverables:

- `requirement.md`
- `roadmap.md`
- `00-overview.md`
- `01-plan.md`
- `02-architecture.md`
- `03-implementation-notes.md`
- `04-verification.md`
- `05-pitfalls.md`

Acceptance:

- Package exists under `dev-docs/active/target-directory-chain-editor-port/`.
- The package captures current/legacy boundaries and MVP decisions.

## Phase 1 - Workflow, Model, And Catalog Alignment

Objective:

- Establish the current-app model layer for the full chain assembly workflow.

Deliverables:

- workflow state model: profile, compute instance, selected chain node, scaffold target
- profile child-view model: `链路`, `活跃资源`, `停用资源`, `使用与版本`
- activation model: `resources[]`, candidate availability, and `model_variants[].selections`
- helper to derive chain-node options from generated chain catalog
- helper to separate standard `builtin_core_chain` resources from custom invocation resources
- helper to expose doc-derived purpose/input/output/interface hints
- helper to create a valid `PlatformComputeNode` candidate
- helper to create/copy/validate `ResourceModelVariant`
- validation helpers for resource-chain attachments
- documented fallback if generated catalog is unavailable

Acceptance:

- New chain-node selector does not depend solely on legacy hardcoded `CORE_CHAIN_IDS`.
- Type-level model stays compatible with existing `PlatformResourceInstance`.
- The board has a clear authoring sequence before UI implementation starts.

## Phase 2 - Generated Resource Write APIs

Objective:

- Add state/context operations that generate and edit project-usable assets.

Deliverables:

- create/update configuration profile
- read/write `resources[]`
- render/toggle `resources[].enabled` as `活跃资源` / `停用资源`
- read/write `resources[].folder` as profile-local virtual folders
- implement `加入档案` for existing resources
- implement drag/drop from `计算实例` into `活跃资源` / `停用资源`
- keep drag/drop scoped to resource metadata items, not implementation files
- select standard resource leaf
- create/update compute instance metadata
- update selected resource fields
- add/update/remove `compute_nodes`
- toggle candidate availability
- add/copy/update/remove standard `model_variants[]`
- update `model_variants[].selections`
- generate/update implementation scaffold file
- save resource JSON to its leaf path
- reload and preserve selection after save where possible

Acceptance:

- Editing one resource does not mutate profile files.
- Profile generation/update is explicit.
- Scaffold generation writes to the implementation path referenced by resource metadata.
- Failed writes surface through the existing in-app dialog pattern.

## Phase 3 - Chain Assembly Workflow UI

Objective:

- Add a guided GUI for assembling profiles, compute instances, chain nodes, docs, and scaffolds.

Deliverables:

- compact workflow header or stepper
- profile selector/create action
- compute instance selector/create action
- resource header with name/id/file/description summary
- compute-node table
- chain-node selector
- documentation summary panel for selected chain node
- scaffold preview/generate action
- display-name input
- add and delete actions
- empty state for resources without compute nodes

Acceptance:

- User can complete the legacy chain-editing workflow without editing raw JSON.
- User can generate a profile, compute-instance metadata, and implementation scaffold from the board.
- UI styling follows current VS Code-like workbench conventions.

## Phase 4 - Documentation And Interface Automation

Objective:

- Turn documentation linkage into practical implementation assistance.

Deliverables:

- selected chain node opens its documentation context in-place and can still deep-link to the help view
- function skeleton generator for Python compute instances
- native source/dynamic-library scaffold generator shape documented or implemented
- idempotent scaffold update strategy
- missing-doc-field warnings

Acceptance:

- Adding a compute node can add a corresponding function skeleton to the selected compute instance.
- Documentation is part of the authoring workflow, not only a navigation target.

## Phase 5 - Profile And Tree Integration

Objective:

- Make the board fit naturally with the existing tree/profile flow.

Deliverables:

- clicking a standard resource opens the assembly inspector
- active profile resource list can navigate to the same resource when resolvable
- resource rows show linked chain count or linked chain summary
- generated/updated profiles appear in the profile tree with `链路`, `活跃资源`, `停用资源`, and `使用与版本`
- status path remains target-directory based

Acceptance:

- The `计算链路组装` workflow is discoverable from Chain Assembly.
- Profile-resource references, resource-chain metadata, and implementation scaffolds remain separate but linked.

## Phase 6 - Verification And Hardening

Objective:

- Verify type safety, disk behavior, generated artifacts, and basic interaction flows.

Deliverables:

- typecheck/build
- unit tests for pure helpers where practical
- manual test matrix for creating/editing/deleting resource chain links
- manual test matrix for profile generation and scaffold generation
- docs update in `04-verification.md`

Acceptance:

- `pnpm --filter @tinder/nextstep typecheck` passes.
- `pnpm --filter @tinder/desktop typecheck` passes.
- Manual smoke test confirms resource JSON changes on disk and reloads correctly.
- Manual smoke test confirms generated profile and scaffold files are usable by the project workflow or clearly marked as source templates.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---:|---:|---|
| Old GUI state model is copied too directly | medium | high | treat legacy code as behavior reference only |
| Chain-node list diverges from docs | medium | high | use generated chain catalog as SSOT |
| Profile/resource ownership gets blurred | medium | high | keep resource chain metadata in resource JSON |
| UI grows too large inside sidebar | medium | medium | use a separate inspector component or main-area panel |
| Scaffold generator duplicates functions | medium | high | use idempotent function detection or generated markers |
| Documentation fields are incomplete | high | medium | show missing fields and generate conservative skeletons |
| Native dynamic-library generation exceeds MVP | medium | medium | generate source/template first, defer compilation integration |
| Existing dirty worktree changes get overwritten | low | high | do not touch unrelated modified files |

## Rollback

- Phase 0 rollback: remove the task package directory.
- Implementation rollback: remove new inspector component and context methods; keep docs if still useful.
- Data rollback: resource JSON edits are normal file edits and should be recoverable through git or OS backups where available.

## To-dos

- [x] Create full task package.
- [ ] Confirm open questions with user.
- [ ] Freeze MVP data ownership rules.
- [ ] Freeze scaffold generation behavior.
- [ ] Freeze documentation-to-interface mapping.
- [ ] Implement model/catalog helpers.
- [ ] Implement Chain Assembly generated-resource write operations.
- [ ] Implement computation chain assembly UI.
- [ ] Implement Python scaffold generation.
- [ ] Verify typecheck/build/manual smoke tests.
