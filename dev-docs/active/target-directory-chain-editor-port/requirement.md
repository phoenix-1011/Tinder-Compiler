# Computation Chain Assembly Requirement

## Status

- State: draft
- Created: 2026-05-11
- Owner: TBD
- Task mapping: TBD, current repository has no active governance registry yet

## Problem

The current `Tinder-Compiler` desktop app already has a Chain Assembly foundation for selecting a data root, reading `.tinder` project data, listing profiles, and managing standard/custom resources.

The legacy GUI in `D:\Tinder\Model\Model-P-v2\tools\nextstep-gui` contains an important resource-chain editing workflow that is not yet present in the current app:

- create and edit platform/standard resource instances
- attach one resource instance to one or more canonical chain nodes
- edit per-resource compute-node display names
- remove chain-node attachments
- show chain/node/file/description status on each resource

This task migrates that workflow into the current project while respecting the current target-directory storage model.

The product goal is broader than a raw chain-link editor. The target board is `计算链路组装`: a simple authoring workflow that turns chain-document knowledge into project-usable resources:

- configuration profiles (`配置档案`) that can be loaded by the project/runtime workflow
- compute instances (`计算实例`) backed by generated or selected dynamic libraries/scripts
- documentation-linked interface scaffolds so adding a compute node can also add the corresponding function skeleton to the compute instance

## Goal

Land a complete `计算链路组装` board in the current Electron/React Chain Assembly experience.

The first complete implementation should allow a user to:

- choose or reuse a Chain Assembly data root
- follow a short, guided flow instead of editing raw JSON
- work inside a configuration profile with four direct child views:
  - `链路`
  - `活跃资源`
  - `停用资源`
  - `使用与版本`
- open standard resource instances from `.tinder/resources/standard/**/*.json`
- inspect and edit `PlatformResourceInstance.compute_nodes`
- add a compute node bound to a canonical chain node
- update a compute node's `node_id` and `display_name`
- enable or disable each compute-node capability inside a resource instance
- remove a compute node from a resource instance
- generate or update a project configuration profile that references the assembled resources
- generate or update a compute instance script/dynamic-library scaffold for selected compute nodes
- when a compute node is added, generate the matching function/interface skeleton in the selected compute instance where supported
- link each compute-node selection to its chain-contract documentation and interface notes
- save the edited resource JSON back to disk
- validate chain-node choices against the current generated chain catalog

## Non-goals

- Do not port the old standalone Tauri/Vite GUI wholesale.
- Do not restore the old GUI's separate runtime-config file workflow as the first slice.
- Do not store target-directory resource edits inside `profiles/*.json` unless the edited data is profile-owned.
- Do not replace the current Chain Assembly data-root and profile/resource tree design.
- Do not change C++ runtime semantics for standard-resource editing.
- Custom multi-node execution must follow latest Model-P-v2 runtime semantics: custom nodes use `resource_instance_id`, `node_id`, and `action_index`; legacy `entrypoint` fields are ignored.
- Do not require full C++ dynamic-library compilation in the first GUI slice; generating source/scaffold files is enough before toolchain integration is confirmed.

## Current Repository Baseline

Current landing points:

- `apps/desktop/src/renderer/components/ChainAssemblyView.tsx`
- `apps/desktop/src/renderer/state/ChainAssemblyContext.tsx`
- `apps/desktop/src/renderer/state/chainAssemblyStorage.ts`
- `packages/nextstep/src/types.ts`
- `packages/nextstep/src/model.ts`
- `packages/nextstep/src/chain-catalog.ts`
- `apps/desktop/src/renderer/help/chain-catalog.generated.ts`

Current data-root layout:

```text
<dataRoot>/.tinder/
  profiles/*.json
  resources/standard/**/*.json
  resources/custom/**/*.json
  profile-extras.json
```

Expected generated/managed project resources:

```text
<dataRoot>/.tinder/
  profiles/*.json                     # 配置档案
  resources/standard/**/*.json         # 标准/平台计算实例 metadata
  resources/custom/**/*.json           # 自定义计算节点 metadata
<dataRoot>/
  scripts/**/*.py                      # script-backed compute instance scaffolds
  native/**                            # dynamic-library source/scaffold landing point, exact layout TBD
```

Current relevant model:

- `PlatformResourceInstance`
- `PlatformComputeNode`
- `CustomNodeConfig` as the current baseline custom shape; target custom authoring model is `CustomResourceInstance`
- `GuiProjectFile`
- `ExecutionItem`
- `CORE_CHAIN_IDS`
- generated `ChainCatalog.orderedNodes`

## Legacy Source Baseline

Legacy reference:

- `D:\Tinder\Model\Model-P-v2\tools\nextstep-gui\src\app.tsx`
- `D:\Tinder\Model\Model-P-v2\tools\nextstep-gui\src\model.ts`
- `D:\Tinder\Model\Model-P-v2\tools\nextstep-gui\src\types.ts`

Legacy functions and UI behavior to mine:

- `createPlatformResource`
- `createPlatformNode`
- `updatePlatformResource`
- `addPlatformNode`
- `updatePlatformNode`
- `removePlatformNode`
- platform resource list
- platform resource detail panel
- chain-node selector backed by `CORE_CHAIN_IDS`

## Product Requirements

- The chain editor must feel native to the current VS Code-like workbench.
- Resource editing should happen from the Chain Assembly area, not as a separate standalone app.
- The chain-node selector should use the current chain catalog as SSOT where possible.
- The UI should make the selected resource and its linked chain nodes visible without requiring raw JSON editing.
- The flow should be task-oriented:
  - select or create a configuration profile
  - create or select a compute instance
  - attach one or more chain nodes
  - generate/update script or dynamic-library scaffolds
  - review documentation/interface notes
  - save generated project resources
- The UI should expose documentation inline enough to support authoring, not only jump to a separate help page.
- Adding a compute node should be able to update the compute instance implementation file with a matching function skeleton.
- Generated scaffolds must be deterministic and idempotent where possible.
- `活跃资源` and `停用资源` are the main edit surfaces for profile-managed resource refs and resource-internal compute-node enablement.
- `链路` is a compute-node-centric projection and shortcut entry, not a separate source of truth.
- `使用与版本` replaces `概览` and owns profile reuse/version/path/usage concerns.
- Existing resources are added to the current profile with the user-facing action `加入档案`.
- Users may drag existing `计算实例` entries directly into `活跃资源` or `停用资源`.
- Draggable `计算实例` entries are resource-instance metadata records, not `.py`, `.dll`, or source files.
- Implementation files may be loaded or associated from resource editing flows, but are not direct drag/drop inputs.
- `计算实例/标准` entries implement capabilities for the current canonical standard chain node catalog.
- `计算实例/自定义` entries are custom compute instances that may contain multiple custom compute nodes; they are not implementations of standard chain nodes.
- Both `计算实例/标准` and `计算实例/自定义` must enter profile `活跃资源` / `停用资源` before they are part of a complete configuration profile.
- Active custom compute nodes may be freely inserted before, between, or after built-in execution items in the chain view.
- Saving must be explicit and recoverable enough for local file workflow expectations.
- Deleting a compute-node attachment must be confirmed or easy to undo in a future slice.

## Data Requirements

- Standard resources are read from `.tinder/resources/standard/**/*.json`.
- Standard-resource edits are written back to the selected resource JSON file.
- The MVP edits `PlatformResourceInstance.compute_nodes`, `model_variants[]`, resource-level fields already present in the current type, and candidate `status` fields.
- Configuration profiles are generated or updated under `.tinder/profiles/*.json`.
- Configuration profiles own profile-managed refs through `resources[]`; standard refs target resource variants, while custom refs target custom resources.
- Compute-instance implementation scaffolds are generated under project-controlled source/script paths referenced by resource metadata.
- Chain-document derived interface metadata should be read from the generated chain catalog first; any missing structured fields should degrade to documentation display rather than blocking authoring.
- Save boundaries follow reuse: resource files store reusable capability definitions and reusable variant presets; profile files store participation, enablement, folders, and chain orchestration.
- Profile references remain separate:
  - `profiles/*.json` owns profile-level project config
  - `profiles/*.json` owns `resources[]` as the new primary profile-managed participation store
  - `resources[].enabled` decides whether a resource variant or custom resource appears under `活跃资源` or `停用资源`
  - `resources[].folder` stores the profile-local virtual subfolder under the selected top-level resource group
  - `profile-extras.json` owns extra profile-to-standard-resource references
  - resource JSON files own their chain-node attachment metadata
  - standard resource JSON files own reusable candidate availability through `compute_nodes[].status` and effective reusable variant presets through `model_variants[].selections`
  - custom resource JSON files own reusable custom node definitions through `custom_nodes[].status`
  - profile JSON owns custom node usage and placement through `custom_node_usages[]`

Compatibility rule:

- `profile-extras.json` remains readable as a legacy compatibility/migration source.
- New saves should prefer profile-owned `resources[]`.
- Missing `compute_nodes[].status` should be interpreted as `available`; legacy `compute_nodes[].enabled` may be read as a migration fallback, but new saves write `status`.

Profile resource ref shape:

```ts
type ProfileResourceRef = ProfileStandardVariantRef | ProfileCustomResourceRef;

interface ProfileStandardVariantRef {
  kind: "standard";
  resource_instance_id: string;
  variant_id: string;
  enabled: boolean;
  folder?: string;
}

interface ProfileCustomResourceRef {
  kind: "custom";
  resource_instance_id: string;
  enabled: boolean;
  folder?: string;
}
```

Display rules:

- `enabled: true` -> `活跃资源`
- `enabled: false` -> `停用资源`
- `folder` is a profile-local virtual folder, not a physical resource-file move
- `活跃资源` / `停用资源` contain standard resource-variant refs and custom resource refs; type is shown by badge/icon, not by splitting the profile tree again
- standard resources may be visually grouped by `resource_instance_id`, but the profile participation unit is `resource_instance_id + variant_id`
- global `计算实例` entries do not appear under `停用资源` until added to the current profile
- `加入档案` adds an existing standard resource variant or custom resource reference to `resources[]`; it does not create resource JSON and does not export runtime config
- drag/drop into `活跃资源` creates or updates the profile resource ref with `enabled: true`
- drag/drop into `停用资源` creates or updates the profile resource ref with `enabled: false`
- drag/drop into a virtual subfolder sets `folder`
- drag/drop accepts resource metadata items only
- `.py`, `.dll`, and source files are selected through explicit load/associate actions when editing a resource instance

Standard/custom compute instance rules:

- `standard` profile resource refs point to `PlatformResourceInstance` metadata.
- `standard` resource `compute_nodes[].node_id` values must refer to the current canonical standard chain node catalog.
- `standard` resources can cover multiple standard chain nodes.
- A standard chain node may be covered by multiple compute-node candidates across resources and applicability scopes.
- Standard resources own model/variant configs; each variant selects which candidate compute node is effective for each standard `node_id`.
- When linking a standard resource to a standard chain node, the operation must carry the target model/variant config.
- Within the same standard resource variant, only one selected compute-node candidate may target the same standard `node_id`.
- `custom` profile resource refs point to custom compute-instance metadata.
- `custom` resources own reusable `custom_nodes[]` capability definitions.
- `custom` nodes export through runtime `custom_nodes[]` and `ordered_execution_list[]` as `custom_invocation_node`.
- `custom` entries are still profile-managed resources: disabled custom refs stay visible under `停用资源` and are excluded from runtime execution.
- custom node usage and execution placement are profile-owned authoring data in `custom_node_usages[]`; runtime export expands them into `ordered_execution_list`.
- built-in execution items in the exported `ordered_execution_list` must follow the current canonical generated order and must not be user-reordered.
- standard chain coverage is not inferred from custom invocation nodes.

Custom compute instance shape:

```ts
interface CustomResourceInstance {
  resource_instance_id: string;
  display_name: string;
  description?: string;
  module_id: string;
  impl_kind: "python_script" | "cpp_dylib";
  location: string;
  custom_nodes: CustomComputeNode[];
}

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

Custom usage and placement authoring shape:

```ts
interface CustomNodeUsage {
  resource_instance_id: string;
  node_id: string;
  enabled: boolean;
  insert_before?: {
    kind: "builtin_domain_node" | "builtin_core_chain";
    domain?: string;
    node_id?: string;
    chain_id?: string;
  } | null;
  order: number;
}
```

Placement rules:

- `insert_before` points to a generated built-in execution anchor.
- `insert_before: null` means append after the last built-in execution item.
- multiple custom entries with the same `insert_before` are sorted by `order`.
- if a referenced built-in anchor no longer exists after standard catalog changes, the UI must show a migration warning and move the custom entry to an explicit unresolved/end slot until the user confirms a new position.

Runtime custom invocation schema:

- `CustomInvocationNodeSpec` includes `custom_node_id`, `resource_instance_id`, `node_id`, `module_id`, `impl_kind`, `location`, `action_index`, legacy `input`, and `enabled`.
- Legacy `entrypoint` fields are ignored by the runtime and must not be used as target semantics.
- Runtime JSON remains flat: each exported custom compute node becomes one `custom_nodes[]` item.
- Generated runtime `custom_node_id` should be stable and unique, recommended as `${resource_instance_id}.${node_id}`.
- `module_id`, `impl_kind`, and `location` come from the custom resource.
- `display_name`, `node_id`, and `action_index` come from the custom node definition; runtime `enabled` comes from profile `custom_node_usages[]` and resource capability `status`.
- Custom compute nodes use one unified call contract: `void customizeFunction(int action_index, const std::map<std::string, std::string>& parameters)`.
- `action_index` must be globally unique across exported custom compute nodes.
- New custom node creation must ask for a user-facing description/summary and then automatically allocate an `action_index`.
- After creation/save, duplicate `action_index` conflicts must not be automatically repaired or silently renumbered; they are blocking validation issues requiring explicit user action.
- `handler_function` may define the resource-local implementation helper for one `action_index`, but it is not a runtime `entrypoint`.
- Generated custom code may use `action_index` to switch/dispatch to `handler_function` values.
- The user-provided description/summary should be emitted as comments in the generated switch case, registry item, or handler stub.
- Effective runtime `parameters` are supplied by engine initialization through `InitCustomResourceParameters(resource_instance_id, parameters)`.
- Authoring may store `default_parameters` as GUI/help/init-template metadata, but runtime `custom_nodes[]` should not depend on per-node entrypoints.

Custom node editing UX:

- Custom node definition is edited from the selected custom resource detail panel under `活跃资源` / `停用资源`.
- The custom resource detail panel has three levels: resource instance fields, custom node list, selected node details.
- Resource-level fields: name, description, `module_id`, `impl_kind`, `location`, implementation-file status, interface-generation status.
- Node list columns: display name, `node_id`, `action_index`, capability status, profile usage state, placement state, validation state.
- Node detail fields: description/summary, `action_index`, resource-local handler function, default parameters metadata, placement selector, generate/update interface action, test invocation action when available.
- New custom node creation uses a lightweight guided flow: display name -> required description/summary -> generated `node_id` -> allocated `action_index` -> generated handler function name -> default parameter metadata -> automatic interface generation -> optional chain placement.
- Chain placement can be edited by drag/drop in `链路`, but must also have non-drag actions such as `放入链路`, `移到...`, `移出链路`, and searchable placement selection.
- Custom node states are `未编排`, `已编排`, `停用`, and `异常`.

Standard resource editing UX:

- Standard resource normal editing uses two columns.
- Left column: selected resource's standard node capability list.
- Right column: selected node detail, documentation, validation, and interface-generation actions.
- Resource-level fields are shown in a compact header or right-panel resource section, not a separate permanent column.
- Resource-level fields include name, description, `impl_kind`, `location`, implementation-file status, and interface-generation status.
- Standard node capability list shows display name, canonical `node_id`, capability status, interface-generated state, and current-profile coverage state.
- Standard node detail shows catalog documentation, `node_id`, display name, node type, capability status, implementation function/interface status, and actions.
- Add/bind standard node flow may temporarily use three columns: current resource capabilities, searchable standard chain catalog, selected-node documentation/interface preview.
- `链路` view may use three columns for cross-resource projection: standard chain backbone/custom slots, resource coverage or candidates, and selected detail/actions.
- Standard nodes cannot be user-reordered; execution position is derived from the generated standard chain catalog.

Standard applicability and versioning:

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

- Authoring config must not bind standard resources to concrete runtime `device_id` values, because those IDs are assigned after simulation starts.
- Standard resource variants bind to applicability/model or service scopes such as `device_model`, `platform_instance`, `environment_service`, or `signal_service`.
- Model variants may be created manually in the first phase; imported variants can be added later with synchronization and validation.
- New standard resources may create an initial variant automatically, but every variant must bind an explicit applicability scope.
- Copying a resource variant creates a new independent `variant_id` and deep-copies applicability plus selections from the source variant.
- Copied variants are independent snapshots: editing the copy must not mutate the source, and editing the source must not automatically update the copy.
- MVP does not support variant inheritance, parent pointers, delta overrides, or automatic upstream sync between variants.
- Copied variant names/IDs should be generated deterministically and remain user-editable before save.
- `default` is allowed only as an explicit service/global variant name; it is not an unbound variant.
- One standard resource may contain capabilities for many standard chain nodes.
- One standard resource may keep multiple candidate versions for one standard chain node.
- Candidate versions may be unselected by all variants; this is legal and should be shown through filtering/grouping rather than as missing coverage.
- Candidate versions may share the same implementation function name.
- Within one variant, at most one selected candidate can use the active shared `base_function_name`.
- Unselected/inactive shared-function candidates use a deterministic inactive suffix such as `__inactive` / `__inactive_2` so they are not called by the active standard function name.
- Switching a variant selection restores the newly selected candidate to the base function name and moves the previously selected candidate to an inactive suffixed function name after collision checks.
- For the same resource variant and same standard `node_id`, only one candidate may be selected.
- A variant selection is invalid if it references a missing candidate, a disabled candidate, or a candidate whose `node_id` does not match the selection's `node_id`.
- If two selections in the same variant target the same `node_id`, validation blocks runtime export until the user chooses one.
- The `链路` view shows multiplicity by node and applicability/model scope instead of treating all duplicate coverage as conflict.
- UI must let users switch resource variants such as `radar A` and `radar B` inside the same standard resource.
- The active variant view shows the selected/effective candidate per standard chain node, while candidate versions remain stored in the same resource.
- UI must support copying a resource variant.
- UI must make copied variants visually equal to manually created variants after save; no inherited/overridden state badge is needed in MVP.
- Configuration profiles include only variants that participate in chain nodes for the profile; adding one standard resource does not include all of its variants by default.

Standard chain node level metadata:

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

Rules:

- Standard node metadata constrains which variant applicability scopes can provide a node.
- L3 platform/environment/signal service nodes may use explicit service/default variants.
- L4 payload/device nodes should use device-model variants.
- The UI can use node level metadata for filtering, grouping, and validation instead of showing missing coverage as an error.

## Generated Artifact Requirements

The board should generate or update three classes of project-usable assets:

- `配置档案`
  - a profile JSON under `.tinder/profiles`
  - references or includes selected resource instances through existing profile/resource mechanisms
  - remains compatible with current `GuiProjectFile`/runtime config conversion rules
- `计算实例 metadata`
  - a `PlatformResourceInstance` or `CustomResourceInstance` JSON file
  - records display name, implementation kind, implementation path, and attached compute nodes
- `计算实例 implementation scaffold`
  - Python script or native source/dynamic-library scaffold
  - includes generated function skeletons for attached compute nodes
  - includes doc-derived comments/signatures only where the chain catalog provides reliable enough information
  - is updated automatically when any standard candidate node or custom compute node is added
  - must never overwrite user-authored function bodies automatically

## Interface Generation Requirements

Automatic generation:

- Adding a standard candidate compute node automatically creates or updates its implementation entry surface.
- Adding a custom compute node automatically creates or updates the unified `customizeFunction` entry surface and action registry.
- If the target file does not exist, the generator may create a complete scaffold.
- If the target file exists and the needed entry or generated registry item is missing, the generator may add it.
- If the entry already exists, the generator must not overwrite the user-authored function body.

Generated region rules:

- Generator-owned regions use paired markers: `<tinder-generated:{region-name}>` and `</tinder-generated:{region-name}>`.
- Supported region names are `custom-actions`, `custom-declarations`, `custom-dispatch`, `standard-actions`, `standard-declarations`, and `standard-dispatch`.
- Content inside generated regions may be fully rewritten.
- Content outside generated regions is user-owned and must not be rewritten automatically.
- Non-empty files without safe generated regions enter pending/conflict instead of receiving large automatic insertions.
- Missing end markers, unpaired markers, nested generated regions, or unknown region names are blocking/pending conflicts.

Generated comment rules:

- Comments and metadata inside generated regions may be regenerated whenever resource metadata changes.
- Generated custom action registries and dispatch cases should include `node_id`, `action_index`, `handler_function`, and the user-provided description/summary when available.
- When a handler stub is created for the first time, the generator writes the description/summary as a Python docstring or C++ function-head/body comment.
- Once a handler exists, the generator must not rewrite its body or existing user-region comments.
- If a resource description changes after handler creation, generated registry/dispatch comments may update, but existing handler comments remain user-owned.

Minimum C++ contracts:

```cpp
void standardFunction(const std::map<std::string, std::string>& parameters);

void customizeFunction(
    int action_index,
    const std::map<std::string, std::string>& parameters
);
```

Runtime export requirements:

- `保存` and `生成运行配置` are separate actions.
- `保存` writes authoring profile/resource/scaffold metadata.
- `生成运行配置` validates active profile refs, expands standard resource variants, expands custom placements, and writes canonical runtime JSON.
- Compute-resource configuration is in scope for this round only where it affects authoring save, validation, scaffold status, or runtime export.
- Detailed engine runtime parameter initialization is out of scope except for recording that custom parameters are injected per `resource_instance_id`.
- Runtime JSON destination should offer:
  - detected engine-effective path from `runtime_config_file` or `nextstep.runtime_config_file`
  - a project/default export path for staging
  - a custom path
- If the selected export path is not the detected engine-effective path, the UI must warn that the exported file will not be active until engine config points to it.
- Runtime export must not automatically rewrite engine config paths in MVP.
- Blocking validation failures prevent runtime export.
- Warnings are included in an export report and do not block export.
- Info items are included in the export report as export summaries and do not indicate validation risk.

Blocking export failures:

- invalid profile ref, missing standard variant, or disabled active ref inconsistency
- invalid standard variant selection: missing candidate, disabled candidate, mismatched `node_id`, duplicate selection for a variant + `node_id`
- standard node applicability scope not allowed by provider metadata
- custom placement unresolved or referencing a missing custom node
- duplicate `custom_node_id` or duplicate exported `action_index`
- enabled exported custom node missing `module_id`, valid `impl_kind`, or implementation `location`
- custom ordered execution references an undefined custom node
- built-in execution order cannot be generated from the current catalog
- scaffold/interface conflict affects an active exported node
- selected runtime export path is not writable

Current warning classes:

- engine-effective runtime path cannot be detected, so export uses the project default/custom path and the engine config still needs to be pointed at it
- selected runtime export path is not the detected engine-effective path
- documentation/interface metadata is incomplete, so generated hints/comments are degraded
- non-participating candidate nodes or variants exist but are filtered/grouped out
- compatibility fallback data was used, such as legacy profile extras or legacy custom `input` action-index parsing
- scaffold pending/conflict state exists only for non-participating nodes

Export report UX:

- `生成运行配置` opens a validation/export report instead of acting as an opaque save.
- Report groups are `Blocking`, `Warning`, and `Info`.
- Blocking items disable final export until fixed.
- Warning items allow export but must remain visible before confirmation.
- Info items summarize export count, target path, generated runtime path, participating standard variants, participating custom nodes, and chain placement count.
- Each report item should carry a locator when possible: profile, resource, variant, compute node, chain node, or chain placement.
- `定位` should navigate to the relevant profile/resource/variant/node/placement editor.
- The report should be saved beside or inside export metadata so a generated runtime file can be audited later.
- A future explicit action may be added as `导出并设为生效配置`, but normal export does not change engine path ownership.

Safe write policy:

- Generated regions may be rewritten.
- User-authored function bodies may only be created once and then preserved.
- Registry/declaration/adapter sections can be regenerated when enclosed by explicit markers.
- Existing functions should be detected idempotently before insertion.
- Handler stubs may be inserted only when the target function does not already exist.
- Existing handler functions with compatible signatures are preserved even when comments differ from resource metadata.
- If a safe edit cannot be proven, the UI must show a pending/conflict state rather than writing automatically.

Conflict cases:

- matching function name exists with an incompatible signature
- non-empty target file has no generated marker and no safe insertion point
- generated marker is missing, unpaired, nested, or has an unknown region name
- inactive suffix rename would collide with an existing symbol
- shared standard function activation would overwrite an existing active function name
- custom `action_index` is duplicated
- generated custom handler function name would collide with an incompatible existing function
- generated registry cannot be updated without touching user code

## Documentation Linkage Requirements

- Each canonical chain node shown in the assembly board must be linkable to the corresponding chain documentation.
- The inspector should show at least:
  - display name
  - canonical node id
  - purpose/summary if available
  - input/output contract rows if available
  - implementation/interface hint if available
- Documentation data should drive scaffold generation when structured fields exist.
- Missing documentation fields should not block adding the node; the UI should show the gap clearly.

## Runtime Config Format Requirement

- Engine-consumed config must be canonical JSON.
- YAML is not a direct input to `unified_model_entry.cpp`.
- If YAML is ever introduced for manual authoring, it must be converted to canonical JSON before runtime loading.
- Authoring profile JSON may contain GUI/lifecycle metadata.
- Runtime config JSON should contain only engine-consumed data needed by `UnifiedModelEntry`.

## Acceptance Criteria

- A complete task package exists under `dev-docs/active/target-directory-chain-editor-port/`.
- The roadmap distinguishes planning, MVP implementation, integration, and verification phases.
- The architecture doc clearly states how current data-root storage differs from the legacy GUI's `project.platform_resources` state.
- The plan identifies which legacy code can be reused conceptually and which parts must be adapted.
- The package treats simple workflow, generated project resources, and documentation-driven interface scaffolding as first-class goals.
- Implementation notes record the initial discovery decisions and later execution changes.
- Verification doc defines typecheck/build/manual checks for future code work.
