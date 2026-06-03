# 04 Verification

## Schema Verification

- model ids and versions reject `_`
- versions reject anything outside `x.x.x`
- object keys match `<model_id>_<x.x.x>`
- platform category codes validate against the `301`/`302`/`303`/`304` entity
  platform numbering rules
- equipment category codes validate as `20*`
- model ids identify concrete models under their category, not the category
  itself
- object keys are derived consistently
- duplicate `(model_id, version)` entries are detected globally across platform
  and equipment models
- a model family has exactly one category
- duplicate platform configuration owners are detected by `platform_object_key`
- configurations are scoped to exactly one model version
- parameter fields accept `value_type = string | bool | int | double`
- adding a parameter field inserts an editable row directly in the table
- malformed model files do not block app startup
- missing categories do not corrupt model family loading
- platform-equipment mounting records remain canonical when edited from either
  UI entry point

## UI Verification

- model library appears as a first-level left-rail module
- model-library module sidebar is titled `模型库`
- model-library module sidebar title row shows `平台` and `设备` tabs
- model-library module sidebar title row shows an icon-only `全部折叠` action
- model-library module sidebar body shows only the active tab's category tree
- clicking `全部折叠` collapses all category nodes in the active tree
- category expanded/collapsed state is remembered when leaving and re-entering
  the model-library module during the same app session
- switching between `平台` and `设备` clears category/model/version selection
- selecting a sidebar category filters concrete models in the main workspace
- entering the model-library module renders the model-library page directly,
  does not create a `模型库` workspace tab, and keeps the first workspace tab
  row visible
- model-library object tabs render in a second global tab row
- after at least one model-library tab is open, the second tab row remains
  visible when switching to other modules
- the second tab row disappears after all model-library tabs are closed
- double-clicking a leaf category opens or activates one category tab in the
  second row
- double-clicking a non-leaf category does not open a workspace tab
- double-clicking a concrete model opens or activates one model tab in the
  second row
- double-clicking a model version opens or activates one version tab in the
  second row
- selecting a non-leaf category hides concrete model creation
- user can create a model family
- user can create multiple versions under one family
- user can edit parameter fields
- user can add a configuration/default template
- configuration default values are edited as strings
- user can edit platform-equipment mounting relationships from platform-version
  detail
- user cannot physically delete referenced model versions
- user can delete unreferenced model versions
- search finds by display name, alias, model id, and object key
- category filters narrow the model family list
- model-library status labels and status transition actions are not shown in the
  MVP UI

## Profile Integration Verification

- platform target can be selected from model library
- compute object binding can be selected from model library
- manual entry still works
- missing library ref shows a warning but preserves export snapshot
- selecting a duplicate platform model version asks whether to overwrite/relink
  the existing configuration profile/export target
- equipment model versions are reusable across multiple platform profile bindings
- each mounted equipment object must bind to a compute-resource branch
- profile bindings without a matching version-level mount are flagged when the
  platform version defines mounts
- mounting edits made in profile associated-model editing are visible after
  reopening the model library platform-version detail

## Runtime Config Verification

- exported runtime config path remains
  `bin/resources/models/<platform_model_id>/<platform_model_id>_<platform_version>.runtime.json`
- exported `platform_model` uses profile snapshot fields
- exported `compute_object_bindings` use profile snapshot fields
- parameter values are not exported
- `standard_nodes[]` and `custom_nodes[]` behavior remains unchanged
