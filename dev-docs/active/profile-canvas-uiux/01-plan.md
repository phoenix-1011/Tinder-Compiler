# Profile Canvas UIUX Plan

## Immediate Plan

1. Lock decisions C1–C25 in `roadmap.md` with the user (done).
2. Resolve detail-level defaults in `requirement.md` § Resolved Edge Cases (done).
3. Stand up Phase 1: mode model + two entry points + canvas top-bar `← 返回` button + empty canvas shell.
4. Implement Phase 2: read-only canvas (group panels, slot nodes, custom nodes on flow line, coverage filter, persistence).
5. Implement Phase 3: inspector + library pin interactivity + inline editing + C21 code-edit jump-out.
6. Implement Phase 4: custom drag + batch candidate panel + shared branch guard.
7. Implement Phase 5: focus layers + in-canvas new-custom + polish + a11y.

## Recommended First Implementation Slice

Phase 1 + a minimal Phase 2 read-only view:

- introduce a single `AppMode = "profile-tree" | "canvas"` in workspace state, persisted in workspace settings; canvas mode also carries `activeCanvasProfileId`
- add the two entry points: right-click `画布编辑` on profile rows, and the `画布` button on the chain editor toolbar
- add the canvas top-bar `← 返回配置档案编辑` button
- in canvas mode, render a library tree (reuse `ChainAssemblyView` sub-components, or extract a library-only view; branch-level expansion can be deferred to Phase 2)
- render a static read-only canvas — group panels (collapsible), slot cards, no drag, no inspector content yet (but reserve a collapsed inspector rail), no persistence yet
- the list editor remains the active editor for `链路` in profile-tree mode

This slice is intentionally inert — no schema changes, no drag, no persistence. It validates:

- the mode model and the two entry-point + return-button round trip
- the layout footprint of library + canvas + reserved inspector rail
- the group panel + slot card visual density

## Risks To Resolve Before Coding

- If mode state is not persisted, every restart drops users into profile-tree mode regardless of where they were last working. Decide whether to persist in workspace settings or in `canvas.json`.
- If the library tree is re-rendered as a sibling instead of being lifted to a shared component, drag sources will differ between modes and cause subtle drop-target bugs in Phase 4. Extract a `LibraryTree` component up front.
- If `.tinder/state/canvas.json` is loaded synchronously on profile open, slow disks could delay canvas first paint. Load it lazily and recover from a missing file with defaults.
- If `ResourceBranchView` is embedded into the inspector without extracting a panel-mode prop, it will fight the full-tab layout. Plan the extraction (`headerless` / `noClose` props) before Phase 3.
- If the off-coverage drop (the withdrawn C9) creeps back in as ad-hoc behavior during Phase 4, edit parity (C20) will silently regress. Treat C9 as actively forbidden, not just absent.
- If pin actions in the library are dispatched to whichever profile is "active" without checking that the canvas top-bar profile dropdown is the source of truth, pin can target the wrong profile after a switch. Make `activeCanvasProfileId` the only source of truth in canvas mode.

## Working Assumptions

- Branch model decisions B1–B13 and `CHAIN_CATALOG` remain stable for the duration of this work.
- Profile JSON write paths (`chainAssemblyStorage`, `setProfileResourceEnabled`, `shiftCustomUsage`, `promptMoveCustomUsage`, etc.) are the only mutation entry points the canvas needs; no new storage APIs are required.
- Both modes are usable on the same data simultaneously; no exclusive lock.
- The list-based chain editor (`ChainEditorView`) is preserved as the reference UI per C18 and may not be deprecated within this package.
- Tech stack stays HTML / CSS Grid + `@dnd-kit` + SVG overlay through MVP (C16). Re-evaluation triggers are documented in C16.
