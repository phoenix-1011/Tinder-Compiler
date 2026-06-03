# Model Library Module Overview

## Purpose

This package defines the planning surface for a project-local `模型库` module.

The module is the field SSOT for platform and payload/device model objects:

- model library organization
- model family identity
- versioned model object keys
- parameter field definitions
- optional default/config templates
- profile export binding support
- database-facing SSOT export support

It is intentionally separate from `计算资源`. Compute resources own executable
implementations, source files, runtime artifacts, and chain capability exposure.
The model library owns model identifiers and parameter-field contracts that the
simulation platform can parse.

## Core Principle

```text
模型库     = model id, version, object key, taxonomy, parameter fields, configs
计算资源   = reusable implementation branch, source/artifact, chain capability
配置档案   = export-time binding snapshot between platform model and compute objects
runtime config = platform model target + compute object bindings + execution model
```

The model library is the authoring SSOT for fields. A configuration profile still
stores export snapshots (`model_id`, `version`, `object_key`) so export remains
complete even when a library entry is later missing or temporarily unsynced.

## Target Organization

The current external model database appears organized as:

```text
库类型
  大类
    子类
      分类码
        具体型号
        版本
          配置 / 参数字段
```

Examples:

- `平台模型 / 飞机 / 预警机 / 3011101 / E-2D / 3011101001_1.2.0`
- `平台模型 / 飞机 / 战斗机 / 3011104 / F-16 / 3011104001_1.2.0`
- `设备模型 / 侦测感知 / 雷达 / 20101 / 雷达 Bravo / 201010001_1.2.0`

The local project module should preserve this hierarchy but avoid forcing the UI
to mirror the external card layout in the first slice.

## Relation To Existing Work

This task package builds on `profile-platform-model-export`:

- profile export targets already store platform model ids and versions
- compute resource bindings already store concrete compute object ids and versions
- runtime config already exports `.runtime.json`
- parameter values are not exported in runtime config

The first implementation should make those fields selectable from the model
library while keeping manual entry available.

## Delivery Order

The roadmap should align in this order:

1. design and freeze the model-library UIUX
2. implement local schema and storage
3. build the model-library management UI
4. link configuration profile export editing to the model library
5. revisit the database-facing SSOT export discussion

The database export is not the same artifact as runtime config. Runtime config is
for platform-model execution. The model-library SSOT export is for database
import/synchronization and will be designed after the model library foundation
is stable.
