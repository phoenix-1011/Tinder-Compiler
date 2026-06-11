import { app, ipcMain } from "electron";
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { spawn } from "node:child_process";
import {
  AUTO_PROPOSAL_SYSTEM_INSTRUCTION,
  EMPTY_USER_AI_SETTINGS,
  createDefaultCodexConfig,
  createDefaultCodexPreset,
  type AiChatEnd,
  type AiChatError,
  type AiChatStartInput,
  type AiChatStarted,
  type AiCodexTaskEvent,
  type AiCodexTaskStartInput,
  type AiCodexTaskStarted,
  type AiMode,
  type AiApiProviderConfig,
  type AiMessage,
  type AiModelPreset,
  type AiProviderTestResult,
  type AiSecretMetadata,
  type AiSecretSaveInput,
  type CodexStatus,
  type UserAiSettings
} from "@tinder/ai";
import { safeStorage } from "electron";
import type { WebContents } from "electron";
import type { ChildProcessWithoutNullStreams } from "node:child_process";

interface SecretRecord {
  secretId: string;
  label?: string;
  storageMode: "safeStorage" | "plain";
  value: string;
}

interface SecretStore {
  secrets: SecretRecord[];
}

const SETTINGS_FILE = "ai-settings.json";
const SECRETS_FILE = "ai-secrets.json";
const AI_MODES = new Set<AiMode>(["chat", "auto", "plan", "debug"]);
const API_RUNTIME_MODES = new Set<AiMode>(["chat", "plan", "auto"]);
const API_PROVIDER_KINDS = new Set(["openai-compatible"]);
const CODEX_SANDBOXES = new Set(["read-only", "workspace-write", "danger-full-access"]);
const CODEX_APPROVAL_POLICIES = new Set(["on-request", "never"]);
const MAX_PROVIDER_ERROR_CHARS = 2000;
const activeChatRequests = new Map<string, AbortController>();
const activeCodexTasks = new Map<string, ChildProcessWithoutNullStreams>();

function aiSettingsPath(): string {
  return join(app.getPath("userData"), SETTINGS_FILE);
}

function aiSecretsPath(): string {
  return join(app.getPath("userData"), SECRETS_FILE);
}

function withApiRuntimeModes(preset: AiModelPreset): AiModelPreset {
  // Targeted migration: API presets saved before `auto` joined
  // API_RUNTIME_MODES carry exactly ["chat", "plan"]. Only that legacy shape
  // is widened - a deliberately narrowed list (e.g. ["chat"]) stays as the
  // user wrote it.
  if (preset.backend !== "api") return preset;
  const modes = preset.supportedModes;
  const isLegacyShape =
    modes?.length === 2 && modes.includes("chat") && modes.includes("plan");
  return isLegacyShape ? { ...preset, supportedModes: [...modes, "auto"] } : preset;
}

function withDefaults(settings: Partial<UserAiSettings>): UserAiSettings {
  const defaultCodexConfig = createDefaultCodexConfig();
  const defaultCodexPreset = createDefaultCodexPreset();
  const codexConfigs = settings.codexConfigs ?? [];
  const modelPresets = settings.modelPresets ?? [];
  return {
    providers: settings.providers ?? [],
    codexConfigs: codexConfigs.some((c) => c.id === defaultCodexConfig.id)
      ? codexConfigs
      : [defaultCodexConfig, ...codexConfigs],
    modelPresets: (modelPresets.some((p) => p.id === defaultCodexPreset.id)
      ? modelPresets
      : [defaultCodexPreset, ...modelPresets]
    ).map(withApiRuntimeModes),
    defaultModelPresetId: settings.defaultModelPresetId,
    defaultMode: settings.defaultMode ?? EMPTY_USER_AI_SETTINGS.defaultMode
  };
}

function ensureString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid AI settings: ${field} is required`);
  }
  return value;
}

function ensureUnique(ids: string[], field: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) throw new Error(`Invalid AI settings: duplicate ${field} id "${id}"`);
    seen.add(id);
  }
}

function validateSettings(input: UserAiSettings): UserAiSettings {
  for (const field of ["providers", "codexConfigs", "modelPresets"] as const) {
    const value = input[field];
    if (value != null && !Array.isArray(value)) {
      throw new Error(`Invalid AI settings: ${field} must be an array`);
    }
  }
  const settings = withDefaults(input);

  ensureUnique(settings.providers.map((p) => ensureString(p.id, "provider.id")), "provider");
  ensureUnique(settings.codexConfigs.map((c) => ensureString(c.id, "codexConfig.id")), "codexConfig");
  ensureUnique(settings.modelPresets.map((p) => ensureString(p.id, "modelPreset.id")), "modelPreset");

  const providerIds = new Set(settings.providers.map((p) => p.id));
  const codexConfigIds = new Set(settings.codexConfigs.map((c) => c.id));
  const presetIds = new Set(settings.modelPresets.map((p) => p.id));

  for (const provider of settings.providers) {
    ensureString(provider.label, "provider.label");
    ensureString(provider.baseUrl, "provider.baseUrl");
    if (!API_PROVIDER_KINDS.has(provider.kind)) {
      throw new Error(`Invalid AI settings: unsupported provider kind "${provider.kind}"`);
    }
    if (provider.apiKeySource?.kind === "env") {
      ensureString(provider.apiKeySource.env, "provider.apiKeySource.env");
    } else if (provider.apiKeySource?.kind === "stored") {
      ensureString(provider.apiKeySource.secretId, "provider.apiKeySource.secretId");
    } else if (provider.apiKeySource) {
      throw new Error("Invalid AI settings: unsupported apiKeySource kind");
    }
  }

  for (const config of settings.codexConfigs) {
    ensureString(config.label, "codexConfig.label");
    ensureString(config.command, "codexConfig.command");
    if (!CODEX_SANDBOXES.has(config.sandbox)) {
      throw new Error(`Invalid AI settings: unsupported Codex sandbox "${config.sandbox}"`);
    }
    if (config.approvalPolicy && !CODEX_APPROVAL_POLICIES.has(config.approvalPolicy)) {
      throw new Error(
        `Invalid AI settings: unsupported Codex approval policy "${config.approvalPolicy}"`
      );
    }
  }

  for (const preset of settings.modelPresets) {
    ensureString(preset.label, "modelPreset.label");
    const supportedModes = preset.supportedModes?.length ? preset.supportedModes : [...AI_MODES];
    for (const mode of supportedModes) {
      if (!AI_MODES.has(mode)) {
        throw new Error(`Invalid AI settings: unsupported mode "${mode}"`);
      }
    }
    if (preset.defaultMode && !supportedModes.includes(preset.defaultMode)) {
      throw new Error(
        `Invalid AI settings: defaultMode "${preset.defaultMode}" is not supported by "${preset.id}"`
      );
    }
    if (preset.backend === "api") {
      if (!preset.providerId || !providerIds.has(preset.providerId)) {
        throw new Error(`Invalid AI settings: API preset "${preset.id}" has no valid provider`);
      }
      ensureString(preset.model, "modelPreset.model");
    } else if (preset.backend === "codex") {
      if (!preset.codexConfigId || !codexConfigIds.has(preset.codexConfigId)) {
        throw new Error(`Invalid AI settings: Codex preset "${preset.id}" has no valid config`);
      }
    } else {
      throw new Error(`Invalid AI settings: unsupported preset backend "${preset.backend}"`);
    }
  }

  if (settings.defaultModelPresetId && !presetIds.has(settings.defaultModelPresetId)) {
    throw new Error("Invalid AI settings: defaultModelPresetId does not exist");
  }
  if (settings.defaultMode && !AI_MODES.has(settings.defaultMode)) {
    throw new Error(`Invalid AI settings: unsupported default mode "${settings.defaultMode}"`);
  }
  if (settings.defaultModelPresetId && settings.defaultMode) {
    const defaultPreset = settings.modelPresets.find((p) => p.id === settings.defaultModelPresetId);
    const defaultPresetModes = defaultPreset?.supportedModes?.length
      ? defaultPreset.supportedModes
      : [...AI_MODES];
    if (!defaultPresetModes.includes(settings.defaultMode)) {
      throw new Error(
        `Invalid AI settings: global defaultMode "${settings.defaultMode}" is not supported by the default preset`
      );
    }
  }
  return settings;
}

async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(path, "utf8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return fallback;
    throw err;
  }
}

async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true });
  await fs.writeFile(path, JSON.stringify(value, null, 2), "utf8");
}

async function readSettings(): Promise<UserAiSettings> {
  const raw = await readJsonFile<Partial<UserAiSettings>>(aiSettingsPath(), {});
  return withDefaults(raw);
}

async function writeSettings(settings: UserAiSettings): Promise<void> {
  await writeJsonFile(aiSettingsPath(), validateSettings(settings));
}

async function readSecretStore(): Promise<SecretStore> {
  return readJsonFile<SecretStore>(aiSecretsPath(), { secrets: [] });
}

async function writeSecretStore(store: SecretStore): Promise<void> {
  await writeJsonFile(aiSecretsPath(), store);
}

function encryptSecret(value: string): { storageMode: "safeStorage"; value: string } {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      "Secure credential storage is not available. Leave the API key empty and use an environment variable instead."
    );
  }
  return {
    storageMode: "safeStorage",
    value: safeStorage.encryptString(value).toString("base64")
  };
}

function decryptSecret(record: SecretRecord): string {
  const buffer = Buffer.from(record.value, "base64");
  if (record.storageMode === "safeStorage") {
    return safeStorage.decryptString(buffer);
  }
  return buffer.toString("utf8");
}

function makeSecretId(): string {
  return `secret-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function saveSecret(input: AiSecretSaveInput): Promise<{ secretId: string }> {
  const store = await readSecretStore();
  const secretId = input.secretId && input.secretId.length > 0 ? input.secretId : makeSecretId();
  const encrypted = encryptSecret(input.value);
  const next: SecretRecord = {
    secretId,
    label: input.label,
    storageMode: encrypted.storageMode,
    value: encrypted.value
  };
  const idx = store.secrets.findIndex((s) => s.secretId === secretId);
  if (idx >= 0) store.secrets[idx] = next;
  else store.secrets.push(next);
  await writeSecretStore(store);
  return { secretId };
}

async function deleteSecret(secretId: string): Promise<void> {
  const store = await readSecretStore();
  await writeSecretStore({
    secrets: store.secrets.filter((s) => s.secretId !== secretId)
  });
}

async function listSecrets(): Promise<AiSecretMetadata[]> {
  const store = await readSecretStore();
  return store.secrets.map((s) => ({
    secretId: s.secretId,
    label: s.label,
    hasSecret: true,
    storageMode: s.storageMode
  }));
}

async function resolveApiKey(provider: AiApiProviderConfig): Promise<string | null> {
  const source = provider.apiKeySource;
  if (!source) return null;
  if (source.kind === "env") return process.env[source.env] ?? null;
  const store = await readSecretStore();
  const record = store.secrets.find((s) => s.secretId === source.secretId);
  if (!record) return null;
  return decryptSecret(record);
}

async function testProvider(providerId: string): Promise<AiProviderTestResult> {
  const settings = await readSettings();
  const provider = settings.providers.find((p) => p.id === providerId);
  if (!provider) return { ok: false, message: "Provider not found" };
  if (provider.kind !== "openai-compatible") {
    return { ok: false, message: `Unsupported provider kind: ${provider.kind}` };
  }
  const apiKey = await resolveApiKey(provider);
  if (provider.apiKeySource && !apiKey) {
    return { ok: false, message: "API key is not configured" };
  }
  const baseUrl = provider.baseUrl.replace(/\/+$/, "");
  const headers: Record<string, string> = { ...(provider.defaultHeaders ?? {}) };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  try {
    const response = await fetch(`${baseUrl}/models`, { method: "GET", headers });
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message: `Provider returned HTTP ${response.status}`
      };
    }
    return { ok: true, status: response.status, message: "Provider is reachable" };
  } catch (err) {
    return { ok: false, message: (err as Error).message ?? String(err) };
  }
}

function makeChatRequestId(): string {
  return `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function sendChatDelta(contents: WebContents, requestId: string, text: string): void {
  if (text) contents.send(`ai:chat:delta:${requestId}`, { requestId, text });
}

function sendChatEnd(contents: WebContents, payload: AiChatEnd): void {
  contents.send(`ai:chat:end:${payload.requestId}`, payload);
}

function sendChatError(contents: WebContents, payload: AiChatError): void {
  contents.send(`ai:chat:error:${payload.requestId}`, payload);
}

function apiHeaders(provider: AiApiProviderConfig, apiKey: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(provider.defaultHeaders ?? {})
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

function chatMessages(input: AiChatStartInput): AiMessage[] {
  const messages = input.messages?.length ? [...input.messages] : [];
  if (input.context?.trim()) {
    messages.unshift({
      role: "system",
      content: `Use this application context when it is relevant:\n\n${input.context.trim()}`
    });
  }
  messages.push({ role: "user", content: input.prompt });
  if (input.mode === "plan") {
    messages.unshift({
      role: "system",
      content: "Return an implementation or debugging plan only. Do not claim to edit files."
    });
  }
  if (input.mode === "auto") {
    messages.unshift({ role: "system", content: AUTO_PROPOSAL_SYSTEM_INSTRUCTION });
    if (input.messages?.length) {
      // History may contain prose assistant turns (chat answers or rewritten
      // proposal summaries); re-anchor the output contract next to the prompt.
      const last = messages.pop();
      messages.push({
        role: "system",
        content:
          "Reminder: respond with a single JSON object following the patch proposal schema - no prose, no markdown fence."
      });
      if (last) messages.push(last);
    }
  }
  return messages;
}

function chatBody(input: AiChatStartInput, preset: AiModelPreset): Record<string, unknown> {
  const model = preset.reasoning?.api?.model ?? preset.model;
  if (!model) throw new Error(`Model preset "${preset.label}" has no model id`);
  const body: Record<string, unknown> = {
    model,
    messages: chatMessages(input),
    stream: true
  };
  if (preset.reasoning?.api?.reasoningEffort) {
    body.reasoning_effort = preset.reasoning.api.reasoningEffort;
  }
  if (preset.advanced?.temperature != null) body.temperature = preset.advanced.temperature;
  if (preset.advanced?.topP != null) body.top_p = preset.advanced.topP;
  if (preset.advanced?.maxOutputTokens != null) {
    body.max_tokens = preset.advanced.maxOutputTokens;
  }
  return { ...body, ...(preset.reasoning?.api?.extraBody ?? {}) };
}

function extractSseDeltas(buffer: string): { deltas: string[]; rest: string; done: boolean } {
  const deltas: string[] = [];
  let done = false;
  const normalized = buffer.replace(/\r\n/g, "\n");
  const parts = normalized.split("\n\n");
  const rest = parts.pop() ?? "";
  for (const part of parts) {
    const data = part
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");
    if (!data) continue;
    if (data === "[DONE]") {
      done = true;
      continue;
    }
    try {
      const parsed = JSON.parse(data) as {
        choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
      };
      const text =
        parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.message?.content ?? "";
      if (text) deltas.push(text);
    } catch {
      // Ignore non-JSON provider heartbeat frames.
    }
  }
  return { deltas, rest, done };
}

function normalizeProviderError(err: unknown): string {
  if (err instanceof DOMException && err.name === "AbortError") return "Request cancelled";
  if (err instanceof Error) return err.message;
  return String(err);
}

function normalizeProviderErrorBody(status: number, body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return `Provider returned HTTP ${status}`;
  const clipped =
    trimmed.length > MAX_PROVIDER_ERROR_CHARS
      ? `${trimmed.slice(0, MAX_PROVIDER_ERROR_CHARS)}... [truncated]`
      : trimmed;
  return `Provider returned HTTP ${status}: ${clipped}`;
}

async function streamChat(contents: WebContents, requestId: string, input: AiChatStartInput) {
  const controller = activeChatRequests.get(requestId);
  if (!controller) return;
  try {
    const prompt = input.prompt.trim();
    if (!prompt) throw new Error("Prompt is required");
    if (!API_RUNTIME_MODES.has(input.mode)) {
      throw new Error(`${input.mode} mode is not available for custom API chat yet`);
    }

    const settings = await readSettings();
    const preset = settings.modelPresets.find((p) => p.id === input.presetId);
    if (!preset) throw new Error("Model preset not found");
    if (preset.backend !== "api") {
      throw new Error("Selected preset is not a custom API preset");
    }
    const supportedModes = preset.supportedModes?.length ? preset.supportedModes : [...AI_MODES];
    if (!supportedModes.includes(input.mode)) {
      throw new Error(`Mode "${input.mode}" is not supported by "${preset.label}"`);
    }
    const provider = settings.providers.find((p) => p.id === preset.providerId);
    if (!provider) throw new Error("Provider not found");
    if (provider.kind !== "openai-compatible") {
      throw new Error(`Unsupported provider kind: ${provider.kind}`);
    }
    const apiKey = await resolveApiKey(provider);
    if (provider.apiKeySource && !apiKey) throw new Error("API key is not configured");

    const baseUrl = provider.baseUrl.replace(/\/+$/, "");
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: apiHeaders(provider, apiKey),
      body: JSON.stringify(chatBody({ ...input, prompt }, preset)),
      signal: controller.signal
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      sendChatError(contents, {
        requestId,
        status: response.status,
        message: normalizeProviderErrorBody(response.status, text)
      });
      return;
    }
    if (!response.body) throw new Error("Provider response did not include a stream body");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let rest = "";
    let done = false;
    while (!done) {
      const chunk = await reader.read();
      if (chunk.done) break;
      const parsed = extractSseDeltas(rest + decoder.decode(chunk.value, { stream: true }));
      rest = parsed.rest;
      done = parsed.done;
      for (const delta of parsed.deltas) sendChatDelta(contents, requestId, delta);
    }
    if (rest.trim()) {
      const parsed = extractSseDeltas(`${rest}\n\n`);
      for (const delta of parsed.deltas) sendChatDelta(contents, requestId, delta);
    }
    sendChatEnd(contents, {
      requestId,
      ok: true,
      reason: controller.signal.aborted ? "cancelled" : "done"
    });
  } catch (err) {
    if (controller.signal.aborted) {
      sendChatEnd(contents, { requestId, ok: false, reason: "cancelled" });
    } else {
      sendChatError(contents, { requestId, message: normalizeProviderError(err) });
    }
  } finally {
    activeChatRequests.delete(requestId);
  }
}

function startChat(contents: WebContents, input: AiChatStartInput): AiChatStarted {
  const requestId = input.requestId?.trim() || makeChatRequestId();
  if (activeChatRequests.has(requestId)) {
    throw new Error(`AI chat request "${requestId}" is already running`);
  }
  activeChatRequests.set(requestId, new AbortController());
  setImmediate(() => {
    void streamChat(contents, requestId, input);
  });
  return { requestId };
}

function cancelChat(requestId: string): void {
  activeChatRequests.get(requestId)?.abort();
}

function makeCodexTaskId(): string {
  return `codex-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function sendCodexEvent(contents: WebContents, event: AiCodexTaskEvent): void {
  contents.send(`ai:codex:event:${event.taskId}`, event);
}

function promptForCodex(input: AiCodexTaskStartInput): string {
  const sections = [
    input.context?.trim()
      ? `Application context:\n${input.context.trim()}`
      : "",
    input.mode === "plan"
      ? "Mode: plan. Return a plan only. Do not edit files."
      : input.mode === "debug"
        ? "Mode: debug. Read-only phase. Diagnose and propose a debugging loop; do not edit files."
        : input.mode === "auto"
          ? "Mode: auto. Read-only phase. Propose actions only; do not edit files."
          : "Mode: chat. Answer the user's question.",
    `User request:\n${input.prompt.trim()}`
  ].filter(Boolean);
  return sections.join("\n\n");
}

function quoteCodexConfigValue(value: string): string {
  return JSON.stringify(value);
}

function codexArgs(preset: AiModelPreset, config: UserAiSettings["codexConfigs"][number]): string[] {
  const args = [
    "--ask-for-approval",
    config.approvalPolicy ?? "on-request",
    "exec",
    "--json",
    "--sandbox",
    "read-only"
  ];
  const model = preset.reasoning?.codex?.model ?? preset.model ?? config.model;
  const profile = preset.reasoning?.codex?.profile ?? config.profile;
  const reasoningEffort =
    preset.reasoning?.codex?.modelReasoningEffort ?? config.modelReasoningEffort;
  if (profile) args.push("--profile", profile);
  if (model) args.push("--model", model);
  if (reasoningEffort) {
    args.push("-c", `model_reasoning_effort=${quoteCodexConfigValue(reasoningEffort)}`);
  }
  args.push("-");
  return args;
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value == null) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function normalizeCodexJsonEvent(taskId: string, raw: unknown): AiCodexTaskEvent {
  if (!raw || typeof raw !== "object") {
    return { taskId, kind: "raw", text: stringifyUnknown(raw), raw };
  }
  const record = raw as Record<string, unknown>;
  const type = stringifyUnknown(record.type || record.event || record.kind);
  const item =
    record.item && typeof record.item === "object"
      ? (record.item as Record<string, unknown>)
      : undefined;
  const itemType = stringifyUnknown(item?.type);
  const text = stringifyUnknown(
    record.message ??
      record.text ??
      record.content ??
      record.delta ??
      item?.text ??
      item?.content
  );
  const command = stringifyUnknown(
    record.command ??
      record.cmd ??
      item?.command ??
      (record.exec && typeof record.exec === "object"
        ? (record.exec as Record<string, unknown>).command
        : undefined)
  );
  const lowerType = type.toLowerCase();
  const lowerItemType = itemType.toLowerCase();
  if (lowerType === "thread.started") {
    return {
      taskId,
      kind: "message",
      text: `Codex thread started${record.thread_id ? `: ${stringifyUnknown(record.thread_id)}` : "."}`,
      raw
    };
  }
  if (lowerType === "turn.started") {
    return { taskId, kind: "message", text: "Codex turn started.", raw };
  }
  if (lowerType === "turn.completed") {
    return { taskId, kind: "complete", text: "Codex turn completed.", raw };
  }
  if (lowerType === "turn.failed" || lowerType.includes("error")) {
    return { taskId, kind: "error", text: text || stringifyUnknown(raw), raw };
  }
  if (lowerItemType === "agent_message" && text) {
    return { taskId, kind: "message", text, raw };
  }
  if (lowerItemType === "reasoning") {
    return { taskId, kind: "message", text: text || "Codex reasoning step completed.", raw };
  }
  if (command || lowerType.includes("command") || lowerType.includes("exec")) {
    return { taskId, kind: "command", command: command || text || type, text, raw };
  }
  if (text) return { taskId, kind: "message", text, raw };
  return { taskId, kind: "raw", text: stringifyUnknown(raw), raw };
}

function consumeCodexJsonl(contents: WebContents, taskId: string, state: { stdoutRest: string }, chunk: string): void {
  state.stdoutRest += chunk;
  const lines = state.stdoutRest.split(/\r?\n/);
  state.stdoutRest = lines.pop() ?? "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      sendCodexEvent(contents, normalizeCodexJsonEvent(taskId, JSON.parse(trimmed)));
    } catch {
      sendCodexEvent(contents, { taskId, kind: "raw", text: trimmed });
    }
  }
}

function flushCodexJsonl(contents: WebContents, taskId: string, state: { stdoutRest: string }): void {
  const trimmed = state.stdoutRest.trim();
  if (!trimmed) return;
  try {
    sendCodexEvent(contents, normalizeCodexJsonEvent(taskId, JSON.parse(trimmed)));
  } catch {
    sendCodexEvent(contents, { taskId, kind: "raw", text: trimmed });
  }
  state.stdoutRest = "";
}

/**
 * Kill a spawned child including its descendants. With `shell: true` on
 * Windows the tracked pid is the cmd.exe wrapper; plain kill() would leave
 * the actual codex process running, so use taskkill's tree mode there.
 */
function killProcessTree(child: ChildProcessWithoutNullStreams): void {
  try {
    if (process.platform === "win32" && child.pid) {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
    } else {
      child.kill();
    }
  } catch {
    /* already exited */
  }
}

async function startCodexTask(
  contents: WebContents,
  input: AiCodexTaskStartInput
): Promise<AiCodexTaskStarted> {
  const prompt = input.prompt.trim();
  if (!prompt) throw new Error("Prompt is required");
  const settings = await readSettings();
  const preset = settings.modelPresets.find((p) => p.id === input.presetId);
  if (!preset) throw new Error("Model preset not found");
  if (preset.backend !== "codex") throw new Error("Selected preset is not a Codex preset");
  const config = settings.codexConfigs.find((item) => item.id === preset.codexConfigId);
  if (!config) throw new Error("Codex config not found");
  const taskId = input.taskId?.trim() || makeCodexTaskId();
  if (activeCodexTasks.has(taskId)) throw new Error(`Codex task "${taskId}" is already running`);
  const cwd = input.cwd?.trim() || app.getPath("home");
  const child = spawn(config.command || "codex", codexArgs(preset, config), {
    cwd,
    env: process.env,
    shell: process.platform === "win32",
    windowsHide: true
  });
  child.stdin.on("error", () => {
    /* Spawn failures destroy stdin before the buffered prompt flushes; the
       child "error" handler below already reports the root cause. */
  });
  child.stdin.end(promptForCodex(input));
  activeCodexTasks.set(taskId, child);
  const state = { stdoutRest: "" };
  let closed = false;
  const finish = (event: AiCodexTaskEvent) => {
    if (closed) return;
    closed = true;
    activeCodexTasks.delete(taskId);
    flushCodexJsonl(contents, taskId, state);
    sendCodexEvent(contents, event);
  };
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => consumeCodexJsonl(contents, taskId, state, chunk));
  child.stderr.on("data", (chunk: string) => {
    if (chunk.trim()) sendCodexEvent(contents, { taskId, kind: "stderr", text: chunk });
  });
  child.on("error", (err) => {
    finish({ taskId, kind: "error", text: err.message, exitCode: null });
  });
  child.on("close", (code) => {
    finish({
      taskId,
      kind: code === 0 ? "complete" : "error",
      exitCode: code,
      text: code === 0 ? "Codex task completed." : `Codex task exited with code ${code ?? "unknown"}.`
    });
  });
  return { taskId };
}

function cancelCodexTask(taskId: string): void {
  const child = activeCodexTasks.get(taskId);
  if (!child) return;
  try {
    killProcessTree(child);
  } finally {
    activeCodexTasks.delete(taskId);
  }
}

function runCommand(command: string, args: string[], timeoutMs = 5000): Promise<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
  error?: string;
}> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env: process.env,
      shell: process.platform === "win32",
      windowsHide: true
    });
    child.stdin.on("error", () => {
      /* spawn failure is reported via the child "error" handler */
    });
    child.stdin.end();
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result: {
      exitCode: number | null;
      stdout: string;
      stderr: string;
      error?: string;
    }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      killProcessTree(child);
      finish({ exitCode: null, stdout, stderr, error: "Timed out" });
    }, timeoutMs);
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (err) => {
      finish({ exitCode: null, stdout, stderr, error: err.message });
    });
    child.on("close", (code) => {
      finish({ exitCode: code, stdout, stderr });
    });
  });
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.stat(path);
    return true;
  } catch {
    return false;
  }
}

async function codexStatus(command = "codex"): Promise<CodexStatus> {
  const version = await runCommand(command, ["--version"], 5000);
  if (version.error || version.exitCode !== 0) {
    return {
      installed: false,
      authenticated: false,
      status: "not-installed",
      command,
      message: version.error || version.stderr || "Codex CLI is not available"
    };
  }

  const login = await runCommand(command, ["login", "status"], 5000);
  if (login.exitCode === 0) {
    return {
      installed: true,
      authenticated: true,
      status: "signed-in",
      command,
      version: (version.stdout || version.stderr).trim(),
      message: (login.stdout || login.stderr).trim() || "Codex CLI is signed in"
    };
  }

  const hasEnvAuth = Boolean(process.env.CODEX_API_KEY || process.env.CODEX_ACCESS_TOKEN);
  const hasFileAuth = await fileExists(join(homedir(), ".codex", "auth.json"));
  const hasLocalCredential = hasEnvAuth || hasFileAuth;
  return {
    installed: true,
    authenticated: false,
    status: hasLocalCredential ? "credentials-found" : "not-signed-in",
    command,
    version: (version.stdout || version.stderr).trim(),
    message: hasLocalCredential
      ? "Codex CLI is available and local credentials were found, but they have not been validated"
      : "Codex CLI is installed, but no local auth cache or Codex auth environment variable was found"
  };
}

/**
 * Renderer-supplied status commands run through a shell, so only probe
 * commands that already exist in validated settings (or the default). An
 * unsaved command must be saved through writeSettings validation first.
 */
async function codexStatusGuarded(command?: string): Promise<CodexStatus> {
  const requested = command?.trim() || "codex";
  const settings = await readSettings();
  const allowed = new Set(["codex", ...settings.codexConfigs.map((c) => c.command.trim())]);
  if (!allowed.has(requested)) {
    return {
      installed: false,
      authenticated: false,
      status: "error",
      command: requested,
      message: "Command is not a saved Codex command. Save it in Settings first."
    };
  }
  return codexStatus(requested);
}

export function registerAiHandlers(): void {
  ipcMain.handle("ai:readSettings", () => readSettings());
  ipcMain.handle("ai:writeSettings", (_event, settings: UserAiSettings) =>
    writeSettings(settings)
  );
  ipcMain.handle("ai:saveSecret", (_event, input: AiSecretSaveInput) => saveSecret(input));
  ipcMain.handle("ai:deleteSecret", (_event, secretId: string) => deleteSecret(secretId));
  ipcMain.handle("ai:listSecrets", () => listSecrets());
  ipcMain.handle("ai:testProvider", (_event, providerId: string) => testProvider(providerId));
  ipcMain.handle("ai:codexStatus", (_event, command?: string) => codexStatusGuarded(command));
  ipcMain.handle("ai:chat:start", (event, input: AiChatStartInput) =>
    startChat(event.sender, input)
  );
  ipcMain.handle("ai:chat:cancel", (_event, requestId: string) => cancelChat(requestId));
  ipcMain.handle("ai:codex:start", (event, input: AiCodexTaskStartInput) =>
    startCodexTask(event.sender, input)
  );
  ipcMain.handle("ai:codex:cancel", (_event, taskId: string) => cancelCodexTask(taskId));
}
