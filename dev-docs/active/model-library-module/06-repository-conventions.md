# Repository Conventions

This document records model-library conventions that should be reused by schema,
UI, profile linkage, runtime config, and future database export work.

## Platform And Equipment Layers

Both platform models and equipment models use the same three-layer structure:

```text
category_code -> model_id -> version
```

- `category_code` is the classification/type code. It is not a versioned model
  object.
- `model_id` is the concrete model id under one category.
- `version` belongs to the concrete model.
- `object_key = model_id + "_" + version`.

Profiles, runtime config, and future database export must reference concrete
versioned model objects, not categories.

Examples:

| Layer | Platform example | Equipment example |
| --- | --- | --- |
| `category_code` | `3011101` 预警机 | `20101` 雷达 |
| `model_id` | `3011101001` E-2D | `201010001` 雷达 Bravo |
| `object_key` | `3011101001_1.2.0` | `201010001_1.2.0` |

## Category Code Rules

The executable default category seed lives in
`packages/nextstep/src/model-library.ts`:

- `platformCategories()` is aligned to Model-P entity category/variety
  classifiers.
- `equipmentCategories()` is aligned to the equipment category list in this
  task package.
- UI grouping nodes may exist for navigation, but concrete models should be
  created under standard leaf categories.
- The platform sidebar does not show `301` as a root node. It shows `3010`,
  `3011`, `3012`, `3013`, and `3014` as first-level roots for force-entity
  platform domains, alongside `302`, `303`, and `304`.

Platform category codes use Model-P entity classification.

| Prefix | Meaning |
| --- | --- |
| `301` | 兵力实体平台 |
| `302` | 弹药实体平台 |
| `303` | 对抗实体平台 |
| `304` | 设施实体平台 |

For `301`, the 4th digit encodes the domain:

| 4th digit | Domain |
| --- | --- |
| `0` | 太空 |
| `1` | 空中 |
| `2` | 水面 |
| `3` | 水下 |
| `4` | 陆地 |

For `302`, `303`, and `304`, the 4th digit must be `0`.

Equipment category codes start with `20`.

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

## Concrete Model Rules

- `model_id + version` must be globally unique across platform and equipment
  models.
- `version` must use `x.x.x`.
- `model_id` and `version` must not contain `_`.
- `object_key` is derived and must not be hand-edited.
- `model_id` must identify a concrete model under a category, not the category
  itself.
- `model_id` should use its owning `category_code` as a prefix unless a later
  external database rule defines a stricter concrete-model numbering scheme.

## Profile And Export Rules

- The profile associated-model UI selects concrete platform model versions.
- Every concrete mounted equipment model in a profile platform config must bind
  to one compute-resource branch.
- A project can have at most one owning profile/export target for the same
  versioned platform object key; duplicates ask whether to overwrite or relink.
- Runtime config exports selected concrete ids and versions. It does not export
  parameter values.
