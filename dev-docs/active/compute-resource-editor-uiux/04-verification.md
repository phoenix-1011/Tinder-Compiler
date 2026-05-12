# 04 Verification

## Acceptance Criteria

- A compute resource can be opened and edited without being added to a profile.
- Resource metadata saves back to the resource JSON file.
- Resource JSON uses `implementation.source_files`, `implementation.build`, `implementation.runtime_artifact`, and `implementation.status`.
- Resource JSON does not write top-level `location` or top-level `impl_kind`.
- Profile files are not changed by ordinary resource edits.
- Existing source files can be associated with a resource.
- New implementation files can be created from templates.
- Generated marker health is shown.
- Interface generation follows safe write rules.
- Python resources can run a basic check.
- C++ resources can run a configured build command and capture logs.
- Build output existence/staleness is visible.
- Usage tab shows profiles that reference the resource.

## Manual Smoke Tests

1. Create a new custom compute resource.
2. Associate a `.py` file.
3. Add a custom node and generate interface.
4. Confirm handler comments are created once.
5. Re-run generation and confirm handler body/comments are preserved.
6. Add the resource to a profile and confirm profile refs only store usage.
7. Run Python check and inspect status.
8. Create a C++ resource with a configured command.
9. Run build and inspect log/status/output path.

## Validation Cases

- Missing implementation file path.
- Missing `implementation.runtime_artifact.path`.
- Missing build output for native runtime export.
- Malformed generated markers.
- Handler function signature mismatch.
- Build command exits non-zero.
- Output artifact is older than source files.
