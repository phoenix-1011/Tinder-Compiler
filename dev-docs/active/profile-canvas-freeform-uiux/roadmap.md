# Profile Canvas Freeform UIUX Roadmap

## Goal

Replace the vertically-stacked-panel canvas with a `@xyflow/react`
free-positioning canvas: draggable category clusters, free-positioned
custom nodes, canonical-order edges across clusters, pan + zoom, lens
highlight. All other canvas semantics (library pin, candidate paths,
inspector content, checkpoint save/reset, exit guard) carry over.

## Decisions To Align

| ID | Topic | Decision | Reason |
| --- | --- | --- | --- |
| D1 | Tech stack | **Proposed:** Adopt `@xyflow/react` (the maintained successor of `react-flow`) as the canvas rendering library. Triggered by C16 conditional clause #3 ("nodes gain user-defined (x, y) positions") which is now met by cluster + custom node positions. | The custom-built CSS flow track was sized for the original constrained design (canonical-only ordering, no free positioning). Free positioning, pan, zoom, orthogonal routing, and ~84-node viewport are exactly the workload a maintained graph library handles well. |
| D2 | Default layout | **Proposed:** Horizontal swimlane — each of the 10 `CHAIN_CATALOG.groups` becomes a draggable `categoryGroup` node. Clusters are placed left-to-right at first open in the canonical order of their first chain node; row wraps when total width exceeds ~2000 px. Cluster width fixed at 220 px; height auto from content. | Matches the user's mental model ("each category is a rectangle, rectangles are draggable"). Horizontal flow matches the canonical execution direction; wraps prevent the canvas from feeling like an infinite ribbon. |
| D3 | Position semantics | **Proposed:** Cluster (x, y) — user-draggable, persisted per profile. Chain node — locked to its canonical sub-order **inside** its cluster (not individually draggable). Custom node — free (x, y), draggable anywhere; on drag-stop, anchor-snap to a position near its `anchorChainId`'s chain node unless `Shift` is held during drop. | Cluster drag is the user-visible degree of freedom they asked for. Chain order is canonical (B-series invariant); making chain-node positions user-controlled would create a visual-vs-runtime divergence. Anchor-snap keeps customs associated with their semantic anchor without locking position absolutely. |
| D4 | Edge style | **Proposed:** Custom edge type `executionEdge` extending react-flow's `smoothstep`. Slightly rounded 90° corners, color from `--tc-canvas-edge-color`. Edges connect consecutive nodes in canonical execution order (chain or custom), including cross-cluster edges. Edges incident to a disabled custom render dashed grey (C17 carried). | `smoothstep` is the cleanest "right-angle polyline" react-flow ships and matches the user's request for 直角折线. Cross-cluster edges are essential because the canonical order weaves between categories — the previous canvas hid this and that was the explicit complaint. |
| D5 | Persistence | **Proposed:** Additively extend `canvas.json` per profile: `viewport: {x, y, zoom}`, `clusterPositions: Record<docSlug, {x, y}>`, `customPositions: Record<arrayIndex, {x, y}>`. Old fields (`coverageFilter`, `flowLineVisible`) kept in the schema for back-compat but ignored. Loss-tolerant: missing fields fall back to defaults (D2 + anchor-snap). | All position state is UI projection per C1; profile JSON stays untouched (C19). Additive schema means existing canvas.json files keep working. |
| D6 | Removed UX | **Proposed:** Drop coverage filter (C6) and locked focus (heavy variant of C10). Show all 84 chain nodes always; rely on pan/zoom to navigate. Lens highlight (light variant of C10) retained. | The original drivers for filter/focus were screen-real-estate limits on a non-scrollable lane layout. Pan/zoom removes those constraints, and the user explicitly asked to keep lens + drop filter-hide. |
| D7 | Lens behavior | **Proposed:** Selection-driven opacity fade. On selection, the selected node and its first-degree canonical neighbors stay at full opacity; everything else fades to `--tc-canvas-lens-far-opacity` (default 0.45). No folding, no filter. Cluster containing a near node stays full opacity in its frame; chain nodes inside the cluster outside the lens window fade individually. | Matches the user's "保留 lens" request. Implementation is a CSS class on the canvas root keyed by selection; react-flow doesn't fight it. |
| D8 | Theme | **Proposed:** MVP ships a dark theme matching the current IDE palette + a subtle grid backdrop + cluster background tint. All canvas colors flow through CSS variables under `--tc-canvas-*` so a future light theme is a variable swap, no component edits. Light theme using a MATLAB-like palette (off-white canvas, dark teal/amber blocks, gold selection) is a planned follow-up after MVP. | Two-step approach: ship the dark MVP fast, design the light theme as a follow-up so it can be polished against actual user feedback without blocking the freeform-canvas landing. |
| D9 | Double-click behavior | **Proposed:** Double-click on a chain node, coverage card, or custom node opens the standalone `ResourceBranchView` tab (carries C11 from the previous package — the locked-focus alternative is no longer applicable since locked focus is withdrawn in D6). Double-click on cluster header does nothing in MVP (reserved for future "zoom to fit cluster"). | Resolves the C10 vs C11 conflict cleanly now that locked focus is gone. Pan/zoom is the new "focus on this neighborhood" gesture. |
| D10 | Migration / coexistence | **Proposed:** Replace the existing canvas in-place. The new `CanvasView` (or `CanvasFreeformView`) takes over the same entry / exit hooks. The old `profile-canvas-uiux` task package is moved to `dev-docs/archived/` after Phase 1 lands; key decisions (B1-B13, C25, C24, etc.) are referenced from this package's overview. | The previous canvas only just shipped; no users invested. Coexistence would double the maintenance surface for no real benefit. |

## Open Questions

- **Custom node default position when first added via library drag**:
  drop coords from the drag event vs anchor-snap. MVP: snap on drop;
  user can manually move afterwards.
- **Cluster collision policy** when two clusters are dragged to
  overlap. MVP: allow overlap; user is responsible. Could add
  collision detection / repulsion in polish.
- **What happens to viewport when the user creates a new profile**
  via the dropdown? MVP: reset viewport to default; let the user
  reposition.
- **Mini-map** — `<MiniMap />` is one line of react-flow; do we ship
  it in MVP or polish? MVP: defer.
- **Cluster auto-expand on chain-node selection** outside the visible
  viewport — should we pan-to-selected? MVP: no; user pans manually.

## Phase 0 — Discussion Package

Deliverables:

- create this dev-docs package
- align decisions D1–D10
- list open questions

Done when:

- decisions are signed off
- any pending question is either deferred or scoped into a later phase

## Phase 1 — react-flow Plumbing + Default Layout

Deliverables:

- install `@xyflow/react` (latest stable v12+)
- new `CanvasFreeformView.tsx` (or replace `CanvasView` in-place)
- `categoryGroup` custom node type rendering current chain-node cards
  as children
- `customNode` custom node type wrapping the existing custom card
  visual
- default horizontal-swimlane layout based on canonical first-node
  order
- viewport persistence to `canvas.json`
- pan + zoom + react-flow `<Controls />` + `<Background />`
- replace old `<CanvasBody>` / `<GroupPanel>` / `<FlowTrack>` paths

Done when:

- entering canvas mode shows the freeform canvas with default layout
- pan + zoom work
- chain nodes render in their clusters with same visual content as
  before
- typecheck passes

## Phase 2 — Cluster + Custom Drag, Position Persistence

Deliverables:

- cluster drag (react-flow built-in; lock chain-node sub-position)
- custom drag with anchor-snap on `onNodeDragStop`
- `clusterPositions` + `customPositions` persistence
- back-compat for canvas.json files missing the new fields

Done when:

- moving clusters / customs persists across reloads
- canvas.json files without new fields render with default layout

## Phase 3 — Edges (Canonical Order + Cross-Cluster Routing)

Deliverables:

- `executionEdge` custom edge type (`smoothstep` + theming)
- canonical-order edges generated for chain → chain and chain ↔ custom
- C17 dashed-grey treatment for edges incident to disabled customs
- C26 warning treatment for edges incident to orphan customs

Done when:

- visible edges always reflect canonical execution order
- cross-cluster edges route cleanly without sharp overlap
- disabled / orphan treatments visible

## Phase 4 — Lens + Inspector Reconnect

Deliverables:

- lens-highlight CSS triggered by selection
- inspector content router (carried from C-series Phase 3) wired to
  react-flow selection events
- batch candidate panel + shared-branch guard reconnected
- C13 / C21 jump-out + exit guard verified end-to-end

Done when:

- selecting a node fades canonical non-neighbors
- inspector shows the same content as before for every selection type
- all jump paths still work

## Phase 5 — Library + Drag-To-Canvas Reconnect

Deliverables:

- library node drag to canvas creates a custom usage at the drop
  coords, with anchor-snap to the nearest chain node
- canvas custom node drag to library trash (deferred — kept on
  right-click menu for MVP)
- auto-pin on first drag (C26 carried)

Done when:

- the full C26 drag flow works on the new canvas
- soft-orphan handling visible after branch transfer

## Phase 6 — Light Theme + Polish (Post-MVP)

Deliverables:

- second theme using MATLAB-like palette (off-white canvas, gold
  selection)
- mini-map (`<MiniMap />`)
- `fit to selection` zoom action
- cluster overlap warning chrome (advisory only)
- a11y pass (keyboard pan, focus management for cards inside
  react-flow)

Done when:

- light theme toggles cleanly with no component-code edits
- MVP feedback issues from Phases 1–5 are addressed

## Out Of Scope (Whole Package)

- changes to profile JSON schema
- runtime export behavior changes
- list view (`ChainEditorView`) — remains as C18 reference UI
- multi-profile layout sharing
- non-canonical chain ordering (parallel chains, conditional, etc.)
- undo/redo beyond the checkpoint save/reset model
