# 04 Verification

## Planning Package Verification

### 2026-05-11

Checks to perform after creating this package:

- Confirm package files exist:
  - `requirement.md`
  - `roadmap.md`
  - `00-overview.md`
  - `01-plan.md`
  - `02-architecture.md`
  - `03-implementation-notes.md`
  - `04-verification.md`
  - `05-pitfalls.md`
- Confirm no product code was modified for this planning-only step.
- Confirm package captures:
  - current app landing points
  - legacy GUI reference points
  - target-directory storage decision
  - `计算链路组装` product target
  - generated profile/resource/scaffold scope
  - documentation-linked interface generation scope
  - `链路` / `活跃资源` / `停用资源` / `使用与版本` profile child-view semantics
  - layered activation/selection model
  - canonical JSON runtime config decision
  - MVP scope
  - open questions

## Future Implementation Verification

### Typecheck

Run after code changes:

```powershell
pnpm --filter @tinder/nextstep typecheck
pnpm --filter @tinder/desktop typecheck
```

### Build

Run when UI implementation reaches a stable slice:

```powershell
pnpm --filter @tinder/desktop build
```

### Manual Smoke Test

Use a sample data root with at least one standard resource JSON file.

Steps:

1. Open Chain Assembly.
2. Select the data root.
3. Select a standard resource.
4. Add a compute-node attachment.
5. Pick a canonical chain node.
6. Edit the compute-node display name.
7. Save the resource.
8. Reload the data root.
9. Verify the resource JSON still contains the edited `compute_nodes`.
10. Remove the compute node and save again.
11. Create or update a configuration profile from the board.
12. Add another compute node and verify interface generation runs automatically.
13. Verify the scaffold gains the required entry/registry item without duplicating existing functions or overwriting user-authored function bodies.
14. Open the selected node's documentation summary from the inspector.

Expected result:

- Only the selected resource JSON file changes.
- Profile JSON files do not change unless the user explicitly edits profile-owned data.
- Generated profile JSON is parseable as `GuiProjectFile`.
- Generated/updated profile JSON contains `resources[]` when standard variants or custom resources are added to the profile.
- Standard profile refs include `resource_instance_id` and `variant_id`.
- Configuration profiles include only participating standard variants, not all variants under the selected standard resource.
- `resources[].enabled` drives `活跃资源` / `停用资源` placement for standard variants and custom resources.
- `resources[].folder` preserves profile-local virtual subfolder placement.
- Standard and custom compute instances both render correctly under profile `活跃资源` / `停用资源` after being added to the profile.
- `加入档案` adds an existing standard variant or custom resource to `resources[]` without modifying the resource JSON.
- Drag/drop into `活跃资源` records `enabled: true`.
- Drag/drop into `停用资源` records `enabled: false`.
- Drag/drop accepts resource metadata items only.
- `.py`, `.dll`, and source files are associated through explicit resource edit actions, not dragged directly.
- `计算实例/标准` resources validate `compute_nodes[].node_id` against the generated canonical standard chain catalog.
- Standard resource normal editor renders as capability list plus selected-node detail/docs/actions.
- Standard resource add/bind flow provides searchable standard catalog selection and selected-node documentation/interface preview.
- Standard resource editing does not expose standard-node reordering.
- Standard resource editing does not expose concrete runtime `device_id` as an authoring target.
- Standard resource editing exposes model/variant configs with applicability/model or service scope.
- Every standard variant has explicit applicability; `default` variants are explicit service/global variants, not unbound variants.
- Standard resource editing supports manual variant creation and variant copy.
- A standard resource can contain capabilities for multiple standard chain nodes.
- A standard resource can contain multiple candidate versions for the same standard chain node.
- Standard resource-to-chain-node linking requires a target model/variant config.
- Unselected candidate versions remain valid and do not appear as missing coverage errors.
- Validation blocks two selections with the same resource variant + standard `node_id`.
- Validation blocks variant selections that reference missing candidates, disabled candidates, or candidates whose `node_id` does not match the selection.
- Validation rejects a variant whose applicability scope is not allowed by the selected standard node provider/applicability metadata.
- Copying a standard resource variant creates a new independent variant with a unique `variant_id`.
- Editing a copied variant does not mutate the source variant, and editing the source does not mutate the copy.
- Copied variants have no inheritance metadata, parent pointer, or override state in MVP.
- Chain projection shows duplicate coverage as multiplicity grouped by node and applicability/model scope.
- `计算实例/自定义` resources can contain multiple custom compute nodes.
- Each custom compute node definition validates `node_id`, globally unique `action_index`, default parameter metadata, and capability `status` independently.
- New custom node creation requires a description/summary before `action_index` allocation.
- Duplicate custom `action_index` values are blocking validation failures and are not auto-repaired or silently renumbered.
- Generated custom scaffold dispatches `action_index` to the configured resource-local handler function when a handler is present.
- Generated custom scaffold preserves the user-provided description/summary as a comment near the action case, registry item, or handler stub.
- Generated-region comments update when resource metadata changes.
- Existing handler function bodies and comments are not rewritten after first creation.
- Missing, unpaired, nested, or unknown generated markers produce visible pending/conflict states.
- Each profile `custom_node_usages[]` entry validates usage `enabled` state and placement state independently.
- `计算实例/自定义` nodes validate/export as `custom_invocation_node` through runtime `custom_nodes[]` and `ordered_execution_list[]`.
- Disabled custom compute instances remain in the profile under `停用资源` but are excluded from runtime execution export.
- Disabled custom compute nodes remain visible under their resource but are excluded from runtime execution export.
- Active custom compute nodes can be inserted before the first built-in item, between built-in items, and after the last built-in item.
- Exported `ordered_execution_list` preserves the current generated built-in order exactly.
- Exported `ordered_execution_list` contains each active custom invocation at the profile-authored placement.
- Exported runtime `custom_nodes[]` includes `resource_instance_id`, `node_id`, implementation metadata, `action_index`, and runtime `enabled` derived from profile usage plus resource capability status; it does not depend on per-node `entrypoint` or per-node runtime `parameters`.
- Custom node editor exposes resource-level fields, node list, selected-node details, and non-drag placement commands.
- Missing or changed built-in placement anchors produce a visible migration warning instead of silently dropping the custom resource.
- Resource JSON stores candidate availability and `model_variants[].selections` for new standard-resource edits.
- Generated implementation scaffold exists at the resource metadata path.
- Adding a compute node automatically updates the scaffold when a safe write is possible.
- Scaffold generation rewrites marked generated regions and registries but preserves user-authored function bodies.
- Scaffold generation creates missing handler stubs once and then treats handler bodies/comments as user-owned.
- Unsafe scaffold edits create visible pending/conflict states instead of writing automatically.
- Standard shared-function activation detects inactive suffix collisions before renaming.
- Duplicate custom `action_index` values are validation errors that require explicit user resolution.
- The UI reloads without dropping or corrupting the resource.

### Suggested Helper Tests

- `chainNodeOptionsFromCatalog` returns ordered chain-node options.
- fallback chain-node options are available when catalog data is missing.
- `createPlatformComputeNode` creates unique display names where required.
- `validateResourceChainLinks` reports unknown chain-node IDs.
- `validateResourceChainLinks` reports duplicate standard selections for the same resource variant + standard `node_id`.
- `generatePythonComputeSkeleton` emits deterministic entries and registries for node IDs/action indexes.
- `mergeGeneratedSkeleton` does not duplicate existing generated functions.
- `mergeGeneratedSkeleton` preserves user-authored function bodies.

## Current Verification Status

- [x] Planning package created.
- [x] Package file existence checked after write.
- [ ] Product typecheck not run; no product code changed in this planning step.
- [ ] Manual GUI smoke test not run; implementation has not started.
