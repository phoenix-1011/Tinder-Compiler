# 01 Plan

## Confirmed

- Compute resources can be edited before joining a configuration profile.
- Code/source files can be associated with compute resources.
- Code/source files are not draggable profile resources.
- Resource metadata and build configuration belong to the resource.
- Profile files only reference resources and store usage/orchestration choices.
- A dedicated compute resource editor is needed.
- Implementation schema is upgraded fully to `implementation.source_files`, `implementation.build`, `implementation.runtime_artifact`, and `implementation.status`.
- Target schema does not preserve legacy top-level `location` or implementation compatibility fields.

## Current Discussion Points

1. Confirm whether MVP supports only one primary `implementation` object or multiple implementation targets.
2. Confirm MVP build/check behavior for Python and C++.
3. Confirm exact tabs and first-screen layout.
4. Confirm how usage information is discovered from profile files.

## Near-Term Output

- A stable UIUX requirement for the resource editor.
- A schema proposal for implementation files and build config.
- A minimal implementation path that does not block the chain assembly package.
