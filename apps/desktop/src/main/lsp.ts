import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

/**
 * Minimal LSP bridge: spawns a Language Server (clangd / pyright / gopls / …)
 * and pipes its stdio to the renderer over IPC. The renderer runs the LSP
 * client (monaco-languageclient) and frames JSON-RPC messages itself; we are
 * just a transparent transport.
 */

interface LspSession {
  id: number;
  child: ChildProcessWithoutNullStreams;
  windowId: number;
  killed: boolean;
}

const sessions = new Map<number, LspSession>();
let nextId = 1;

export interface LspStartOptions {
  /** Server identifier (informational, e.g. "clangd"). */
  id: string;
  /** Executable on PATH or absolute path. */
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
}

export function registerLspHandlers(): void {
  ipcMain.handle("lsp:start", (event: IpcMainInvokeEvent, opts: LspStartOptions) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) throw new Error("No browser window for lsp:start");

    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(opts.command, opts.args ?? [], {
        cwd: opts.cwd,
        env: { ...process.env, ...(opts.env ?? {}) },
        windowsHide: true,
        // shell:false — LSP messages are length-prefixed binary; no shell munging.
        shell: false
      });
    } catch (err) {
      throw new Error(`无法启动语言服务器 ${opts.id}: ${(err as Error).message}`);
    }

    const id = nextId++;
    const session: LspSession = { id, child, windowId: win.id, killed: false };
    sessions.set(id, session);

    const emit = (channel: string, payload: unknown) => {
      if (!win.isDestroyed()) win.webContents.send(channel, payload);
    };

    // Forward stdout as raw bytes (base64) — LSP framing is the renderer's job.
    child.stdout.on("data", (chunk: Buffer) => {
      emit(`lsp:data:${id}`, chunk.toString("base64"));
    });

    // Stderr is purely diagnostic — let the renderer surface it as needed.
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      emit(`lsp:stderr:${id}`, chunk);
    });

    child.on("error", (err) => {
      emit(`lsp:error:${id}`, { message: err.message });
    });

    child.on("close", (code, signal) => {
      emit(`lsp:exit:${id}`, { exitCode: code ?? -1, signal });
      sessions.delete(id);
    });

    win.once("closed", () => {
      if (!session.killed && !child.killed) {
        try {
          child.kill();
        } catch {
          /* ignore */
        }
      }
    });

    return { id, pid: child.pid ?? null };
  });

  ipcMain.handle("lsp:write", (_event, id: number, base64: string) => {
    const session = sessions.get(id);
    if (!session || session.killed) return;
    const buf = Buffer.from(base64, "base64");
    session.child.stdin.write(buf);
  });

  ipcMain.handle("lsp:stop", (_event, id: number) => {
    const session = sessions.get(id);
    if (!session) return;
    session.killed = true;
    try {
      session.child.kill();
    } catch {
      /* ignore */
    }
    sessions.delete(id);
  });
}
