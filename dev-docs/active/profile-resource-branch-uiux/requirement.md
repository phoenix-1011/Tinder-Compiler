# Profile Resource Branch UIUX Requirement

## Background

The current app has these concepts:

- `.tinder/profiles/*.json` configuration profiles
- `.tinder/resources/<kind>/<resource_instance_id>/resource.json` compute resources
- standard-resource `model_variants[]`
- profile `resources[]` refs that currently point at a standard `variant_id` or a custom resource

The next UIUX step needs a clearer branch model because users work primarily from configuration profiles and expect edits there to affect the currently selected implementation branch.

## Goals

- Treat compute resources as families that contain one or more branches.
- Treat branches as complete editable versions, including implementation code and runtime artifact association.
- Let a profile reference a selected branch slot for each participating resource.
- Preserve fast branch switching inside a profile.
- Prevent accidental edits to branches shared by other profiles.
- Support profile-context branch editing as a first-class workflow.
- Make branch usage visible before editing or deleting a branch.
- Keep runtime export deterministic by resolving profile refs to exact branch IDs.

## Non-Goals

- Do not keep branch implementation as a shallow overlay on top of a shared resource implementation.
- Do not silently mutate a shared branch from a profile edit session.
- Do not make profile refs store duplicated implementation details.
- Do not require users to leave the profile tree to edit the branch used by that profile.
- Do not remove the global `计算实例` library; it remains the family/branch management surface.

## Product Model

### Resource Family

A compute-resource family is the stable library object:

```ts
interface ComputeResourceFamily {
  schema_version: 3;
  resource_kind: "standard" | "custom";
  resource_instance_id: string;
  display_name: string;
  description?: string;
  tags?: string[];
  default_branch_id?: string;
  branches: ComputeResourceBranchSummary[];
}
```

The family is what appears under global `计算实例 / 标准` and `计算实例 / 自定义`.

### Branch

A branch is the effective editable version:

```ts
interface ComputeResourceBranch {
  branch_id: string;
  display_name: string;
  description?: string;
  status: "draft" | "active" | "disabled";
  implementation: ComputeResourceImplementation;
  notes?: string;
  created_from_branch_id?: string;
  created_at?: string;
  updated_at?: string;
}
```

Standard-resource branches additionally own:

```ts
compute_nodes: StandardComputeCandidate[];
effective_candidates: Record<string, string>;
```

Custom-resource branches additionally own:

```ts
custom_nodes: CustomComputeNodeDef[];
```

Decision B10 is frozen: custom `action_index` values are system-managed, not ordinary user-authored fields. They must be unique across the project-level compute-instance SSOT, including all custom resource families and all custom branches, regardless of whether a branch is currently referenced by any profile or enabled for export. The allocator may use monotonic, sparse, or random candidate generation, but every allocation and generation pass must validate against the full known project index set before writing.

Decision B9 is frozen: a profile slot may override which existing standard candidate is effective for that slot only. This is profile-owned projection state and must not mutate the compute branch. If a profile user changes implementation content, branch metadata, or the candidate set itself, that is a branch edit; for a shared branch, the profile-context UI must offer the same two actions as code edits: create a new current-profile branch, or jump to the global compute-instance branch editor.

The profile-facing workflow does not select `model_variants[]`. Existing `model_variants[]` data should be treated as migration input or as a future internal branch-level concept only if a separate model-binding need is proven later.

### Profile Branch Slot

Profile participation should be modeled as a branch slot:

```ts
type ProfileResourceSlot =
  | ProfileStandardBranchSlot
  | ProfileCustomBranchSlot;

interface ProfileStandardBranchSlot {
  kind: "standard";
  resource_instance_id: string;
  /** Current branch selected by this profile slot. */
  selected_branch_id: string;
  enabled: boolean;
  folder?: string;
  overrides?: {
    /**
     * Profile-local usage override. A string selects an existing candidate for
     * this slot only; null clears the branch default for this slot.
     */
    effective_candidates?: Record<string, string | null>;
  };
}

interface ProfileCustomBranchSlot {
  kind: "custom";
  resource_instance_id: string;
  /** Current branch selected by this profile slot. */
  selected_branch_id: string;
  enabled: boolean;
  folder?: string;
}
```

The profile owns:

- selected branch ID
- active/disabled state
- profile-local folder
- profile-local standard effective-candidate overrides
- custom-node usage placement

The branch owns:

- capability metadata
- implementation files
- runtime artifact
- generated interface state
- branch-level validation state

Decision B3 is frozen: all editable implementation content belongs to the branch. Resource-family metadata must not own a shared editable implementation that profile-context branch edits would mutate.

Decision B6 is frozen: `计算实例` is the source of truth for branch content. Configuration profiles are projection layers over that source of truth. Profile files must not duplicate branch-owned implementation content.

Profile files may store standard candidate overrides only as slot-local usage choices. The selected branch remains the implementation SSOT; profile overrides must never duplicate code, candidate definitions, branch metadata, or generated interface state.

## Profile UI Requirements

### Resource Row

Each profile resource row should show:

- resource family display name
- selected branch display name
- branch status
- blocking/warning issue count when available
- coverage or custom-node summary
- usage hint when selected branch is shared

Example:

```text
雷达 Alpha · production-a
审计工具集 · default
```

The sidebar tree must not host direct branch switching. It should stay a compact navigation surface. Branch switching belongs in the opened main workspace for that profile slot.

### Branch Dropdown

The branch selector in the opened main workspace is a profile-level operation. It changes only `selected_branch_id`.

It should include:

- current branch
- all branches in the same resource family
- branch status
- usage count
- validation hint
- `+ 基于当前分支创建新分支`
- `管理全部分支…`

Switching branches should not copy or edit branch content.

### Profile-Context Editing

Clicking a profile resource row opens the selected branch editor with profile context:

```text
production / 雷达 Alpha / production-a
```

The branch editor must allow editing all branch-owned content:

- branch name and description
- branch status
- standard compute candidates and effective selection
- custom nodes and action indexes
- implementation source files
- runtime artifact path
- generated interface state
- validation issues

### Shared Branch Guard

Before editing a branch from a profile context:

- detect whether the selected branch is referenced by profile slots other than the current slot
- if the branch is used exclusively by the current profile slot, allow direct editing in profile context
- if shared, block direct profile-context edits
- show a risk warning explaining which other profiles/slots may be affected
- provide a primary action to create a new branch for the current profile slot
- provide a quick action to open the selected branch in the global `计算实例` branch editor
- after creating a new branch, automatically update the current profile slot to the new `selected_branch_id` and allow direct editing
- shared-branch modification through the jump path is a deliberate global compute-instance maintenance operation

Global `计算实例` context may allow direct shared-branch editing, but the UI must show impact and usage clearly before mutation.

## Global Compute-Instance Requirements

The global `计算实例` tree opens the resource-family / branch management surface.

It owns workflows that are broader than one profile slot:

- list all branches for one resource family
- create a new branch
- copy an existing branch
- delete an unused branch
- rename branch
- edit shared branches deliberately
- show which profiles and slots reference each branch
- show cross-profile impact before shared-branch mutation
- open a branch editor without a profile-specific edit guard, but with explicit usage/risk context

The global surface should not hide profile usage. A shared branch edit is allowed only as an explicit maintenance action with visible impact.

## Branch Management MVP

MVP includes:

- profile sidebar rows showing compact `计算实例 · 分支` labels
- click profile resource row to open profile-context branch editor
- branch switching in the opened main workspace
- `创建当前档案分支` from profile context
- shared-branch guard with `创建当前档案分支` and `在计算实例中打开并修改`
- global compute-instance branch list
- create branch from blank/current/other branch in global context
- copy branch
- rename branch
- delete branch only when unused by profiles
- branch usage display
- branch editor for branch-owned content
- explicit risk/impact display for shared branch editing

MVP excludes:

- branch diff
- branch merge
- branch history
- branch rollback
- permissions or lock management
- branch template marketplace
- nested branch-internal `model_variants[]`
- automatic cleanup of legacy root-level `src/`, `include/`, or `artifact`
- multi-user conflict resolution

## Branch Copy Requirements

Creating a branch from another branch should:

- allocate a unique `branch_id`
- copy branch metadata
- copy standard compute nodes and effective selections, or custom nodes
- copy managed source files into the new branch directory
- rewrite managed source references to the new branch
- rewrite managed Python source runtime artifacts to the copied source file when the artifact is the branch's source entry
- clear compiled/binary runtime artifact paths by default and mark artifact state as pending
- do not inherit external runtime artifact paths automatically; require reselection or explicit confirmation
- mark generated/interface state as pending when source paths or generated regions change
- allocate fresh unique `action_index` values for copied custom nodes
- update generated custom dispatch/registry surfaces so copied implementation code matches the new indexes

Imported or legacy data may contain duplicate `action_index` values. Such conflicts must be surfaced as blocking issues for interface generation and runtime export. The preferred repair path is system reallocation with preview so generated dispatch metadata and branch JSON stay synchronized.

Global branch-copy UI may expose an advanced `复制运行产物` option for managed artifacts, but it must default off. If enabled, copied binary artifacts should still be marked unverified/pending until validation confirms they are usable for the copied branch.

## Fast Branch Switching

Fast switching is preserved by treating the profile row as a family row with a selected branch dropdown.

Important rule:

```text
切换分支 = profile ref update
编辑分支 = branch content update
创建当前档案分支 = copy current slot branch + update profile ref
```

Switching to another branch should update chain projection and export validation immediately.

## Branch Creation Modes

Profile-context creation:

- exposed as `创建当前档案分支`
- always copies the branch currently selected by the current profile slot
- creates the new branch under the same compute-resource family
- automatically updates the current profile slot to the new branch
- then allows profile-context editing because the new branch is exclusive to that slot
- does not offer blank creation in this context

Global compute-instance creation:

- exposed as `新建分支…`
- may start from a blank branch
- may copy the currently selected branch
- may copy another branch from the same resource family
- does not automatically update any profile slot unless launched from a profile-specific action that explicitly says it will switch the slot

## Branch Storage

Managed branch storage uses per-branch directories:

```text
.tinder/resources/<kind>/<resource_instance_id>/
  resource.json
  branches/
    <branch_id>/
      branch.json
      src/
      include/
      artifact/
```

Family `resource.json` owns only family-level metadata and branch index state.

Branch `branch.json` owns all branch-level editable content and uses paths relative to the branch directory for managed files.

New branch-aware writes must not place editable branch implementation files in family-level `src/`, `include/`, or `artifact`.

## Legacy V2 Migration

Legacy v2 resource package:

```text
.tinder/resources/<kind>/<resource_instance_id>/
  resource.json
  src/
  include/
  artifact/
```

Branch-aware target package:

```text
.tinder/resources/<kind>/<resource_instance_id>/
  resource.json
  branches/
    <branch_id>/
      branch.json
      src/
      include/
      artifact/
  _legacy-backup/
    resource.v2.json
```

Migration flow:

1. Detect legacy v2 package.
2. Compatibility-read it as a family plus synthetic/migrated branches.
3. Allow browsing and runtime export without rewriting disk.
4. Before the first branch write, prompt the user to migrate.
5. Create branch directories.
6. Write branch JSON files.
7. Copy legacy managed files into each branch directory.
8. Rewrite root `resource.json` as family metadata.
9. Map old profile `variant_id` refs to `selected_branch_id`.
10. Save old v2 `resource.json` under `_legacy-backup/resource.v2.json`.

The legacy snapshot is inert. It exists only as an old-version snapshot for manual reference or recovery. It must not be used by normal branch-aware reads, exports, validation, generation, or writes after migration.

## Duplicate Family In One Profile

Decision B8 is frozen:

- a configuration profile must not contain multiple slots for the same `resource_instance_id`
- one compute-resource family appears at most once under a profile
- users choose between implementations by switching `selected_branch_id`
- if parallel use is truly required, users should create/copy a separate compute-resource family with a different `resource_instance_id`

Allowed:

```text
雷达 Alpha · default
雷达 Beta · hi-precision
```

Not allowed:

```text
雷达 Alpha · default
雷达 Alpha · hi-precision
```
