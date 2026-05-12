# 03 Implementation Notes

## 2026-05-11

- Created task package `target-directory-chain-editor-port`.
- Reviewed current repository structure:
  - Electron/React desktop app under `apps/desktop`
  - shared NextStep model under `packages/nextstep`
  - current Chain Assembly components and state under `apps/desktop/src/renderer`
  - generated chain catalog support under `packages/nextstep/src/chain-catalog.ts`
- Reviewed legacy repository reference:
  - `D:\Tinder\Model\Model-P-v2\tools\nextstep-gui\src\app.tsx`
  - `D:\Tinder\Model\Model-P-v2\tools\nextstep-gui\src\model.ts`
  - `D:\Tinder\Model\Model-P-v2\tools\nextstep-gui\src\types.ts`
- Identified the legacy chain-editor behavior as resource-instance `compute_nodes` editing.
- Chose a new task rather than folding this into an existing current-repo doc because the current repo has no `dev-docs/active` task package yet.
- Recorded the core migration decision:
  - legacy GUI edited `project.platform_resources`
  - current app should edit `.tinder/resources/standard/**/*.json` leaf files
- Recorded the catalog decision:
  - prefer generated current chain catalog
  - use `CORE_CHAIN_IDS` only as fallback or compatibility helper
- Updated the task scope after the user clarified the target:
  - the deliverable is the full `计算链路组装` board
  - the workflow must be simple and guided
  - the board must generate project-usable resources, including profiles and compute-instance metadata/implementation files
  - documentation linkage must support authoring and scaffold generation, not only navigation
  - adding a compute node should be able to add a matching function skeleton to the compute instance implementation file
- Froze profile child-view copy:
  - `链路`
  - `活跃资源`
  - `停用资源`
  - `使用与版本`
- Froze the source-of-truth model:
  - `活跃资源` and `停用资源` are the primary edit surfaces for profile-managed resources and compute-node capability enablement
  - `链路` is a compute-node projection and shortcut entry
  - `使用与版本` owns profile reuse, save path, Save As, simulation-object usage, and version maintenance
- Froze activation ownership:
  - profile JSON owns `resources[]`
  - standard profile refs point to `resource_instance_id + variant_id`
  - custom profile refs point to `resource_instance_id`
  - `resources[].enabled` decides whether a standard variant or custom resource appears under `活跃资源` or `停用资源`
  - `resources[].folder` is a profile-local virtual folder path
  - profile JSON includes only participating standard variants, not every variant under a selected standard resource
  - standard resource JSON owns candidate availability and `model_variants[].selections`
  - custom resource JSON owns custom node definitions
  - missing enabled flags are interpreted as enabled for compatibility
  - `profile-extras.json` becomes compatibility/migration data rather than the new primary storage
- Froze existing-resource membership behavior:
  - user-facing action text is `加入档案`
  - it adds an existing resource to the selected profile's `resources[]`
  - it does not create resource JSON and does not export runtime config
  - resources may be dragged from `计算实例` into `活跃资源` or `停用资源`
  - drop target determines default `resources[].enabled`
- Froze `计算实例` scope:
  - `计算实例` is the user-facing global resource-instance metadata library
  - draggable resources are resource-instance metadata records from `.tinder/resources/**`
  - `.py`, `.dll`, and source files are not draggable resources
  - implementation files can only be loaded or associated through explicit resource editing actions
- Froze standard/custom compute-instance boundary from docs and Model-P-v2:
  - `计算实例/标准` corresponds to resource instances for the current canonical `builtin_core_chain` standard node catalog
  - `计算实例/自定义` corresponds to `custom_invocation_node` / `custom_nodes`
  - custom compute instances can own multiple custom compute nodes
  - custom compute nodes are ordered execution items, not standard chain node capabilities
  - custom invocation resources still belong to profile `活跃资源` / `停用资源`
  - active custom compute nodes can be placed freely around generated built-in execution anchors
  - standard chain coverage should not be inferred from custom invocation nodes
- Model-P-v2 runtime/GUI alignment:
  - old GUI inserts custom nodes by moving `custom_invocation_node` items inside `ordered_execution_list`
  - runtime rejects reordered/missing/extra built-in items but accepts custom items around them
  - current app should store custom placements in profile authoring data and generate runtime `ordered_execution_list` from the current catalog
  - latest runtime `CustomInvocationNodeSpec` already carries `resource_instance_id`, `node_id`, `action_index`, implementation metadata, legacy `input`, and `enabled`; per-node `entrypoint` is not target semantics
  - effective custom invocation parameters are injected per resource through `InitCustomResourceParameters(resource_instance_id, parameters)`
- Froze custom node editing UX:
  - edit custom resource metadata and custom node definitions in `活跃资源` / `停用资源`
  - edit execution placement in `链路`
  - provide drag/drop plus non-drag commands such as `移到...`
  - track node states as `未编排`, `已编排`, `停用`, and `异常`
- Froze standard resource editing UX:
  - normal resource edit uses two columns: capability list and detail/docs/actions
  - resource metadata stays in a compact header or resource section
  - add/bind standard node flow may temporarily use three columns
  - standard nodes cannot be reordered by the user
- Froze standard coverage/versioning policy:
  - resources bind to applicability/model scope, not runtime device IDs
  - one resource can cover multiple standard chain nodes
  - one resource can store multiple candidate versions for the same standard chain node
  - one resource can define multiple model/variant configs
  - linking a resource to a standard chain node must carry the target model/variant config
  - only one candidate may be selected for the same resource variant + standard `node_id`
  - duplicate selections for that key are validation errors
  - unselected candidates are legal and should be handled with filtering/grouping UI
  - `复制变体` is part of the resource editing workflow
  - standard chain nodes need provider/applicability metadata so service-level and device-model-level nodes validate against the correct variant scopes
  - the standard-chain count is intentionally not frozen because docs/catalog may add or remove nodes
- Froze interface/scaffold generation policy:
  - adding any standard candidate or custom compute node automatically generates/updates the implementation entry surface
  - generators may rewrite marked generated regions and registries, but must not overwrite user-authored function bodies
  - custom nodes call `customizeFunction(int action_index, const std::map<std::string, std::string>& parameters)`
  - `action_index` is globally unique across exported custom nodes
  - new custom nodes collect a user description/summary and then allocate `action_index`; duplicate `action_index` conflicts are blocking and must not be auto-repaired
  - generated custom scaffolds may create an `action_index` switch/dispatch table to resource-local handler functions, with the user description emitted as comments
  - generated-region comments may be updated, but existing handler body/comments are user-owned after first creation
  - use paired `<tinder-generated:{region-name}>` markers for generated regions; malformed markers become pending/conflict states
  - standard candidates may share `base_function_name`; inactive shared candidates use deterministic inactive suffixes
  - unsafe edits become pending/conflict states for user confirmation
- Froze config format direction:
  - engine-consumed runtime config is canonical JSON
  - YAML is not a direct `unified_model_entry.cpp` input
  - optional future YAML authoring must convert to canonical JSON first
- No product code changes were made while creating this package.

## 2026-05-12

- Scope split with the product owner. This package is now narrowed to the
  configuration-profile (`配置档案`) surface; 计算实例 editing (standard
  resource capability/variant/applicability editing, custom resource
  multi-node authoring, action_index allocation, Python/native scaffold
  generation, scaffold marker safe-write policy) moves to a separate task
  package.
- In scope here:
  - profile schema v2: `resources[]`, `custom_node_usages[]`, lazy
    migration from v1 + `profile-extras.json`.
  - four profile child views: `链路`, `活跃资源`, `停用资源`,
    `使用与版本`.
  - `加入档案`, drag/drop into 活跃/停用, profile-local virtual folders.
  - `链路` projection (read-only view over already-defined resources;
    custom-node placement editing is profile-owned data so the placement
    UI stays here even though the custom resource itself is authored in
    the other package).
  - `保存` ↔ `生成运行配置` split with the Blocking / Warning / Info
    report shape; flattening custom placements into runtime
    `ordered_execution_list` is owned here.
- Out of scope (moved to the resource-editor task package):
  - `PlatformResourceInstance` detail editing, `compute_nodes[]`
    candidate management, `model_variants[]`, applicability scope UI.
  - `CustomResourceInstance` multi-node refactor, action_index
    allocation, custom-node creation wizard, handler-function fields.
  - Python / native scaffold generators and the `<tinder-generated:*>`
    marker safe-write policy.
- Open questions resolved on 2026-05-12:
  - global `计算实例` editing-before-`加入档案`: deferred along with all
    other 计算实例 editing.
  - new compute node display-name default: catalog display name, fall
    back to `node-XX` only when missing.
  - native scaffold initial shape: single C++ source/header template
    first; project layout (CMake/xmake) deferred until after toolchain
    integration is agreed.
- Implementation will land in small slices on `main` so each step stays
  reviewable. First slice (PR-1) is types + lazy-migration helpers only;
  no renderer changes.
