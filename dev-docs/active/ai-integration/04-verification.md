# 04 Verification

## Static Checks

Run after implementation:

```powershell
pnpm typecheck
pnpm build
```

Package-specific checks:

```powershell
pnpm --filter @tinder/ai typecheck
pnpm --filter @tinder/desktop typecheck
```

## Custom API Smoke Checks

Current local note:

- A temporary local OpenAI-compatible HTTP/SSE endpoint was started on
  `127.0.0.1` and exercised through the Electron renderer preload API.
- `testProvider` called `/v1/models` with a stored API key reference and
  returned `Provider is reachable`.
- `startChat` streamed `CHAT API SMOKE` for a `High` preset and `PLAN API
  SMOKE` for a `Medium` preset.
- Captured request bodies confirmed the model/reasoning mappings:
  - `smoke-model-high` with `reasoning_effort: high`
  - `smoke-model-medium` with `reasoning_effort: medium`
- Missing stored key returned `API key is not configured`.
- Bad URL returned a readable fetch failure.
- `readSettings()` and renderer `localStorage` did not contain the raw smoke
  key.

Provider setup:

- create a provider with an OpenAI-compatible `baseUrl`
- set API key through the Add Model modal
- verify the same key can be managed from Settings
- create at least two model presets under the provider
- mark one preset with `High` reasoning and one with `Medium` reasoning
- verify each reasoning label maps to the expected provider request fields

Expected:

- provider test reports available when the endpoint is reachable
- missing environment variable reports a clear configuration error
- missing stored key reports a clear configuration error
- bad base URL reports a clear connection error
- streaming response updates the AI panel incrementally
- cancelling an in-flight request stops UI updates and closes the backend
  request

## Model Picker Manual Checks

Expected:

- model dropdown groups custom API presets and Codex presets separately
- search filters presets by label and provider
- selected model label shows reasoning, for example `GPT-5.5 High`
- model rows do not expose reasoning as a separate control
- `Add Model` appears inside the model-preset picker and opens model management
- `Manage Providers` opens provider management
- reasoning is not exposed as a separate top-level control
- editing a model shows the reasoning label and its backend-specific mapping
- API key entry is available in Add Model and in Settings management

## Project Defaults Checks

Expected:

- selecting a project default writes only ids/mode to `.tinder/project.json`
- raw API keys never appear in `.tinder/project.json`
- raw API keys never appear in renderer `localStorage`
- project defaults load after reopening the folder
- missing preset ids fall back to user default with a visible warning

## Codex CLI Smoke Checks

Current local note:

- The WindowsApps Codex desktop package path returned `Access is denied`.
- Installing `@openai/codex` globally with npm created a runnable CLI shim at
  `C:\nvm4w\nodejs\codex.cmd`.
- `codex --version`, `codex login status`, and a minimal read-only JSONL exec
  smoke pass locally.
- Node `spawn(command, args, { shell: true })` smoke passes when the prompt is
  sent through stdin with `codex exec ... -`; passing the prompt as a normal
  Windows shell argument can split on spaces and fail.
- Electron build smoke via local CDP passes:
  - `window.tinder.ai` is available from the renderer
  - `codexStatus` reports `signed-in`
  - the right AI panel opens from the titlebar toggle
  - the panel shows `Codex High`
  - the Codex work-package card is visible
  - Settings AI -> Add Model -> Codex shows advanced command, profile,
    sandbox, and approval fields
  - non-read-only sandbox options are visible but disabled in Phase 5
  - a temporary custom Codex config and preset can be written, read back, and
    restored through the renderer AI settings API
  - `startCodexTask` streams events and returns final `OK` with exit code `0`
- `pnpm build` passes after the Codex preset advanced configuration changes.

Setup:

```powershell
codex --version
```

Readonly task:

```powershell
codex exec --json --sandbox read-only "summarize this repository"
```

Expected:

- missing `codex` shows unavailable state in the model picker
- Settings can save a Codex command/path override
- Settings can launch `codex login` in the run panel
- Settings can launch `codex login --device-auth` in the run panel
- available `codex` shows configured Codex presets
- Codex preset editing can choose model and reasoning effort
- read-only task streams events into the AI panel
- AI panel shows the Codex execution root and active subject before launch
- final assistant message is visible
- command and error events are visible when Codex emits them
- task cancellation terminates the subprocess

## Security Checks

Expected:

- renderer never receives raw API keys
- user settings file does not include raw API keys
- `.tinder/project.json` does not include raw API keys
- `auto` and `debug` do not write or run commands without a visible
  permission/confirmation boundary
- network endpoint configuration is user-controlled and not hardcoded to public
  services

## Regression Checks

Expected:

- existing file explorer, run panel, terminal, search, LSP, model library, and
  profile views still open
- app starts without any AI provider configured
- AI panel shows a helpful empty/configuration state
- typecheck passes without weakening existing project contracts

## Phase 6.1 Checks

Current local note:

- `pnpm --filter @tinder/desktop typecheck` passes after adding
  session/proposal/snapshot UI.
- `pnpm build` passes after the Phase 6.1 changes.
- Electron CDP smoke confirms the AI panel renders the session header with
  provider, root, branch, execution-target selector, and new-session control.
- Electron CDP smoke confirms `root/main` target selection shows the explicit
  write-boundary warning.

Expected:

- `auto` creates an active-document patch proposal instead of silently writing.
- proposal apply updates the active document through the workspace state API.
- apply creates a session-memory snapshot with before/applied content hashes.
- rollback restores the pre-apply content only when current content still
  matches the applied hash.
- rollback refuses to overwrite user edits made after apply.

## Phase 6.2 Checks

Current local note:

- `pnpm -r typecheck` passes after the model-driven proposal and context-chip
  changes (2026-06-10).

Expected (manual UI):

- With an API preset and an open file document, `auto` mode streams a model
  response and converts it into a draft patch proposal with a rendered diff;
  apply/discard/rollback behave as in Phase 6.1.
- A model response whose JSON is malformed, missing `title`/`targets`, or
  targets a non-allowlisted uri produces a readable error turn and no
  proposal.
- A model response with `targets: []` shows the title/summary as an assistant
  turn and a "no applyable targets" system note.
- `auto` without an open file document is blocked with a readable error.
- `auto` with a Codex preset shows the follow-up-slice message and does not
  invoke the local stub behavior.
- Context chips appear for project, chain profile (when `.tinder` profiles are
  loaded), canvas selection (canvas mode only), and active document; clicking
  a chip toggles strike-through and removes that section from the request
  context (verify via provider request capture).
- A second `chat` question that refers to the previous answer ("它/上一条")
  is answered with conversation context, confirming `messages` history is
  sent.

## Phase 6.3 Checks

Current local note:

- `pnpm -r typecheck` and `pnpm --filter @tinder/desktop build` pass after the
  business-object writable target changes (2026-06-10).

Expected (manual UI):

- With a chain profile loaded (canvas or profile tree) and no file document
  open, `auto` mode can produce a proposal targeting the profile JSON; the
  proposal card shows the target with a `disk` tag.
- Applying a disk-target proposal writes the profile file and the sidebar /
  canvas reflect the change after the automatic reload; rollback restores the
  previous file content.
- Editing the profile file externally between proposal and apply produces a
  conflict instead of overwriting.
- A model payload whose profile afterContent is invalid JSON is rejected with
  a readable error and no proposal.
- A profile larger than the per-target budget is excluded from writable
  targets with a transcript note, and auto mode still works against the
  active document.
- When the profile is open as a document, the proposal targets the editor
  copy (no `disk` tag) and apply leaves the document dirty for manual save.

## AI Panel UI Pass Checks (2026-06-11)

Expected (manual UI):

- In canvas mode the AI panel shows the "unavailable in canvas mode" notice
  and no composer; switching back to the profile view restores the panel.
- The transcript fills the panel, sticks to the bottom while streaming, and
  stops following when the user scrolls up.
- User messages render as right-aligned bubbles; assistant replies as plain
  text; system/command/stderr/error notes as slim labeled strips.
- The composer footer hosts the mode and model selectors plus a send button
  that becomes a stop button while a request is running.
- Enter sends, Shift+Enter inserts a newline, and confirming Chinese IME
  composition with Enter does not send.
- With no model configured the transcript shows the centered empty state
  with an Add Model button.
- A patch proposal appears inline at the end of the transcript.
