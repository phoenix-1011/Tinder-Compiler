# Profile Canvas Freeform UIUX Requirement

## Background

The first canvas (`profile-canvas-uiux`, Phases 1–5) presented chain
composition as vertically-stacked, scrollable group panels with
edges only within each panel. Hands-on feedback identified two core
gaps:

1. The visual is unlike Simulink (the user's reference model) —
   group panels stack and scroll instead of laying out on a
   navigable 2-D surface.
2. The execution-order edges only travel within a single category
   panel, so the cross-category structure of the canonical execution
   order is invisible. The user must mentally weave from one panel
   to the next.

This package redesigns the canvas around `@xyflow/react`, with
draggable category clusters arranged on a pan/zoom viewport,
canonical-order edges that cross clusters, and free-positionable
custom nodes.

## Goals

- Free-positioning canvas with pan + zoom (Simulink-style)
- Category clusters as draggable, resizable-by-content containers
- Chain nodes locked to their canonical sub-order inside their cluster
- Custom nodes free-positioned, anchor-snapped on drop
- Edges follow canonical execution order across clusters using
  orthogonal `smoothstep` routing
- Lens highlight on selection (canonical ±1 neighbors stay at full
  opacity, others fade)
- Per-profile persisted layout (cluster positions, custom positions,
  viewport)
- All existing edit / pin / candidate / save semantics preserved

## Non-Goals

- No edit to chain order (canonical is read-only)
- No new pipeline shapes (no parallel chains, no conditional branches)
- No multi-profile layout sharing in MVP
- No light theme in MVP
- No replacing list view; list view stays as reference UI (C18 carried)
- No new profile JSON schema fields

## Modes

Two hard-switched modes from C2 still apply:

- `配置档案编辑` (current default) — profile tree + list editor
- `画布编辑` (now the freeform canvas) — pan/zoom react-flow viewport

Entry / exit paths from C3 unchanged (profile right-click `画布编辑`,
chain editor toolbar `画布` button, canvas top-bar `← 返回`).

## Canvas Layout

### Viewport

The canvas main area is a `<ReactFlow>` instance occupying the cell
between sidebar (library) and inspector (right or bottom dock).
Pan and zoom are react-flow defaults:

- Pan: drag canvas background
- Zoom: scroll wheel (with Ctrl on Windows for finer control), pinch
  on touchpad, react-flow `<Controls />` for +/-/fit
- Background: react-flow `<Background />` with subtle grid (16 px)
  using `--tc-canvas-grid-color` for theming

Viewport state (x, y, zoom) is persisted in `canvas.json` per profile
and restored on canvas mount.

### Category Clusters (`categoryGroup` node type)

Each of the 10 `CHAIN_CATALOG.groups` becomes a single react-flow
node of type `categoryGroup`:

```text
┌──────────────────────────┐
│ 平台基础链路 · 6/6        │ ← header: docTitle + coverage count
├──────────────────────────┤
│ ┌──────────────────────┐ │
│ │ 1 · 裁决影响          │ │
│ │   雷达 Alpha · prod   │ │
│ ├──────────────────────┤ │
│ │ 2 · 设备裁决          │ │
│ │   ...                 │ │
│ └──────────────────────┘ │
└──────────────────────────┘
```

- Width: fixed (~220 px)
- Height: auto (sum of chain-node card heights + header + padding)
- (x, y): user-draggable; persisted in `canvas.json` keyed by `docSlug`
- Chain nodes inside are NOT individually draggable; they belong to
  the cluster and move with it

### Chain Nodes (rendered inside `categoryGroup`)

Each chain node is a fixed-position child of its cluster, ordered by
canonical sub-order within the group. Visual content matches the
old `SlotCard`:

- Order badge + display name + doc title
- Stacked standard coverage cards (up to 3 + `+N` chip)
- Selection / lens / orphan visual states (carried from C26 / C10)

### Custom Nodes (free-positioned, `customNode` node type)

Each entry in `profile.custom_node_usages` becomes its own react-flow
node at the canvas root (not inside any group). Position is
user-controlled and persisted in `canvas.json` keyed by `arrayIndex`.

**Anchor-snap on drop**: when a custom node finishes being dragged
(`onNodeDragStop`), its position is adjusted to be near the chain
node identified by `usage.anchorChainId` (or near the canonical
predecessor when anchorChainId is null):

- Locate the anchor's cluster + chain node DOM position
- Offset the custom by `+24 px` to the right of the cluster
- Vertically align with the anchor chain node (± a small bin if a
  custom already occupies that slot)
- Don't snap when the user holds `Shift` during drop (escape hatch)

This keeps customs visually associated with their anchor without
locking position absolutely.

### Edges

All edges are of a custom type `executionEdge` extending react-flow's
`smoothstep`:

- Connect consecutive nodes in canonical execution order (chain or
  custom)
- Solid line, slight rounded corners (`smoothstep` with small
  `borderRadius`)
- Color: `--tc-canvas-edge-color` (muted gray)
- Edges incident to a disabled custom render dashed grey (C17)
- Edges incident to an orphan custom render with a warning chip
  (C26) — visual TBD in implementation

## Lens Highlight (C10 retained)

When a node is selected, react-flow's selection state drives a CSS
class on the wrapper. The class triggers:

- Selected node + its first-degree canonical neighbors: full opacity
- All other nodes: fade to ~45 %

No folding, no filter — just opacity. Pan/zoom replaces the old
locked-focus mode.

## Removed UX Elements

- Coverage filter (toggle gone). All 84 chain nodes always visible.
- Locked focus mode (`F` shortcut gone, "聚焦中" pill gone).
- Group panel collapse (no longer applicable — group is a cluster, not
  a panel).
- The Phase-5 `保存 / 重置` checkpoint UX stays; `已保存 / 未保存` pill
  stays; exit guard stays.

## Inspector

Inspector content unchanged from `profile-canvas-uiux` Phase 3. The
inspector renders the same content router by selection type (slot /
coverage card / custom node) with embedded `ResourceBranchView`
skinny content for coverage / custom.

The inspector remains a dockable overlay (right or bottom). In
react-flow terms it sits **outside** the `<ReactFlow>` instance, in
its existing CSS grid cell, so it does not pan/zoom.

## Library Sidebar

Library sidebar unchanged from C26 — 3-level for custom (family →
branch → node), 2-level for standard, pin three-state, custom node
rows draggable. Drag target:

- Library custom node → drop on canvas (anywhere) → creates a usage
  with `anchorChainId` resolved by **nearest chain node** (by Y
  position relative to clusters) and auto-pin (per C26).
- Custom node already on canvas → drag to reorder/re-anchor — drop
  triggers anchor-snap.

## Persistence

`canvas.json` schema is extended additively. Existing fields stay.

```ts
interface CanvasPerProfileState {
  // ... existing fields (coverageFilter, flowLineVisible removed;
  //     selection, inspector, focus stay) ...

  /**
   * react-flow viewport state (pan + zoom). Restored on canvas mount;
   * react-flow's onViewportChange writes here.
   */
  viewport: { x: number; y: number; zoom: number };

  /**
   * Per-cluster (x, y) keyed by docSlug. Clusters absent from the
   * map fall back to the default horizontal-swimlane layout.
   */
  clusterPositions: Record<string, { x: number; y: number }>;

  /**
   * Per-custom-usage (x, y) keyed by arrayIndex (stable identifier
   * used by the existing custom_node_usages mutations). Usages
   * absent from the map use the anchor-snap default for their
   * anchor chain node.
   */
  customPositions: Record<number, { x: number; y: number }>;
}
```

`coverageFilter` and `flowLineVisible` are deprecated but kept in the
schema for back-compat; they're ignored by the new canvas.

## Default Layout (First-Open Heuristic)

When `clusterPositions` has no entry for a docSlug, position it by:

- Order clusters left-to-right by the canonical order of their first
  chain node
- Place at y=0 (single row swimlane); cluster width = 220 px;
  cluster gap = 60 px (room for inter-cluster edges)
- When the row would exceed 2000 px wide, wrap to a second row
  (~100 px below)

When `customPositions` has no entry for a usage, anchor-snap to its
canonical anchor's cluster as described above.

`viewport` defaults to `{ x: 0, y: 0, zoom: 0.85 }` so the first row
fits in a standard editor window.

## Theming

All canvas-specific colors flow from CSS variables under
`--tc-canvas-*`. MVP defines a dark palette only:

```css
:root {
  --tc-canvas-bg:          #1e1e1e;
  --tc-canvas-grid-color:  rgba(255,255,255,0.04);
  --tc-canvas-cluster-bg:  rgba(255,255,255,0.025);
  --tc-canvas-cluster-border: var(--tc-border-soft);
  --tc-canvas-node-bg:     var(--tc-bg-editor);
  --tc-canvas-edge-color:  var(--tc-fg-muted);
  --tc-canvas-selected:    var(--tc-accent);
  --tc-canvas-lens-far-opacity: 0.45;
}
```

Light-theme follow-up (planned, not in MVP): swap the variables to a
MATLAB-like palette (off-white canvas `#fafafa`, light grid, teal/
amber block accents, gold `#ffcc00` selection ring).

## C-Series Carry-Overs (Spec Pointers)

| Decision | Status |
| --- | --- |
| B1–B13 (branch model) | Unchanged, still in force |
| C1 SSOT boundary | Still in force — clusterPositions / customPositions / viewport are UI state, not profile data |
| C8 drag semantics | Unchanged (standard not draggable, custom node draggable) |
| C13 shared-branch guard | Unchanged |
| C14 + 新建自定义节点 | Unchanged |
| C17 disabled custom visual (dashed) | Unchanged |
| C18 list view reference UI | Unchanged |
| C19 no schema changes | Unchanged |
| C20 edit parity | Unchanged |
| C21 code-edit jump | Unchanged |
| C22 custom = first-class node | Unchanged |
| C23 directional flow line | Unchanged in intent, edges now react-flow not inline DOM |
| C24 split adjustment paths | Unchanged |
| C25 pin metaphor | Unchanged |
| C26 custom node placement model | Unchanged |
| **C6 coverage filter** | **Withdrawn** — show all 84 chain nodes always |
| **C10 locked focus (heavy layer)** | **Withdrawn** — pan/zoom replaces it |
| C10 lens (light layer) | Retained |
| **C16 tech choice** | **Re-evaluated per its own conditional clause (trigger #3); now `@xyflow/react`** |

## Out Of Scope (MVP)

- Light theme + MATLAB palette
- Multi-profile shared layouts
- Cluster resize handles (size is content-driven)
- Mini-map (react-flow `<MiniMap />`; deferred to polish)
- Multi-select bulk operations
- Edge labels
- Animated edge transitions
- "Fit to selection" zoom action
