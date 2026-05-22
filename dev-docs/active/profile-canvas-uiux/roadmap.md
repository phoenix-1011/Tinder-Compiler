# Profile Canvas UIUX Roadmap

## Goal

Deliver a canvas-style editor for configuration-profile chain composition as a projection UI over the existing profile JSON, without changing chain order semantics, branch model, or runtime export.

## Decisions To Align

| ID | Topic | Decision | Reason |
| --- | --- | --- | --- |
| C1 | SSOT boundary | **Frozen:** Canvas is a pure projection of profile JSON. Canvas-only state (focus, collapse, scroll, zoom, selection, coverage filter, flow-line visibility, inspector dock + collapsed) is persisted under `.tinder/state/canvas.json` and does not enter profile JSON or runtime export. | Keeps profile JSON the canonical edit target and avoids dual-write conflicts between modes. |
| C2 | Mode model | **Frozen:** Two hard-switched application modes — `配置档案编辑` (current) and `画布编辑` (new). Mode is global; per-mode UI state is independently preserved. | Avoids cramming canvas, library, profile tree, and inspector into one mode and lets each mode optimise its sidebar. |
| C3 | Entry points | **Frozen:** Enter `画布编辑` via two entry points — right-click on a profile → `画布编辑`, and a `画布` button on the existing chain editor toolbar. Both entries are context-scoped (carry a specific `profileId`). Exit canvas mode via a `← 返回配置档案编辑` button on the canvas top bar, or via paths that exit canvas as a side effect (C13 jump, C21 code edit). | Canvas mode is always profile-scoped, so a global ActivityBar toggle is unnecessary. Two contextual entries plus a visible canvas-bar exit cover discoverability without an always-on global control. |
| C4 | Layout | **Frozen:** Library (left) + canvas (centre) + inspector (right or bottom dock). In `画布编辑`, the sidebar contains only the compute-instance library expanded to branch level (family → branches). Profile selection moves to the canvas top-bar dropdown. The inspector is a single dockable panel — defaults to right, user-toggleable to bottom dock for wide content (candidate tables, multi-field forms). Inspector dock position and collapse state persist per profile in `canvas.json`. The inspector is collapsible. | Right dock fits narrow property forms; bottom dock fits wide tables. Single panel with toggle position is simpler than two panels. Library showing branch level lets users pin a specific branch directly. |
| C5 | Group structure | **Frozen:** Canvas content is grouped by `CHAIN_CATALOG.groups` (`docSlug`). Each group is a collapsible panel rendering its chain nodes in canonical `order` as a horizontal track. | Chain doc category is the highest-signal classification and matches existing filter semantics. |
| C6 | Uncovered nodes | **Frozen:** All chain nodes may be uncovered. Uncovered = legal "no-op" at runtime. A coverage filter is ON by default and silently hides uncovered slots (no `⋯ N 个未配置 ⋯` chip). When two visible slots become non-adjacent because of hidden ones in between, the flow line simply spans the larger gap. To reveal hidden slots, toggle the coverage filter off globally. | Silent hiding reduces visual noise; the global toggle is sufficient because slot reveal is an "I want to see everything" intent, not a per-gap one. |
| C7 | Multi-coverage | **Frozen:** A chain-node slot stacks N covering **standard** compute-resource cards vertically inside the slot. Above 3, the remainder collapses to a `+N` chip with inline expander. Custom usages are never inside slots (see C22). | Matches existing `coverage.status: multi` semantics for standard resources; keeps slot semantics clean by excluding customs entirely. |
| C8 | Drag semantics | **Frozen:** Standard resources are **not draggable** on the canvas — their adjustments go through C24 paths (pin / activate / candidate selection). Custom resources are draggable from the library, with the only valid drop targets being edges of the directional flow line (see C22, C23). | Standard resources self-declare coverage via `compute_nodes[]`, so dragging them to a slot was always semantically misleading. Custom usages are inherently between-slot nodes, so a flow-line edge is the only honest drop target. |
| C9 | Off-coverage drop | **Withdrawn:** Standard resources are no longer draggable per C8, so an off-coverage confirm bubble is unnecessary. This decision slot is retained as a placeholder; do not reuse the ID. | Removed by the consequence of C8. |
| C10 | Focus | **Frozen:** Two coexisting focus layers — lens highlight (light, default on any selection — fades non-neighbors to ~40 % opacity, no folding) and locked focus (heavy, double-click or shortcut — shows ± N neighbors only, folds other group panels to title strips). N defaults to 2, configurable in inspector. `Esc` / shortcut exits locked focus. | Lens covers the casual "give me context" need; locked focus covers the "I am working on this neighborhood" need without conflating with filtering. |
| C11 | Card interactions | **Frozen:** Single click = select + inspector load. Double click / middle click = open standalone `ResourceBranchView` tab (exits canvas mode with a secondary confirmation, per C13 / C21 jump pattern). Right click = entity-specific menu (reuse current operations). | Keeps lightweight interactions inside the canvas while preserving deep-edit access via the existing tab UI. |
| C12 | Inspector | **Frozen:** Single dockable panel (right or bottom, per C4). Embeds `ResourceBranchView` content for coverage / custom selections. Slot selection shows chain-node metadata + per-chain-node candidate dropdown (C24c). **Branch switching is not done in the inspector** — it is done via library pin (C25). The inspector handles all other inline edits (metadata, candidate, parameters, artifact path). | Aligns with C25's pin metaphor as the single source of branch-switch UX, keeping the inspector focused on per-selection metadata and candidate adjustments. |
| C13 | Shared branch guard | **Frozen:** In-canvas lightweight bubble (not modal) with `创建当前档案分支` and `在计算实例中修改`. `创建当前档案分支` copies the branch in-place and updates the library pin to the new branch, then editing proceeds. `在计算实例中修改` triggers a secondary confirmation explaining that the canvas will exit and UI state is preserved for return. | Lowers the friction of common ergonomic edits while still gating the cross-profile-impact action behind a deliberate confirmation. Pin (C25) is the visible after-effect of branch creation. |
| C14 | Creating new custom in canvas | **Frozen:** Canvas top bar exposes `+ 新建自定义节点`, reusing `NewResourceDialog`. After creation, the new custom appears in the library tree and briefly highlights (~3 s) as `待放置`. Mode does not switch. The created resource is not yet pinned or placed — the user drags it from the library onto a flow-line edge (C8 / C22) to use it. | Removes the need to leave canvas mode for what is a common authoring step. Keeping placement explicit preserves the user's intent over execution position. |
| C15 | Persistence | **Frozen:** Canvas UI state persists per profile under `.tinder/state/canvas.json` — focus (locked + target + radius), collapsed groups / slots, scroll position per group, selection, coverage filter, flow-line visibility, and inspector dock + collapsed state. Missing or invalid file falls back to defaults; never blocks profile loading. | App restarts should preserve the user's working position; loss tolerance avoids blocking on schema drift. |
| C16 | Tech choice | **Frozen:** MVP implements with HTML / CSS Grid + `@dnd-kit` + SVG overlay (polyline as the sequence of edges between slot / custom nodes, custom is a regular DOM node positioned along the edge sequence). No graph library at MVP. **Trigger to re-evaluate** `react-flow` (primary candidate) or `X6` — adoption is reconsidered if any of: (1) chain-node order becomes user-editable (breaks canonical order); (2) parallel chains / conditional branches / sub-chains are introduced (breaks single-line); (3) nodes gain user-defined `(x, y)` positions; (4) self-implementation of flow line + hit-testing + focus rerouting exceeds ~1500 LOC, indicating fight-the-data-model friction. | The graph-y surface is small and constrained; a library's built-in features mostly land on UX we explicitly exclude. The conditional triggers avoid both upfront over-engineering and irreversible self-implementation lock-in if the model evolves. |
| C17 | Active / disabled in canvas | **Frozen:** Disabled standard coverage cards render muted but remain inside their slot. Disabled custom usage nodes remain on the flow line as muted cards, and the edges incident to them render dashed grey to signal "execution skips here". Right-click `激活 / 停用` continues to drive `profile.resources.enabled` and `usage.enabled`. There is no separate `停用` section in canvas mode. | Spatial visibility of disabled items helps reasoning about why something is not running. Dashed edges make the execution skip immediately visible without forcing the user to read each card's state. |
| C18 | List view as reference UI | **Frozen:** The existing list-based `ChainEditorView` remains unchanged and serves as the reference UI for chain operations. Canvas is a visual reskin: every canvas operation must map to an existing list-view operation. Canvas is opt-in via the entry points in C3. | Reverse constraint — prevents canvas from silently introducing new chain operations not expressible in list view; also a screen-reader / dense-screen alternative and a risk hedge during canvas maturity. |
| C19 | Schema impact | **Frozen:** No changes to profile JSON schema, branch model, runtime export, or `CHAIN_CATALOG`. Only additions: (a) `.tinder/state/canvas.json`, (b) new components, (c) toolbar / context-menu entries. | Keeps the canvas a UI-layer change; allows revert without data migration. |
| C20 | Edit parity | **Frozen:** Canvas mode's edit surface must cover the full edit surface of list view plus `ResourceBranchView`. Every edit available there must be reachable from canvas mode — either inline in the inspector, or via a deliberate jump (C13 shared-branch jump, C21 code edit jump). No edit may be silently dropped. | Stops the canvas from regressing edit capability under UI density pressure; forces explicit handling for every edit that does not fit inline. |
| C21 | Code editing path | **Frozen:** Editing branch implementation source files (`src/*.py`, `src/*.cpp`, etc.) is not done inside canvas mode. Clicking a source file in the inspector triggers a secondary confirmation, then switches to `配置档案编辑` mode and opens the file in a Monaco tab — same jump pattern as C13's `在计算实例中修改`. Canvas UI state is preserved for return. A future revision may add an inline split-view option, but MVP uses the jump-out path. | Inline Monaco inside canvas mode would require split layout, screen-real-estate reshuffling, and another mode-state component. Jump-out reuses the existing tab editor and matches the established C13 pattern. |
| C22 | Custom usage position model | **Frozen:** Custom usages are first-class **nodes** alongside slot nodes — not attached to slots and not decorations on a line. The execution flow is a sequence of canonical-order edges: `[slot]→[custom]→[custom]→[slot]→…`. Position of a custom in this sequence is determined by `anchorChainId` + `arrayIndex` (anchor identifies the inter-slot interval; `arrayIndex` orders multiple customs within that interval). Hiding a slot collapses the two adjacent intervals; the customs on either side preserve their `arrayIndex` order in the merged interval. | Treats customs as proper graph nodes so node-edge semantics (selection, drop targets, hit-testing) are uniform across slot and custom. Removes the "ornament on a line" mental model. |
| C23 | Directional flow line | **Frozen:** The canvas overlays a directional flow line composed of edges between consecutive visible nodes (slot or custom) in canonical execution order. Default state: visible. Toggle in canvas top bar; visibility persists in `canvas.json` as `flowLineVisible`. While dragging a custom resource, the line auto-shows temporarily even if hidden, so drop targets on inter-node edges are always discoverable. Edges adjacent to a disabled custom render dashed grey (see C17). | Makes execution flow first-class without re-introducing free wiring. Always-visible default matches the "Simulink-like" mental model the user asked for; temporary-on-drag is a fallback for users who hide it for screen real estate. |
| C24 | Standard resource adjustment paths | **Frozen:** Standard resources are adjusted through three orthogonal paths, none of which involve canvas drag. (a) **Pin in library** (C25) — adds the resource to profile, switches branch within a family, or removes from profile. (b) **Activate / deactivate** — right-click on a canvas coverage card, or via the library pin context menu; toggles `profile.resources.enabled`. (c) **Candidate selection (实现函数)** — single-slot inspector dropdown (default) and a top-bar `批量候选` panel that lists every covered chain node with a per-row candidate dropdown (`effective_candidates[chainNodeId]`). Branch switching is **not** done in either inspector or batch panel; it is done by pin (C25). | Three operations have three different scopes: pin = membership (profile-wide), activate = visibility (per slot), candidate = implementation (per chain node). Conflating them into a single dropdown was the original list-view ergonomics problem; canvas mode separates them explicitly. |
| C25 | Library pin metaphor | **Frozen:** Library branch rows support a `pin` action scoped to the currently selected profile. Pinning a branch sets that family's slot in the profile to `selected_branch_id = pinned_branch` and `enabled = true`. Pinning another branch of the same family transfers the pin (B8 radio behaviour). Unpinning removes the family slot from `profile.resources` entirely (deactivation alone is via C24b). Library renders three pin states: unpinned (default), pinned + active (filled icon, highlighted row), pinned + disabled (outlined icon, highlighted but muted row). The pin context menu offers `unpin`, `停用 / 激活`, `移到目录…`, and the existing branch operations. | Collapses "add + select + activate" into one motion, gives the library a built-in view of "which branches this profile uses", and visually enforces B8's one-family-per-profile rule. |

## Open Questions

Detail-level questions deliberately deferred from Phase 0 — each is scoped enough to be validated during or after a specific phase rather than blocking the whole package.

### A. Focus geometry (validate in Phase 5)

- **Default radius `N = 2`** is a guess; verify against representative profiles. Candidates for adjustment include making N adaptive (e.g., expand to include the next standard-covered slot if all neighbors are uncovered).
- Whether the radius window may cross `docSlug` group boundaries is resolved by default to "yes" (see Resolved Edge Cases in `requirement.md`); revisit if users report disorientation.

### B. Validation surface (Phase 3 follow-up)

- Where action-index conflicts (B10) are surfaced is resolved by default to the inspector overview; revisit if conflicts become frequent enough to deserve a dedicated panel.
- Whether the inspector should show a per-profile health summary (covered / total / issues / disabled count) alongside selection details, or only in the empty state.

### C. Pin ergonomics (Phase 3 follow-up)

- Whether pin should support **multi-select** ("pin all default branches of families X, Y, Z at once") as a follow-up. Considered out-of-scope for MVP.
- Whether unpinning a family that has other-profile usages should show a courtesy notice (current decision: no — unpin is a local-profile action; other profiles are unaffected because `profile.resources` is per-profile).

### D. Performance + accessibility (Phase 5)

- Performance budget for first canvas paint when `canvas.json` + profile JSON are both warm. Target proposal: < 200 ms on the reference hardware; verify with a populated profile.
- Keyboard navigation between slot / custom nodes (Tab order, arrow keys, Home / End to group boundaries).
- Screen reader semantics for the flow line — it is purely visual; needs `aria-hidden` on the SVG plus a textual order representation in the inspector or a hidden ordered list for AT consumers.

### E. List-view parity (continuous)

- C20 declares parity; any new list-view feature added to `ChainEditorView` or `ResourceBranchView` after this package lands must extend the parity table in `requirement.md` before canvas adopts the feature.
- Whether the list view should eventually offer a `画布` button per row (not just the toolbar button) for direct entry from a specific node — Phase 5 polish candidate.

## Phase 0 — Discussion Package

Deliverables:

- create this dev-docs package
- align decisions C1–C25
- list open questions and resolved edge cases

Done when:

- decisions are signed off, and any pending question is either deferred or scoped into a later phase

## Phase 1 — Mode Plumbing

Deliverables:

- application mode model (config-tree vs canvas), persisted in app state
- right-click `画布编辑` on profile rows
- `画布` button on existing chain editor toolbar
- `← 返回配置档案编辑` button on canvas top bar
- empty canvas shell with mode-switch round-trip
- per-mode UI state preservation across switches

Done when:

- a user can enter canvas mode from both entry points, return via the canvas top-bar button, and per-mode UI state survives the switch

## Phase 2 — Canvas Read-Only

Deliverables:

- library panel (reuse `计算实例 / 标准` and `计算实例 / 自定义` trees, expanded to branch level: family → branches)
- library shows pin state indicators (read-only in this phase — three visual states from C25, but no interactive pinning yet)
- group panels by `CHAIN_CATALOG.groups`
- slot cards with stacked **standard** coverage cards (multi-coverage)
- custom cards rendered as nodes on flow-line edges (C22) at correct positions
- directional flow line overlay (C23) with top-bar toggle
- coverage filter ON by default — silently hides uncovered + custom-free slots (no chip, per C6)
- disabled standard cards muted; disabled custom incident edges dashed grey (C17)
- canvas state persistence (read + write `.tinder/state/canvas.json`, including flow-line visibility and inspector dock state)

Done when:

- a user can browse the canvas, see the directional flow line through customs, fold groups, toggle the coverage filter, scroll, and the view restores on app restart

## Phase 3 — Inspector + Library Pin Interactivity

Deliverables:

- inspector panel with right / bottom dock toggle and collapse control (state persisted in `canvas.json`)
- slot inspector (chain node metadata, coverage list, per-row candidate dropdown — C24c)
- coverage card inspector (embedded `ResourceBranchView` content; branch metadata / candidate / artifact path editable inline)
- custom inspector (segment, position, enable toggle, parameters)
- library pin interactivity (C25): pin / unpin actions, three visual states, family-radio repinning
- right-click `激活 / 停用` on coverage cards drives `profile.resources.enabled` (C24b)
- code-file click in inspector triggers C21 jump-out with secondary confirmation
- click-to-select round-tripping with canvas highlight

Done when:

- a user can select any canvas entity, inspect and inline-edit its metadata, manage profile membership and branch selection via library pins, and the C20 edit-parity check passes against list view + `ResourceBranchView`

## Phase 4 — Custom Drag + Batch Candidate Panel + Shared Branch Guard

Deliverables:

- library → flow-line-edge drag for custom resources (the only canvas drag — C8 / C22)
- custom-node drag along the flow line to reposition (reorder within and across intervals)
- top-bar `批量候选` panel listing every covered chain node with per-row candidate dropdown (C24c batch view)
- shared-branch guard bubble (C13) with `创建当前档案分支` and `在计算实例中修改`
- secondary confirmation for actions that exit canvas mode

Done when:

- a user can place / reposition customs entirely on the flow line, adjust candidates one-by-one or in bulk, and shared-branch edits are properly gated

## Phase 5 — Focus, New-Custom-In-Canvas, Polish

Deliverables:

- lens highlight on selection
- locked focus on double-click / `F` shortcut, with `± N` radius (default 2)
- `+ 新建自定义节点` toolbar action (reuse `NewResourceDialog`) with `待放置` highlight
- right-click context menus at parity with the current list editor
- empty / error states
- accessibility pass for keyboard navigation between cards
- performance baseline verification

Done when:

- canvas mode is the daily-driver experience for chain composition; the list editor becomes the explicit fallback per C18

## Out Of Scope (Whole Package)

- mini-map
- multi-select / bulk operations
- snap-to-grid or free positioning
- free graph topology / wire editing
- diff / merge / undo across modes (general app undo, if any, applies as today)
- schema changes to profile JSON, branch model, or runtime export
