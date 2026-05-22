# Profile Canvas UIUX Overview

## Purpose

This task package defines a Simulink-style canvas editor for configuration profiles. The canvas presents a profile's chain composition as a visual board with grouped lanes and draggable nodes, in place of the current list-based chain editor.

The canvas is strictly a projection UI layer. The configuration profile JSON remains the single source of truth for chain composition; the canvas neither stores nor persists chain semantics independently.

```text
profile.json (SSOT)
  resources[]              branch slots, enabled, folder
  custom_node_usages[]     anchor + arrayIndex
  ...

.tinder/state/canvas.json (UI projection only)
  focus target
  group / slot collapse
  scroll
  selection
  coverage filter
  flow-line visibility
  inspector dock + collapsed
```

This boundary preserves and extends prior decisions:

- B1 keeps profile resource rows as branch slots; the canvas inherits this and presents them visually.
- B6 keeps `计算实例` as the SSOT for resource families and branches; the canvas does not bypass it.
- B8 keeps "no duplicate `resource_instance_id` slots per profile"; the canvas enforces this visually through the pin metaphor (C25).

## Why A Canvas Now

The current chain editor (`ChainEditorView`) is a long flat list of canonical chain nodes plus interleaved custom usages. It is good for completeness but poor for:

- understanding chain shape by category at a glance
- focusing on a small relevant neighborhood instead of all 81 nodes
- seeing multi-coverage on one chain node without scrolling rows
- placing a custom usage by spatial intuition rather than picking an anchor from a dropdown

A canvas with grouped lanes, slot nodes with stacked coverage cards, custom nodes on a directional flow line, and a library-pin metaphor for membership / branch / activation directly addresses these, while keeping chain-ordering and branch semantics unchanged.

## What This Package Does Not Change

- the canonical chain order from `CHAIN_CATALOG`
- the runtime ordered dispatch and `action_index` model
- the branch model and shared-branch guard semantics (B1–B13 frozen)
- profile JSON schema for `resources`, branches, and custom usages
- compute-resource library structure (`计算实例 / 标准`, `计算实例 / 自定义`)

## Target User Experience

Two hard-switched application modes:

```text
配置档案编辑 (current default)
  Sidebar : 配置档案 tree + 计算实例 library
  Main    : list-based chain editor, branch editor, profile lifecycle, etc.

画布编辑 (new)
  Sidebar     : 计算实例 library only (family → branches, with pin)
  Top bar     : ← 返回 + profile dropdown + canvas actions
  Main        : canvas (grouped lanes of slot nodes + custom nodes on flow line)
  Inspector   : right-dock default, or bottom-dock; collapsible
```

Canvas mode is always profile-scoped; entered via right-click on a profile or the `画布` button on the existing chain editor toolbar, exited via the canvas top-bar `← 返回` button (or via C13 / C21 jump-out paths).

Within the canvas:

- chain nodes are grouped into collapsible panels by their `docSlug` (environment / platform / signal / ...)
- each group panel renders chain-node slot nodes in canonical order as a horizontal track
- a slot node displays its covering **standard** compute-resource cards stacked inside (multi-coverage allowed)
- custom usages are first-class **nodes** in the execution sequence — never inside slots, never decorations on a line
- a directional flow line (default visible, toggleable) is a sequence of edges connecting consecutive visible nodes (slot or custom) in canonical execution order
- a coverage filter silently hides uncovered, custom-free slots (no chip)
- standard resources are not draggable; profile membership and branch are managed via library `pin` (one click = add + select + activate)
- custom resources drag only onto edges of the flow line
- focus has two layers: lens highlight (default) and locked focus (double-click to fold non-neighbors)

## Relationship To Existing Packages

This package consumes the decisions of `profile-resource-branch-uiux` and does not modify them. Branch slot semantics, branch switching, the shared-branch guard, and storage shape are inherited unchanged.

This package supersedes the visual layer of the existing chain editor (`ChainEditorView`). The list view remains unchanged and serves as the reference UI (C18) — every canvas operation must map to a list-view operation.

## Non-Goals For This Package

- do not modify profile JSON schema
- do not change runtime export semantics
- do not introduce free graph topology — no free wires, no user-defined `(x, y)`, chain order is fixed
- do not reimplement branch management; the inspector embeds `ResourceBranchView` content
- do not replace the configuration-profile tree; both modes remain
