# AI Integration Requirements

## Product Requirement

The desktop app must provide a usable AI entry point that can select between
custom API models and Codex CLI presets.

The UI should follow the Cursor-style model picker pattern:

- mode selector first
- model preset selector second
- reasoning shown as part of the model preset label
- reasoning mapped by each preset to the actual model/provider request shape
- advanced model/provider parameters hidden behind add/edit model screens

## Functional Requirements

### Model Presets

- The app supports multiple model presets.
- A preset belongs to either a custom API backend or a Codex backend.
- A preset can declare supported modes: `chat`, `auto`, `plan`, `debug`.
- A preset can declare a visible `reasoning` template label such as `low`,
  `medium`, or `high`.
- A preset maps its visible reasoning label to provider-specific or Codex-specific
  request fields.
- The visible preset label includes reasoning, such as `GPT-5.5 High`.
- The selected preset persists as a user default and can be overridden per
  project.
- The model-preset picker includes an `Add Model` action.

### Custom API Providers

- The app supports multiple custom API providers.
- The MVP provider kind is OpenAI-compatible HTTP API.
- Providers have ids, labels, base URLs, and optional default headers.
- API keys can be entered in the Add Model modal.
- API keys can be managed from a dedicated Settings screen.
- Providers reference secrets through environment variables or stored secret ids.
- The main process performs provider requests.
- The renderer never receives raw API keys.
- The provider supports streaming responses.
- The provider supports cancellation.

### Codex CLI

- The app can detect whether `codex` is available.
- Codex presets appear in the same model picker as API presets.
- Codex presets are implemented through a task runner.
- Codex presets allow model selection.
- Codex presets allow reasoning effort selection.
- The first Codex implementation supports read-only `codex exec --json`.
- Codex task events are normalized before reaching the renderer.
- Write-capable Codex modes require a visible permission/confirmation boundary.

### AI Panel

- The right-side AI panel replaces the placeholder with a real interaction
  surface.
- The panel shows a mode selector.
- The panel shows a model-preset selector.
- The mode selector supports `chat`, `auto`, `plan`, and `debug`.
- `chat` is ordinary question and answer.
- `auto` is automatic writing mode and requests permission when needed.
- `plan` outputs a plan without applying changes.
- `debug` is a bug-fix loop that locates the issue, can insert logs, runs tests,
  and iterates on a fix.
- The panel supports a prompt input.
- The panel supports streaming output.
- The panel can show provider/configuration errors.
- The panel can show Codex task status and final output.

### Settings

- Settings expose provider management.
- Settings expose model preset management.
- Settings expose API-key management.
- Add/edit model allows reasoning selection.
- Add/edit model allows editing the backend-specific reasoning mapping.
- Add/edit model may expose advanced parameters.
- Main AI panel does not expose advanced parameters.

## Non-functional Requirements

- Runtime must not require public network access.
- API endpoint selection must be user-configurable.
- AI integration must not slow down app startup.
- Missing AI configuration must not break non-AI app workflows.
- AI config and IPC contracts should be typechecked.
- Existing project/model-library/runtime export contracts must remain unchanged.

## Security Requirements

- Raw API keys are not stored in project files.
- Raw API keys are not stored in renderer `localStorage`.
- Raw API keys are not sent to the renderer.
- UI-entered API keys are stored by the main process and referenced by secret id.
- Write-capable modes require permission/confirmation.
- Codex task output should be visible enough for users to understand what ran.

## Explicit Non-goals

- No AI harness.
- No orchestration layer.
- No multi-agent flow.
- No tool registry.
- No silent automatic patch apply.
- No hidden command approval workflow.
- No connector integration in this slice.
