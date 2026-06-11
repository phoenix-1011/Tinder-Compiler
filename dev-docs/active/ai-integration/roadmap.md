# AI Integration Roadmap

## Goal

Land the first AI integration layer in `Tinder-Compiler`:

- Cursor-like AI mode and model-preset selectors
- multiple custom OpenAI-compatible API providers
- reasoning represented inside model presets as provider-mapped template slots
- Codex CLI presets as local task backends
- no harness or orchestration layer in this task package

## Planning Baseline

| Source | Path/reference | Used for | Trust level | Notes |
| --- | --- | --- | --- | --- |
| Current user request | current conversation | scope and UI target | highest | user requested task package and Cursor-like model parameter handling |
| Current app code | `D:\Tinder\Tinder-Compiler` | landing points | high | Electron/React desktop shell is the target |
| Existing architecture docs | `docs/architecture.md`, `README.md` | provider boundary and offline assumptions | high | AI package already owns provider integration |
| Existing AI package | `packages/ai/src/index.ts` | initial provider abstraction | high | needs expansion for config/presets |
| Codex manual | current local manual snapshot | `codex exec --json` behavior | high | use for CLI invocation expectations |

## Scope

Expected implementation areas:

- `packages/ai/src/index.ts`
- `apps/desktop/src/main/ai.ts` (new, proposed)
- `apps/desktop/src/main/ipc.ts`
- `apps/desktop/src/preload/index.ts`
- `apps/desktop/src/preload/api.d.ts`
- `apps/desktop/src/renderer/components/AIPanel.tsx`
- `apps/desktop/src/renderer/components/SettingsView.tsx`
- `apps/desktop/src/renderer/state/ProjectContext.tsx`
- `packages/project/src/index.ts`
- `dev-docs/active/ai-integration/*`

## Non-goals

- No harness.
- No custom tool registry.
- No planner/executor orchestration.
- No multi-agent workflow.
- No silent auto-apply write path.
- No direct workspace mutation from AI output in the MVP.
- No connector/app integration.
- No public-network dependency requirement.

## Decision Log

| ID | Topic | Decision | Rationale |
| --- | --- | --- | --- |
| A1 | UI shape | Use a Cursor-like top control pair: mode selector plus model-preset selector. The mode list is `chat`, `auto`, `plan`, and `debug`. | Keeps daily AI use compact and familiar while matching the user's requested modes. |
| A2 | User-facing parameter | Reasoning is the only normal user-facing parameter. It is a preset template slot, not a universal backend enum. | The user explicitly narrowed parameter choice to reasoning and clarified it must map to the actual model. |
| A3 | Parameter placement | Reasoning lives inside the model preset label, for example `GPT-5.5 High`, and each preset maps that label to provider/Codex request fields. | Matches Cursor's model picker pattern while preserving model-specific request semantics. |
| A4 | Advanced parameters | Temperature, max output, top-p, and provider flags live only in add/edit model UI. | Prevents clutter in the AI panel. |
| A5 | Multiple APIs | Support multiple custom API providers. | Users may need local, intranet, and gateway endpoints. |
| A6 | API kind | MVP custom provider kind is OpenAI-compatible. | Repo README already calls out OpenAI-compatible local/intranet endpoints. |
| A7 | Codex placement | Codex appears in the model picker as a backend family. | Users should choose between API models and Codex from one place. |
| A8 | Codex abstraction | Codex is implemented as a task runner, not a chat completion provider. | `codex exec` emits task events and may run commands. |
| A9 | Codex MVP permission | Codex MVP starts with read-only `codex exec --json`. | Avoids premature write safety and approval decisions. |
| A10 | Secret boundary | API keys are not stored in project config or renderer localStorage. | Prevents accidental credential leaks. |
| A11 | Project config | Project config stores only default ids and mode. | Keeps `.tinder/project.json` shareable. |
| A12 | User config | Provider and preset definitions are user-level settings under Electron `userData`. | Providers are machine/user-specific. |
| A13 | Harness scope | Harness and orchestration implementation are out of scope for the initial provider/preset task package, but Phase 6 defines `auto` as the full harness/orchestration mode contract. | Keeps early integration small while preserving the intended `auto` product meaning. |
| A14 | Startup behavior | AI availability checks are lazy and must not block app startup. | Missing AI configuration should not affect core editor workflows. |
| A15 | Add model entry | The model-preset picker includes an `Add Model` action row. | Adding a model should be reachable from the same selector where users notice a preset is missing. |
| A16 | Provider and preset relationship | A provider is an endpoint or Codex config; a model preset is provider plus model plus reasoning template plus default mode. | Users choose presets in the main UI instead of juggling provider and model separately. |
| A17 | Custom API compatibility | MVP custom API support targets OpenAI-compatible chat-completions style endpoints first. | This matches local/intranet endpoint compatibility needs and keeps the first adapter narrow. |
| A18 | API key entry | API keys can be entered in Add Model and managed in Settings, but are stored by the main process and referenced by secret id. | The UI must support key entry without leaking raw keys to project files or renderer storage. |
| A19 | Codex preset editing | Codex presets are editable for model and reasoning effort; command/profile/sandbox/approval are advanced preset fields. | Users need model and reasoning effort selection while permission-affecting settings stay deliberate. |
| A20 | Mode semantics | `chat` is normal Q&A; `auto` is full automation with harness/orchestration and may use root/main after explicit session selection; `plan` outputs a plan; `debug` is a later bug-fix loop mode and is not part of the Phase 6 first implementation. | Matches the user's updated mode semantics and keeps debug deferred. |
| A21 | Project defaults | Project config stores `aiModelPresetId` and `aiMode`; provider details and secrets remain user-level. | Project defaults should be shareable without machine-specific credentials. |
| A22 | Add Model fields | Add Model includes name, backend, provider/Codex config, model id, reasoning label, reasoning mapping, default mode, and API key entry when needed. | A missing model should be fully addable from the picker flow. |
| A23 | Write permission boundary | Write-capable modes are allowed by the product model but must not write or run commands without a visible permission/confirmation boundary. | Preserves safety while allowing `auto` and `debug` to mean real automation. |
| A24 | Codex subject mapping | Codex does not operate directly on UI objects. The selected profile/resource/branch/model-library entry is first mapped to a file/context work package with an execution root. | The app's real work objects are `.tinder` business objects rather than a traditional source-project directory, while Codex is file/repo oriented. |
| A25 | Codex account state | Codex configuration includes CLI availability plus authentication state. The UI must support checking status and starting login, and must keep Codex auth separate from custom API provider keys. | Codex CLI requires ChatGPT or API-key authentication and reuses local CLI credentials; model presets alone are not enough to run Codex. |
| A26 | Writable object scope | Write-capable AI sessions may modify objects under the project `.tinder/` directory. Files outside `.tinder/` are out of the default writable target set until a later explicit decision expands scope. | The app's primary operation objects live under `.tinder/`, so this gives automation useful reach without opening the whole project by default. |

## Open Questions

- Should the MVP include provider import/export for sharing endpoint presets
  without secrets?
- Should API patch proposals use unified diffs or structured edit objects as
  the first write-preview format?
- Should Codex write mode be required to run in a temporary worktree, or can it
  directly modify root/main after explicit session selection?

## Assumptions Until Confirmed

- A1: The first AI panel chat flow can support current-file and selection
  context before deeper model-library/resource context chips.
- A2: Codex write modes should prefer a separate diff/worktree safety design
  before direct workspace writes.
- A3: A model preset can support multiple modes, but the active mode must be
  validated against those supported modes.

## Phase 0 - Discussion Package

Deliverables:

- create this dev-docs task package
- record UI, storage, provider, and Codex boundaries
- record deferred harness/orchestration scope

Done when:

- roadmap is reviewed and the first implementation slice is agreed

## Phase 1 - UX And Contract Freeze

Deliverables:

- freeze AI panel top controls
- freeze model-preset dropdown grouping and row labels
- freeze mode list and model-row labels
- freeze model preset contract
- freeze provider config contract
- freeze project default fields
- freeze user settings storage location
- freeze UI-entered API-key storage behavior
- freeze Codex preset editable fields
- freeze Codex subject/work-package mapping rules
- freeze Codex auth status and login UX

Done when:

- users can explain how to choose API models versus Codex presets
- users can explain why reasoning is in the model label
- users can explain how a reasoning label maps to the selected model/backend
- users can explain the difference between `chat`, `auto`, `plan`, and `debug`
- users can explain where provider/model settings are edited
- users can explain where API keys are entered and managed
- users can explain which Codex preset fields are normal versus advanced
- users can explain which UI object will be sent to Codex and which files form
  the work package
- users can explain whether Codex is installed and signed in

## Phase 2 - Config And Settings Foundation

Status: implemented for the initial desktop slice.

Deliverables:

- add AI config and preset types in `@tinder/ai`
- extend project config with `aiModelPresetId` and `aiMode`
- add main-process user AI settings read/write
- add Codex CLI availability and auth-status probing API
- add preload AI settings API
- add Settings UI for providers and model presets
- add Settings UI for Codex account/status/login entry
- seed empty/default state gracefully

Done when:

- users can add providers and model presets without editing JSON
- project defaults can reference an existing preset
- Codex account state is visible without opening a terminal manually
- typecheck passes

## Phase 3 - Custom API Provider Runtime

Status: implemented for OpenAI-compatible streaming chat; local
OpenAI-compatible HTTP/SSE smoke passed on 2026-06-09.

Deliverables:

- implement OpenAI-compatible provider
- support availability test
- support streaming chat request
- support request cancellation
- normalize provider errors
- keep API keys in main process only

Done when:

- AI panel can send a prompt to a custom API preset and stream a response
- missing key, bad endpoint, and provider failure states are readable

## Phase 4 - AI Panel MVP

Status: implemented for API `chat` and `plan` modes.

Deliverables:

- replace placeholder AI panel body
- add mode selector
- add model-preset selector
- add prompt input
- add response stream display
- add basic context chips for current file and selection
- add empty/configuration state

Done when:

- the AI panel is usable for chat-style questions with a configured API preset
- the app remains usable with no AI configuration

## Phase 5 - Codex CLI Readonly Task Mode

Status: closed for the read-only slice. Local CLI and Electron smoke pass after
installing `@openai/codex` globally and configuring the app command to
`C:\nvm4w\nodejs\codex.cmd`. The AI panel shows the Codex work package, prompt
delivery uses stdin to avoid Windows shell argument splitting, Codex presets
support advanced editing, and write-capable sandboxes remain disabled in Phase
5.

Deliverables:

- detect `codex` availability
- detect whether Codex is authenticated enough to run `codex exec`
- expose Codex status: not installed, not signed in, signed in, or error
- provide login actions that launch `codex login` and
  `codex login --device-auth` in a visible terminal/task
- allow the Codex command/path to be edited when `codex` resolves to a
  non-executable packaged app path
- add built-in or user-configured Codex read-only preset
- allow the preset to choose model and reasoning effort
- map the current UI subject to a Codex work package before launching
- choose a Codex execution root from the data root or mapped work package
- run `codex exec --json --sandbox read-only`
- parse JSONL events
- normalize task, command, message, error, and completion events
- support cancellation

Done when:

- users can choose a Codex read-only preset and run a repo analysis task
- users can see and repair missing login state
- users can see which `.tinder` object/context is included in the Codex prompt
- final output and task status are visible in the AI panel
- Codex missing/auth/error states are visible

## Phase 6 - Patch Preview Discussion

Status: Phase 6.1 implementation started on 2026-06-09. The first slice covers
session target UI, structured active-document proposal preview, session-memory
snapshot, explicit apply, and guarded rollback. Phase 6.2 (2026-06-10) made
`auto` model-driven for API presets (strict-JSON proposal payload parsed into
the proposal/preview/apply/snapshot pipeline, active document as the only
writable target per P1), added toggleable business-object context chips
(project, chain profile, canvas selection, active document), and multi-turn
`messages` history for API requests. Phase 6.3 (2026-06-10) widened writable
targets to the current chain profile JSON as a `.tinder/` business object:
editor vs disk target storage, full-content context for writable targets,
JSON validation before preview, and disk-aware apply/rollback with
ChainAssembly reload. Full `auto` harness/orchestration and Codex
write/root-main execution remain follow-up slices.

Deliverables:

- discuss whether API patch proposals should generate unified diffs, structured file
  changes, or editor-local suggestions
- discuss whether Codex write mode should use a temporary worktree
- define confirm/apply behavior before implementation
- define the visible permission boundary for `auto` and `debug`
- define how `.tinder` business objects map to writable file sets
- define rollback and audit expectations for applied AI changes
- define how new AI sessions display provider, project/root, branch, and
  execution target (`worktree`, `root/main`, or `readonly`)
- define the `auto` contract as full harness/orchestration while keeping its
  implementation in a dedicated follow-up slice
- defer `debug` implementation

Done when:

- write-capable AI scope is split into a separate accepted task or phase
- the first patch preview format is chosen
- the Codex write execution strategy is chosen
- direct root/main mode, if enabled, has a distinct visible confirmation and
  conflict boundary
- `auto` and `debug` have explicit implementation boundaries
- `.tinder/` writable scope is visible and protected by snapshot/conflict
  checks

## Rollback Strategy

- Phase 0 rollback: remove `dev-docs/active/ai-integration/`.
- Phase 1-2 rollback: remove AI settings/project config additions.
- Phase 3 rollback: disable provider invocation while preserving config types.
- Phase 4 rollback: restore AI panel placeholder.
- Phase 5 rollback: hide Codex presets and disable Codex runner IPC.

## Phase 0 Checklist

- [x] Create task package directory.
- [x] Write overview.
- [x] Write plan.
- [x] Write architecture.
- [x] Write implementation notes.
- [x] Write verification.
- [x] Write pitfalls.
- [x] Write requirements.
- [x] Write roadmap.
