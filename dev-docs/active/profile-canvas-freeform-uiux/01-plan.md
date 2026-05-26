# Profile Canvas Freeform UIUX Plan

## Immediate Plan

1. Lock decisions D1–D10 in `roadmap.md` with the user.
2. Stand up Phase 1: install `@xyflow/react`, build the minimum
   freeform viewport with category-group nodes carrying the existing
   chain-node visuals at default-layout positions. No drag, no
   custom nodes, no edges yet.
3. Phase 2: cluster drag + custom drag + position persistence.
4. Phase 3: edges (canonical-order, cross-cluster, smoothstep + C17
   dashed).
5. Phase 4: lens + inspector reconnect.
6. Phase 5: library drag to canvas + C26 flows.
7. Phase 6 (post-MVP): light theme, mini-map, a11y.

## Recommended First Implementation Slice

Phase 1 + minimum Phase 2 drag:

- Add `@xyflow/react` to `apps/desktop`'s deps (and its CSS).
- Replace `CanvasBody` / `GroupPanel` / `FlowTrack` with a new
  `CanvasFreeformBody` that mounts `<ReactFlow>`.
- Reuse the existing `CanvasProjection` builder for grouping
  metadata; layer the default-layout (x, y) on top.
- Render `categoryGroup` and `customNode` react-flow nodes using
  the existing `SlotCard` / `CoverageCard` / `CustomCard` JSX
  (extracted into shared components if needed).
- Skip edges initially. Skip drag initially.
- Verify pan + zoom work, viewport persists.

This slice validates:

- the react-flow integration shape (CSS host, sizing, theming hooks)
- the projection-to-node mapping
- viewport persistence in canvas.json
- the dark-theme variable scaffolding

## Risks To Resolve Before Coding

- **react-flow CSS scope**: react-flow ships its own CSS (selection
  outline, node default, edge default). It must coexist with our
  `.canvas-*` classes without theme leaks. Plan: scope react-flow
  styles via a wrapper class, override `.react-flow__node` /
  `.react-flow__edge` defaults to `transparent`, and let our card
  classes paint.
- **Chain-node-inside-cluster layout**: react-flow doesn't lay out
  group children automatically. We need a deterministic sub-position
  for each chain node (relative to its group) so cluster drag works.
  Plan: compute `position.x = padding`, `position.y = header + sum(prev sibling heights)` at projection time, store in the node data, and use `parentNode` + `extent: "parent"` to lock chain nodes into the group.
- **Cross-cluster edges with non-uniform group heights**: clusters
  have different heights; edges crossing tall clusters will route
  around them via `smoothstep`. Plan: use react-flow's handles
  positioned on the chain node's right edge, not the cluster's edge.
- **Custom-node anchor-snap math**: anchor-snap needs the anchor
  chain node's absolute position (cluster + sub-position). Use
  react-flow's `getNode` API at drag-stop time.
- **Persistence write storm**: react-flow fires `onNodesChange` on
  every drag tick. Throttle the canvas.json write through the
  existing 250 ms debounce in `useCanvasPersistedState`; only commit
  the final position.
- **Selection sync**: react-flow has its own selection state. We
  already persist a `selection` field in canvas.json. Plan: keep
  canvas.json as the source of truth for cross-mount selection;
  react-flow's transient `selected` mirrors it in-session.
- **Hot reload + react-flow context**: react-flow's `<ReactFlow>`
  needs a provider context. Plan: place `<ReactFlowProvider>` at the
  top of `CanvasView` so hot reload doesn't lose it.

## Working Assumptions

- B1–B13 + the carried C-series decisions (C8, C13, C14, C17, C18,
  C19, C20, C21, C22, C23, C24, C25, C26, C10 light layer) stay
  stable for the duration of this work.
- `CHAIN_CATALOG.groups` continues to give us the 10 category
  buckets and canonical sub-order — no schema work required for the
  84-node count change.
- Profile JSON write paths and the checkpoint model from Phase 5 of
  the previous package remain the only mutation channels.
- The list-based `ChainEditorView` is preserved as C18 reference UI
  and may not be deprecated within this package.
- Tech stack stays `@xyflow/react` for MVP. If a future need (live
  collaborative editing, server-side layout, etc.) requires more
  graph operations, re-evaluate at the same maturity bar as D1.
