# Profile Canvas Freeform UIUX Overview

## Purpose

This task package redesigns the configuration-profile canvas as a
free-positioning, Simulink-style board built on `@xyflow/react`. It
supersedes the visual layer of `profile-canvas-uiux`; the underlying
branch model, pin metaphor, candidate / activation paths, library,
inspector content, save/reset checkpoint, and exit-guard semantics
all remain in force unchanged.

The pivot is driven by hands-on UX feedback: the current canvas
groups chain nodes into vertically-stacked lanes that scroll, which
neither matches a Simulink mental model nor lets users arrange the
view to their working context. The new design lets the user move
category clusters freely on a pan/zoom canvas, with edges following
the canonical execution order across clusters and custom nodes
positionable anywhere.

## Why Now (C16 Trigger)

The previous package froze C16 with a conditional re-evaluation
clause:

> Trigger to re-evaluate react-flow (primary candidate) or X6 — adoption is reconsidered if any of:
> (1) chain-node order becomes user-editable (breaks canonical order);
> (2) parallel chains / conditional branches / sub-chains are introduced (breaks single-line);
> (3) **nodes gain user-defined (x, y) positions**;
> (4) self-implementation of flow line + hit-testing + focus rerouting exceeds ~1500 LOC.

Trigger #3 is now explicitly met — category clusters and custom
nodes carry user-controlled (x, y) positions. Adopting `@xyflow/react`
is therefore *within* the frozen C16 envelope, not a spec drift.

## What Stays From `profile-canvas-uiux`

- B1–B13 branch model (resource family / branches / selected_branch_id)
- C25 library pin metaphor (3-state, family-radio, custom unpin cascade)
- C24 split adjustment paths (pin / activate / candidate)
- C20 edit parity — every list-view edit reachable from canvas
- C18 list view as reference UI
- C19 no profile JSON schema changes
- C13 shared branch guard (now a dialog; bubble still TBD per Phase 5 note)
- C21 code-edit jump-out
- C26 custom node placement model (anchor + arrayIndex; soft-orphan)
- C14 `+ 新建自定义节点` library entry
- Checkpoint model (保存 / 重置 / dirty pill / exit guard)
- Inspector content router (slot / coverage / custom)
- Library `CanvasLibrary` component
- Top bar (icon back / sidebar / profile dropdown / save / reset)

## What Changes / Is Removed

| Old | New |
| --- | --- |
| Vertical-stacking group panels + scroll | `@xyflow/react` canvas, pan + zoom |
| Per-group horizontal flow track | Free 2-D positioning of category clusters |
| Edges only within a category panel | Edges follow canonical execution order across clusters |
| Custom nodes confined to seams between adjacent chain nodes in the same panel | Custom nodes free-positioned, anchor-snap on drop |
| C6 coverage filter (silent hide of uncovered slots) | Removed — show all 84 nodes always |
| C10 locked focus (±N neighbors + group fold) | Removed — pan/zoom replaces it |
| C10 lens highlight | Retained |
| Inline DOM edges (Unicode `══►` → CSS line) | react-flow `smoothstep` orthogonal edges |
| CSS Grid `1fr / 320px` body | react-flow viewport + dockable inspector overlay |

## Relationship To Existing Packages

- **Supersedes** `profile-canvas-uiux` for the canvas rendering layer.
  That package can be archived once D-series is frozen and Phase 1 lands.
- **Inherits** `profile-resource-branch-uiux` (B1–B13).
- **Untouched**: list view (`chain-editor-view`), profile JSON schema,
  runtime export pipeline, resource branch editor.

## Non-Goals

- No changes to profile JSON schema (still C19-equivalent)
- No changes to runtime export / canonical order
- No graph topology editing (chain order remains canonical; users
  cannot reorder chain nodes, only their visual containers)
- No undo/redo across canvas sessions (checkpoint model is the
  rollback surface)
- No light theme in MVP (planned follow-up — see D-series)
- No multi-profile shared layouts (per-profile layouts only)

## Target User Experience

Entering canvas mode shows the same library on the left and inspector
on the right as today. The center is now a react-flow viewport with:

```text
┌──────────────────────────────────────────────────────────────┐
│ ┌──────────┐    ┌──────────┐                    ┌──────────┐ │
│ │ 平台基础  │──→ │ 通信链路 │──→ ... ──→         │ 维护链路 │ │
│ │ ┌──────┐ │    │ ┌──────┐ │                    │ ┌──────┐ │ │
│ │ │ n=1  │ │    │ │ n=6  │ │                    │ │ n=82 │ │ │
│ │ ├──────┤ │    │ ├──────┤ │                    │ ├──────┤ │ │
│ │ │ n=2  │ │    │ │ n=7  │ │                    │ │ n=83 │ │ │
│ │ ├──────┤ │    │ ├──────┤ │                    │ ├──────┤ │ │
│ │ │ n=3  │ │    │ │ n=8  │ │                    │ │ n=84 │ │ │
│ │ └──────┘ │    │ └──────┘ │                    │ └──────┘ │ │
│ └──────────┘    └──────────┘                    └──────────┘ │
│                                                              │
│        ⌬ custom (free-positioned, anchored to n=4)           │
│                                                              │
│                                                  zoom: 100%  │
└──────────────────────────────────────────────────────────────┘
```

- Chain nodes sit inside category clusters in canonical sub-order.
- Clusters can be dragged to any position; their chain nodes follow.
- Edges connect consecutive nodes in canonical execution order,
  routing orthogonally between clusters (`smoothstep`).
- Custom nodes are draggable anywhere; on drop they anchor-snap
  near their canonical anchor's chain node.
- Pan: drag empty canvas area. Zoom: scroll wheel / pinch / control
  buttons. Lens highlight on selection fades canonical non-neighbors.
- Default layout: horizontal swimlane (clusters in left-to-right
  order of the canonical first node they contain).

## Light Theme (MATLAB Palette) — Follow-Up

The dark theme MVP uses the existing IDE dark variables plus a
dark-gray canvas backdrop with a subtle grid. A planned follow-up
adds a light theme that follows the MATLAB / Simulink palette
(off-white canvas, dark teal/orange block accents, gold selection
ring). All canvas styles use CSS variables under `--tc-canvas-*`
so the swap is purely a theme variable change — no component code
edits.
