# 01 Plan

## Phase A - Baseline Package

- Create the complete task package.
- Record current and legacy code references.
- Record initial decisions, assumptions, risks, and verification plan.

### Done definition

- All package docs exist.
- `roadmap.md` contains phase-level delivery criteria.
- No product code has been changed for planning-only work.

## Phase B - Decision Freeze

- Confirm whether the global `计算实例` inspector can edit resources before `加入档案`, or whether MVP editing is profile-local only.
- Confirmed: compute-resource configuration is in scope where it affects authoring save, validation, scaffold status, or runtime export; detailed engine runtime parameter initialization remains out of scope for this decision round.
- Confirm whether catalog display names should seed compute-node display names.
- Confirmed: profile child views are `链路`, `活跃资源`, `停用资源`, `使用与版本`.
- Confirmed: `活跃资源` and `停用资源` are source-of-truth edit surfaces; `链路` is projection and shortcut entry.
- Confirmed: profile owns participating standard variants/custom resources in `resources[]`; standard resource owns candidate availability and variant selections.
- Confirmed: adding an existing resource to the selected profile uses the action text `加入档案`.
- Confirmed: resources may be dragged from `计算实例` into `活跃资源` or `停用资源`.
- Confirmed: `计算实例/标准` targets the current canonical standard chain node catalog; `计算实例/自定义` targets Model-P-v2 custom invocation nodes.
- Confirmed: `计算实例/自定义` entries must also enter profile `活跃资源` / `停用资源` and are part of the complete configuration profile.
- Confirmed: active custom compute nodes can be freely inserted before, between, or after built-in execution items.
- Confirmed: one custom compute instance can contain multiple custom compute nodes; the nodes are the chain-placement unit.
- Confirmed: custom node execution uses Model-P-v2 runtime semantics with `resource_instance_id`, `node_id`, globally unique `action_index`, and resource-level parameters injected by `InitCustomResourceParameters`.
- Confirmed: custom node definition is edited in resource detail panels; chain placement is edited in `链路`.
- Confirmed: standard resource normal editing uses two columns; add/bind flows may temporarily use three columns.
- Confirmed: standard resources bind to applicability/model scope, not runtime device IDs.
- Confirmed: one resource can contain multiple standard chain nodes and multiple candidate versions per standard node; each model/variant selects at most one effective candidate per standard `node_id`.
- Confirmed: standard resource-to-chain-node links must carry the target model/variant config; legality is checked against variant selections.
- Confirmed: configuration profiles include only participating standard resource variants, not all variants under a selected resource.
- Confirmed: standard node metadata needs provider/applicability levels for L3 service and L4 device-model nodes.
- Confirmed: adding any standard candidate or custom compute node automatically generates or updates the implementation entry surface.
- Confirmed: scaffold writes must be safe and must not overwrite user-authored function bodies automatically.
- Confirmed: custom compute nodes use `customizeFunction(int action_index, const std::map<std::string, std::string>& parameters)`.
- Confirmed: standard shared function names use deterministic inactive suffixes for inactive candidates.
- Confirmed: engine-consumed runtime config is canonical JSON.
- Confirmed: `保存` and `生成运行配置` are separate actions; runtime export targets the detected engine-effective path first, then project/default path, then custom path.
- Confirmed: `生成运行配置` produces a Blocking / Warning / Info report with navigation locators; blocking prevents export, warning allows export, and normal export does not rewrite engine config paths.
- Confirmed: save boundaries follow reuse: resource files store reusable capability definitions and variant presets, while profile files store participation, enablement, folders, and chain orchestration.
- Confirmed: resource-internal availability uses `status`; profile participation and custom node usage use `enabled`.
- Confirmed: standard resource variants are copied as independent snapshots in MVP; no inheritance, override layer, parent pointer, or automatic upstream sync.
- Confirmed: new custom nodes collect a description/summary, auto-allocate `action_index`, and never auto-repair duplicate `action_index` conflicts after save.
- Confirmed: custom resources may generate an `action_index` switch/dispatch to resource-local handler functions; these handlers are not runtime entrypoints.
- Confirmed: interface generators may rewrite marked generated regions and create handler stubs once, but must not rewrite existing handler bodies or user-region comments.
- Confirmed: generated-region comments may update from metadata; first-created handler stubs get generated comments, and existing handler comments remain user-owned.
- Confirm the native scaffold shape: C++ source template first, or direct dynamic-library project layout.

### Done definition

- Open questions are either answered or promoted to explicit assumptions.
- `roadmap.md` is updated if the MVP scope changes.

## Phase C - Workflow And Model Helpers

- Add helper functions for chain-node options.
- Add helper functions for doc-derived node summaries and interface hints.
- Add helper functions for compute-node creation and validation.
- Add helper functions for script/native scaffold generation.
- Keep helpers pure where possible so they can be tested without Electron.

### Done definition

- Helpers are typechecked.
- Any tests added for helpers pass.

## Phase D - Generated Resource State And Disk IO

- Add selected-resource state to Chain Assembly.
- Add selected-profile state for the assembly workflow.
- Add update/save methods for standard resource leaf files.
- Add create/update methods for configuration profiles.
- Add create/update methods for compute-instance metadata.
- Add scaffold write methods for implementation files.
- Preserve current tree loading and reload behavior.
- Surface write errors through current dialog UI.

### Done definition

- Editing a standard resource writes only that resource JSON file.
- Creating/updating a profile writes only the selected profile JSON file.
- Generating a scaffold writes only the implementation path selected by the user or resource metadata.
- Reload keeps the selected resource when the path still exists.

## Phase E - Computation Chain Assembly UI

- Add a guided computation-chain assembly component.
- Render profile selection/creation.
- Render compute instance selection/creation.
- Render selected resource metadata.
- Render editable compute-node rows.
- Render documentation summary and interface hints for selected chain nodes.
- Render scaffold target and generate/update action.
- Support add/update/remove actions.
- Use current dark workbench styling.

### Done definition

- A user can add, edit, and delete chain-node attachments without raw JSON editing.
- A user can create/update a profile, compute instance metadata, and script/native scaffold from the board.
- Adding a compute node can generate or update a matching function skeleton.
- UI fits current layout and does not require the old standalone GUI.

## Phase F - Integration And Verification

- Wire standard-resource tree rows to inspector selection.
- Optionally wire active-profile resource rows to inspector navigation.
- Wire selected chain nodes to inline documentation and help-view navigation.
- Run typecheck/build.
- Perform manual smoke test against a sample data root.

### Done definition

- Typecheck/build status is recorded in `04-verification.md`.
- Manual smoke results are recorded with exact files edited/generated.

## Immediate Discussion Topics

1. Confirm whether global `计算实例` entries can be edited before `加入档案`, or whether editing starts only after they enter `活跃资源` / `停用资源`.
2. Confirm scaffold generation policy for native compute instances beyond source/header templates.
