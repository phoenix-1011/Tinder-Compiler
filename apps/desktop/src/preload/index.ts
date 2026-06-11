import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type {
  AiChatDelta,
  AiChatEnd,
  AiChatError,
  AiChatStartInput,
  AiChatStarted,
  AiCodexTaskEvent,
  AiCodexTaskStartInput,
  AiCodexTaskStarted,
  AiProviderTestResult,
  AiSecretMetadata,
  AiSecretSaveInput,
  CodexStatus,
  UserAiSettings
} from "@tinder/ai";

export interface DirEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

export interface WalkEntry {
  path: string;
  relativePath: string;
  name: string;
}

export interface OpenedFolder {
  name: string;
  path: string;
}

export interface RecentFolder {
  name: string;
  path: string;
  openedAt: number;
}

export interface TerminalCreateOptions {
  cwd?: string;
  cols?: number;
  rows?: number;
}

export interface TerminalCreateResult {
  id: number;
  shell: string;
}

export interface TerminalExitInfo {
  exitCode: number;
  signal?: number;
}

export type Disposable = () => void;

export interface TerminalApi {
  create(opts?: TerminalCreateOptions): Promise<TerminalCreateResult>;
  write(id: number, data: string): Promise<void>;
  resize(id: number, cols: number, rows: number): Promise<void>;
  dispose(id: number): Promise<void>;
  onData(id: number, listener: (data: string) => void): Disposable;
  onExit(id: number, listener: (info: TerminalExitInfo) => void): Disposable;
}

export interface RunStartOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  label?: string;
}

export interface RunStartedInfo {
  id: number;
  command: string;
  args: string[];
  cwd: string;
  label?: string;
  pid: number | null;
  startedAt: number;
}

export interface RunExitInfo {
  exitCode: number;
  signal: NodeJS.Signals | null;
  killed: boolean;
  durationMs: number;
}

export interface RunApi {
  start(opts: RunStartOptions): Promise<{ id: number; pid: number | null; startedAt: number }>;
  write(id: number, data: string): Promise<void>;
  kill(id: number, signal?: NodeJS.Signals): Promise<void>;
  list(): Promise<RunStartedInfo[]>;
  onStarted(id: number, listener: (info: RunStartedInfo) => void): Disposable;
  onStdout(id: number, listener: (chunk: string) => void): Disposable;
  onStderr(id: number, listener: (chunk: string) => void): Disposable;
  onError(id: number, listener: (err: { message: string }) => void): Disposable;
  onExit(id: number, listener: (info: RunExitInfo) => void): Disposable;
}

export interface SearchOptions {
  query: string;
  cwd: string;
  isRegex?: boolean;
  caseSensitive?: boolean;
  matchWholeWord?: boolean;
  includes?: string[];
  excludes?: string[];
  maxResults?: number;
}

export interface SearchMatch {
  path: string;
  relativePath: string;
  line: number;
  column: number;
  preview: string;
  matchStart: number;
  matchEnd: number;
}

export interface SearchEndInfo {
  exitCode: number;
  cancelled?: boolean;
  error?: string;
  totalMatches: number;
}

export interface SearchApi {
  start(opts: SearchOptions): Promise<{ id: number }>;
  cancel(id: number): Promise<void>;
  onMatch(id: number, listener: (match: SearchMatch) => void): Disposable;
  onStderr(id: number, listener: (chunk: string) => void): Disposable;
  onEnd(id: number, listener: (info: SearchEndInfo) => void): Disposable;
}

export interface RecentApi {
  list(): Promise<RecentFolder[]>;
  remove(path: string): Promise<RecentFolder[]>;
}

export interface LspStartOptions {
  id: string;
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
}

export interface LspApi {
  start(opts: LspStartOptions): Promise<{ id: number; pid: number | null }>;
  write(id: number, base64: string): Promise<void>;
  stop(id: number): Promise<void>;
  onData(id: number, listener: (base64: string) => void): Disposable;
  onStderr(id: number, listener: (chunk: string) => void): Disposable;
  onError(id: number, listener: (info: { message: string }) => void): Disposable;
  onExit(
    id: number,
    listener: (info: { exitCode: number; signal: NodeJS.Signals | null }) => void
  ): Disposable;
}

export interface AiApi {
  readSettings(): Promise<UserAiSettings>;
  writeSettings(settings: UserAiSettings): Promise<void>;
  saveSecret(input: AiSecretSaveInput): Promise<{ secretId: string }>;
  deleteSecret(secretId: string): Promise<void>;
  listSecrets(): Promise<AiSecretMetadata[]>;
  testProvider(providerId: string): Promise<AiProviderTestResult>;
  codexStatus(command?: string): Promise<CodexStatus>;
  startChat(input: AiChatStartInput): Promise<AiChatStarted>;
  cancelChat(requestId: string): Promise<void>;
  onChatDelta(requestId: string, listener: (delta: AiChatDelta) => void): Disposable;
  onChatEnd(requestId: string, listener: (end: AiChatEnd) => void): Disposable;
  onChatError(requestId: string, listener: (error: AiChatError) => void): Disposable;
  startCodexTask(input: AiCodexTaskStartInput): Promise<AiCodexTaskStarted>;
  cancelCodexTask(taskId: string): Promise<void>;
  onCodexTaskEvent(taskId: string, listener: (event: AiCodexTaskEvent) => void): Disposable;
}

export interface TinderApi {
  openFolder(): Promise<OpenedFolder | null>;
  openFolderByPath(path: string): Promise<OpenedFolder>;
  listDir(path: string): Promise<DirEntry[]>;
  /**
   * Like `listDir` but returns `null` instead of throwing when the
   * directory does not exist. Other errors (permission denied, etc.)
   * still throw. Use for optional reads (lazily-created template
   * directories etc.) so the main process doesn't log expected ENOENTs.
   */
  tryListDir(path: string): Promise<DirEntry[] | null>;
  walkDir(root: string, opts?: { limit?: number }): Promise<WalkEntry[]>;
  readText(path: string): Promise<string>;
  /** Like `readText` but returns `null` instead of throwing on ENOENT. */
  tryReadText(path: string): Promise<string | null>;
  /**
   * Boolean existence probe. Silent on ENOENT — other errors still throw.
   * Cheaper than tryReadText for callers that don't need the contents.
   */
  exists(path: string): Promise<boolean>;
  writeText(path: string, contents: string): Promise<void>;
  createFile(path: string): Promise<void>;
  createDir(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  trash(path: string): Promise<void>;
  revealInOs(path: string): Promise<void>;
  joinPath(...segments: string[]): Promise<string>;
  relativePath(root: string, target: string): Promise<string>;
  platform: NodeJS.Platform;
  terminal: TerminalApi;
  run: RunApi;
  search: SearchApi;
  recent: RecentApi;
  lsp: LspApi;
  ai: AiApi;
  userKeybindings: UserKeybindingsApi;
  project: ProjectApi;
  /** Update the OS-drawn title bar overlay (minimize/maximize/close buttons). */
  setTitleBarOverlay(opts: { color: string; symbolColor: string }): Promise<void>;
}

export interface UserKeybindingsApi {
  /** Read raw keybindings.json (creates an empty file on first call). */
  read(): Promise<string>;
  /** Returns the on-disk path of keybindings.json. */
  path(): Promise<string>;
  /** Open the file in the editor and return the path. */
  openForEditing(): Promise<string>;
}

export interface ProjectApi {
  /** Read .tinder/project.json — returns null if it doesn't exist yet. */
  read(root: string): Promise<string | null>;
  write(root: string, contents: string): Promise<void>;
}

function listenOn<T>(channel: string, listener: (payload: T) => void): Disposable {
  const wrap = (_event: IpcRendererEvent, payload: T) => listener(payload);
  ipcRenderer.on(channel, wrap);
  return () => ipcRenderer.off(channel, wrap);
}

const terminal: TerminalApi = {
  create: (opts) => ipcRenderer.invoke("terminal:create", opts ?? {}),
  write: (id, data) => ipcRenderer.invoke("terminal:write", id, data),
  resize: (id, cols, rows) => ipcRenderer.invoke("terminal:resize", id, cols, rows),
  dispose: (id) => ipcRenderer.invoke("terminal:dispose", id),
  onData: (id, listener) => listenOn(`terminal:data:${id}`, listener),
  onExit: (id, listener) => listenOn(`terminal:exit:${id}`, listener)
};

const run: RunApi = {
  start: (opts) => ipcRenderer.invoke("run:start", opts),
  write: (id, data) => ipcRenderer.invoke("run:write", id, data),
  kill: (id, signal) => ipcRenderer.invoke("run:kill", id, signal),
  list: () => ipcRenderer.invoke("run:list"),
  onStarted: (id, listener) => listenOn(`run:started:${id}`, listener),
  onStdout: (id, listener) => listenOn(`run:stdout:${id}`, listener),
  onStderr: (id, listener) => listenOn(`run:stderr:${id}`, listener),
  onError: (id, listener) => listenOn(`run:error:${id}`, listener),
  onExit: (id, listener) => listenOn(`run:exit:${id}`, listener)
};

const search: SearchApi = {
  start: (opts) => ipcRenderer.invoke("search:start", opts),
  cancel: (id) => ipcRenderer.invoke("search:cancel", id),
  onMatch: (id, listener) => listenOn(`search:match:${id}`, listener),
  onStderr: (id, listener) => listenOn(`search:stderr:${id}`, listener),
  onEnd: (id, listener) => listenOn(`search:end:${id}`, listener)
};

const recent: RecentApi = {
  list: () => ipcRenderer.invoke("recent:list"),
  remove: (path) => ipcRenderer.invoke("recent:remove", path)
};

const lsp: LspApi = {
  start: (opts) => ipcRenderer.invoke("lsp:start", opts),
  write: (id, base64) => ipcRenderer.invoke("lsp:write", id, base64),
  stop: (id) => ipcRenderer.invoke("lsp:stop", id),
  onData: (id, listener) => listenOn(`lsp:data:${id}`, listener),
  onStderr: (id, listener) => listenOn(`lsp:stderr:${id}`, listener),
  onError: (id, listener) => listenOn(`lsp:error:${id}`, listener),
  onExit: (id, listener) => listenOn(`lsp:exit:${id}`, listener)
};

const ai: AiApi = {
  readSettings: () => ipcRenderer.invoke("ai:readSettings"),
  writeSettings: (settings) => ipcRenderer.invoke("ai:writeSettings", settings),
  saveSecret: (input) => ipcRenderer.invoke("ai:saveSecret", input),
  deleteSecret: (secretId) => ipcRenderer.invoke("ai:deleteSecret", secretId),
  listSecrets: () => ipcRenderer.invoke("ai:listSecrets"),
  testProvider: (providerId) => ipcRenderer.invoke("ai:testProvider", providerId),
  codexStatus: (command) => ipcRenderer.invoke("ai:codexStatus", command),
  startChat: (input) => ipcRenderer.invoke("ai:chat:start", input),
  cancelChat: (requestId) => ipcRenderer.invoke("ai:chat:cancel", requestId),
  onChatDelta: (requestId, listener) => listenOn(`ai:chat:delta:${requestId}`, listener),
  onChatEnd: (requestId, listener) => listenOn(`ai:chat:end:${requestId}`, listener),
  onChatError: (requestId, listener) => listenOn(`ai:chat:error:${requestId}`, listener),
  startCodexTask: (input) => ipcRenderer.invoke("ai:codex:start", input),
  cancelCodexTask: (taskId) => ipcRenderer.invoke("ai:codex:cancel", taskId),
  onCodexTaskEvent: (taskId, listener) => listenOn(`ai:codex:event:${taskId}`, listener)
};

const userKeybindings: UserKeybindingsApi = {
  read: () => ipcRenderer.invoke("userConfig:keybindings"),
  path: () => ipcRenderer.invoke("userConfig:keybindingsPath"),
  openForEditing: async () => {
    // Seed-on-first-read, then return path. The renderer can open the path.
    await ipcRenderer.invoke("userConfig:keybindings");
    return ipcRenderer.invoke("userConfig:keybindingsPath");
  }
};

const project: ProjectApi = {
  read: (root) => ipcRenderer.invoke("project:read", root),
  write: (root, contents) => ipcRenderer.invoke("project:write", root, contents)
};

const api: TinderApi = {
  openFolder: () => ipcRenderer.invoke("dialog:openDirectory"),
  openFolderByPath: (path) => ipcRenderer.invoke("fs:openFolder", path),
  listDir: (path) => ipcRenderer.invoke("fs:list", path),
  tryListDir: (path) => ipcRenderer.invoke("fs:tryList", path),
  walkDir: (root, opts) => ipcRenderer.invoke("fs:walk", root, opts ?? {}),
  readText: (path) => ipcRenderer.invoke("fs:readText", path),
  tryReadText: (path) => ipcRenderer.invoke("fs:tryReadText", path),
  exists: (path) => ipcRenderer.invoke("fs:exists", path),
  writeText: (path, contents) => ipcRenderer.invoke("fs:writeText", path, contents),
  createFile: (path) => ipcRenderer.invoke("fs:createFile", path),
  createDir: (path) => ipcRenderer.invoke("fs:createDir", path),
  rename: (from, to) => ipcRenderer.invoke("fs:rename", from, to),
  trash: (path) => ipcRenderer.invoke("fs:trash", path),
  revealInOs: (path) => ipcRenderer.invoke("fs:revealInOs", path),
  joinPath: (...segments) => ipcRenderer.invoke("path:join", ...segments),
  relativePath: (root, target) => ipcRenderer.invoke("path:relative", root, target),
  platform: process.platform,
  terminal,
  run,
  search,
  recent,
  lsp,
  ai,
  userKeybindings,
  project,
  setTitleBarOverlay: (opts) =>
    ipcRenderer.invoke("window:setTitleBarOverlay", opts)
};

contextBridge.exposeInMainWorld("tinder", api);
