# 01 Plan

## Recommended First Slice

Build the AI integration as a provider and model-preset foundation:

1. freeze the selector UX and model-preset contract
2. add user/project configuration contracts
3. add custom API provider invocation in the main process
4. replace the AI panel placeholder with a minimal chat surface
5. add Codex CLI detection and read-only `codex exec --json` task streaming

This slice should not implement harness logic, orchestration, autonomous edit
application, or multi-agent workflows.

## Implementation Order

1. Add shared AI config and model-preset types in `@tinder/ai`.
2. Extend project config shape with `aiModelPresetId` and `aiMode`.
3. Add user-level AI config persistence under Electron `userData`.
4. Add main-process secret storage for UI-entered API keys.
5. Add main-process AI IPC handlers.
6. Implement OpenAI-compatible custom API provider support.
7. Add Add Model modal and provider/model management UI in Settings.
8. Replace `AIPanel` placeholder with the mode selector, model-preset selector,
   context chips, prompt input, and streaming response area.
9. Add Codex CLI detection.
10. Add read-only Codex task streaming through `codex exec --json`.
11. Revisit patch/diff preview only after the chat and read-only task flows are
    stable.

## UX Strategy

Use two compact controls at the top of the AI panel:

```text
[ Chat/Auto/Plan/Debug v ] [ Model preset v ]
```

The model preset dropdown should follow Cursor's mental model:

- users choose named presets, not raw provider parameters
- reasoning is a preset template label, for example `GPT-5.5 High`
- each preset maps that reasoning label to the actual provider/Codex parameter
  shape supported by the selected model
- low-frequency parameters are edited only in `Add Model` / `Edit Model`
- Codex appears in the same preset picker as a backend family
- the model-preset picker includes an `Add Model` action row

Example model menu:

```text
Search models

Custom API
  Opus 4.8 High
  GPT-5.5 High
  Sonnet 4.6 Medium
  Kimi K2.5

Codex
  Codex High
  Codex Readonly

Actions
  Add Model
  Manage Providers
```

## Parameter Strategy

Normal users should only see reasoning through the model preset name:

- `Low`
- `Medium`
- `High`

These labels are template slots, not a universal API enum. Each model preset
owns the mapping from the visible label to the actual request shape. Examples:

```ts
{
  label: "GPT-5.5 High",
  reasoning: {
    label: "high",
    api: { reasoning_effort: "high" }
  }
}

{
  label: "Local Coder High",
  reasoning: {
    label: "high",
    api: { model: "local-coder-high" }
  }
}

{
  label: "Codex High",
  reasoning: {
    label: "high",
    codex: { modelReasoningEffort: "high" }
  }
}
```

Advanced parameters may exist in model editing, but they should not clutter the
main AI panel:

- temperature
- max output tokens
- top-p
- provider-specific flags
- Codex sandbox/approval flags

## Mode Strategy

The four mode labels have product-level meanings:

- `chat`: ordinary question and answer, no file writes
- `auto`: automatic writing mode; it may request permission when it needs to
  write files or run commands
- `plan`: output an implementation/debugging plan without applying changes
- `debug`: bug-fix loop that first roughly locates the problem, may insert logs,
  runs tests, and iterates on a fix

Implementation can phase these in. If the current backend or current phase does
not support a write-capable mode, the UI must show that state instead of
silently downgrading into unconfirmed writes.

## Storage Strategy

Project-local `.tinder/project.json` stores only project defaults:

```json
{
  "aiModelPresetId": "gpt-55-high",
  "aiMode": "auto"
}
```

User-level AI settings store providers and presets:

```json
{
  "providers": [],
  "modelPresets": []
}
```

Secrets are stored separately:

- API keys can be entered in the Add Model modal
- API keys can be managed from a dedicated Settings management screen
- stored keys are written by the main process only and referenced by secret id
- environment variables remain supported for machine-managed deployments

Project files must never contain raw API keys.

## Codex Strategy

Codex is treated as a local task backend, not as a normal completion provider.

The first Codex slice should:

- detect whether `codex` is on PATH
- show unavailable state if missing
- allow Codex presets to choose model and reasoning effort
- keep Codex command/profile/sandbox/approval controls in the preset management
  surface, not in the main picker
- run read-only `codex exec --json`
- parse JSONL events into task output
- keep command execution and file-change details visible

Write-capable Codex presets are allowed by the product model but must go through
the mode permission boundary. Worktree-backed execution remains the preferred
later hardening path.

## Out Of Scope Until Later

- tool harness
- custom tool registry
- multi-step orchestration layer
- prompt planner
- multi-agent dispatch
- silent auto-apply edits
- background task scheduler
- external connector integration
