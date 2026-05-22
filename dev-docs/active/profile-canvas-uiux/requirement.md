# Profile Canvas UIUX Requirement

## Background

The current chain editor (`ChainEditorView`) is a flat list view of the canonical chain nodes plus interleaved custom usages. Discussion identified the following pain points:

- categorisation by chain doc group is only a filter, not a primary visual structure
- users mostly care about a small neighborhood, not the full 81 nodes
- multi-coverage on one chain node is visually flattened into multiple rows
- custom node placement uses a dropdown anchor picker rather than spatial intuition
- adding a resource, switching its branch, and activating it are three separate operations

A canvas-style editor was discussed as a Simulink-like investment. Free graph topology is rejected — the chain has no free wiring. A grouped-lane visual board with library-pin metaphor and a directional flow line is the agreed shape.

## Goals

- provide a canvas editor that visually represents a configuration profile's chain composition
- make chain categories the primary visual structure
- make small neighborhoods easy to focus
- make custom node placement direct via drag onto a flow-line edge
- collapse "add + switch branch + activate" into a single library-pin motion
- keep profile JSON as the SSOT; the canvas is a projection
- reuse existing branch and shared-branch flows without reimplementation
- persist canvas UI state across app restarts

## Non-Goals

- no new profile schema
- no new runtime semantics
- no free DAG editing; chain order remains fixed
- no replacement of the configuration-profile tree in `配置档案编辑` mode
- no automatic migration of `canvas.json`; loss of UI state on schema change is acceptable

## Modes

Two hard-switched application modes:

```text
配置档案编辑 (default, current)
  sidebar : profile tree + library
  main    : list / tab UIs

画布编辑 (new)
  sidebar     : library only (family → branches with pin)
  topbar      : ← 返回 + profile dropdown + canvas actions (coverage filter, 流程线, 批量候选, + 自定义节点)
  main        : canvas
  inspector   : right-dock (default) or bottom-dock, collapsible
```

Mode switching is global. The canvas state and the profile-tree state are independently preserved; switching back returns to the prior view of each side.

Entry points into `画布编辑` (both context-scoped, carrying a specific `profileId`):

1. Right-click on a configuration profile in the profile tree → `画布编辑`
2. From the list-based chain editor toolbar, a `画布` button to the left of `保存编辑`

Entry points that exit `画布编辑`:

- `← 返回配置档案编辑` button on the canvas top bar (primary exit)
- double-click a card on the canvas to open its full `ResourceBranchView` tab (C11)
- click `在计算实例中修改` in the shared-branch guard bubble (C13)
- click a source code file in the inspector (C21 code edit jump)

All opt-outs other than the primary `← 返回` button display a secondary confirmation explaining that canvas UI state (focus, collapse, scroll, inspector dock) is preserved across mode switches and can be restored on return.

## Canvas Layout

```text
┌─────────── library ─────────────┬─────────── canvas ─────────────────────┬──── inspector ────┐
│ 计算实例 / 标准                  │ ← 返回  profile: production v           │ [dock ▶|▼] [×]    │
│   ▾ 雷达 Alpha            📍     │ [coverage filter] [流程线] [批量候选]    │ 选中: slot / card  │
│       production-a 📍 (default)  │ [+ 自定义节点]                          │                    │
│       production-b               │                                         │ candidate dropdown │
│       experimental               │ [▼ environment 7/14]                    │ capability tabs    │
│   ▸ 雷达 Bravo                   │   [slot]══►[⌬custA]══►[slot]══►[slot]   │ usage info         │
│   ▾ 气象服务              📍     │ [▶ platform 21/40]                      │                    │
│       default      📍 (default)  │ [▼ signal 9/15]                         │                    │
│ 计算实例 / 自定义                │   [slot]══►[slot]┄┄►[⌬custB(off)]┄┄►...│                    │
│   ▸ ...                          │                                         │                    │
└──────────────────────────────────┴─────────────────────────────────────────┴────────────────────┘

Legend:
  📍 (filled)  = pinned + active branch    [slot] = chain-node slot with standard coverage cards inside
  📍 (outline) = pinned + disabled         ⌬     = custom usage node (lives on the flow line)
                                           ══►   = directional flow line, active segment
                                           ┄┄►   = dashed grey segment (adjacent to a disabled custom)

Inspector docked at bottom (alternative layout):

┌─────────── library ─────────────┬─────────── canvas ──────────────────────────────────┐
│   ...                            │ ← 返回   profile ...                                │
│                                  │ [▼ environment ...]                                 │
│                                  │ [▼ ...]                                             │
│                                  ├─────────────────────────────────────────────────────┤
│                                  │ inspector (bottom dock, full canvas width)          │
│                                  │ ...                                                 │
└──────────────────────────────────┴─────────────────────────────────────────────────────┘
```

### Library Tree (canvas mode)

- top level: `计算实例 / 标准`, `计算实例 / 自定义`
- second level: resource family (e.g. `雷达 Alpha`)
- third level: branches under each family, with the `default_branch_id` flagged `(default)`
- each branch row shows a usage chip indicating how many profiles reference it (early shared-branch heads-up)
- standard resources are **not draggable**; adjustments go through pin (C25) + canvas right-click + inspector candidate selection (C24)
- custom resources are draggable, but only onto edges of the directional flow line (C22 / C23)
- right-click on family / branch reuses the existing operations (new branch, copy, rename, delete-if-unused)

#### Pin Metaphor (C25)

Each branch row has a `pin` button scoped to the currently selected profile.

Three visual states:

| State | Indicator | Profile state |
| --- | --- | --- |
| Unpinned (default) | `📌` outline button, on hover only | family slot not in `profile.resources`, OR `selected_branch_id` ≠ this branch |
| Pinned + active | `📍` filled, row highlight | family slot exists, `selected_branch_id` = this branch, `enabled = true` |
| Pinned + disabled | `📍` outlined, row highlight muted | family slot exists, `selected_branch_id` = this branch, `enabled = false` |

Operations:

- **pin an unpinned branch**: creates / updates the family slot in `profile.resources` (`selected_branch_id = X`, `enabled = true`)
- **pin another branch of the same family**: B8 radio behavior — automatically transfers the pin (updates `selected_branch_id`, preserves `enabled`)
- **unpin**: removes the family slot from `profile.resources` entirely
- **right-click pinned**: context menu with `unpin`, `停用 / 激活`, `移到目录…`, and existing branch ops
- **right-click unpinned**: existing branch ops only

Unpin is the "remove" operation; deactivation alone is via the canvas right-click `停用` (C17, C24b) which sets `enabled = false` while keeping the pin.

### Group Panels

- one panel per `docSlug` in `CHAIN_CATALOG.groups`
- a `custom-only` virtual group collects custom usages whose anchor's `docSlug` is filtered out, so no usage disappears silently
- panel header shows display name and a coverage count (`covered / total`)
- panel is collapsible; collapsed state persists per profile

### Slot Cards

- rendered for every chain node in canonical `order` within its group panel
- a slot card shows: order/doc badge, display name, type badge, and zero or more **standard** coverage cards stacked vertically inside
- uncovered slots render visually muted; they may be hidden entirely by the coverage filter (silent — see C6)
- slot cards are not drop targets for any drag operation

### Coverage Cards (inside a slot)

- one card per covering **standard** compute resource for that chain node
- card label: `资源 · 分支`, plus a tiny `⊞` icon to mark standard auto-cover
- disabled coverage renders muted (C17)
- when a slot stacks more than 3 cards, the rest collapse into a `+N` chip; click expands inline
- right-click: `停用 / 激活`, `从档案中移除`, `切换分支…` (delegates to library pin), `候选实现 (实现函数)…`

### Custom Nodes (on flow line)

- custom usages are first-class **nodes** in the flow, alongside slot nodes — never inside a slot, never decorations on a line
- rendered as compact horizontal cards bearing the `⌬` marker for visual identification
- position in the execution sequence is determined by `anchorChainId` + `arrayIndex`; anchor identifies the inter-slot interval, `arrayIndex` orders multiple customs within that interval
- a custom may appear anywhere along the chain by virtue of its anchor; the same custom resource may have multiple usages with different positions
- when a slot is hidden by the coverage filter, the customs on its adjacent intervals collapse into the merged interval, preserving `arrayIndex` order
- single click = select; right-click = existing context menu (`上移`, `下移`, `移到段…`, `停用`, `移出链路`)
- disabled custom nodes render muted; the edges incident to them render dashed grey (C17)

### Directional Flow Line (C23)

A directed overlay composed of edges connecting consecutive visible nodes (slot or custom) in canonical execution order.

- default visible
- toggle in the canvas top bar (`流程线`); visibility persists per profile in `canvas.json` as `flowLineVisible`
- when a slot is hidden by the coverage filter, no edge is drawn to it; the line skips to the next visible node
- edges incident to a disabled custom node render dashed grey to signal "execution skips here" (C17)
- when the line is hidden but the user starts dragging a custom resource from the library, the line auto-shows for the duration of the drag, so inter-node edges (the drop targets) are always discoverable
- the line is purely a visualisation of canonical execution order; it does not represent data flow and is not editable directly

### Coverage Filter

- default ON
- silently hides slots that are uncovered (no chip rendered)
- hidden slots disappear; the flow line spans the gap between the two visible neighbors
- toggle globally in the canvas top bar to reveal all slots

### Focus

Two coexisting layers, applied to selection:

- **Lens highlight** (always active when there is a selection)
  - selected slot/card at full opacity
  - first-degree neighbors at full opacity
  - everything else fades to roughly 40 % opacity
  - no folding or hiding
- **Locked focus** (opt-in via double-click slot/card, or shortcut `F`)
  - shows selected slot ± N neighbors only (N default 2, configurable in inspector)
  - other group panels collapse to title strips
  - exit via `Esc` or the same shortcut

### Drag-and-Drop Semantics

Only custom resources participate in canvas drag. Standard resources have **no** drag interactions on the canvas (see C8, C24).

| Source | Drop target | Effect |
| --- | --- | --- |
| Library: custom resource | Edge between two visible nodes (slot or custom) | Inserts a new custom usage node into that edge position (`anchorChainId` set to the bordering slot, `arrayIndex` slotted into the interval's order). The same custom resource may have multiple usages with different positions. |
| Canvas custom node | Different edge | Moves the custom node into the new edge position (updates `anchorChainId` and `arrayIndex`). |
| Canvas custom node | Adjacent edge in the same interval | Reorders within the interval (drives `shiftCustomUsage`). |
| Canvas card | Trash zone / outside canvas | Deferred past MVP; removal is via right-click. |

While dragging a custom resource, the directional flow line auto-shows even if the user has hidden it, so the drop target is always visible. The auto-show ends when the drag ends.

### Card Interactions

- single click: select (inspector loads)
- double click: open standalone `ResourceBranchView` tab — exits canvas mode after a secondary confirmation
- middle click: same as double click
- right click: existing context menu for the entity type

### Inspector

- single dockable panel, with `dock 右` / `dock 下` toggle in its header
- right dock: narrow column, ~320 px, best for property forms
- bottom dock: full canvas width, ~280 px tall, best for candidate tables and multi-field forms
- collapsible (`×` / `>|` chevron), with collapsed-rail strip showing only the dock toggle
- dock position and collapse state persist per profile in `canvas.json`
- empty state when nothing selected — shows current-profile overview (coverage count, custom count, branch issues, action-index conflicts)

Content by selection type:

- **slot selected**: chain node id, group, order, doc title, list of covering standard cards with per-card `停用 / 移除` quick actions, plus a **per-chain-node candidate dropdown** (C24c) that drives `effective_candidates[chainNodeId]` for the relevant branch
- **coverage card selected**: reuse `ResourceBranchView` content as an embedded panel (summary / capability / usage tabs); candidate selection lives in the capability tab; **branch switching is not done here** — branch is managed via library pin (C25)
- **custom card selected**: custom usage details, segment position (`anchorChainId` + `arrayIndex`), enable toggle, parameters, `action_index` (read-only); link to the custom resource's `ResourceBranchView` for deeper edits

Implementation source files (`src/*.py`, `src/*.cpp`, etc.) appear as links in the capability tab; clicking triggers the C21 jump-out flow.

#### Batch Candidate Panel (C24c)

A canvas top-bar action `批量候选` opens a panel listing every chain node covered by the current profile, with one row per chain node:

```text
chain node  | 当前候选 (实现函数)              | 来源 resource · 分支
平台.对准   | radar.alignment.fast        v   | 雷达 Alpha · production-a
平台.脉冲   | radar.pulse.lowpower        v   | 雷达 Alpha · production-a
信号.滤波   | weather.filter.kalman       v   | 气象服务 · default
...
```

Each row's dropdown lists the candidates declared by the covering branch for that chain node; selecting writes `effective_candidates[chainNodeId]` for the relevant branch. Branch is not changeable here — only the candidate within the already-selected branch.

### Shared Branch Guard (in canvas)

Triggered when the user attempts a branch-editing action on a slot whose selected branch is shared (used by other profile slots).

Inline bubble (not modal) anchored to the card:

```text
该分支被 3 个档案使用。编辑前请选择：
[创建当前档案分支]   [在计算实例中修改]
```

- `创建当前档案分支`: copies the branch, updates the library pin to the new branch, closes the bubble, and editing proceeds in-canvas
- `在计算实例中修改`: secondary confirmation:

  ```text
  切换到「配置档案编辑」并打开计算实例分支编辑器？
  画布将退出，UI 状态 (聚焦 / 折叠 / scroll / inspector dock) 已保存，可下次回到画布恢复。
  [继续]   [取消]
  ```

  on `继续`: mode switches to `配置档案编辑` and opens the global-scope `ResourceBranchView` tab

### Code Editing Jump-Out (C21)

Triggered when the user clicks a source file link in the inspector capability tab.

Secondary confirmation (same shape as C13's confirmation):

```text
切换到「配置档案编辑」并打开代码文件？
画布将退出，UI 状态 (聚焦 / 折叠 / scroll / inspector dock) 已保存，可下次回到画布恢复。
[继续]   [取消]
```

On `继续`:

1. canvas state is flushed to `canvas.json`
2. mode switches to `配置档案编辑`
3. the file opens in a Monaco tab

Return to canvas: user re-enters via the same two entry points (C3); canvas state restores from `canvas.json`.

### Edit Parity (C20)

Every edit available in list view + `ResourceBranchView` must have a corresponding path in canvas mode:

| Edit | Canvas path |
| --- | --- |
| Branch metadata (name, description, status, notes) | inspector, inline |
| Branch `selected_branch_id` switch (= which branch is in use) | library pin (C25) |
| Standard `effective_candidates` selection (实现函数 per chain node) | inspector candidate dropdown (single) + top-bar `批量候选` panel (bulk) — both C24c |
| Custom node fields (display name, module_id, impl_kind, location, default_parameters, enabled) | inspector |
| Custom usage segment / order / enable | drag on flow line + right-click menu |
| Runtime artifact path | inspector |
| Source code (`src/*.*`) | C21 jump-out |
| Shared branch edits | C13 bubble (`创建当前档案分支` or jump-out) |
| Add resource to profile | library pin (C25) |
| Remove resource from profile | library unpin (C25), or right-click coverage card `从档案中移除` |
| Activate / deactivate resource | right-click on coverage card, or library pin context menu (C24b) |
| Move resource folder | inspector or right-click menu |
| Delete unused branch / family | library right-click |
| Create new branch from current | library branch row context menu `+ 基于当前分支创建新分支` |
| Create new custom resource | canvas toolbar `+ 自定义节点` (C14) |

If a future list-view feature adds a new edit, this table must extend before the canvas can land that feature without regression.

### Creating New Custom Resources From Canvas

- canvas toolbar exposes `+ 新建自定义节点`
- reuses `NewResourceDialog` in lightweight mode (no mode switch)
- after creation: the new custom appears in the library tree and briefly highlights (~3 s) as `待放置`
- the new resource is created in the global compute-instance library; it is not yet in `profile.resources` until the user drags it onto a flow-line edge

### Mode Switch UX

- switching mode does not lose data; profile JSON remains the SSOT
- canvas UI state (focus, collapse, scroll, selection, inspector dock) is persisted before mode switch and restored on return
- `配置档案编辑` mode state (open tabs, active tab) is independently preserved

## Persistence

A new file under the data root: `.tinder/state/canvas.json`.

```ts
interface CanvasStateFile {
  schema_version: 1;
  profiles: Record<string /* profileId */, CanvasPerProfileState>;
}

interface CanvasPerProfileState {
  focus?: {
    locked: boolean;
    target?: CanvasSelection;
    radius?: number;
  };
  collapsedGroups: string[];
  collapsedSlots: string[];
  scrollTopByGroup: Record<string, number>;
  selection?: CanvasSelection;
  coverageFilter: boolean;
  flowLineVisible: boolean;
  inspector: {
    dock: "right" | "bottom";
    collapsed: boolean;
  };
}

type CanvasSelection =
  | { kind: "slot"; chainNodeId: string }
  | { kind: "coverage"; chainNodeId: string; resourceInstanceId: string }
  | { kind: "custom"; usageArrayIndex: number };
```

Loss-tolerant: a missing or invalid file is recovered by defaults; never blocks profile loading.

## Resolved Edge Cases

These are deliberate defaults chosen during Phase 0 to avoid stalling Phase 1. They are not promoted into the C-series decisions because they are UX details, not directional choices; revisit if real-use feedback contradicts them.

### Pin Behavior

- **Pinning a disabled-status branch** is allowed. `status: "disabled"` on a branch is informational, not a hard constraint. The library row shows a `状态: 已停用` chip; pinning does not change branch status.
- **Pinning when the family is already in profile with another branch**: the pin is transferred (B8 radio). `enabled` is preserved.
- **Pinning when the family is in profile but `enabled = false`**: pin re-enables the family (`enabled = true`) and switches branch. The "pin = active" intent wins.
- **Unpin** removes the family slot entirely from `profile.resources`. To temporarily disable without removing, use the canvas right-click `停用` (which sets `enabled = false` while preserving the pin).

### Locked Focus Geometry

- **Radius counting**: `± N` counts **all nodes** (slot + custom) in canonical execution order, not slots only. A radius of 2 includes the 2 preceding and 2 following nodes regardless of their kind.
- **Cross-group span**: the radius window may cross `docSlug` group boundaries. Any group containing at least one in-radius node stays expanded for the in-radius portion only; out-of-radius nodes in the same group fold.
- **Composition with coverage filter**: the coverage filter is applied first to determine the visible-node list; the radius is then computed within that list. Toggling coverage filter while locked focus is active recomputes the radius window without exiting focus.

### Canvas Empty State

- **No covered slots, no customs**: the canvas auto-disables the coverage filter (override) and shows all canonical slots in their muted uncovered style, with an inline hint: `在库中 pin 标准资源以覆盖此链路，或拖入自定义节点`. The hint dismisses on first action and does not return for that profile.
- **Profile not yet selected in canvas mode dropdown**: the canvas shows a profile picker placeholder; the library renders without pin state.

### Flow Line Endpoints

- The first visible node has no incoming arrow.
- The last visible node terminates in a single arrowhead.
- No special start / end markers; the line is purely "consecutive directed edges in canonical order".

### Profile Switch In Canvas Mode

- When the user changes the canvas top-bar profile dropdown, the previous profile's canvas state is flushed to `canvas.json` and the new profile's state is loaded. Library pin indicators update to reflect the new profile.
- No confirmation is shown; canvas state of both profiles is preserved.
- An in-progress drag is cancelled on profile switch.

### Library State Scope

- **Family / branch tree expansion** is **global navigation state** (persisted in workspace settings, not `canvas.json`); it does not switch per profile.
- **Pin state** is **profile data** (lives in the profile JSON via `profile.resources`); the library reads it for the currently selected profile.
- **Library filter / search input** (post-MVP) would be global if added.

### Save Semantics

- No `保存` button in canvas mode. Every canvas action writes through to profile JSON immediately (same pattern as the existing chain assembly storage).
- The list view's `保存编辑` button is retained inside the list view itself per C18.

### Concurrent Profile JSON Mutation

- Canvas subscribes to `chainAssemblyStorage` change events. External writes (e.g. from a parallel list-view tab in `配置档案编辑` mode, or from a future remote sync) trigger a canvas re-render.
- No conflict resolution: every write is whole-file, and the latest write wins. Canvas-only state (`canvas.json`) is independent and does not conflict with profile writes.

### Drag Interactions

- **Dragging onto a coverage-filtered area**: all hidden slots auto-reveal for the duration of the drag (same auto-show pattern as the flow line). On drop or drag cancel, the filter re-applies.
- **Dropping a custom onto its current position**: no-op (no JSON write, no toast).
- **Cancelling a drag** (Esc, drop on invalid area, or mode switch): no JSON write.

### Inspector Dock Sizing

- Fixed defaults for MVP: right dock ~320 px wide, bottom dock ~280 px tall.
- User resizing is post-MVP; the dock toggle (right ↔ bottom) is the only size-related control in MVP.

### Action-Index Conflicts (B10)

- Imported branches with duplicate `action_index` are surfaced in the inspector's empty-state overview (the profile overview shown when nothing is selected), with a blocking-issue count and click-through to the affected resources.
- Repair (system reallocation) uses existing branch-model paths; canvas does not introduce a new repair surface.

## Out Of Scope (MVP)

- mini-map
- multi-select
- bulk operations beyond the `批量候选` panel
- keyboard reordering of custom usages
- snapshot / restore of canvas history
- snap-to-grid layout (none; layout is data-driven)
- free positioning of custom cards (anchor + `arrayIndex` remains the source of truth)
- user-resizable inspector dock
- inline source code editing inside canvas mode (C21 jump-out only)
