export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type AiMode = "chat" | "auto" | "plan" | "debug";

export type AiBackendKind = "api" | "codex";

export type AiExecutionTarget = "readonly" | "worktree" | "root-main";

export type AiProviderKind = "openai-compatible";

export type AiApiKeySource =
  | { kind: "env"; env: string }
  | { kind: "stored"; secretId: string };

export interface AiApiProviderConfig {
  id: string;
  label: string;
  kind: AiProviderKind;
  baseUrl: string;
  apiKeySource?: AiApiKeySource;
  defaultHeaders?: Record<string, string>;
}

export interface CodexCliConfig {
  id: string;
  label: string;
  command: string;
  profile?: string;
  model?: string;
  modelReasoningEffort?: string;
  sandbox: "read-only" | "workspace-write" | "danger-full-access";
  approvalPolicy?: "on-request" | "never";
}

export interface AiReasoningTemplate {
  label: string;
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

export interface AiModelPreset {
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

export interface UserAiSettings {
  providers: AiApiProviderConfig[];
  codexConfigs: CodexCliConfig[];
  modelPresets: AiModelPreset[];
  defaultModelPresetId?: string;
  defaultMode?: AiMode;
}

export const EMPTY_USER_AI_SETTINGS: UserAiSettings = {
  providers: [],
  codexConfigs: [],
  modelPresets: [],
  defaultMode: "chat"
};

export interface AiProviderTestResult {
  ok: boolean;
  message: string;
  status?: number;
}

export interface AiSecretMetadata {
  secretId: string;
  label?: string;
  hasSecret: boolean;
  storageMode: "safeStorage" | "plain";
}

export interface AiSecretSaveInput {
  secretId?: string;
  label?: string;
  value: string;
}

export interface AiChatStartInput {
  requestId?: string;
  presetId: string;
  mode: AiMode;
  prompt: string;
  context?: string;
  messages?: AiMessage[];
}

export interface AiChatStarted {
  requestId: string;
}

export interface AiChatDelta {
  requestId: string;
  text: string;
}

export interface AiChatEnd {
  requestId: string;
  ok: boolean;
  reason?: "done" | "cancelled";
}

export interface AiChatError {
  requestId: string;
  message: string;
  status?: number;
}

export interface AiSessionDescriptor {
  id: string;
  mode: AiMode;
  presetId?: string;
  backend?: AiBackendKind;
  providerLabel: string;
  rootLabel: string;
  rootPath?: string;
  branchLabel: string;
  executionTarget: AiExecutionTarget;
  writableScope?: string;
  createdAt: string;
}

/**
 * Where a patch target's content lives and how apply/rollback must write it:
 * "editor" targets are open workspace documents (in-memory update, the user
 * saves); "disk" targets are project files written directly (e.g. `.tinder/`
 * business objects not open in an editor).
 */
export type AiPatchTargetStorage = "editor" | "disk";

export interface AiPatchProposalTarget {
  uri: string;
  label: string;
  language?: string;
  storage?: AiPatchTargetStorage;
  beforeContent: string;
  afterContent: string;
}

export interface AiPatchProposal {
  id: string;
  sessionId: string;
  mode: AiMode;
  presetId: string;
  title: string;
  summary: string;
  createdAt: string;
  targets: AiPatchProposalTarget[];
  status: "draft" | "applied" | "discarded" | "conflict";
}

export interface AiPatchSnapshot {
  snapshotId: string;
  proposalId: string;
  createdAt: string;
  mode: AiMode;
  presetId: string;
  targets: Array<{
    uri: string;
    storage?: AiPatchTargetStorage;
    beforeContent: string;
    beforeHash: string;
    appliedContent: string;
    appliedHash: string;
  }>;
}

export interface AiCodexTaskStartInput {
  taskId?: string;
  presetId: string;
  mode: AiMode;
  prompt: string;
  context?: string;
  cwd?: string;
}

export interface AiCodexTaskStarted {
  taskId: string;
}

export type AiCodexTaskEventKind =
  | "message"
  | "command"
  | "stderr"
  | "error"
  | "complete"
  | "raw";

export interface AiCodexTaskEvent {
  taskId: string;
  kind: AiCodexTaskEventKind;
  text?: string;
  command?: string;
  exitCode?: number | null;
  raw?: unknown;
}

export interface CodexStatus {
  installed: boolean;
  authenticated: boolean;
  status: "not-installed" | "not-signed-in" | "credentials-found" | "signed-in" | "error";
  command: string;
  version?: string;
  message?: string;
}

/**
 * JSON payload an API model must return in `auto` mode. The renderer converts
 * a valid payload into an `AiPatchProposal` against the current documents.
 */
export interface AiProposalPayloadTarget {
  /** Must match a uri listed in the "Writable targets" context section. */
  uri: string;
  /** Complete resulting file content, not a diff or fragment. */
  afterContent: string;
  note?: string;
}

export interface AiProposalPayload {
  title: string;
  summary?: string;
  targets: AiProposalPayloadTarget[];
}

export type AiProposalParseResult =
  | { ok: true; payload: AiProposalPayload }
  | { ok: false; error: string };

/**
 * System instruction injected by the main process for `auto` mode API chats.
 * The writable target list itself travels in the request context, so this
 * text stays free of per-request state.
 */
export const AUTO_PROPOSAL_SYSTEM_INSTRUCTION = [
  "You are generating a file patch proposal for an IDE. Respond with a single JSON object and nothing else - no prose before or after it.",
  "Schema:",
  "{",
  '  "title": string,            // short imperative summary of the change',
  '  "summary": string,          // optional, 1-3 sentences on what changed and why',
  '  "targets": [',
  "    {",
  '      "uri": string,          // must exactly match a uri from the "Writable targets" context section',
  '      "afterContent": string, // the COMPLETE new file content after your change',
  '      "note": string          // optional per-file remark',
  "    }",
  "  ]",
  "}",
  "Rules:",
  '- Only modify files listed in the "Writable targets" context section.',
  '- "afterContent" must be the full resulting file content, never a diff, patch, or fragment.',
  "- Preserve unrelated content exactly, including comments, formatting, and blank lines.",
  '- If the request cannot be satisfied within the writable targets, return {"title": "...", "summary": "<explain why>", "targets": []}.'
].join("\n");

function scanBalancedObject(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return null;
}

function parsesAsObject(candidate: string): boolean {
  try {
    const parsed = JSON.parse(candidate) as unknown;
    return Boolean(parsed) && typeof parsed === "object" && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

const MAX_JSON_SCAN_STARTS = 32;

/**
 * Pull the most likely JSON object out of model output. Prefers the last
 * fenced ```json block, then falls back to balanced `{...}` spans. Prose
 * braces before the payload (e.g. "I'll update {config}: {...}") are skipped
 * by parse-testing each balanced span instead of trusting the first `{`.
 */
export function extractJsonCandidate(text: string): string | null {
  const fenced = [...text.matchAll(/```(?:json)?\s*\n?([\s\S]*?)```/gi)]
    .map((match) => match[1]?.trim())
    .filter((block): block is string => Boolean(block && block.startsWith("{")));
  for (let index = fenced.length - 1; index >= 0; index -= 1) {
    if (parsesAsObject(fenced[index])) return fenced[index];
  }
  let from = text.indexOf("{");
  let fallback: string | null = null;
  for (let attempts = 0; from >= 0 && attempts < MAX_JSON_SCAN_STARTS; attempts += 1) {
    const candidate = scanBalancedObject(text, from);
    if (candidate) {
      if (parsesAsObject(candidate)) return candidate;
      fallback = fallback ?? candidate;
    }
    from = text.indexOf("{", from + 1);
  }
  // Return the first balanced-but-invalid span so the caller can surface a
  // JSON.parse error message instead of a generic "no JSON object" one.
  return fallback;
}

export function parseAiProposalPayload(
  text: string,
  allowedUris: string[]
): AiProposalParseResult {
  const candidate = extractJsonCandidate(text);
  if (!candidate) return { ok: false, error: "Response contains no JSON object" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch (err) {
    return { ok: false, error: `Response JSON is invalid: ${(err as Error).message}` };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "Response JSON is not an object" };
  }
  const record = parsed as Record<string, unknown>;
  const title = typeof record.title === "string" ? record.title.trim() : "";
  if (!title) return { ok: false, error: 'Proposal is missing a "title" string' };
  const summary = typeof record.summary === "string" ? record.summary.trim() : undefined;
  if (!Array.isArray(record.targets)) {
    return { ok: false, error: 'Proposal is missing a "targets" array' };
  }
  const targets: AiProposalPayloadTarget[] = [];
  for (const [index, raw] of record.targets.entries()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, error: `targets[${index}] is not an object` };
    }
    const target = raw as Record<string, unknown>;
    const uri = typeof target.uri === "string" ? target.uri : "";
    if (!uri) return { ok: false, error: `targets[${index}] is missing a "uri" string` };
    if (!allowedUris.includes(uri)) {
      return {
        ok: false,
        error: `targets[${index}].uri "${uri}" is not a writable target. Allowed: ${allowedUris.join(", ") || "(none)"}`
      };
    }
    if (typeof target.afterContent !== "string") {
      return { ok: false, error: `targets[${index}] is missing an "afterContent" string` };
    }
    targets.push({
      uri,
      afterContent: target.afterContent,
      note: typeof target.note === "string" ? target.note : undefined
    });
  }
  return { ok: true, payload: { title, summary, targets } };
}

export function createDefaultCodexConfig(): CodexCliConfig {
  return {
    id: "codex-default",
    label: "Codex",
    command: "codex",
    sandbox: "read-only",
    approvalPolicy: "on-request"
  };
}

export function createDefaultCodexPreset(): AiModelPreset {
  return {
    id: "codex-readonly-high",
    label: "Codex High",
    backend: "codex",
    codexConfigId: "codex-default",
    reasoning: {
      label: "high",
      displayName: "High",
      codex: { modelReasoningEffort: "high" }
    },
    supportedModes: ["chat", "auto", "plan", "debug"],
    defaultMode: "plan"
  };
}
