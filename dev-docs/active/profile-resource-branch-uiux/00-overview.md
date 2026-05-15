# Profile Resource Branch UIUX Overview

## Purpose

This task package defines the product model and UIUX for resources under a configuration profile.

The key change from the current implementation is that a configuration profile should not mentally consume a whole `计算实例`. It consumes a selected editable branch of a compute-resource family.

```text
计算实例 = resource family / reusable container
分支     = complete editable implementation version
配置档案 = selected branch slots, activation, folders, and chain orchestration
```

Global `计算实例` remains the management surface for the resource family and all of its branches. It is where users review usage, maintain shared branches, create/copy/delete branches, and reason about cross-profile impact.

`计算实例` is the source of truth for resource families and branches. A configuration profile is a projection layer: it selects branches, activates/deactivates slots, groups slots, and owns chain orchestration, but it does not own duplicated branch implementation content.

The package exists so the branch model can be aligned before changing schema, storage, or UI behavior.

## Current Discussion Baseline

The following points are considered aligned for this package:

- A configuration profile associates with a compute-resource branch, not an entire compute resource.
- A branch is the effective editable unit used by runtime export.
- Branch content must be fully editable, including capability metadata, selected nodes, implementation files, and runtime artifact association.
- Configuration-profile context is the primary user workflow; users should be able to inspect and edit the branch they are actually using without leaving the profile mental model.
- Editing from a profile must not accidentally mutate a shared branch used elsewhere. If the selected branch is shared, the profile-context editor should block direct edits, show the impact/risk, and offer two paths: create a new branch for the current profile slot, or jump to the global compute-instance branch editor for deliberate shared modification.
- Fast switching between implementation branches inside a profile must be preserved.

## Core Principle

Use branch references as the storage and export truth, but keep the UI centered on compute-resource families.

```text
Profile row:
  雷达 Alpha
  当前分支：production-a  v

Stored ref:
  resource_instance_id = "radar-alpha"
  selected_branch_id   = "production-a"
```

This preserves two important properties:

- runtime/export always resolves to one deterministic branch
- users can quickly switch the selected branch for a compute instance in the profile UI

Source-of-truth boundary:

```text
计算实例 SSOT:
  resource family metadata
  branch metadata
  branch capabilities
  branch implementation files
  branch runtime artifacts

配置档案 projection:
  selected_branch_id
  enabled / disabled
  profile-local folder
  custom-node chain placement
```

## Relationship To Existing Packages

This package refines and partially supersedes earlier resource/variant language:

- `compute-resource-editor-uiux` treats `model_variants[]` as standard-resource selection variants under one implementation.
- This package promotes branch to a larger unit: a branch can carry complete implementation state and editable resource content.
- `target-directory-chain-editor-port` already states that profiles own participation and chain orchestration. This package clarifies that participation points at a branch slot.

## Target User Experience

Under a configuration profile, resource rows should behave like compact branch-slot labels:

```text
配置档案
  production
    链路
    活跃资源
      雷达 Alpha · production-a
      审计工具集 · default
    停用资源
      遗留平台服务 · archive
    使用与版本
```

Expected operations:

- click resource row: open the selected branch in profile context
- branch switching: available in the opened main workspace, not directly in the sidebar tree
- context menu: create branch from current, manage branches, activate/deactivate, move folder, remove from profile
- edit branch: edit metadata, capability nodes, implementation files, runtime artifact, and validation issues
- shared branch guard: profile-context editing is allowed only for branches used exclusively by the current profile slot; shared branches show a warning plus `创建当前档案分支` and `在计算实例中打开并修改`

## Non-Goals For This Package

- Do not implement code changes yet.
- Do not finalize every schema migration detail before the product model is agreed.
- Do not define build/compile workflows beyond preserving branch-owned implementation files and artifacts.
- Do not remove support for legacy resource files in this discussion.
