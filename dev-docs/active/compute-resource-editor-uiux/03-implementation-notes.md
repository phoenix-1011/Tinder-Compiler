# 03 Implementation Notes

## Current Repo Touchpoints

Likely touchpoints:

- `packages/nextstep/src/types.ts`
- `packages/nextstep/src/model.ts`
- `apps/desktop/src/renderer/components/ChainAssemblyView.tsx`
- `apps/desktop/src/renderer/state/ChainAssemblyContext.tsx`
- future `ComputeResourceEditor` components

## Implementation Strategy

- Keep the new editor independent from runtime export at first.
- Add resource creation helpers that separate required input, generated fields, defaults, and template-prefilled suggestions.
- Discover built-in templates and project templates; do not introduce a user-template location in MVP.
- Store template origin as metadata only; do not branch runtime/export logic by template.
- Implement save-as-template as a structural export that strips implementation and profile-specific data.
- Implement copy-resource as a separate operation that either copies implementation files into a new resource directory or clears implementation associations.
- Use `.tinder/resources/<kind>/<resource_instance_id>/resource.json` for new managed resource packages.
- Add `storage: managed | external` to source file refs and treat managed paths as resource-package-relative.
- Require per-generation confirmation before generated writes touch external files; do not store long-term external-write permission in MVP.
- Add pure helpers for implementation file refs, runtime artifact refs, interface status, and capability status normalization.
- Add editor-local save state for resource config, active code file, and interface generation.
- Normalize only the new `implementation` object; do not introduce legacy `location` or top-level `impl_kind` compatibility paths.
- Do not add build/check execution in this UIUX slice.
- Reuse marker safety decisions from the chain assembly package.
- Treat profile usage summary as a derived read model from `.tinder/profiles/**/*.json`.

## MVP Implementation Focus

- create standard/custom draft resources from minimal input
- apply optional resource creation templates
- save a resource as a project template without concrete implementation references
- copy a resource without sharing source-file references
- create managed resource packages and managed source files under `.tinder/resources`
- associate external source files without treating them as profile resources
- resource metadata editing
- source file association and creation
- runtime artifact association
- generated marker health display
- code edit mode in the main work area
- compact source-file switcher for `implementation.source_files[]`
- right assistant panel context switcher: `文档`, `接口`, `问题`, `AI`
- automatic interface entry generation
- generated comments
- handler/function entry maintenance
- resource and node capability `status` editing
- standard resource variant switcher and effective-candidate selection
- custom resource action editor with generated `action_index`, parameters, handler mapping, and usage links
- compact read-only usage summary inside `概要`
- separate dirty/save state indicators and navigation prompts
- external modification detection and non-overwrite behavior
- first implementation slice: schema/types, resource package discovery/read/write, create/copy/save flows

## Risks

- Treating templates as resource subclasses instead of prefill/suggestion sources.
- Letting save-as-template leak concrete source paths, runtime artifacts, generated state, or profile usage into templates.
- Adding a user-template layer that duplicates project-template semantics.
- Creating two resources that point to the same source file after copy.
- Introducing `.tinder/compute-resources` and splitting the resource library semantics.
- Treating external source files as safe to modify without explicit confirmation.
- Adding durable external-write authorization state before the write model is proven.
- Starting with the full code editor before resource package storage and save semantics are stable.
- Forgetting to reassign custom `action_index` values during copy.
- Letting draft resources export as effective runtime resources.
- Collapsing resource JSON save and code-file save into one ambiguous operation.
- Letting interface generation write across boundaries without preview or impact summary.
- Overwriting externally modified resource/code files automatically.
- Letting future build-system concepts leak into current UI copy.
- Adding a redundant resource-local left file tree.
- Treating AI UI placeholder as an implemented harness or automatic write path.
- Letting the resource editor become a second chain ordering editor.
- Allowing multiple effective standard candidates for the same resource variant and standard `node_id`.
- Storing build details in profiles by accident.
- Letting file associations become draggable resource refs.
- Treating generated code conflicts as warnings when they should block interface generation/export.
- Accidentally writing old implementation fields alongside `implementation`.
