# 01 Plan

## Recommended First Slice

Build the model library as a local authoring and selection module:

1. UIUX alignment
2. schema and storage
3. management UI
4. profile export selector integration
5. database SSOT export contract

The first slice should not implement external sync. It should also avoid changing
runtime config shape beyond selecting existing id/version fields from the model
library.

## Implementation Order

1. Freeze the model-library UIUX as a list/table management workflow.
2. Add types in `@tinder/nextstep`.
3. Add normalize and object-key helpers.
4. Add storage discovery in desktop state.
5. Add model-library page and navigation.
6. Add version selector widgets.
7. Integrate selector into `ProfileExportConfigDialog`.
8. Add validation and status labels.
9. Revisit database SSOT export after local management and profile linkage are stable.

## Data Migration Strategy

No mandatory migration is required for existing profiles.

Existing profile export targets without `model_library_ref` are treated as manual
entries. They remain exportable if id/version validation passes.

When a user selects a model-library version, the profile stores both:

- `model_library_ref`
- the current export snapshot fields

## UX Strategy

The MVP should prioritize efficient editing over visual browsing:

- model library is a first-level left-rail module, at the same hierarchy level
  as compute chain assembly
- after entering the module, the module sidebar title row is
  `模型库 + 平台/设备 tabs`
- the sidebar body shows only the category tree for the active tab
- sidebar tree nodes are category codes used to filter the main workspace
- the main workspace shows a searchable concrete model list and a version/detail
  editor

The MVP explicitly does not include a card/gallery view. The external card-style
browser can be revisited later only if the model library becomes a
browsing-heavy workflow.

The agreed UIUX shape is summarized in `07-uiux-decisions.md`.

## Storage Strategy

The current lightweight persistence slice stores the whole local authoring index
in one project-local file:

```text
.tinder/model-library/index.json
```

The file contains `categories`, `families`, `versions`, and `mounts`. Missing
files load as an empty model library with the default taxonomy, and edits are
written back with a short debounce.

The role-partitioned layout under `.tinder/model-library/platform` and
`.tinder/model-library/equipment` remains a later storage hardening step.
External database library names are not modeled in the MVP. Categories are
metadata/index records used for filtering and display.

## Database SSOT Export Strategy

The model library should eventually export a database-facing SSOT artifact, but
the export shape is deferred. Runtime config remains scoped to platform-model
execution and continues to omit parameter values.

External database ids and table mappings are deferred until the table structure
is available.

## Frozen MVP Rules

- `model_id + version` is globally unique.
- `version` uses `x.x.x`.
- `object_key` uses `<model_id>_<x.x.x>`.
- platform `category_code` uses the `301`/`302`/`303`/`304` entity platform
  numbering families.
- equipment `category_code` starts with `20`.
- platform and equipment model versions both use
  `category_code -> model_id -> version`; profile export selects concrete
  `model_id + version`, not the category.
- each family has one category.
- platform-equipment mounting is version-scoped.
- every concrete mounted equipment object in a profile must bind to a
  compute-resource branch.
- referenced model versions are deprecated instead of physically deleted.
- configuration templates do not link into profiles in the MVP.
