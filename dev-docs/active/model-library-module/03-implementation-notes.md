# 03 Implementation Notes

## Naming

Use `关联型号` in the profile export UI for platform model targets.

Use `模型库` for the management module.

Use `计算资源对象` for the id/version assigned to a compute-resource branch in a
profile export target.

## Object Keys

`object_key = model_id + "_" + version`.

`version` must use `x.x.x`. The full object key must use
`<model_id>_<x.x.x>`.

Validation must reject `_` inside `model_id` and `version`, and
`model_id + version` must be globally unique across platform and equipment
models.

Platform and equipment numbering use two separate fields:

- `category_code` is the type/classification code.
- `model_id` is the concrete model id under that category.

Platform `category_code` values use the `301`/`302`/`303`/`304` entity platform
families. Equipment `category_code` values start with `20`.

Profiles, runtime config, and database-facing exports must reference concrete
versioned model objects, not categories. For example, select
`3011101001_1.2.0` for a concrete early-warning aircraft model rather than
`3011101_1.2.0` for the `预警机` category.

Do not let users directly edit `object_key`; show it as derived text.

## Manual Entries

Manual profile entries should have no `model_library_ref`.

The MVP model-library UI does not show lifecycle status labels or status
transition actions. It should show binding provenance/completeness separately:

- `来自模型库`
- `手动填写`
- `模型库缺失`

## Field Defaults

`default_value` belongs to the model library as a template/default. It is not the
actual simulation value and is not exported in runtime config.

MVP parameter fields are edited inline in the version detail table. Adding a
field inserts a new row directly; it does not open a dialog.

- `value_type` supports `string`, `bool`, `int`, and `double`
- `value_range` is stored as a string and is not parsed by the UI
- `default_value` is a string
- configuration `default_values` are `Record<string, string>`

## External Database

Do not add source ids, external table ids, or import/sync fields in the MVP.
Those fields should be designed after reviewing the actual external database
table structure.

## Delete Policy

Referenced model versions are not physically deleted. Unreferenced versions can
be deleted.

## Profile Binding Completeness

When a platform version defines mounts, every concrete mounted equipment object
must have a compute-resource branch binding in the owning profile. This rule
lets the model library and the profile validate each other.
