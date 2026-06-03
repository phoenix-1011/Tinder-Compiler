# Model Library Module Roadmap

## Decision Log

The shared numbering and object-key conventions are summarized in
`06-repository-conventions.md`. The agreed MVP navigation and work surface are
summarized in `07-uiux-decisions.md`.

| ID | Topic | Decision | Rationale |
| --- | --- | --- | --- |
| M1 | Module boundary | Model library owns model ids, versions, object keys, taxonomy, parameter fields, and optional configs. | These are the fields the platform model parser depends on. |
| M2 | Compute-resource separation | Compute resources remain separate and continue to own source files, runtime artifacts, branch state, and chain capabilities. | Avoids duplicating implementation data and keeps runtime loading through `.tinder/resources`. |
| M3 | Profile snapshot | Profiles store export snapshots even when a library ref exists. | Export must remain complete if model library sync is incomplete or a model entry is missing. |
| M4 | Manual fallback | Profile export UI keeps manual id/version entry. | The model library will not be complete on day one. |
| M5 | Object key delimiter | `_` is reserved as the id/version delimiter and is rejected inside ids and versions. | Prevents `a_b + c` vs `a + b_c` key collisions. |
| M6 | Parameter values | Runtime config does not export parameter values. | Engine receives actual parameters from the platform database. |
| M7 | First UI shape | MVP uses a dense management view, not a visual card gallery clone. | Faster to implement and easier to integrate with current desktop shell. |
| M8 | External sync | External model database synchronization is deferred. | Local schema and profile integration should be stable before import/sync semantics are added. |
| M9 | Platform vs equipment | Model library explicitly separates platform models from payload/equipment models. | Platform models own profile export targets; equipment models are bound to compute-resource branches. |
| M10 | Mounting consistency | Platform-equipment mounting can be edited from the model library or from profile associated-model editing, but both entries must write the same normalized relationship. | Dual entry points are acceptable only if they cannot diverge. |
| M11 | One profile per platform version | Within one project, one versioned platform model object key can have at most one owning configuration profile/export target; duplicate creation asks whether to overwrite/relink. | Prevents multiple competing profile configs for the same platform model version. |
| M12 | UIUX first | Planning and implementation should settle model-library UIUX before profile integration and database SSOT export. | The workflow must be clear before binding it to profile/runtime contracts. |
| M13 | Database SSOT export | Model library will later export a database-facing SSOT contract, but the export shape is deferred. | Runtime config serves platform-model execution; database export should be discussed after the core model library is built. |
| M14 | Lightweight local storage | Current MVP persistence stores the authoring index at `.tinder/model-library/index.json`; role-split files can be introduced later. | Keeps the first storage slice simple while preserving platform/equipment as schema-level roles. |
| M15 | Object hierarchy | Use `ModelFamily -> ModelVersion -> ParameterFields / Configurations / Mounting`. | Family owns display/category metadata; version owns parseable object key and fields. |
| M16 | Category model | Categories are metadata/index records, not the top-level storage partition. | Avoids overfitting local storage to external gallery taxonomy. |
| M17 | Version-owned configs | Configurations are owned by one `ModelVersion` and are not shared across versions. | Versioned platform/equipment parsers may diverge, so config defaults should stay version-scoped. |
| M18 | Basic scalar parameters | MVP parameter fields support `string`, `bool`, `int`, and `double`; ranges remain string metadata. | Matches the current field-SSOT need without introducing nested or external database type mapping. |
| M19 | External DB deferred | External database ids/source refs are not modeled in MVP. | Future sync should be aligned against the actual database table structure. |
| M20 | Global model uniqueness | `model_id + version` is globally unique across platform and equipment models. | The versioned model object should not depend on a type namespace to be unique. |
| M21 | Version and object-key format | `version` uses `x.x.x`; full object key uses `<model_id>_<x.x.x>`. | `model_id` is the concrete model id, not the category code, and is not fixed to five digits. |
| M22 | Single category | One model family has exactly one category in the MVP. | Concrete category rules will be provided later; avoid premature multi-category behavior. |
| M23 | Version-level mounting | Platform-equipment mounting relationships are owned by the platform model version. | Different platform versions can have different equipment slots/defaults. |
| M24 | Equipment requires compute binding | Every concrete mounted equipment object in a profile platform config must bind to a compute-resource branch. | Enables bidirectional validation between the model library mounting model and the configuration profile. |
| M25 | Delete policy | Referenced model versions are deprecated, not physically deleted; only unreferenced drafts can be deleted. | Prevents profile/runtime bindings from silently breaking. |
| M26 | Config-template linkage deferred | Configuration templates are maintained in the model library but do not link into profiles in the MVP. | Profile linkage should wait until the model library foundation is stable. |
| M27 | Entity platform category numbering | Entity platform category codes use the `301`/`302`/`303`/`304` families: force entity platform, ammunition entity platform, countermeasure entity platform, and facility entity platform. | Matches Model-P entity classification and platform parser expectations. |
| M28 | Entity domain digit | For `301` force entity platform category codes, the 4th digit encodes domain: `0` space, `1` air, `2` surface, `3` underwater, `4` land. For `302`/`303`/`304`, the 4th digit is `0`. | Preserves the existing SimEntityClassifier domain mapping. |
| M29 | Equipment category numbering | Equipment category codes start with `20`; `201`-`209` define equipment groups and five-digit prefixes define equipment categories such as `20101` radar. | Keeps payload/equipment categories separate from entity platform categories. |
| M30 | Category versus concrete model | Platform and equipment both use `category_code -> model_id -> version`; profiles and exports reference concrete `model_id + version`, not categories. | Prevents type codes such as `3011101` or `20101` from being mistaken for concrete model objects. |
| M31 | Model-library navigation | Model library is a first-level left-rail module at the same level as compute chain assembly. After entering it, the module sidebar title row shows `模型库 + 平台/设备 tabs`; the sidebar body shows only the active tab's category tree. | Matches the existing app shell hierarchy and keeps platform/equipment split inside the model-library workspace without rendering two long trees at once. |

## Open Questions

- None for the current architecture pass.

## Phase 0 - Discussion Package

Deliverables:

- create this dev-docs task package
- record boundaries, target hierarchy, and roadmap
- identify open questions for user alignment

Done when:

- roadmap is reviewed and the first implementation slice is agreed

## Phase 1 - UIUX Alignment

Deliverables:

- freeze model-library page layout
- freeze platform/equipment split in the UI
- freeze left-rail entry and model-library module sidebar structure
- freeze list/table-first management workflow
- define model family list columns
- define version, parameter-field, configuration, and mounting panels
- define duplicate platform profile overwrite/relink prompt

Done when:

- users can explain where to edit platform models, equipment models, parameter
  fields, configurations, and mounting relationships
- users can explain that sidebar nodes are categories and main-workspace rows
  are concrete models
- no card/gallery behavior is required for MVP

## Phase 2 - Schema And Storage

Deliverables:

- add `ModelObjectKind`, `ModelFamily`, `ModelVersion`, scalar parameter field
  types
- add platform/equipment-specific refs and validation
- define normalize/derive helpers for object keys
- define canonical mounting relationship storage
- define model-library storage layout under `.tinder/model-library`
- implement read-only discovery and parsing

Done when:

- model entries can be loaded into a stable in-memory index
- model-library mounting relationships have one canonical persisted shape
- malformed entries are skipped with warnings instead of blocking startup

## Phase 3 - Local Model Library Management UI

Deliverables:

- add a model library navigation entry
- show model library as a first-level left-rail module
- show `平台` and `设备` as tabs next to the `模型库` sidebar title
- show only the active tab's category tree in the module sidebar body
- show model family list with search/filter
- show model family detail and version list
- support add/edit/delete for local families and versions
- support editing parameter fields and configurations
- support editing platform-equipment mounting relationships from the model
  library side

Done when:

- users can maintain local model ids, versions, and fields without editing JSON

## Phase 4 - Profile Export Integration

Deliverables:

- add model-library selector to associated platform model modal
- add model-library selector to compute object binding rows
- auto-fill id/version/object key from selected model version
- keep manual fallback with clear status label
- warn on missing/deprecated/draft library refs
- show platform-equipment mounting state in associated-model editing
- when a duplicate platform model object key is selected, ask whether to
  overwrite/relink the existing configuration profile/export target

Done when:

- profile export config can be completed from the model library or manually
- runtime config output remains unchanged except for values selected from library
- mounting edits from either UI entry point stay consistent after reload

## Phase 5 - Database SSOT Export Discussion

Deliverables:

- discuss database-facing export scope after the model library is built
- keep database export separate from `.runtime.json`
- avoid locking database export shape before the external table structure is
  reviewed

Done when:

- database export scope is agreed separately

## Phase 6 - Import And Sync Preparation

Deliverables:

- defer import/sync until the external database table structure is available
- define the table-structure review checklist
- identify which local fields must map to external database columns

Done when:

- the team has enough table-structure context to design import/sync without
  changing profile export contract semantics

## Phase 7 - Advanced Field Authoring

Deliverables:

- field grouping and ordering
- unit dictionaries
- configuration diff by version
- revisit richer parameter type mapping only if the external database table
  structure explicitly requires it

Done when:

- string-field authoring remains stable, and any future non-string expansion has
  a table-backed decision
