# 00 Overview

## Status

- State: draft
- Created: 2026-05-11
- Last updated: 2026-05-11
- Next step: review the package with the user, then freeze MVP decisions before code changes.

## Summary

This task lands the `计算链路组装` board in the current `Tinder-Compiler` app.

The board's purpose is to make chain assembly operational rather than merely editable:

- simple authoring flow
- generated project configuration profiles
- generated/updated compute-instance metadata
- generated script/native implementation scaffolds
- documentation-linked interface hints and function skeletons

The current app already has a Chain Assembly foundation:

- data-root selection
- `.tinder` directory initialization
- profile listing and creation
- standard/custom resource trees
- drag-to-profile resource attachment
- in-app dialogs
- Electron preload file IO

The missing capability includes the legacy GUI workflow that edits resource-instance chain attachments through `PlatformResourceInstance.compute_nodes`, plus the higher-level generation workflow needed to produce project-usable resources.

## Goal

Add a native Chain Assembly board for assembling profile-managed compute instances stored under:

```text
<dataRoot>/.tinder/resources/standard/**/*.json
<dataRoot>/.tinder/resources/custom/**/*.json
```

The board should let users add standard and custom compute instances into profile `活跃资源` / `停用资源`, inspect and edit which canonical chain nodes a standard resource instance serves, define multiple custom compute nodes under one custom compute instance, freely place active custom nodes around built-in execution items, then generate/update the related profile, metadata, and implementation scaffold.

## Non-goals

- Do not port the old standalone GUI as-is.
- Do not introduce a new desktop shell.
- Do not merge resource-chain metadata into profile JSON files.
- Do not change runtime C++ behavior in the MVP.
- Do not require native dynamic-library compilation in the MVP.

## Key Context

Legacy GUI model:

- Resource instances were edited inside `project.platform_resources`.
- Chain links lived in `resource.compute_nodes`.
- Chain choices came from `CORE_CHAIN_IDS`.

Current app model:

- Resource instances are stored as separate JSON files in the target directory.
- Profile files and resource files are separate ownership boundaries.
- Chain docs are parsed into a generated chain catalog.

Therefore, the port should reuse the legacy behavior but adapt the storage and chain-node source.

Expanded product target:

- `配置档案`: profile JSON generated/updated from the board
- `计算实例 metadata`: resource JSON generated/updated from the board
- `计算实例 implementation`: Python or native scaffold generated/updated from the board
- `文档联动`: selected chain node shows doc-derived purpose/input/output/interface hints
- `接口自动化`: adding a compute node can also add a corresponding function skeleton to the implementation file

## Acceptance Criteria

- The task package is complete and self-contained.
- The roadmap can drive implementation without rereading the whole old GUI first.
- The architecture doc identifies storage boundaries and UI landing points.
- The task package treats profile/resource/scaffold generation as first-class scope.
- The verification doc defines future typecheck, build, and manual smoke checks.

## Mapping

- Slug: `target-directory-chain-editor-port`
- Repository: `D:\Tinder\Tinder-Compiler`
- Legacy reference: `D:\Tinder\Model\Model-P-v2\tools\nextstep-gui`
- Task ID: TBD
- Governance mapping: TBD
