# Resource Branch Count Requirement

## Background

The current profile resource model:

```ts
interface ProfileStandardVariantRef {
  kind: "standard";
  resource_instance_id: string;
  variant_id: string;
  selected_branch_id?: string;
  enabled: boolean;
  folder?: string;
  overrides?: ProfileStandardSlotOverrides;
}

interface ProfileCustomResourceRef {
  kind: "custom";
  resource_instance_id: string;
  selected_branch_id?: string;
  enabled: boolean;
  folder?: string;
}
```

Each profile slot binds one branch of a compute-resource instance. The
implicit quantity is always 1.

Real platforms carry multiple identical units (e.g. 4 radars, 8
missiles). Users must currently create duplicate resource families to
express quantity, which is error-prone and violates the "one family,
many branches" model from `profile-resource-branch-uiux`.

## Goals

- Allow a profile branch binding to carry a **count** expressing how
  many identical units of that branch are equipped.
- Allow **multiple branches within a single compute-resource instance**
  to be active simultaneously, each with its own count.
- Preserve backward compatibility: omitted count defaults to 1.
- Include count in the runtime export JSON so the simulation engine can
  instantiate the correct number of compute units.
- Show count in both canvas and non-canvas editor UIs.

## Non-Goals

- Do not introduce per-unit configuration differences (all N units of
  the same branch share identical configuration).
- Do not implement code changes in this package.
- Do not change the chain execution order model — count is purely a
  resource-binding quantity, not an execution multiplier.

## Model Changes

### Profile Branch Binding

Add an optional `count` field to both branch binding types:

```ts
interface ProfileStandardVariantRef {
  kind: "standard";
  resource_instance_id: string;
  variant_id: string;
  selected_branch_id?: string;
  enabled: boolean;
  folder?: string;
  overrides?: ProfileStandardSlotOverrides;
  /** Number of identical units equipped. Default: 1. */
  count?: number;
}

interface ProfileCustomResourceRef {
  kind: "custom";
  resource_instance_id: string;
  selected_branch_id?: string;
  enabled: boolean;
  folder?: string;
  /** Number of identical units equipped. Default: 1. */
  count?: number;
}
```

Constraints:

- `count` must be a positive integer (≥ 1).
- `count` omitted or `undefined` → treated as 1.
- `count: 0` is invalid and must be rejected at validation time.

### Multi-Branch Activation

The current model enforces one branch per resource instance per
profile (Decision B8 from `profile-resource-branch-uiux`). This
package proposes relaxing B8 to allow **multiple branch bindings for
the same `resource_instance_id`**, each selecting a different
`selected_branch_id` with its own `count` and `enabled` state.

This means a profile's `resources[]` array could contain:

```json
[
  {
    "kind": "standard",
    "resource_instance_id": "radar-alpha",
    "selected_branch_id": "search-mode",
    "enabled": true,
    "count": 2
  },
  {
    "kind": "standard",
    "resource_instance_id": "radar-alpha",
    "selected_branch_id": "track-mode",
    "enabled": true,
    "count": 2
  }
]
```

Uniqueness constraint shifts from `resource_instance_id` alone to the
pair `(resource_instance_id, selected_branch_id)`.

**Open question**: whether B8 relaxation is done in this package or
deferred to a follow-up. The count feature can land first with the B8
single-branch constraint intact (one branch per instance, just with a
count). Multi-branch activation can follow.

## Runtime Export

The runtime export JSON must include count so the simulation engine
knows how many compute units to instantiate.

### Current export shape (resource participation)

The current runtime report emits resource participation as part of the
chain execution plan. The exact export shape depends on the runtime
report builder (`runtimeReport.ts`), but conceptually each resource
binding resolves to a set of compute nodes in the execution plan.

### Proposed export addition

Each resolved resource participation entry should carry:

```ts
{
  resource_instance_id: string;
  branch_id: string;
  count: number;          // always ≥ 1
  compute_nodes: [...];   // resolved from branch
}
```

The engine uses `count` to instantiate N identical compute pipelines
for the same branch configuration.

**Open question**: does the engine need per-unit indexing in the export
(e.g. `unit_index: 0..N-1`), or is a plain count sufficient? This
depends on runtime addressing semantics (e.g., "radar unit #2 detects
target" vs. "some radar detects target").

## Canvas Display

### Coverage Card

Coverage cards on the freeform canvas currently show:

```text
雷达 Alpha · search-mode
```

With count, show a badge when count > 1:

```text
雷达 Alpha · search-mode  ×4
```

The `×N` badge uses a distinct style (e.g., smaller font, muted
accent color) to distinguish quantity from the resource/branch label.

When count is 1 (the default), no badge is shown — this preserves
backward-compatible visual parity.

### Inspector

The inspector panel for a selected coverage card should show:

- Resource instance display name
- Selected branch display name
- Count control: a compact numeric stepper (`- [N] +`) allowing
  the user to adjust count from 1 upward
- The stepper is profile-local state (same as `enabled`, `folder`)

### Multi-Branch Visual (if B8 is relaxed)

If multiple branches of the same resource instance are active, each
gets its own coverage card in the cluster. The coverage cards share
the same resource instance name but show different branch names:

```text
雷达 Alpha · search-mode  ×2
雷达 Alpha · track-mode   ×2
```

## Non-Canvas Editor (List View)

The existing list-view resource editor under `活跃资源` / `停用资源`
must also expose the count field.

### Resource Row

Each resource row in the sidebar tree currently shows:

```text
雷达 Alpha · search-mode
```

With count > 1, append the badge:

```text
雷达 Alpha · search-mode  ×4
```

### Resource Detail Panel

The opened resource detail panel (the main workspace when a resource
row is clicked) should include a count control in the header area,
near the branch selector and enable/disable toggle. Same compact
numeric stepper as the canvas inspector.

### Batch Operations

If the non-canvas editor supports multi-select in the future, count
should be bulk-editable (set all selected to the same count). This is
a future consideration, not an MVP requirement.

## Validation

- `count` must be a positive integer.
- `count: 0` or negative values are blocking validation errors.
- Non-integer values (e.g. `count: 1.5`) are blocking errors.
- If B8 is relaxed: duplicate `(resource_instance_id, selected_branch_id)`
  pairs in the same profile are blocking errors.

## Migration

- Existing profile JSON files omit `count`. The reader treats missing
  `count` as 1. No file rewrite needed.
- First write that touches the resource slot (any edit) should persist
  the explicit `count` value.
- No schema version bump needed — the field is additive and optional.

## Open Questions

| # | Question | Notes |
| --- | --- | --- |
| 1 | Should B8 (one branch per instance) be relaxed now or later? | Count can land first with B8 intact; multi-branch follows |
| 2 | Does runtime export need per-unit indexing? | Depends on engine addressing model |
| 3 | Should count have a maximum cap? | Practical limit TBD (e.g., 999) |
| 4 | How does count interact with chain execution order? | Count is resource-binding quantity, not execution multiplier — but runtime may need clarification |
