# Profile Resource Branch UIUX Implementation Readiness

## Verdict

The product decisions B1-B13 are implementation-ready. The first code pass should not jump directly into UI rewrites; it should introduce a branch-aware normalized model and compatibility adapters around the current v2 resource system.

The current codebase still uses:

- `ComputeResourceV2` as the resource editor / runtime export unit
- `ProfileResourceRef.variant_id` as the standard-resource selection field
- `resource-editor://<kind>/<resourceId>` tabs
- `.tinder/resources/<kind>/<resource_instance_id>/resource.json` v2 packages

The branch implementation should preserve those paths through adapters until branch storage and profile refs are stable.

## Current Code Anchors

Primary type/model files:

- `packages/nextstep/src/types.ts`
- `packages/nextstep/src/model.ts`

Renderer storage and state:

- `apps/desktop/src/renderer/state/chainAssemblyStorage.ts`
- `apps/desktop/src/renderer/state/ChainAssemblyContext.tsx`
- `apps/desktop/src/renderer/state/chainProjection.ts`
- `apps/desktop/src/renderer/state/runtimeReport.ts`
- `apps/desktop/src/renderer/state/WorkspaceContext.tsx`

Renderer UI:

- `apps/desktop/src/renderer/components/ChainAssemblyView.tsx`
- `apps/desktop/src/renderer/components/ResourceEditorView.tsx`
- `apps/desktop/src/renderer/components/ResourceCapabilityTab.tsx`
- `apps/desktop/src/renderer/components/EditorArea.tsx`

Test fixtures:

- `apps/desktop/src/renderer/state/testData.ts`

## New Type Layer

Add branch-aware types beside existing v2 types first. Do not delete `ComputeResourceV2` in the first slice.

Recommended additions in `packages/nextstep/src/types.ts`:

```ts
export interface ComputeResourceFamilyFile {
  schema_version: 3;
  resource_kind: ComputeResourceKind;
  resource_instance_id: string;
  display_name: string;
  description?: string;
  tags?: string[];
  default_branch_id: string;
  branches: ComputeResourceBranchSummary[];
  created_at?: string;
  updated_at?: string;
}

export interface ComputeResourceBranchSummary {
  branch_id: string;
  display_name: string;
  status: ComputeResourceStatus;
  updated_at?: string;
}

interface ComputeResourceBranchCommon {
  schema_version: 3;
  resource_kind: ComputeResourceKind;
  resource_instance_id: string;
  branch_id: string;
  display_name: string;
  description?: string;
  status: ComputeResourceStatus;
  implementation: ComputeResourceImplementation;
  notes?: string;
  created_from_branch_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface StandardComputeResourceBranch
  extends ComputeResourceBranchCommon {
  resource_kind: "standard";
  compute_nodes: StandardComputeCandidate[];
  effective_candidates: Record<string, string>;
}

export interface CustomComputeResourceBranch
  extends ComputeResourceBranchCommon {
  resource_kind: "custom";
  custom_nodes: CustomComputeNodeDef[];
}

export type ComputeResourceBranch =
  | StandardComputeResourceBranch
  | CustomComputeResourceBranch;
```

Profile refs should move to branch slots while accepting legacy refs during migration:

```ts
export type ProfileResourceSlot =
  | ProfileStandardBranchSlot
  | ProfileCustomBranchSlot;

export interface ProfileStandardBranchSlot {
  kind: "standard";
  resource_instance_id: string;
  selected_branch_id: string;
  enabled: boolean;
  folder?: string;
  overrides?: {
    effective_candidates?: Record<string, string | null>;
  };
}

export interface ProfileCustomBranchSlot {
  kind: "custom";
  resource_instance_id: string;
  selected_branch_id: string;
  enabled: boolean;
  folder?: string;
}
```

Compatibility rule:

- keep `ProfileResourceRef` as an accepted legacy union for now
- normalize it to `ProfileResourceSlot` at read time
- write new profile files with `selected_branch_id`

## Model Helpers

Add or update helpers in `packages/nextstep/src/model.ts`.

Required pure helpers:

```ts
export const DEFAULT_BRANCH_ID = "default";

export function branchKey(kind, resourceInstanceId, branchId): string;

export function profileSlotKey(slot: ProfileResourceSlot): string;
// B8: key is kind + resource_instance_id, not branch_id.

export function normalizeProfileResourceSlot(
  ref: ProfileResourceRef | ProfileResourceSlot
): ProfileResourceSlot;

export function normalizeProfileToBranchSlots(
  profile: GuiProjectFile,
  extras?: ProfileExtrasLike
): GuiProjectFile;

export function familyBranchSummary(
  branch: ComputeResourceBranch
): ComputeResourceBranchSummary;

export function projectBranchToV1Resource(
  family: ComputeResourceFamilyFile,
  branch: ComputeResourceBranch
): PlatformResourceInstance | CustomNodeConfig;
```

Important behavior:

- `profileSlotKey` must reject/dedupe duplicate `resource_instance_id` slots in one profile.
- Legacy `variant_id` maps to `selected_branch_id`.
- Legacy custom refs without branch id map to `selected_branch_id = "default"`.
- `projectBranchToV1Resource` is temporary compatibility for existing sidebar/chain projection code.

## Storage Constants

Add constants in `apps/desktop/src/renderer/state/chainAssemblyStorage.ts`:

```ts
export const RESOURCE_BRANCHES_DIR = "branches";
export const RESOURCE_BRANCH_FILE = "branch.json";
export const LEGACY_BACKUP_DIR = "_legacy-backup";
export const LEGACY_V2_RESOURCE_FILE = "resource.v2.json";
```

## Storage Shapes

Introduce normalized resource library state while preserving current tree rendering.

Suggested renderer-only types:

```ts
export interface ResourceFamilyEntry {
  kind: "standard" | "custom";
  family: ComputeResourceFamilyFile;
  familyDir: string;
  branches: ComputeResourceBranchEntry[];
  legacyV2?: {
    sourcePath: string;
    resource: ComputeResourceV2;
    projectedBranchIds: string[];
  };
}

export interface ComputeResourceBranchEntry {
  branch: ComputeResourceBranch;
  branchDir: string;
  metadataPath: string;
}

export interface BranchResourceIndex {
  familyById: Map<string, ResourceFamilyEntry>;
  branchByKey: Map<string, ComputeResourceBranchEntry>;
}
```

`DiskState` should gain branch-aware fields:

```ts
resourceFamilies: {
  standard: ResourceFamilyEntry[];
  custom: ResourceFamilyEntry[];
};
resourceIndex: BranchResourceIndex;
```

Keep existing `standardTree` / `customTree` initially by projecting each family/default branch to legacy leaf data. This limits the first UI blast radius.

## Resource Package Readers

Add these storage helpers:

```ts
readResourceFamilyPackage(familyDir, kind): Promise<ResourceFamilyEntry>
readBranchPackage(familyDir, family, branchId): Promise<ComputeResourceBranchEntry>
readLegacyV2AsFamily(familyDir, kind, rawText): Promise<ResourceFamilyEntry>
writeResourceFamily(paths, family): Promise<void>
writeResourceBranch(paths, family, branch): Promise<void>
```

Legacy projection:

- no `branches/` directory and `resource.json` parses as `ComputeResourceV2`
- standard resource:
  - `model_variants.length === 0` => one synthetic `default` branch
  - `model_variants.length === 1` => one branch from that variant id
  - `model_variants.length > 1` => one synthetic branch per variant
- custom resource:
  - one synthetic `default` branch

Legacy projected branches should use the current package root as their effective branch dir until explicit migration. They are readable/exportable but not writable as branch storage.

## Explicit Migration Transaction

Add a migration plan before writing files:

```ts
interface LegacyV2MigrationPlan {
  kind: "standard" | "custom";
  familyDir: string;
  legacyResourcePath: string;
  legacyResource: ComputeResourceV2;
  targetFamily: ComputeResourceFamilyFile;
  targetBranches: Array<{
    branch: ComputeResourceBranch;
    branchDir: string;
    filesToCopy: Array<{ from: string; to: string }>;
  }>;
  profileUpdates: Array<{
    profilePath: string;
    from: { resource_instance_id: string; variant_id?: string };
    to: { resource_instance_id: string; selected_branch_id: string };
  }>;
}
```

Execution order:

1. Preflight: target branch dirs do not collide, files are readable, target profile files are writable.
2. Create `_legacy-backup/resource.v2.json` from old root `resource.json`.
3. Create `branches/<branch_id>/`.
4. Copy legacy managed `src/`, `include/`, `artifact/` files into each branch directory.
5. Write every `branches/<branch_id>/branch.json`.
6. Write family-level `resource.json`.
7. Rewrite affected profiles from `variant_id` to `selected_branch_id`.
8. Reload `DiskState`.

Failure policy:

- before step 6, old v2 root `resource.json` is still authoritative
- after step 6, branch storage is authoritative
- `_legacy-backup/resource.v2.json` is inert and ignored by normal readers
- do not delete root-level legacy `src/`, `include/`, or `artifact` in MVP

## Branch Usage Index

Build usage from normalized profiles:

```ts
interface BranchUsage {
  profileId: string;
  profileName: string;
  resourceInstanceId: string;
  selectedBranchId: string;
  enabled: boolean;
  folder?: string;
}

function collectBranchUsage(disk): Map<string, BranchUsage[]>;
```

Usage key:

```text
<kind>:<resource_instance_id>:<branch_id>
```

Use it for:

- profile-context shared branch guard
- global branch usage display
- delete branch gating
- branch row badges

Shared guard rule:

- exclusive if usage count is exactly one and points to the current profile slot
- otherwise shared

## Branch Copy Service

Add one storage-level service in `ChainAssemblyContext` or a dedicated branch storage module:

```ts
copyBranch(params: {
  kind: "standard" | "custom";
  resourceInstanceId: string;
  sourceBranchId: string;
  newBranchName: string;
  mode: "profile-current" | "global";
  updateProfileSlot?: {
    profileId: string;
  };
}): Promise<{ branchId: string; branchDir: string }>;
```

Behavior:

- source is current slot branch for profile-context creation
- global creation may be blank/current/other branch
- managed source files are copied
- managed Python source artifact refs are rewritten to copied source
- binary artifact refs are cleared by default and set pending
- external artifact refs are not inherited unless explicit future UI confirms it
- custom branches receive fresh project-global unique `action_index` values
- update generated registry/dispatch metadata if generation can do so safely; otherwise surface pending/conflict
- profile slot is updated only after branch copy succeeds

## Custom Action Index Allocator

Add one allocator API:

```ts
collectProjectActionIndexes(index: BranchResourceIndex): Set<number>
allocateProjectActionIndex(index: BranchResourceIndex): number
allocateProjectActionIndexesForBranchCopy(branch, index): ComputeResourceBranch
validateProjectActionIndexes(index): ValidationIssue[]
```

Required validation points:

- custom node create
- branch copy
- branch save
- interface generation
- runtime export
- legacy/import migration

Do not validate only against active profile selections.

## Runtime Projection And Export

Current `runtimeReport.ts` consumes `ComputeResourceV2[]`. Replace it through a normalized resolver:

```ts
interface ResolvedProfileSlot {
  slot: ProfileResourceSlot;
  family: ComputeResourceFamilyFile;
  branch: ComputeResourceBranch;
}

resolveProfileSlots(profile, resourceIndex): {
  activeStandard: ResolvedProfileSlot[];
  activeCustom: ResolvedProfileSlot[];
  disabled: ResolvedProfileSlot[];
  missing: ProfileResourceSlot[];
}
```

Runtime report should validate:

- missing family
- missing selected branch
- duplicate `resource_instance_id` slots
- branch status/artifact/generated-region issues
- project-global duplicate `action_index`
- custom usages reference active custom slot and selected branch node

Runtime config should read:

- standard coverage and effective candidates from selected standard branches plus profile slot overrides
- custom node definitions from selected custom branches
- artifact path from selected branch implementation

## Workspace Routing

The existing `resource-editor://<kind>/<resourceId>` route cannot distinguish global branch editing from profile-context branch editing.

Add a new branch editor route:

```text
branch-editor://global/<kind>/<resourceId>/<branchId>
branch-editor://profile/<profileId>/<kind>/<resourceId>/<branchId>
```

Workspace document fields should include:

```ts
branchId?: string;
branchEditorContext?: "global" | "profile";
profileId?: string;
profileDisplayName?: string;
```

Profile sidebar row click opens `branch-editor://profile/...`.

Global `计算实例` branch list opens `branch-editor://global/...`.

The old resource editor can remain for legacy/global resource editing until branch editor parity is reached, but new branch-aware profile flows should use branch editor routes.

## UI Components

Recommended split:

- `BranchEditorView.tsx`
  - loads selected family/branch from `DiskState.resourceIndex`
  - renders context header
  - owns shared guard UI
  - delegates body tabs to existing resource editor sections where possible
- `BranchSwitcherDialog.tsx`
  - main-workspace branch switching
  - writes profile slot only
- `BranchManagementView.tsx`
  - global family branch list
  - create/copy/rename/delete branch
  - usage display

Reuse existing:

- `ResourceCapabilityTab.tsx` after props are changed from `ComputeResourceV2` to `ComputeResourceBranch`
- `ResourceEditorView.tsx` sections where possible, but avoid continuing the old resource-family mental model in profile context

## Implementation Slices

### Slice 1 - Types And Normalization

Files:

- `packages/nextstep/src/types.ts`
- `packages/nextstep/src/model.ts`

Deliverables:

- branch/family/profile-slot types
- legacy profile ref normalization
- slot key / duplicate detection
- project branch-to-v1 projection helpers

Acceptance:

- package typecheck passes
- current v2 fixtures can be represented as branch-aware in-memory objects

### Slice 2 - Storage Adapter

Files:

- `apps/desktop/src/renderer/state/chainAssemblyStorage.ts`
- `apps/desktop/src/renderer/state/testData.ts`

Deliverables:

- branch-aware resource family readers
- legacy v2 projection
- `DiskState.resourceFamilies` and `resourceIndex`
- old `standardTree` / `customTree` still populate from projection

Acceptance:

- existing app tree still loads
- no disk migration occurs during browsing

### Slice 3 - Profile Slot Writes

Files:

- `packages/nextstep/src/model.ts`
- `apps/desktop/src/renderer/state/ChainAssemblyContext.tsx`
- `apps/desktop/src/renderer/components/ChainAssemblyView.tsx`

Deliverables:

- add/drop/switch resources using `selected_branch_id`
- duplicate `resource_instance_id` rejection
- compact `计算实例 · 分支` labels
- branch switching only in main workspace

Acceptance:

- adding same family twice guides to switching existing slot
- active/disabled/folder operations still work

### Slice 4 - Branch Copy And Migration

Files:

- `chainAssemblyStorage.ts`
- `ChainAssemblyContext.tsx`
- `interfaceGeneration.ts`

Deliverables:

- explicit legacy migration plan/executor
- branch copy service
- artifact policy
- project-global `action_index` allocation

Acceptance:

- profile-context `创建当前档案分支` copies selected branch and switches slot
- copied custom branch receives fresh unique action indexes
- legacy snapshot is inert

### Slice 5 - Branch Editor And Global Management

Files:

- `WorkspaceContext.tsx`
- `EditorArea.tsx`
- new `BranchEditorView.tsx`
- new `BranchManagementView.tsx`

Deliverables:

- global/profile branch editor routes
- shared branch guard
- global branch list and usage display
- create/copy/rename/delete unused branch

Acceptance:

- shared branch from profile offers both actions
- global shared edit shows usage impact

### Slice 6 - Runtime Projection And Export

Files:

- `chainProjection.ts`
- `runtimeReport.ts`
- `ChainEditorView.tsx`

Deliverables:

- selected branch resolution
- branch-owned candidate selection
- selected custom branch node export
- duplicate action index blocking validation

Acceptance:

- switching selected branch changes projection and export
- missing branch/family reports blocking issue

## Pre-Implementation Checklist

- B1-B13 remain frozen.
- No profile-facing `model_variants[]` selector is introduced.
- No branch-owned implementation content is written at family level.
- Legacy migration is explicit and write-triggered.
- Every branch-copy path uses the project-global action index allocator.
- New UI route distinguishes profile-context and global branch editing.
- Runtime export resolves selected branches, not resource families.
