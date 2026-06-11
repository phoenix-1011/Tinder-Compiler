# 02 Architecture

## Boundary Summary

```text
renderer AI panel
  -> preload AI API
  -> main-process AI service
  -> @tinder/ai contracts
       -> custom API provider
       -> Codex CLI runner
```

The renderer owns interaction state and display. The main process owns network
calls, subprocess execution, filesystem-safe config IO, and access to secrets.
The `@tinder/ai` package owns shared contracts and provider/runner
implementations that are not Electron-specific.

## Backend Families

### Custom API Provider

Custom API providers handle chat-style model requests.

Initial supported kind:

```ts
type AiProviderKind = "openai-compatible";
```

Provider config:

```ts
interface AiApiProviderConfig {
  id: string;
  label: string;
  kind: "openai-compatible";
  baseUrl: string;
  apiKeySource?: AiApiKeySource;
  defaultHeaders?: Record<string, string>;
}

type AiApiKeySource =
  | { kind: "env"; env: string }
  | { kind: "stored"; secretId: string };
```

The provider should support:

- availability test
- non-streaming completion
- streaming response
- request cancellation
- error normalization

### Codex CLI Runner

Codex CLI is a task runner, not a normal chat completion provider.

Runner config:

```ts
interface CodexCliConfig {
  id: string;
  label: string;
  command: string;
  profile?: string;
  model?: string;
  modelReasoningEffort?: string;
  sandbox: "read-only" | "workspace-write" | "danger-full-access";
  approvalPolicy?: "on-request" | "never";
}
```

Codex presets are editable from model/preset management. Normal editable fields
include label, model, and reasoning effort. Command/path, profile, sandbox, and
approval policy are advanced fields because they affect execution and
permissions.

## Model Preset Contract

The model preset is the user-facing selectable unit.

```ts
type AiBackendKind = "api" | "codex";
type AiMode = "chat" | "auto" | "plan" | "debug";

type AiReasoningLabel = string;

interface AiReasoningTemplate {
  label: AiReasoningLabel;
  displayName?: string;
  api?: {
    model?: string;
    reasoningEffort?: string;
    extraBody?: Record<string, unknown>;
  };
  codex?: {
    model?: string;
    profile?: string;
    modelReasoningEffort?: string;
  };
}

interface AiModelPreset {
  id: string;
  label: string;
  backend: AiBackendKind;
  providerId?: string;
  codexConfigId?: string;
  model?: string;
  reasoning?: AiReasoningTemplate;
  supportedModes?: AiMode[];
  defaultMode?: AiMode;
  advanced?: {
    temperature?: number;
    maxOutputTokens?: number;
    topP?: number;
  };
}
```

Rules:

- `label` includes the normal-facing reasoning template label, such as `High`.
- `reasoning` is the only normal user-facing parameter, but it is not a
  universal backend enum.
- each preset maps its reasoning label to the actual API or Codex request shape
  required by that model.
- `advanced` is edited only from model management UI.
- the model-preset picker includes an `Add Model` action that opens model
  management.
- API presets require `providerId`.
- Codex presets require `codexConfigId`.

## Mode Contract

The mode selector is independent from the preset, but it can be validated
against the preset's supported modes.

```ts
type AiMode = "chat" | "auto" | "plan" | "debug";
```

Initial behavior:

- `chat`: ask and answer without file writes
- `auto`: automatic writing mode; request permission when it needs to write
  files or run commands
- `plan`: produce implementation/debugging plans without applying changes
- `debug`: bug-fix loop; roughly locate the issue, insert logs when useful, run
  tests, and iterate on a fix

## Config Storage

### User AI Settings

Store under Electron `app.getPath("userData")`, for example:

```text
<userData>/ai-settings.json
```

Shape:

```ts
interface UserAiSettings {
  providers: AiApiProviderConfig[];
  codexConfigs: CodexCliConfig[];
  modelPresets: AiModelPreset[];
  defaultModelPresetId?: string;
  defaultMode?: AiMode;
}
```

### Project Defaults

Extend `.tinder/project.json`:

```ts
interface ProjectConfig {
  /** Legacy provider override; new AI selection should prefer aiModelPresetId. */
  aiProviderId?: string;
  aiModelPresetId?: string;
  aiMode?: AiMode;
}
```

Project config stores selection defaults only. It does not store raw provider
credentials.

### Secrets

API keys can be entered from:

- Add Model modal
- Settings provider/model management

Secret rules:

- project config stores only ids, never raw keys
- renderer `localStorage` stores no raw keys
- renderer can submit a key to the main process, but later reads return only
  metadata such as `hasSecret`
- providers reference keys through `AiApiKeySource`
- environment variables remain supported through `{ kind: "env" }`
- UI-entered keys use `{ kind: "stored" }`
- stored keys should use Electron/main-process protected storage when available;
  if protected storage is unavailable, the UI must disclose the fallback before
  storing a raw secret
- renderer never receives the secret value

## IPC Surface

Proposed preload API:

```ts
interface AiApi {
  readSettings(): Promise<UserAiSettings>;
  writeSettings(settings: UserAiSettings): Promise<void>;
  saveSecret(input: AiSecretSaveInput): Promise<{ secretId: string }>;
  deleteSecret(secretId: string): Promise<void>;
  testProvider(providerId: string): Promise<AiProviderTestResult>;
  startChat(input: AiChatStartInput): Promise<{ id: number }>;
  cancel(id: number): Promise<void>;
  startCodexTask(input: CodexTaskStartInput): Promise<{ id: number }>;
  onEvent(id: number, listener: (event: AiEvent) => void): Disposable;
}
```

Event model:

```ts
type AiEvent =
  | { type: "delta"; text: string }
  | { type: "message"; role: "assistant"; text: string }
  | { type: "task"; status: "started" | "running" | "completed" | "failed" }
  | { type: "command"; command: string; status: string }
  | { type: "file_change"; path: string; status: string }
  | { type: "error"; message: string };
```

The renderer should not parse provider-specific streaming protocols or Codex
JSONL directly.

## UI Landing Points

Expected files:

- `apps/desktop/src/renderer/components/AIPanel.tsx`
- `apps/desktop/src/renderer/components/SettingsView.tsx`
- `apps/desktop/src/renderer/state/SettingsContext.tsx`
- `apps/desktop/src/renderer/state/ProjectContext.tsx`
- `apps/desktop/src/preload/index.ts`
- `apps/desktop/src/main/ipc.ts` or a new `ai.ts`
- `packages/ai/src/index.ts`

## Context Sources

The first slice can support explicit context chips:

- current file
- selected text
- current project
- manually attached files

Model-library or compute-resource context can be added later as dedicated chips
after the base AI surface is stable.

## Write Safety

This task package defines write-capable `auto` and `debug` mode semantics, but
implementation must not silently write. A backend can expose a write-capable
mode only when the permission/confirmation path for that backend is implemented.

Later write-capable flows must route through:

```text
AI output or Codex action -> permission/confirmation boundary -> write/run
```

Codex write-capable modes should prefer temporary worktree execution before
direct workspace writes.
