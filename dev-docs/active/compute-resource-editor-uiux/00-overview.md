# Compute Resource Editor UIUX Overview

## Purpose

This package discusses the UIUX and product boundary for editing `计算实例` / compute resources.

It is intentionally separate from `target-directory-chain-editor-port`, which focuses on assembling a configuration profile and exporting runtime configuration. This package focuses on the resource-level workspace:

- what a compute resource is
- which reusable capabilities it exposes
- which code files implement it
- how interfaces are generated
- how build/check/package workflows are surfaced
- how the resource is reused by configuration profiles

## Core Principle

Compute resource editing follows the reuse boundary:

```text
计算实例编辑器 = resource identity, reusable capability definitions, implementation files, build configuration, generated interfaces
配置档案       = resource participation, active/disabled state, selected variant, custom node usage, chain placement
```

## Target User Experience

Selecting a compute resource opens a resource-level editor rather than only a small JSON form.

Recommended top-level tabs:

- `概要`
- `能力节点`
- `实现文件`
- `构建与产物`
- `文档与接口`
- `使用情况`

## Relation To Chain Assembly

The chain assembly board may link into this editor, but it does not own resource implementation details. Resource edits are reusable across profiles; profile edits reference resources.

