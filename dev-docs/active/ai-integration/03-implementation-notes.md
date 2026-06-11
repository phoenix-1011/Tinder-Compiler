# 03 Implementation Notes

## Initial Package Creation

- Created task package `ai-integration`.
- Scoped the package to AI provider/model-preset integration and Codex CLI task
  launch.
- Excluded harness, orchestration, multi-agent behavior, and auto-write flows.

## Repo Observations

- `packages/ai/src/index.ts` already contains a minimal `AiProvider` contract.
- `apps/desktop/src/renderer/components/AIPanel.tsx` is currently a placeholder.
- `packages/project/src/index.ts` and `ProjectContext.tsx` already expose
  `aiProviderId`.
- `runner.ts` already has subprocess streaming behavior that can inform the
  Codex CLI runner, but Codex-specific parsing should live behind an AI task
  service rather than in the generic run panel.
- User settings currently use renderer `localStorage`; AI provider secrets
  should not use that path.
- UI-entered API keys should be submitted once to the main process and then
  referenced by secret id; renderer readback should expose only metadata.

## Design Notes

- Treat model presets as the primary UI unit.
- Keep reasoning inside the preset label, matching Cursor's model picker
  behavior.
- Treat reasoning as a preset-owned template slot that maps to the actual
  provider/Codex request fields for the selected model.
- Keep advanced parameters in add/edit model dialogs.
- Treat Codex as a backend family in the model picker, but implement it as a
  task runner.
- Codex presets must allow model and reasoning effort selection.
- Keep API provider network calls in the main process.
- Keep raw secrets out of project files and renderer state.

## Implemented Slice

- Added user-level AI settings and secret storage in the Electron main process.
- Added model preset and provider management in Settings, including edit,
  delete, provider test, key replacement, and key clearing.
- Added project AI defaults for `aiModelPresetId` and `aiMode`; project files
  store only ids and mode.
- Added an OpenAI-compatible `/chat/completions` streaming runtime in the main
  process.
- Added renderer-safe request ids, streaming delta/end/error events, and
  cancellation.
- Replaced the AI panel placeholder with mode/model selectors, current document
  context chip, prompt input, streaming transcript, and cancel action.
- Added a Codex read-only task runner for `codex exec --json --sandbox read-only`.
- Added Codex task request ids, JSONL event parsing, command/stderr/raw/error
  event forwarding, completion events, and cancellation.
- Wired Codex presets into the AI panel Run action using the current workspace
  folder as `cwd` and the active document as context.
- Added Settings controls for the Codex command/path, browser login
  (`codex login`), and device-code login (`codex login --device-auth`) using
  the visible run panel.
- Added Codex preset advanced editing for command, profile, sandbox,
  approval policy, model, and reasoning effort. Phase 5 still enforces
  read-only sandbox execution; write-capable sandboxes remain deferred.
- Wired Codex approval policy into the CLI global
  `--ask-for-approval <policy>` argument before `exec`.
- Added an AI panel work-package card for Codex presets so users can see the
  execution root, active subject, and included context before running a task.
- Changed Codex prompt delivery to `codex exec ... -` with stdin input. This
  avoids Windows shell argument splitting for prompts with spaces and closes
  stdin explicitly so Codex does not wait for extra input.
- Tightened JSONL event normalization so `item.completed` agent messages are
  shown as messages, while task completion waits for the process close event
  that carries an exit code.
- Phase 5 review fixes: AIPanel unmount now cancels active backend tasks,
  non-Codex presets no longer force Codex status probing, Codex task event
  cleanup no longer depends on a callback declared later, and deleting a custom
  Codex preset removes an orphan Codex config when no other preset references it.
- Kept write-capable `auto` and `debug` behavior read-only in this slice; they
  can ask Codex for plans/diagnosis but do not grant write permissions.
- Local smoke note: the WindowsApps Codex desktop package path returned
  `Access is denied`. Installing `@openai/codex` globally with npm created a
  runnable CLI shim at `C:\nvm4w\nodejs\codex.cmd`; `codex --version`,
  `codex login status`, and a minimal
  `codex exec --json --sandbox read-only "Respond with exactly OK."` smoke all
  completed successfully.
- Phase 3 smoke note: a temporary local OpenAI-compatible HTTP/SSE endpoint was
  exercised through the Electron renderer preload API. Provider reachability,
  streaming `chat` and `plan` requests, reasoning-effort request mapping,
  missing-key errors, bad-URL errors, and renderer/settings secret non-leakage
  all passed.
- Phase 5 is closed for the read-only slice. Codex write permissions,
  workspace-write sandboxes, and auto/debug mutation loops are intentionally
  deferred to Phase 6 decisions.
- Started Phase 6.1 by adding shared AI session/proposal/snapshot types and an
  AI panel foundation for session target selection, active-document proposal
  preview, explicit apply, session-memory snapshot, and guarded rollback.
- Phase 6.1 does not implement the final `auto` harness/orchestration loop and
  does not allow Codex to execute write-capable root/main tasks yet.
- Phase 6.2 (2026-06-10) made `auto` model-driven for API presets: the main
  process allows `auto` through the API runtime and injects a strict-JSON
  proposal instruction (`AUTO_PROPOSAL_SYSTEM_INSTRUCTION` in `@tinder/ai`);
  the renderer streams the response, extracts/validates the JSON payload with
  `parseAiProposalPayload` (fenced-block and balanced-brace tolerant), and
  converts it into the existing proposal -> preview -> apply -> snapshot
  pipeline. Target URIs are validated against a writable-target allowlist
  (currently the active `file`-kind document only, per P1), and `afterContent`
  is normalized to the target document's EOL before diffing.
- Phase 6.2 added business-object context injection
  (`renderer/state/aiContext.ts`): project summary, chain-profile structure
  (profile name, `ordered_execution_list`, `resources`,
  `custom_node_usages`, clipped JSON), persisted canvas selection (read from
  `.tinder/state/canvas.json`, ~250 ms debounce lag accepted), and the active
  document. The AI panel shows these as toggleable context chips; disabled
  chips are excluded from the request context. Codex tasks reuse the same
  context builder.
- Phase 6.2 also passes prior user/assistant turns (last 12) as `messages`
  history for API `chat`, `plan`, and `auto` requests, making conversations
  and proposal iterations multi-turn.
- Codex `auto` remains a visible "follow-up slice" message; the local
  prompt-echo proposal stub (`proposedContentForPrompt`) was removed.
- Phase 6.2 review pass (2026-06-10) fixed: `auto` missing from
  `API_SUPPORTED_MODES` in Settings (the proposal pipeline was unreachable
  from the UI; main now also widens stored API presets on read); auto mode
  force-includes the writable target's content even when its context chip is
  off; `ai:codexStatus` only probes commands present in validated settings
  (renderer strings previously reached `spawn` with `shell:true`); Windows
  cancel now kills the codex process tree via `taskkill /T` instead of only
  the cmd.exe wrapper; codex spawn stdin got an error handler (ENOENT on
  non-shell platforms crashed main); `view.showAi` now opens the right-side
  AI panel instead of the dead sidebar stub; `reloadSettings` preserves the
  user's in-panel preset/mode and no longer blocks on codex probing;
  `previewDiff` shows pure-append/truncate changes; cancelled auto streams
  discard partial JSON from transcript/history; chat history is
  char-budgeted; `extractJsonCandidate` parse-tests balanced spans so prose
  braces before the payload don't poison extraction; a trailing system
  reminder re-anchors the JSON contract under prose history; new sessions
  keep applied-proposal snapshots reachable for rollback.
- Phase 6.2 review cleanups: shared `startApiStream` scaffold (was duplicated
  across chat/auto), rAF-batched streaming transcript updates, memoized
  proposal hash/diff rendering, `makeSessionDescriptor` (was 3 copies),
  reuse of `hashText`/`slugify`/`readPersistedCanvasSelection` instead of
  local re-implementations, removed dead `AiPatchEdit`/`edits`/`endPosition`
  and the legacy `AiProvider`/`InMemoryProviderRegistry` block, and made
  Settings reloads non-blocking on codex probing.

- Phase 6.3 (2026-06-10) added business-object writable targets: the auto
  writable set is now the active file document plus the current chain profile
  JSON (`resolveWritableTargets` in `renderer/state/aiContext.ts`). Profile
  targets not open in an editor are `storage: "disk"` — apply writes the file
  directly and reloads ChainAssembly state; open documents stay
  `storage: "editor"` via `updateContent`. Writable targets always include
  their complete content in the request context (per-target 24k-char budget;
  oversized candidates are excluded and reported), `.json` afterContent is
  parse-validated before preview, and apply/rollback conflict checks read
  current content from the target's storage. Snapshot targets record the
  storage discriminator so rollback writes to the right place.

- Phase 6.3 review pass (2026-06-11) fixed: an oversized open profile
  document could fall through the size gate into the disk branch (writing
  beneath a dirty editor buffer); a new proposal no longer destroys the
  rollback snapshot of a previously applied proposal, and rollback only
  mutates the proposal it belongs to; auto mode acquires the busy guard
  before async target resolution (double Ctrl+Enter race); EOL normalization
  now works both directions (a stray CRLF no longer flips an LF file);
  apply/rollback conflict gates compare exact content instead of 32-bit
  hashes; `withApiRuntimeModes` only migrates the exact legacy
  `["chat","plan"]` shape instead of permanently re-widening user-narrowed
  mode lists; `AI_SETTINGS_CHANGED_EVENT` is a shared constant.
- Known follow-up: `ProjectConfig` is still hand-duplicated between
  `packages/project` and `ProjectContext.tsx` (pre-existing; the renderer
  copy should import from `@tinder/project`).

## Deferred Topics

- additional `.tinder` business objects as writable targets (resources,
  templates, canvas state) beyond the chain profile
- deeper schema validation for profile JSON proposals (currently JSON.parse
  only)
- per-hunk apply (P5 later stage)
- worktree-based Codex write mode
- tool harnesses
- prompt routing/orchestration
- multi-agent execution
- background tasks
- connector data sources
