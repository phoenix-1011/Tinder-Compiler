# Compute Resource Editor UIUX Roadmap

## Decision Log

| ID | Topic | Decision | Rationale |
| --- | --- | --- | --- |
| R1 | Edit before profile membership | Compute resources can be edited before `加入档案`. | Resources are reusable assets, not profile-local rows. |
| R2 | Code file association | `.py`, `.cpp`, `.h`, and related files are associated from the resource editor, not dragged into profiles. | Code files implement resources; profile refs consume resources. |
| R3 | Resource editor shape | Use a tabbed resource workspace: `概要`, `能力节点`, `实现文件`, `文档与接口`. `构建与产物` and `使用情况` are not first-class tabs in MVP. | Keep the editor focused on high-frequency editing instead of making it feel like a profile management surface. |
| R4 | Artifact ownership | Runtime artifact association belongs to the compute resource. | The artifact is part of the reusable implementation state consumed by runtime export. |
| R5 | Profile boundary | Profiles store only participation and orchestration choices. | Avoid duplicating implementation details across profiles. |
| R6 | Build system deferral | Compilation/build command UI is deferred; MVP focuses on metadata editing, source/artifact association, interface generation, comments, and status editing. | Build integration is a separate concern and should not slow down the resource editor UX foundation. |
| R7 | Interface safety | Use the marker/write rules from the chain assembly package. | Interface generation must not overwrite user code. |
| R8 | Implementation schema | Use a full `implementation` object with `source_files`, `build`, `runtime_artifact`, and `status`. | Source files, build behavior, and engine-loaded artifacts have different lifecycles. |
| R9 | No legacy implementation fields | Do not keep `location` or top-level implementation compatibility fields in the target schema. | The product is still being shaped, so a clean schema is cheaper than carrying semantic drift forward. |
| R10 | Single implementation target | One compute resource has exactly one primary `implementation`. Multi-implementation targets are not planned as an MVP or later upgrade path. | Multiple implementation targets would split source/build/export ownership and add avoidable complexity that does not match the current resource semantics. |
| R11 | Multi-model variants remain | Standard resources still support multiple `model_variants` under one primary `implementation`. | Device/model differences are capability-selection concerns, not separate source/build/artifact targets. |
| R12 | MVP tab scope | MVP enables `概要`, `能力节点`, `实现文件`, and `文档与接口`. `构建与产物` is hidden; artifact summary appears in `概要` / `实现文件`. `使用情况` is downgraded to a read-only usage summary inside `概要`. | Usage impact and artifact association are useful context, but neither is frequent enough to deserve a top-level tab in this slice. |
| R13 | Code editing mode layout | Code editing uses the main work area with a lightweight source-file switcher; do not add a second left file tree inside the resource editor. | The app already has navigation trees, and a resource-local file tree would be redundant. |
| R14 | Right assistant panel | Code mode has a right-side assistant panel with `文档` / `接口` / `问题` / `AI` switches; AI is UI-only placeholder for now. | LLM participation should be planned in the UX without binding this slice to a harness or write path. |
| R15 | Standard resource editor semantics | Standard resources edit variant-scoped coverage of standard chain nodes. A resource variant can keep multiple candidate versions for a standard node, but only one candidate is effective for the same resource variant and standard `node_id`. | Standard resources answer which reusable capability covers which standard node for a model/variant; they do not define free execution order. |
| R16 | Custom resource editor semantics | Custom resources edit reusable custom actions: `custom_nodes[]`, required description, auto-generated `action_index`, parameters, status, and handler mapping. Chain insertion and order remain owned by configuration profiles. | Custom resources expose actions that can be inserted into chains, while profile chain editing owns where and when they execute. |
| R17 | Usage summary | Show profile usage as a compact, read-only summary inside `概要`, with optional expansion and links to open the owning profile. | The main value is impact awareness before editing; mutation still belongs to configuration profile editing. |
| R18 | Draft creation | New resources require only `resource_kind` and `display_name`; everything else is generated, defaulted, or template-prefilled. Draft resources can be saved and can be added to a profile as disabled, but cannot be exported as effective runtime config until blocking validation is cleared. | Creation should be lightweight, while activation/export still enforce correctness. |
| R19 | Creation templates | Resource creation accepts optional built-in templates and project templates, such as blank, detector, strike, platform service, environment service, or signal service. Templates prefill suggestions and defaults but do not change the resource schema or create an automatically valid runtime resource. | Future domain templates can be added without changing the core resource model. |
| R20 | Save and dirty states | Show resource configuration, code file, and interface generation states separately. `保存资源配置`, `保存代码文件`, and `生成/更新接口` are separate actions; interface generation is the only action allowed to cross the resource/code boundary and must use preview plus safe-write rules. | Users need to know exactly which artifact changed, which artifact is unsaved, and whether generation touched code. |
| R21 | Template sources | MVP supports built-in templates and project templates only. Project templates live under `.tinder/resource-templates/`. There is no separate user-template layer. | User templates and project templates are too close semantically; project templates are enough for team reuse. |
| R22 | Save as template | MVP may allow saving a compute resource as a project template, but templates must exclude concrete implementation references, source files, runtime artifacts, generated state, and profile usage. If the user needs implementation files and artifact references, use resource copy instead. | Templates are for reusable structure and suggestions; copies are for concrete implemented resources. |
| R23 | Copy resource | Use one `复制计算实例` entry with a dialog option `复制代码实现`. Default is yes: copy implementation files into a new resource directory. If no, copy only resource structure and clear implementation associations. Copying must never create shared source-file references between two resources. | Shared source files would make interface generation, manual edits, and regenerated `action_index` values affect another resource invisibly. |
| R24 | Resource package layout | Reuse the current `.tinder/resources/{standard,custom}` library. A managed resource should be stored as `.tinder/resources/<kind>/<resource_instance_id>/resource.json` with implementation files under sibling `src/`, `include/`, and optional `artifact/` directories. | This matches the existing configuration-profile resource library instead of introducing a separate `.tinder/compute-resources` concept. |
| R25 | Managed vs external files | `implementation.source_files[]` records whether each source file is `managed` or `external`. Managed files live under the resource package and use resource-relative paths; external files are references and require explicit write confirmation. | The editor can safely copy/generate managed files while still supporting existing code outside the Tinder resource package. |
| R26 | External write confirmation | Every interface generation preview must list external files that would be modified and require explicit confirmation for that generation. MVP does not remember long-term external-write authorization. | This keeps external code edits deliberate without adding permission-state complexity. |
| R27 | First implementation slice | Start implementation with schema/types, resource package discovery/read/write, and create/copy/save flows. Defer the full code editor surface and full interface generator until the resource storage foundation is stable. | The first slice should establish durable data ownership before adding heavier UI and code-generation behavior. |

## Open Questions

- None for the current planning pass.

## Phase 0 - Discussion Package

Deliverables:

- create this dev-docs package
- record editor goals and boundaries
- seed first decision points

Done when:

- docs exist and can be used for discussion

## Phase 1 - Schema Alignment

Deliverables:

- define resource-level implementation association schema
- define runtime artifact association schema
- define usage query shape
- align with existing `@tinder/nextstep` types

Done when:

- resource/profile/runtime ownership is unambiguous

## Phase 2 - Editor UI Design

Deliverables:

- define resource editor navigation
- define standard resource panels
- define custom resource panels
- define implementation file panel
- define future build/artifact entry point without implementing build workflows
- define overview usage summary

Done when:

- each tab has clear data ownership and expected actions

## Phase 3 - Implementation Slice

Deliverables:

- select/open resource editor from `计算实例`
- add schema/types for resource packages and implementation refs
- discover/read/write `.tinder/resources/<kind>/<resource_instance_id>/resource.json`
- create draft resources
- copy resources with or without code implementation
- edit and save resource metadata
- associate implementation files
- associate runtime artifact
- generate/update interfaces, handlers, comments, and generated regions
- edit resource/node capability `status`
- show separate dirty/save/interface states

Done when:

- a resource can be edited and validated without being added to a profile

## Phase 4 - Integration

Deliverables:

- chain assembly links to resource editor
- resource editor shows profile usage summary
- runtime export consumes effective resource implementation state

Done when:

- resource editing and profile assembly are linked without sharing ownership incorrectly
