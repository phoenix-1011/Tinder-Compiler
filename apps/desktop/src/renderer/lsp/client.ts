import * as monaco from "monaco-editor";
import { createMessageConnection, type MessageConnection } from "vscode-jsonrpc/browser";
import type {
  InitializeParams,
  InitializeResult,
  PublishDiagnosticsParams,
  ServerCapabilities
} from "vscode-languageserver-protocol";
import { IpcMessageReader, IpcMessageWriter } from "./transport";
import { registerProviders } from "./providers";
import { applyDiagnostics } from "./diagnostics";

export interface LanguageClientOptions {
  /** Identifier (e.g. "clangd"). */
  id: string;
  /** Monaco language ids the server should serve. */
  documentSelector: string[];
  /** Workspace root URI (file:///…). */
  workspaceFolderUri: string;
  /** Workspace root path (filesystem). */
  workspacePath: string;
}

interface OpenedDoc {
  uri: string;
  language: string;
  version: number;
  content: string;
}

const MARKER_OWNER_PREFIX = "tinder-lsp:";
const CHANGE_DEBOUNCE_MS = 200;

export class LanguageClient {
  private connection: MessageConnection | null = null;
  private capabilities: ServerCapabilities | null = null;
  private readonly opened = new Map<string, OpenedDoc>();
  private readonly disposers: Array<() => void> = [];
  private readonly modelListeners = new Map<string, monaco.IDisposable[]>();
  private readonly markerOwner: string;

  constructor(private readonly ptyId: number, public readonly options: LanguageClientOptions) {
    this.markerOwner = `${MARKER_OWNER_PREFIX}${options.id}`;
  }

  async start(): Promise<void> {
    const reader = new IpcMessageReader(this.ptyId);
    const writer = new IpcMessageWriter(this.ptyId);
    const conn = createMessageConnection(reader, writer);
    this.connection = conn;
    conn.listen();

    conn.onNotification("textDocument/publishDiagnostics", (p: PublishDiagnosticsParams) =>
      applyDiagnostics(this.markerOwner, p)
    );

    const result = (await conn.sendRequest("initialize", this.initParams())) as InitializeResult;
    this.capabilities = result.capabilities;
    await conn.sendNotification("initialized", {});

    this.disposers.push(
      ...registerProviders(conn, this.capabilities, this.options.documentSelector, (uri) =>
        this.opened.has(uri)
      )
    );

    // Track current and future Monaco models.
    for (const m of monaco.editor.getModels()) this.maybeOpen(m);
    const onCreate = monaco.editor.onDidCreateModel((m) => this.maybeOpen(m));
    const onDispose = monaco.editor.onWillDisposeModel((m) => this.close(m));
    this.disposers.push(() => onCreate.dispose(), () => onDispose.dispose());
  }

  async stop(): Promise<void> {
    for (const d of this.disposers) try { d(); } catch { /* ignore */ }
    this.disposers.length = 0;
    for (const listeners of this.modelListeners.values()) for (const l of listeners) l.dispose();
    this.modelListeners.clear();
    for (const m of monaco.editor.getModels()) {
      monaco.editor.setModelMarkers(m, this.markerOwner, []);
    }
    if (this.connection) {
      try { this.connection.dispose(); } catch { /* ignore */ }
      this.connection = null;
    }
  }

  // ---- Document sync -------------------------------------------------------

  private maybeOpen(model: monaco.editor.ITextModel): void {
    if (!this.options.documentSelector.includes(model.getLanguageId())) return;
    const uri = model.uri.toString();
    if (this.opened.has(uri)) return;

    const doc: OpenedDoc = {
      uri,
      language: model.getLanguageId(),
      version: 1,
      content: model.getValue()
    };
    this.opened.set(uri, doc);
    this.connection?.sendNotification("textDocument/didOpen", {
      textDocument: { uri, languageId: doc.language, version: doc.version, text: doc.content }
    });

    // Full-document sync, debounced.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      timer = null;
      const cur = this.opened.get(uri);
      if (!cur) return;
      cur.version += 1;
      cur.content = model.getValue();
      this.connection?.sendNotification("textDocument/didChange", {
        textDocument: { uri, version: cur.version },
        contentChanges: [{ text: cur.content }]
      });
    };
    const sub = model.onDidChangeContent(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, CHANGE_DEBOUNCE_MS);
    });
    this.modelListeners.set(uri, [sub]);
  }

  private close(model: monaco.editor.ITextModel): void {
    const uri = model.uri.toString();
    if (!this.opened.has(uri)) return;
    this.opened.delete(uri);
    const listeners = this.modelListeners.get(uri);
    if (listeners) {
      for (const l of listeners) l.dispose();
      this.modelListeners.delete(uri);
    }
    this.connection?.sendNotification("textDocument/didClose", { textDocument: { uri } });
    monaco.editor.setModelMarkers(model, this.markerOwner, []);
  }

  private initParams(): InitializeParams {
    return {
      processId: null,
      rootUri: this.options.workspaceFolderUri,
      workspaceFolders: [{ uri: this.options.workspaceFolderUri, name: this.options.id }],
      capabilities: {
        textDocument: {
          synchronization: { dynamicRegistration: false, didSave: false },
          completion: {
            completionItem: { snippetSupport: true, documentationFormat: ["markdown", "plaintext"] }
          },
          hover: { contentFormat: ["markdown", "plaintext"] },
          definition: { linkSupport: true },
          publishDiagnostics: { relatedInformation: false }
        },
        workspace: { workspaceFolders: true }
      },
      clientInfo: { name: "Tinder Compiler", version: "0.1.0" }
    };
  }
}

export async function startLanguageClient(
  ipc: { command: string; args?: string[]; cwd?: string; env?: Record<string, string> },
  opts: LanguageClientOptions
): Promise<LanguageClient> {
  const { id: ptyId } = await window.tinder.lsp.start({
    id: opts.id,
    command: ipc.command,
    args: ipc.args,
    cwd: ipc.cwd,
    env: ipc.env
  });
  const client = new LanguageClient(ptyId, opts);
  await client.start();
  return client;
}
