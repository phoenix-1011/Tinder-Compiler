# Compute Resource Editor UIUX Roadmap

## Decision Log

| ID | Topic | Decision | Rationale |
| --- | --- | --- | --- |
| R1 | Edit before profile membership | Compute resources can be edited before `加入档案`. | Resources are reusable assets, not profile-local rows. |
| R2 | Code file association | `.py`, `.cpp`, `.h`, and related files are associated from the resource editor, not dragged into profiles. | Code files implement resources; profile refs consume resources. |
| R3 | Resource editor shape | Use a tabbed resource workspace: `概要`, `能力节点`, `实现文件`, `构建与产物`, `文档与接口`, `使用情况`. | This keeps repeated resource editing dense but navigable. |
| R4 | Build ownership | Build/check configuration belongs to the compute resource. | Build commands and output paths are reusable with the resource. |
| R5 | Profile boundary | Profiles store only participation and orchestration choices. | Avoid duplicating implementation details across profiles. |
| R6 | MVP native build | MVP may execute configured build commands and capture logs instead of managing full native project systems. | This supports real compilation without overcommitting to one toolchain. |
| R7 | Interface safety | Use the marker/write rules from the chain assembly package. | Interface generation must not overwrite user code. |
| R8 | Implementation schema | Use a full `implementation` object with `source_files`, `build`, `runtime_artifact`, and `status`. | Source files, build behavior, and engine-loaded artifacts have different lifecycles. |
| R9 | No legacy implementation fields | Do not keep `location` or top-level implementation compatibility fields in the target schema. | The product is still being shaped, so a clean schema is cheaper than carrying semantic drift forward. |

## Open Questions

- Which build command presets should be offered for C++ first?
- Should one resource support multiple implementation targets later, or only one primary `implementation` object in MVP?
- Which build command presets should be offered for C++ first?

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
- define build/check configuration schema
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
- define build/output panel
- define usage panel

Done when:

- each tab has clear data ownership and expected actions

## Phase 3 - Implementation Slice

Deliverables:

- select/open resource editor from `计算实例`
- edit and save resource metadata
- associate implementation files
- run basic Python checks / configured build command
- show build logs and artifact status

Done when:

- a resource can be edited and validated without being added to a profile

## Phase 4 - Integration

Deliverables:

- chain assembly links to resource editor
- resource editor shows profile usage
- runtime export consumes effective resource implementation state

Done when:

- resource editing and profile assembly are linked without sharing ownership incorrectly
