# Profile Platform Model Export Requirement

## Background

Configuration profiles already decide which compute-resource branches participate
in a run. The simulation platform also needs a stable runtime config contract:

- each exported runtime config is scoped to one platform model object key such as
  `3012101_1.2.0`
- each compute-resource branch used by that exported platform model must be
  associated with one concrete compute object key such as `2012101_1.2.0`
- parameter values are not exported from this runtime config; the engine receives
  parameters from the platform database at runtime
- payload/device compute implementations are still loaded from the project's
  `.tinder/resources` compute-resource library

## Goals

- Let one authoring profile define multiple platform model export targets.
- Export complete runtime config documents scoped to platform model targets.
- Do not export separate payload/device model documents.
- Require every active compute-resource branch to have a concrete compute object
  key per platform model target before export.
- Keep compute-resource implementation data owned by resource branches.
- Make the mapping visible and editable from the configuration profile overview.

## Non-Goals

- Do not implement the full project model library in this slice.
- Do not export parameter values or default values.
- Do not change compute-resource branch storage.
- Do not require payload/device model documents under `bin/resources/models`.

## Profile Contract

Profiles store export targets under `export_config`:

```ts
interface ProfileExportConfig {
  schema_version: 1;
  platform_model_targets: ProfilePlatformModelTarget[];
}

interface ProfilePlatformModelTarget {
  target_id: string;
  platform_model_id: string;   // e.g. "3012101"
  platform_version: string;    // e.g. "1.2.0"
  platform_object_key?: string; // derived: "3012101_1.2.0"
  display_name?: string;
  enabled: boolean;
  compute_object_bindings: ProfileComputeObjectBinding[];
}

interface ProfileComputeObjectBinding {
  binding_id: string;
  resource_kind: "standard" | "custom";
  resource_instance_id: string;
  selected_branch_id: string;
  compute_object_id: string;      // e.g. "2012101"
  compute_object_version: string; // e.g. "1.2.0"
  compute_object_key?: string;    // derived: "2012101_1.2.0"
  display_name?: string;
}
```

The authoritative object key is derived from id and version. UI should not ask
users to hand-type `platform_object_key` or `compute_object_key`. Because the
derived key uses `_` as its separator, ids and versions must not contain `_`.

## Export Path

Each enabled target exports one runtime config document:

```text
<engine_root>/bin/resources/models/<platform_model_id>/<platform_model_id>_<platform_version>.runtime.json
```

Example:

```text
bin/resources/models/3012101/3012101_1.2.0.runtime.json
bin/resources/models/3012101/3012101_1.2.1.runtime.json
bin/resources/models/3200101/3200101_1.2.0.runtime.json
```

## Runtime Config Document

The exported document is the runtime config consumed by the platform model. It
records the platform object, compute object bindings, and execution model. It
does not contain parameter values.

```json
{
  "version": 2,
  "platform_model": {
    "model_id": "3012101",
    "version": "1.2.0",
    "object_key": "3012101_1.2.0"
  },
  "compute_object_bindings": [
    {
      "compute_object_key": "2012101_1.2.0",
      "compute_object_id": "2012101",
      "compute_object_version": "1.2.0",
      "resource_kind": "standard",
      "resource_instance_id": "radar-alpha",
      "branch_id": "hi-precision"
    }
  ],
  "ordered_execution_list": [],
  "standard_nodes": [
    {
      "standard_node_id": "runtime.signal.digitized_observables",
      "resource_instance_id": "radar-alpha",
      "branch_id": "hi-precision",
      "candidate_id": "digitized-observables",
      "display_name": "Digitized Observables",
      "module_id": "radar-alpha",
      "impl_kind": "cpp_dylib",
      "location": "bin/.tinder/resources/standard/radar-alpha/radar_alpha.dll",
      "function_name": "emit_digitized_observables",
      "enabled": true
    }
  ],
  "custom_nodes": []
}
```

## Validation

Validation is target-scoped:

- enabled targets require `platform_model_id` and `platform_version`
- model ids, object ids, and versions allow only letters, digits, dots, and
  hyphens; underscores are rejected to keep derived object keys unambiguous
- platform object keys must be unique within one profile
- every active profile compute-resource branch must have a binding in every
  enabled target
- each binding requires `compute_object_id` and `compute_object_version`
- binding resource kind, instance id, and branch id must resolve to an active
  profile resource slot
- selected branches must resolve to compute-resource metadata
- branch runtime artifact must be present before export
- standard branches must have effective candidates for exported standard nodes
- custom branches must have allocated `action_index` values for exported custom
  nodes

## UI

The configuration profile overview page owns this surface:

- the overview statistics include associated model targets as
  `display name（model id_version）`
- the `关联型号` row has a `+` action for creating a new associated model target
- each associated model label is clickable and opens a modal for that target
- the modal contains target editing and compute object bindings for one
  associated model target
- the modal supports updating and deleting the selected associated model target
- the selected target editor includes associated model id, version, display
  name, and enabled state
- the same modal contains the compute object binding table for that target
- sync action adds missing active resource branches into the binding table
- completeness status is shown per selected target
- export current target and export all enabled targets actions generate complete
  runtime config documents in the engine `bin/resources/models` path
- the chain page only performs runtime pre-checks; it does not export a separate
  execution-only runtime config

The chain and resource pages continue to own process composition and branch
selection. This page only maps those branches to platform database object keys.
