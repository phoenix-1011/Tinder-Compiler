# 02 Architecture

## Storage Layout

Current lightweight persistence layout:

```text
.tinder/model-library/
  index.json
```

`index.json` is the local authoring SSOT for the MVP. It stores:

```ts
interface ModelLibraryIndex {
  categories: ModelCategory[];
  families: ModelFamily[];
  versions: ModelVersion[];
  mounts: PlatformEquipmentMount[];
}
```

Missing files load as an empty model library with the default taxonomy. Changes
are written back to `index.json` with a short debounce.

The hardened storage layout can later split entries by durable model role:

```text
.tinder/model-library/
  categories.json
  platform/
  equipment/
  profile-index.json
```

External database identifiers and source refs are deferred until the actual
database table structure is available.

Categories are metadata/index records. They can be used for filtering and
display, but they are not the top-level storage partition.

`profile-index.json` stores the derived ownership index:

```text
platform_object_key -> profile_id / target_id
```

The index can be rebuilt from profiles, but keeping it explicit makes duplicate
checks and overwrite/relink prompts cheap and visible.

## Index Shape

```ts
interface ModelLibraryIndex {
  categoriesById: Map<string, ModelCategory>;
  familiesById: Map<string, ModelFamily>;
  versionsByKey: Map<string, ModelVersion>;
  versionsByFamilyId: Map<string, ModelVersion[]>;
  familiesByObjectKind: Map<ModelObjectKind, ModelFamily[]>;
  familiesByCategoryId: Map<string, ModelFamily[]>;
  mountsByPlatformObjectKey: Map<string, PlatformEquipmentMount[]>;
  platformProfileOwnerByObjectKey: Map<string, { profile_id: string; target_id: string }>;
}
```

`versionsByKey` uses the globally unique `object_key`.

## Profile Integration Flow

```text
ModelLibraryIndex
  -> selector chooses ModelVersion
  -> profile stores model_library_ref + id/version snapshot
  -> runtime config uses snapshot fields
```

Runtime config should not dereference the model library during export. Export
validation may use the library for warnings, but the exported contract should be
derived from the profile snapshot to keep the export deterministic.

## Mounting Relationship Flow

```text
Model library platform-version editor
  -> edits PlatformEquipmentMount
  -> writes canonical mount record

Profile associated-model editor
  -> edits the same PlatformEquipmentMount through the selected platform target
  -> writes canonical mount record
  -> profile stores export binding snapshot for the selected compute resource
```

The model library owns structural mounting facts such as slots, allowed equipment
models, defaults, and compatibility. The profile owns the current export/run
binding between:

- platform model target
- equipment slot or mounted object
- compute-resource branch
- concrete equipment model id/version snapshot

If a platform version defines mounts, every concrete equipment selection for that
platform profile must bind to a compute-resource branch. The model library can
therefore validate expected equipment, while the profile validates that each
mounted equipment object has an executable implementation branch.

## Duplicate Platform Config Rule

The project must maintain a single owner for each versioned platform model object
key:

```text
platform_object_key -> profile_id / target_id
```

When a user creates or selects a platform model version that is already owned by
another configuration profile/export target, the UI must ask whether to
overwrite/relink the existing owner. This rule is platform-only; equipment model
versions remain reusable across many platform profiles and compute bindings.

## Deletion Policy

Referenced model versions must not be physically deleted. The UI should change
their status to `deprecated` instead. Only unreferenced draft versions can be
deleted.

## Ownership Boundaries

```text
ModelVersion.parameter_fields
  owned by model library

PlatformEquipmentMount
  owned by model library

ComputeResource.implementation.runtime_artifact
  owned by compute resource branch

ProfileExportConfig.compute_object_bindings
  owned by configuration profile as export/run binding snapshots

RuntimeConfigV2.compute_object_bindings
  exported from profile snapshot
```

## Database SSOT Export

The model library should eventually expose a database-facing export that is
separate from runtime config. The export shape is intentionally deferred until
the external database table structure is reviewed.

MVP parameter fields support `string`, `bool`, `int`, and `double`. Database
source ids and table mappings should be added only after the external database
table structure is reviewed.
