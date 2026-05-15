# Profile Resource Branch UIUX Architecture

## Ownership Layers

```text
Resource family
  owns stable identity, display name, tags, branch index

Branch
  owns editable implementation version
  owns capability metadata
  owns source files and runtime artifact refs
  owns generated-interface state, status, notes, and validation state

Profile slot
  owns selected branch id
  owns active/disabled state
  owns profile-local folder

Profile chain
  owns custom-node usage placement and execution ordering
```

`计算实例` is the source of truth. The configuration profile is only a projection over selected branches plus profile-local activation and orchestration state.

## Proposed Storage Layout

Preferred shape for managed branch resources:

```text
.tinder/
  resources/
    standard/
      radar-alpha/
        resource.json
        branches/
          default/
            branch.json
            src/
            include/
            artifact/
          production-a/
            branch.json
            src/
            include/
            artifact/

    custom/
      audit-toolkit/
        resource.json
        branches/
          default/
            branch.json
            src/
            include/
            artifact/
```

`resource.json` is family metadata. `branch.json` is branch metadata and includes branch-owned capability/implementation state.

Decision B7 is frozen:

- family `resource.json` owns family identity, display metadata, branch index, and default branch pointer
- branch `branch.json` owns branch metadata, capabilities, implementation refs, runtime artifact refs, generated-interface state, status, notes, and validation state
- branch-local `src/`, `include/`, and `artifact/` directories isolate managed files per branch
- no new branch-aware implementation content should be stored in family-level `src/`, `include/`, or `artifact/`

## Profile Shape

Profile files should eventually store branch slots:

```json
{
  "resources": [
    {
      "kind": "standard",
      "resource_instance_id": "radar-alpha",
      "selected_branch_id": "production-a",
      "enabled": true,
      "folder": "雷达"
    }
  ]
}
```

Compatibility adapters may accept the current field name `variant_id` during migration, but the product language should use `selected_branch_id` / `branch_id`.

Decision B1 is frozen: profile rows are resource-family slots whose effective implementation is resolved by `selected_branch_id`. The UI may display the family as the row label, but storage, chain projection, runtime export, and profile-context editing must resolve the selected branch explicitly.

Decision B6 is frozen: branch switching writes profile JSON only; branch editing and branch creation write compute-instance branch storage. Profile-context `创建当前档案分支` is a compound operation: copy current selected branch in the compute-instance SSOT, then update the profile slot projection to the new branch.

## Chain Projection

Chain projection should read:

```text
profile.resources[]
  -> selected branch
    -> branch.compute_nodes / branch.effective_candidates
```

For standard resources:

- coverage comes from active standard slots and their selected branches
- effective candidate selection comes from branch-owned state
- changing effective candidate selection is a branch edit and follows the same profile-context guard as code edits

For custom resources:

- available custom nodes come from the selected branch
- placement still comes from `profile.custom_node_usages[]`

## Branch Copy

Branch copy needs to be a storage-level operation, not just JSON cloning.

Required behavior:

- copy branch JSON
- copy managed files into the new branch directory
- rewrite managed file refs
- handle external refs deliberately
- avoid overwriting files silently
- update profile slot only after branch copy succeeds

## Migration Direction

Current v2 package:

```text
.tinder/resources/standard/radar-alpha/resource.json
.tinder/resources/standard/radar-alpha/src/radar.py
```

can migrate in memory as:

```text
family: radar-alpha
branch: default
branch content: old resource.json content
branch files: old src/include/artifact refs
```

Disk migration should be explicit or carefully staged because it may move files.

Compatibility mode may initially treat current v2 package-level implementation files as the synthetic `default` branch without immediately moving them on disk. New branch-aware writes should use the frozen branch-directory layout.

Decision B12 is frozen:

- legacy v2 packages are read through an adapter as resource family + branches
- browsing and runtime export do not force disk migration
- first branch write prompts explicit migration
- migration writes new branch-directory storage
- old `variant_id` profile refs map to `selected_branch_id`
- old v2 `resource.json` is saved as a legacy snapshot only
- the legacy snapshot is not a live fallback and must not be used by future reads, exports, or writes
