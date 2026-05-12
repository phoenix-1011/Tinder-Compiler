# Compute Resource Editor UIUX Overview

## Purpose

This package discusses the UIUX and product boundary for editing `计算实例` / compute resources.

It is intentionally separate from `target-directory-chain-editor-port`, which focuses on assembling a configuration profile and exporting runtime configuration. This package focuses on the resource-level workspace:

- what a compute resource is
- which reusable capabilities it exposes
- which code files implement it
- how interfaces are generated
- how runtime artifact association is surfaced
- where future build/check/package workflows can attach later
- how the resource is reused by configuration profiles

## Core Principle

Compute resource editing follows the reuse boundary:

```text
计算实例编辑器 = resource identity, reusable capability definitions, implementation files, runtime artifact association, generated interfaces, capability status
配置档案       = resource participation, active/disabled state, selected variant, custom node usage, chain placement
```

## Target User Experience

Selecting a compute resource opens a resource-level editor rather than only a small JSON form.

Recommended top-level tabs:

- `概要`
- `能力节点`
- `实现文件`
- `文档与接口`

`构建与产物` is hidden as a top-level MVP tab. Runtime artifact state is summarized in `概要` and `实现文件`.

`使用情况` is not a top-level tab in MVP. The overview can show a compact, read-only usage summary such as `被 3 个配置档案使用`, with optional expansion and links to open the owning configuration profile.

The shared shell is the same for standard and custom resources, but the `能力节点` workspace changes by resource kind:

- standard resources edit model/variant-scoped coverage of standard chain nodes
- custom resources edit reusable custom actions that can later be inserted by a configuration profile

## Relation To Chain Assembly

The chain assembly board may link into this editor, but it does not own resource implementation details. Resource edits are reusable across profiles; profile edits reference resources.

Execution order and custom-node placement stay in configuration profile chain editing. The compute resource editor can show usage impact and deep-link to the profile chain, but it should not become a second chain-ordering surface.
