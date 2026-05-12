# 04 Verification

## Acceptance Criteria

- A compute resource can be opened and edited without being added to a profile.
- Resource metadata saves back to the resource JSON file.
- Resource JSON uses `implementation.source_files`, `implementation.runtime_artifact`, and `implementation.status`; `implementation.build` is not edited by MVP UI.
- Resource JSON does not write top-level `location` or top-level `impl_kind`.
- Resource JSON contains one primary `implementation`, not `implementations[]`.
- A new resource can be saved as a draft with only `resource_kind` and `display_name`.
- Draft resources can be added to a profile only as disabled by default.
- Active/export validation blocks draft or incomplete resources.
- Optional templates prefill suggestions without changing the resource schema.
- Built-in and project templates are discovered separately and shown with source labels.
- Saving a resource as a template excludes implementation files, runtime artifacts, generated state, and profile usage.
- Copying a resource never creates shared source-file references.
- Copying with code implementation creates new source-file refs under a new resource directory.
- Copying without code implementation clears source-file and runtime-artifact associations.
- New managed resources are stored under `.tinder/resources/<kind>/<resource_instance_id>/resource.json`.
- Managed source refs use resource-package-relative paths.
- External source refs are marked external and require per-generation confirmation before generated writes.
- `构建与产物` is not shown as a top-level MVP tab.
- Multi-implementation target fields are not written and are not treated as a future upgrade path.
- Standard resource `model_variants[]` continue to work under the single implementation.
- Runtime export does not ask the user to choose an implementation target.
- Profile files are not changed by ordinary resource edits.
- Existing source files can be associated with a resource.
- New implementation files can be created from templates.
- Generated marker health is shown.
- Interface generation follows safe write rules.
- Interface generation can add missing generated entries and handler/function stubs when safe.
- Existing handler/function bodies and comments are preserved.
- Resource-level and node-level `status` can be edited.
- Runtime artifact association is visible.
- Code edit mode opens the active source file in the main work area.
- Code edit mode uses a compact source-file switcher, not a nested left file tree.
- Right assistant panel exposes `文档`, `接口`, `问题`, and `AI` contexts.
- AI context is present only as a UI placeholder and does not perform writes.
- Resource configuration, active code file, and interface generation states are displayed separately.
- `保存资源配置` does not write source-file contents.
- `保存代码文件` does not write resource JSON.
- `生成/更新接口` shows preview/impact summary before writing generated regions or missing stubs.
- External modifications are detected and not overwritten automatically.
- Standard resource editor exposes variant-scoped standard-node coverage.
- Standard resource validation prevents multiple effective candidates for the same resource variant and standard `node_id`.
- Custom resource editor exposes custom actions with generated `action_index`, parameters, status, and handler mapping.
- Custom action placement and execution order are not edited from the resource editor.
- `使用情况` is not shown as a first-class MVP tab.
- `概要` shows a compact, read-only profile usage summary.

## Manual Smoke Tests

1. Create a new custom compute resource with only type and name; confirm it saves as draft.
2. Create a new standard compute resource from a detector template; confirm template fields are prefilled but still draft.
3. Save a resource as a project template and confirm the template contains no source file paths or runtime artifact paths.
4. Copy a resource with `复制代码实现 = yes`; confirm files are copied and source refs point to the new files.
5. Copy a resource with `复制代码实现 = no`; confirm source refs and runtime artifact path are cleared.
6. Confirm custom `action_index` values are reassigned in both copy paths.
7. Create a managed resource and confirm it writes `.tinder/resources/<kind>/<resource_instance_id>/resource.json`.
8. Create a new source file and confirm it is stored as a managed path such as `src/main.cpp`.
9. Associate an external source file and confirm generated writes require explicit confirmation every time.
10. Add a draft resource to a profile and confirm it is disabled by default.
11. Confirm export blocks an active draft or incomplete resource.
12. Associate a `.py` file.
13. Add a custom node and generate interface.
14. Confirm handler comments are created once.
15. Re-run generation and confirm handler body/comments are preserved.
16. Add the resource to a profile and confirm profile refs only store usage.
17. Edit resource-level and node-level `status`.
18. Associate a runtime artifact path.
19. Open code edit mode and switch between associated source files through the dropdown/menu.
20. Verify right assistant panel context switching.
21. Create a standard resource variant and select one effective candidate for a standard node.
22. Try to select two effective candidates for the same variant and standard node; confirm validation blocks it.
23. Confirm custom action usage links navigate to profile chain editing without mutating placement automatically.
24. Confirm usage is visible from `概要` and does not allow profile mutation.
25. Edit resource metadata and confirm only resource configuration becomes dirty.
26. Edit code and confirm only the active code file becomes dirty.
27. Run interface generation and confirm preview appears before any write.
28. Modify the same source file externally while open and confirm the editor does not overwrite it automatically.
29. Confirm no build command/log UI is required in MVP.

## Validation Cases

- Missing implementation file path.
- Missing `implementation.runtime_artifact.path`.
- Missing runtime artifact for native runtime export.
- Active draft resource.
- Template-generated suggestion not completed by the user.
- Project template tries to include implementation source or artifact paths.
- Copied resource still references original source files.
- Copy target directory contains an existing file with the same name.
- Copied custom resource keeps original `action_index` values.
- Managed source ref uses an absolute path instead of resource-package-relative path.
- Generated write targets an external file without explicit confirmation.
- External write confirmation is remembered as long-term authorization.
- Dirty resource configuration when switching resource.
- Dirty code file when switching active source/resource.
- External modification of resource JSON or source file while open.
- Malformed generated markers.
- Handler function signature mismatch.
- Generated interface conflict affects an active node.
