# Profile Resource Branch UIUX Implementation Notes

## Existing Code Touch Points

Likely affected areas once implementation starts:

- `packages/nextstep/src/types.ts`
- `packages/nextstep/src/model.ts`
- `apps/desktop/src/renderer/state/chainAssemblyStorage.ts`
- `apps/desktop/src/renderer/state/ChainAssemblyContext.tsx`
- `apps/desktop/src/renderer/state/chainProjection.ts`
- `apps/desktop/src/renderer/state/runtimeReport.ts`
- `apps/desktop/src/renderer/components/ChainAssemblyView.tsx`
- `apps/desktop/src/renderer/components/ResourceEditorView.tsx`
- `apps/desktop/src/renderer/components/ResourceCapabilityTab.tsx`
- `apps/desktop/src/renderer/state/testData.ts`

## Compatibility Strategy

Do not start by rewriting all persisted resources.

Recommended adapter sequence:

1. Parse current v2 resource packages as a family with a synthetic `default` branch.
2. Keep existing UI working through projected legacy shapes.
3. Add branch-aware helpers beside existing resource helpers.
4. Update profile refs only after branch-slot schema is stable.
5. Add explicit disk migration later if needed.

## Legacy Snapshot

During explicit migration, save the old v2 `resource.json` as an inert legacy snapshot, for example:

```text
_legacy-backup/resource.v2.json
```

This file is not part of normal application state after migration. Branch-aware readers must ignore it except for explicit manual inspection/recovery tooling.

## Branch Editing Guard

Profile-context editor should compute branch usage:

```text
selected resource_instance_id + selected_branch_id
  -> count profile slots referencing it
  -> if referenced outside current slot, branch is shared
```

The editor should allow branch-owned edits only when the selected branch is used exclusively by the current profile slot.

For shared branches, the editor should block direct profile-context edits and show:

```text
该分支被其他配置档案引用，直接修改会影响这些档案。
创建当前档案分支
在计算实例中打开并修改
```

`创建当前档案分支` should:

- create a new branch from the selected branch
- copy branch metadata and managed files
- update the current profile slot to the new `selected_branch_id`
- reload profile/resource state
- continue editing in profile context

`在计算实例中打开并修改` opens the same selected branch in the global compute-instance branch editor. That editor must show branch usage/impact before mutation.

## Branch Selector Behavior

The sidebar row should not contain an interactive branch selector. It should render a compact single-line label such as `雷达 Alpha · production-a`.

The interactive branch selector should live in the opened main workspace for the selected profile slot.

Changing the selection:

- updates profile slot only
- does not copy files
- does not modify branch JSON
- refreshes chain projection and validation

## Branch Creation Behavior

Profile-context `创建当前档案分支`:

- source branch is always the current slot's `selected_branch_id`
- target branch is created in the compute-instance family
- managed files are copied into the new branch directory
- managed Python source runtime artifacts are redirected to the copied source entry
- compiled/binary runtime artifacts are cleared by default and marked pending
- external runtime artifacts are not inherited automatically
- profile slot is updated only after branch copy succeeds
- user continues in the profile-context branch editor

Global `新建分支…`:

- source may be blank, current branch, or another selected branch in the same family
- does not update profile slots by default

## Custom Action Index Allocation

`action_index` is a system-managed project-global identifier. The uniqueness scope is all custom branches in the project, not just active profile selections or export participants.

Allocation must scan all known custom compute-resource branches before assigning an index. A random allocator is acceptable only if it still validates that the generated value is unused before writing.

Required validation points:

- custom node creation
- branch copy
- interface generation
- branch save
- runtime export
- legacy/import migration

Branch copy should allocate fresh indexes for copied custom nodes and then update generated dispatch/registry metadata. If source files contain user-authored logic keyed directly by old numeric indexes outside generated regions, the generator should surface a conflict or warning rather than silently rewriting user code.

## Naming

Use user-facing `分支`.

Prefer code naming:

- `branch_id`
- `selected_branch_id`
- `ComputeResourceFamily`
- `ComputeResourceBranch`
- `ProfileResourceSlot`

Avoid using `variant` for the new product concept unless referring to legacy compatibility.

## Standard Candidate Selection

Implement profile-local standard candidate overrides only for selecting among existing candidates on the selected branch.

When a profile user changes which candidate implements a standard chain node:

- if the change is only "which existing candidate is effective for this slot", write `profile.resources[].overrides.effective_candidates`
- if the change edits code, candidate definitions, candidate membership, or branch metadata, treat it as editing the selected branch
- if branch editing is needed and the selected branch is exclusive to the current profile slot, edit directly in profile context
- if branch editing is needed and the branch is shared, show the shared branch guard with `创建当前档案分支` and `在计算实例中打开并修改`
- when creating a current-profile branch from a slot with overrides, bake the overrides into the new branch and clear the profile override

Existing `model_variants[]` should be treated as legacy/migration input until a separate branch-internal model-binding design is accepted.
