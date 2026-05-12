# 05 Pitfalls

## Known Risks

### Copying Old GUI State Too Literally

The old GUI edited one `GuiProjectFile` object and stored resources in `project.platform_resources`.

The current app stores standard resources as separate files under `.tinder/resources/standard`. Copying the old state model directly would blur ownership and create profile/resource duplication.

Mitigation:

- port behavior, not structure
- write resource-chain edits back to the selected resource JSON file

### Hardcoding The Old Chain List

The old GUI used `CORE_CHAIN_IDS`.

The current repository has a generated chain catalog from docs. A hardcoded list may drift from the chain-contract docs.

Mitigation:

- prefer generated chain catalog
- keep `CORE_CHAIN_IDS` as fallback only

### Sidebar Overload

The current Chain Assembly tree already contains profile and resource navigation. Adding a full table editor inside the tree could make the sidebar cramped.

Mitigation:

- use a separate inspector component
- consider main editor area integration if the sidebar becomes too narrow

### Profile And Resource Ownership Confusion

Profiles can reference resources, while resource JSON files own their implementation and chain metadata.

Mitigation:

- keep profile-resource reference editing separate from resource-chain editing
- document which file is written before implementing save behavior

### Silent Disk Writes

The app writes real JSON files in a target directory. Silent writes can surprise users if no dirty/save state exists.

Mitigation:

- start with explicit save or clear action feedback
- show write failures through the existing dialog flow
- consider dirty-state tracking in a later slice

### Documentation As Navigation Only

The clarified product goal requires documentation to help author compute instances, not only open a help page.

Mitigation:

- show node purpose/input/output/interface hints inside the assembly inspector
- use structured chain catalog fields for scaffold comments and TODOs
- surface missing doc fields clearly

### Scaffold Generation Overwrites User Code

Generated script/native files will become user-editable implementation surfaces. A naive generator could overwrite custom logic.

Mitigation:

- generate new files conservatively
- use marked generated regions or function-existence checks
- preview scaffold changes before applying once the workflow matures

### Native Dynamic-Library Scope Creep

Generating and compiling dynamic libraries requires toolchain detection, project layout, build scripts, exports, and runtime loading rules.

Mitigation:

- implement Python script scaffolding first
- implement native source/template generation before native compilation
- keep runtime/build integration as a later explicit phase

## Resolved Pitfalls

- None yet.
