# Profile Resource Branch UIUX Verification

## Product Verification

Before implementation:

- confirm implementation plan follows frozen decisions B1-B13

## Test Data Requirements

Fixtures should include:

- one resource family with two standard branches
- one profile using branch A
- another profile using branch A to trigger shared edit guard
- one profile using branch B
- one custom resource family with two branches
- one attempted duplicate family slot that validation/UI rejects
- one custom branch copy that receives fresh unique `action_index` values
- one imported duplicate `action_index` fixture that blocks generation/export
- branch with managed source files
- branch with external source refs
- draft branch with missing runtime artifact
- active branch with valid runtime artifact
- branch copy from Python managed source artifact preserves a valid copied source artifact ref
- branch copy from compiled/binary artifact clears or marks artifact pending
- branch copy from external artifact requires reselection/confirmation

## UI Verification

Profile tree:

- branch names appear next to resource-family names
- sidebar tree does not expose direct branch switching
- branch switching is available in the main workspace
- switching branch updates chain projection
- active/disabled still works at slot level
- folder move still works at slot level
- adding the same `resource_instance_id` twice is rejected or converted into a branch-switch action

Global branch management:

- global compute-instance branch list shows all branches for a family
- branch list shows usage by profile/slot
- create branch supports blank/current/other branch sources in global context
- unused branches can be deleted
- used branches cannot be deleted without first removing profile refs
- shared branch opened globally shows impact/risk context

Branch editor:

- opening from profile shows profile/family/branch context
- shared branch shows edit guard
- private branch allows edits directly
- shared branch guard lists affected profiles/slots
- shared branch guard can create a new current-profile branch and switch the slot
- shared branch guard provides quick jump to global compute-instance branch editor

Runtime/export:

- export resolves selected branch implementation
- switching branch changes export output
- disabled slots do not export
- duplicate family slots are rejected before export
- duplicate `action_index` values block export even if they came from legacy/imported data

## Technical Verification

Minimum checks once code changes exist:

```text
pnpm --filter @tinder/nextstep typecheck
pnpm --filter @tinder/desktop typecheck
pnpm typecheck
```

Targeted manual checks:

- load existing v2 resources without disk migration
- save new branch-aware resources
- reload app and confirm branch selection persists
- confirm legacy profile refs migrate predictably
