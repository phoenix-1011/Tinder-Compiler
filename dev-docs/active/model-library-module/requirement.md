# Model Library Module Requirement

## Goals

- Provide a project-local model library that can serve as the SSOT for model
  identifiers, versions, object keys, and parameter fields.
- Support the local model-library hierarchy:
  model type -> category -> family -> version -> configurations.
- Keep model management separate from compute resources.
- Let profile export configuration select platform models and payload/equipment
  models from the library.
- Preserve manual fallback entry until the model library is complete enough for
  all profiles.
- Do not export parameter values in runtime config.
- Keep platform-equipment mounting relationships consistent when edited from
  either the model library or the profile associated-model surface.

## Non-Goals

- Do not implement external database synchronization in the first slice.
- Do not model external database source ids before the table structure is
  reviewed.
- Do not move compute-resource implementation data into the model library.
- Do not make the model library responsible for engine execution order.
- Do not require all existing profiles to have model-library refs immediately.
- Do not implement full card-gallery visual parity with the external system in
  the MVP.

## Product Objects

```ts
type ModelObjectKind =
  | "platform_model"
  | "equipment_model";

interface ModelCategory {
  category_id: string;
  category_code: string;
  parent_category_id?: string;
  display_name: string;
  order?: number;
}

interface ModelFamily {
  family_id: string;
  object_kind: ModelObjectKind;
  category_id: string;
  display_name: string;
  aliases?: string[];
  country?: string;
  image_ref?: string;
  status: "draft" | "active" | "deprecated";
}

interface ModelVersion {
  model_id: string; // concrete model id under the family category
  version: string; // x.x.x
  object_key: string; // derived: model_id + "_" + version
  family_id: string;
  display_name?: string;
  status: "draft" | "active" | "deprecated";
  parameter_fields: ModelParameterField[];
  configurations?: ModelConfiguration[];
}
```

`platform_model` versions are profile export targets. `equipment_model` versions
are concrete payload/device objects that can be bound to compute-resource
branches.

## Numbering Rules

See `06-repository-conventions.md` for the shared repository convention. This
section keeps the requirement-facing details in the same shape.

`object_key = model_id + "_" + version`.

`version` must use `x.x.x`.

The repository uses three layers for both platforms and equipment:

```text
category_code -> model_id -> version
```

`category_code` is the type/classification code. It is used for taxonomy,
filtering, validation, and candidate generation. It is not a versioned model
object and must not be selected by a profile export target directly.

`model_id` is the concrete platform or equipment model id under one
`category_code`. `model_id + version` is the globally unique versioned model
object that profiles, runtime config, and future database export may reference.

Entity platform `category_code` values use the existing Model-P entity numbering
families:

| Prefix | Meaning |
| --- | --- |
| `301` | 兵力实体平台，例如飞机、舰船、潜艇、车辆、单兵、阵地 |
| `302` | 弹药实体平台 |
| `303` | 对抗实体平台 |
| `304` | 设施实体平台 |

For `301` force entity platforms, the 4th digit encodes domain:

| 4th digit | Domain |
| --- | --- |
| `0` | 太空 |
| `1` | 空中 |
| `2` | 水面 |
| `3` | 水下 |
| `4` | 陆地 |

For `302`, `303`, and `304` entity platforms, the 4th digit is `0`.

Model-P classification uses progressively longer entity prefixes:

| Length | Level | Example |
| --- | --- | --- |
| 3 | 基础实体族 | `301` 平台 |
| 5 | 大类 | `30111` 飞机 |
| 7 | 种类 | `3011104` 战斗机 |
| 9 | 具体类 | `301110499` 战斗机实例类 |

For repository authoring, these Model-P platform prefixes are treated as
platform `category_code` values. A concrete platform model must be created under
one category before it can have versions. For example, `3011101` can mean the
`预警机` category, while a concrete model under it can use a `model_id` such as
`3011101001`, producing `3011101001_1.2.0`.

Equipment `category_code` values start with `20`.

| Prefix | Meaning |
| --- | --- |
| `201` | 侦测感知 |
| `20101` | 雷达 |
| `20102` | 声纳 |
| `20103` | 信号侦察 |
| `20104` | 光电 |
| `20105` | 红外 |
| `20106` | 磁探 |
| `202` | 电子对抗 |
| `20201` | 有源电子干扰 |
| `20202` | 无源电子干扰发射器 |
| `203` | 武器系统 |
| `20301` | 导弹发射系统 |
| `20302` | 火炮系统 |
| `20303` | 定向能 |
| `20304` | 布放设备 |
| `204` | 通信设备 |
| `20401` | 作战数据链 |
| `20402` | 无线电链路 |
| `20403` | 卫星通信 |
| `20405` | 浮标数据链 |
| `205` | 平台机动 |
| `20501` | 旋转翼机动设备 |
| `20502` | 固定翼机动设备 |
| `20503` | 地面平台机动设备 |
| `20504` | 水面机动设备 |
| `20505` | 两栖机动设备 |
| `20506` | 水下机动设备 |
| `20507` | 常规导弹机动设备 |
| `20508` | 巡航导弹机动设备 |
| `20509` | 画像导弹机动设备 |
| `20510` | 空间平台机动设备 |
| `206` | 指挥控制 |
| `20601` | 指控设备 |
| `20602` | 出动回收系统 |
| `207` | 数据处理设备 |
| `20701` | 平台数据处理组件 |
| `20702` | 联合信息处理组件 |
| `208` | 综合保障 |
| `20801` | 后勤保障 |
| `20802` | 维修防护 |
| `20803` | 工程装备 |
| `209` | 其他 / 自定义设备 |

For repository authoring, these equipment prefixes are treated as equipment
`category_code` values. A concrete equipment model must be created under one
category before it can have versions. For example, `20101` can mean the `雷达`
category, while a concrete radar model can use a `model_id` such as
`201010001`, producing `201010001_1.2.0`.

## Parameter Fields

Parameter fields describe what the platform model can parse. User-provided
values are defaults or templates, not final simulation values.

```ts
type ModelParameterValueType = "string" | "bool" | "int" | "double";

interface ModelParameterField {
  field_key: string;
  display_name: string;
  value_type: ModelParameterValueType;
  required: boolean;
  value_range?: string;
  unit?: string;
  description?: string;
  default_value?: string;
}

interface ModelConfiguration {
  config_id: string;
  display_name: string;
  description?: string;
  default_values: Record<string, string>;
}
```

Configurations are version-owned. A configuration belongs to exactly one
`ModelVersion`; cross-version sharing is not part of the MVP.

## Mounting Relationships

The structural platform-equipment relationship is model-library data. A profile
owns the run/export binding that selects which compute-resource branch implements
one mounted equipment object.

```ts
interface PlatformEquipmentMount {
  mount_id: string;
  platform_object_key: string;
  slot_id: string;
  display_name: string;
  required: boolean;
  cardinality: "single" | "multiple";
  allowed_equipment_object_keys: string[];
  default_equipment_object_key?: string;
}
```

Mounting relationships are owned by the platform `ModelVersion`, not by
`ModelFamily`. The persisted mount file is version-scoped so different platform
versions can define different slots, compatibility, and defaults.

The same mounting relationship may be edited from two UI entry points:

- model library platform-version detail
- profile `关联型号` editing surface

Both entry points must persist the same normalized record. There must not be one
copy in the model library and a second divergent copy in the profile.

## Profile Binding

Profile export configuration should store both a library ref and an export
snapshot:

```ts
interface ModelLibraryRef {
  object_kind: ModelObjectKind;
  family_id: string;
  model_id: string;
  version: string;
}

interface ProfilePlatformModelTarget {
  model_library_ref?: ModelLibraryRef;
  platform_model_id: string;
  platform_version: string;
  platform_object_key?: string;
}

interface ProfileComputeObjectBinding {
  model_library_ref?: ModelLibraryRef;
  mount_id: string;
  slot_id: string;
  compute_object_id: string;
  compute_object_version: string;
  compute_object_key?: string;
  resource_kind: "standard" | "custom";
  resource_instance_id: string;
  selected_branch_id: string;
}
```

The snapshot fields remain authoritative for export. The library ref is used for
selection, validation, and field-schema lookup.

`ProfilePlatformModelTarget.model_library_ref` must point to a `platform_model`.
`ProfileComputeObjectBinding.model_library_ref` must point to an
`equipment_model`.

## Validation

- `model_id + version` must be globally unique across platform and equipment
  models.
- `version` must use `x.x.x`.
- `object_key` must use `<model_id>_<x.x.x>`.
- platform `category_code` must use the `301`/`302`/`303`/`304` entity
  platform numbering families.
- equipment `category_code` must start with `20`.
- `301` platform category codes must have a valid 4th digit domain marker.
- `302`/`303`/`304` platform category codes must use `0` as the 4th digit.
- `model_id` must identify a concrete model under its family category, not the
  category itself.
- `model_id` should use its owning `category_code` as a prefix unless a later
  external database rule defines a stricter concrete-model numbering scheme.
- `model_id` and `version` must not contain `_` because `_` is the object-key
  delimiter.
- `object_key` is derived and should not be hand-edited.
- one `(model_id, version)` pair must resolve to one model version globally.
- each model family has exactly one category in the MVP.
- one versioned platform model object key can have at most one owning
  configuration profile/export target in the project.
- creating or selecting a duplicate platform model object key must ask whether to
  overwrite/relink the existing configuration profile/export target.
- the one-profile rule does not apply to equipment models; the same equipment
  model version can be mounted or bound by multiple platform profiles.
- each concrete mounted equipment object in a profile platform config must bind
  to one compute-resource branch.
- each equipment compute binding must resolve to a valid platform-version mount
  when the platform version defines mounts.
- active profile export targets should warn when their library ref is missing.
- manual entries remain valid if the id/version/path segment rules pass.
- deprecated model versions can remain referenced but should warn before export.
- draft model versions cannot be selected by default for export unless manual
  override is explicitly allowed.
- mounting relationships edited from model-library UI and profile UI must produce
  the same persisted record after reload.
- referenced model versions cannot be physically deleted; they can only be
  deprecated. Only unreferenced draft versions can be deleted.
- model-library configurations do not link into profiles in the MVP.
