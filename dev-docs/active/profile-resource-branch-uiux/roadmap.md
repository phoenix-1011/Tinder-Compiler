# Profile Resource Branch UIUX Roadmap

## Goal

Define and implement branch-centric configuration-profile resource editing.

Profiles should present compute resources as branch slots: users can switch the selected branch quickly, and can edit the selected branch in profile context without accidentally mutating a shared implementation.

## Decisions To Align

| ID | Topic | Decision | Reason |
| --- | --- | --- | --- |
| B1 | Profile association | **Frozen:** Profile resource items are resource-family slots with a `selected_branch_id`; export, projection, and profile-context editing resolve through that selected branch. | Runtime export must resolve to exact implementation state while the UI can still present a compute-resource family row. |
| B2 | UI object | **Frozen:** Profile resource rows are compact single-line slot labels showing resource family plus selected branch; branch switching is not allowed directly in the sidebar tree and happens in the opened main workspace. | Keeps the directory tree lightweight while preserving clear branch identity and profile-context switching. |
| B3 | Branch scope | **Frozen:** Branches own all editable implementation content, including capability metadata, selected/effective nodes, implementation source files, runtime artifact refs, generated-interface state, status, notes, and validation state. | Users expect profile-context edits to affect the actual selected implementation without mutating a family-level shared implementation. |
| B4 | Shared edit guard | **Frozen:** Profile-context editing is allowed only when the selected branch is used exclusively by the current profile slot. If the branch is shared, the profile editor shows a risk warning and offers two actions: create a new branch for the current profile slot, or jump to the global compute-instance branch editor for deliberate shared modification. | Prevents accidental cross-profile mutation while supporting both profile-local divergence and intentional shared-branch maintenance. |
| B5 | Global resource role | **Frozen:** Global `计算实例` is the management surface for resource families and all branches, including shared-branch maintenance, branch create/copy/delete, usage review, and cross-profile impact assessment. | Keeps reusable library navigation while making profile editing focused on current slot usage and exclusive-branch edits. |
| B6 | Switching / editing / creation | **Frozen:** Switching branch edits only the profile slot `selected_branch_id`; editing branch edits branch-owned files/content in the compute-instance SSOT; profile-context branch creation copies the current slot's selected branch and switches the slot, while global creation may copy any branch or start blank. | Separates profile projection from compute-instance source of truth and avoids accidental empty/ambiguous profile branches. |
| B7 | Storage shape | **Frozen:** Store branch-owned metadata and files under per-branch directories inside the compute-resource family: family `resource.json`, branch `branches/<branch_id>/branch.json`, and branch-local `src/`, `include/`, `artifact/`. | Branch-owned code and artifacts need physical isolation while the compute instance remains the SSOT. |
| B8 | Duplicate family slots | **Frozen:** A configuration profile must not contain multiple slots for the same `resource_instance_id`. One compute-resource family appears at most once per profile; users switch `selected_branch_id` to choose the implementation branch. | Keeps the profile mental model simple and avoids ambiguous parallel execution of the same compute instance family. |
| B9 | Standard candidate selection | **Frozen:** A profile slot may override which existing standard candidate is effective for that slot only. The override is profile-owned projection state and does not mutate the compute branch. Editing code, branch metadata, adding/removing candidates, or changing candidate definitions remains branch-owned and uses the shared-branch guard. | Lets configuration profiles tune usage choices while preserving the compute instance as the SSOT for implementation content. |
| B10 | Custom action index allocation | **Frozen:** `action_index` is system-managed and project-globally unique across all custom compute-resource branches. Creation, branch copy, interface generation, save, and runtime export must validate uniqueness; conflicts are blocking until resolved by system reallocation or explicit repair. | Runtime custom dispatch depends on stable unique action indexes, and branch/profile switching should never introduce hidden duplicate invocation IDs. |
| B11 | Branch copy artifact policy | **Frozen:** Branch copy copies branch metadata and managed source files. Managed Python source artifacts may be redirected to the copied source file. Compiled/binary artifacts are not copied by default and become pending. External artifacts are not inherited automatically and must be reselected or explicitly confirmed. | Prevents copied branches from silently sharing stale or unsafe runtime outputs while keeping Python source-entry branches ergonomic. |
| B12 | Legacy v2 migration | **Frozen:** Legacy v2 resource packages are compatibility-read as family + branches without modifying disk. First branch write requires explicit migration. Migration writes branch-directory storage, maps old `variant_id` to `selected_branch_id`, and saves a legacy snapshot for reference only; the snapshot is not used by future reads, exports, or writes. | Avoids surprise disk rewrites while giving users a recoverable old-format snapshot during the branch-storage transition. |
| B13 | Branch management MVP | **Frozen:** MVP includes profile slot display/opening, main-workspace branch switching, current-profile branch creation, shared-branch guard, global branch list, branch create/copy/rename, delete unused branch, branch usage display, and branch editor. Diff/merge/history/rollback, permissions, branch templates marketplace, nested model variants, and automatic legacy cleanup are out of scope. | Delivers the branch workflow needed by configuration profiles without turning the first slice into a version-control system. |

## Open Questions

- None for the current decision pass.

## Phase 0 - Discussion Package

Deliverables:

- create this dev-docs package
- capture current discussion decisions
- define product model and terminology
- list open questions

Done when:

- docs are sufficient for product/schema/UI alignment

## Phase 1 - Schema Direction

Deliverables:

- encode frozen branch storage shape in TypeScript schema
- define profile branch-slot schema
- define family metadata schema
- define branch metadata schema
- implement migration model from current v2 resource packages and profile refs

Done when:

- a profile can unambiguously point at one branch
- runtime export can resolve the branch without reading ambiguous family-level implementation state

## Phase 2 - Profile UI Design

Deliverables:

- profile resource-row branch display
- branch dropdown behavior
- branch switch flow
- shared branch guard flow
- create-branch-from-current flow
- duplicate resource-family slot rejection and switch guidance

Done when:

- users can view, switch, and begin editing branch slots from `活跃资源` / `停用资源`

## Phase 3 - Branch Editor Design

Deliverables:

- branch editor header with profile context
- shared branch usage banner
- branch-owned metadata editing
- branch-owned capability editing
- branch-owned implementation/source-file editing
- validation and dirty-state rules

Done when:

- the editor no longer implies edits are made to a whole resource family when opened from a profile slot

## Phase 4 - Storage Implementation

Deliverables:

- branch package read/write helpers
- family metadata read/write helpers
- profile branch-slot read/write helpers
- branch copy helper that copies managed files safely
- migration helper for existing v2 packages

Done when:

- existing fixtures can load into branch-aware in-memory state
- new branch-aware resources can be saved and reloaded

## Phase 5 - Runtime Projection And Export

Deliverables:

- chain projection reads selected branches
- execution projection reads selected branches
- runtime report resolves selected branch implementations
- runtime export emits branch-effective resource data

Done when:

- switching branch in a profile changes chain coverage/export output deterministically

## Phase 6 - Verification And UX Polish

Deliverables:

- test data covering shared branches, private branches, attempted duplicate slots, and branch switching
- typecheck and targeted runtime-export validation
- profile resource-row visual polish
- branch editor shared-state messaging

Done when:

- branch workflow is usable without reading raw JSON

## Implementation Progress

- Phase 1 partial: branch-aware TypeScript schema, profile `selected_branch_id`, branch-family index, and selected-branch runtime projection are implemented.
- Phase 2 partial: profile resource rows open a branch workspace; branch switching writes only the current profile slot.
- Phase 2/4 partial: shared branch guard is visible in profile context; "create current-profile branch" copies the selected branch, migrates v2 resource packages on first branch write, and switches the profile slot to the new branch.
- Phase 3 partial: global/profile branch workspace shows context, branch list, usage, and shared-edit risk. Full branch-owned metadata/capability/source editing remains the next implementation slice.
- Phase 3 partial: branch workspace now supports branch-owned summary editing, standard/custom capability editing, branch save/revert, Ctrl+S dirty-state integration, and managed source-file opening from the branch directory. Standard branch editing locks legacy nested variant management so the selected branch remains the implementation boundary.
- Phase 4 partial: saving a branch updates `branches/<branch_id>/branch.json` plus the family branch summary; saving a legacy v2 projected branch performs the first branch-layout migration and writes the inert legacy snapshot.
- Readiness fixes: dirty branch switching now prompts save/discard/cancel; legacy v2 package and single-file migration share one branch-layout helper and copy managed source files for every migrated branch; global branch management now includes copying the current branch and deleting unused branches.
- Profile slot override slice: standard-resource effective candidate selection is now stored on `profile.resources[].overrides.effective_candidates`, projected over the selected branch for profile/runtime use, and does not mutate the compute branch definition. Branch metadata, code, and node structure edits still require a profile-private branch or global compute-instance editing.
