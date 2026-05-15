# Profile Resource Branch UIUX Plan

## Immediate Plan

1. Implement the frozen B1-B13 semantics in schema/storage behind compatibility adapters.
2. Add branch-aware in-memory projection for existing v2 resources.
3. Add profile slot reads/writes with `selected_branch_id`.
4. Add branch package read/write/copy/migration helpers.
5. Wire profile resource rows and main-workspace branch switching.
6. Wire profile-context shared branch guard and global compute-instance branch management.

## Recommended First Implementation Slice

The first code slice should be intentionally small:

- add a branch-aware in-memory model while preserving current disk compatibility
- compatibility-read existing v2 resources as families with synthetic branches
- map current profile `variant_id` refs to `selected_branch_id` through the adapter
- update profile resource rows to display compact `计算实例 · 分支` labels
- keep direct branch switching out of the sidebar tree
- avoid moving implementation files until explicit migration is triggered by the first branch write

## Risks To Resolve Before Coding

- If legacy `model_variants[]` are exposed as a live profile-facing selector, it will conflict with the frozen branch model.
- If code files remain family-level after branch-aware writes, profile-context branch editing will still mutate shared implementation accidentally.
- If `action_index` allocation does not scan every custom branch in the project, branch copy/import can create hidden runtime conflicts.
- If migration is implicit or lossy, existing profile refs could silently change behavior.

## Working Assumptions

- Branch is the profile-facing implementation unit.
- Branch-owned implementation files should be physically isolated when branch-specific edits are allowed.
- Profile switching between branches should be fast and should not copy files.
- Profile-context editing should be direct only for branches exclusively used by the current profile slot. Shared branches should offer either profile-local branch creation or global compute-instance editing with explicit risk context.
