# Profile Resource Branch UIUX Pitfalls

## Ambiguous Variant vs Branch Semantics

The current `model_variants[]` already uses variant language. The frozen branch model removes `model_variants[]` from the profile-facing workflow.

Risk: exposing both branch switching and `model_variants[]` selection in profile UI would make it unclear which one controls the effective implementation.

Implementation should treat existing `model_variants[]` as migration input unless a separate future branch-internal model-binding design is accepted.

## Shared Code References

Branch editing cannot be safe if two branches point at the same managed source file.

Branch copy must create isolated managed files or explicitly preserve external references with write confirmation.

## Silent Shared Branch Mutation

Profile-context editing is dangerous if it mutates a branch used by other profiles without warning.

The shared branch guard is required before implementing broad branch editing. Profile-context editors should only directly edit branches exclusively used by the current profile slot; shared branch mutation belongs in the global compute-instance branch editor with explicit risk context.

## Action Index Conflicts

Custom branch copying or legacy import can duplicate `action_index` values if allocation only checks the current branch or current profile.

The frozen rule is project-global uniqueness across all custom branches. Every allocator, branch copy, interface generation, save, migration, and export path must validate against the full project index set.

## Profile Rows Becoming Too Dense

Rows need branch identity, status, and issue hints, but should remain scannable.

Prefer:

```text
Family name · Branch name       compact badges
```

Avoid turning every row into a large card in the sidebar. Branch switching belongs in the opened main workspace, not in the sidebar row.

## Duplicate Family Slots

Allowing the same compute-resource family to appear multiple times in one profile makes branch switching, export semantics, and user expectations too complex.

The profile UI should reject duplicate `resource_instance_id` slots. If a user tries to add a resource family that is already present, guide them to switch the existing slot's branch instead.

## Migration Surprise

Moving existing `src/`, `include/`, or `artifact/` directories during automatic migration can break external expectations.

Prefer in-memory compatibility first, then explicit migration if needed.
