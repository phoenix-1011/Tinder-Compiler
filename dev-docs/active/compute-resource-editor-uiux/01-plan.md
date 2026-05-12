# 01 Plan

## Confirmed

- Compute resources can be edited before joining a configuration profile.
- Code/source files can be associated with compute resources.
- Code/source files are not draggable profile resources.
- Resource metadata and runtime artifact association belong to the resource.
- Profile files only reference resources and store usage/orchestration choices.
- A dedicated compute resource editor is needed.
- Implementation schema is upgraded fully to `implementation.source_files`, `implementation.runtime_artifact`, and `implementation.status`; `implementation.build` is future-only for this UIUX slice.
- Target schema does not preserve legacy top-level `location` or implementation compatibility fields.
- Each compute resource supports exactly one primary `implementation`; multi-implementation targets are not planned as a later upgrade path.
- Standard resources still support multiple `model_variants` under that one implementation.
- Build/compilation workflows are deferred; MVP focuses on UIUX for source association, artifact association, interface generation, generated comments, handler/function entry maintenance, and capability `status` editing.
- Code editing mode uses the main work area, not a nested left file tree.
- Code mode has a right assistant panel with `文档` / `接口` / `问题` / `AI`; AI is UI-only placeholder in this slice.
- Standard compute resource editing is variant-scoped standard-node coverage, not free chain ordering.
- Custom compute resource editing is reusable custom action definition; profile chain editing owns insertion position and execution order.
- `使用情况` is not a top-level tab in MVP; profile usage is a read-only summary inside `概要`.
- New resources are saved as drafts with minimal required input: resource kind and display name.
- Creation templates are optional prefill mechanisms, not separate schema branches.
- Templates have two sources in MVP: built-in templates and project templates.
- Saving a compute resource as a template creates a project template without concrete implementation files or runtime artifacts.
- Copying a compute resource uses one dialog and must never create shared source-file references.
- Copying code implementation is the default; copying without code clears source and artifact associations.
- Managed compute resources follow `.tinder/resources/<kind>/<resource_instance_id>/resource.json`.
- Source file refs distinguish managed resource-package files from external associations.
- `构建与产物` is hidden in MVP; artifact summary appears in `概要` and `实现文件`.
- External generated writes require explicit confirmation each time; no long-term authorization memory in MVP.
- First implementation slice starts with schema/types, resource package discovery/read/write, and create/copy/save flows.
- Resource configuration, active code file, and interface generation state are displayed separately.
- Interface generation can cross the resource/code boundary only through preview and safe-write rules.

## Current Discussion Points

- None for the current planning pass.

## Near-Term Output

- A stable UIUX requirement for the resource editor.
- A schema proposal for implementation files and runtime artifact association.
- A minimal implementation path that does not block the chain assembly package.
