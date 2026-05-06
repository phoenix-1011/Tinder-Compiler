import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import { spawn as ptySpawn, type IPty } from "node-pty";
import { join } from "node:path";
import { homedir } from "node:os";

interface PtySession {
  id: number;
  pty: IPty;
  windowId: number;
  flushTimer: NodeJS.Timeout | null;
  buffer: string;
  disposed: boolean;
}

const sessions = new Map<number, PtySession>();
let nextId = 1;

/** ~16ms frame batching — same idea as VS Code terminal. */
const FRAME_INTERVAL_MS = 16;

function shellIntegrationDir(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "shell-integration");
  }
  return join(app.getAppPath(), "resources", "shell-integration");
}

interface ShellLaunchConfig {
  command: string;
  args: string[];
  injection?: boolean;
}

function resolveShell(): ShellLaunchConfig {
  if (process.platform === "win32") {
    const script = join(shellIntegrationDir(), "shellIntegration.ps1");
    // Prefer PowerShell 7 if installed, fall back to Windows PowerShell.
    const pwsh = process.env["ProgramFiles"]
      ? join(process.env["ProgramFiles"]!, "PowerShell", "7", "pwsh.exe")
      : "";
    const command = pwsh && existsSync(pwsh) ? pwsh : "powershell.exe";
    return {
      command,
      args: ["-NoExit", "-Command", `try { . '${script.replace(/'/g, "''")}' } catch {}`],
      injection: true
    };
  }
  if (process.platform === "darwin") {
    return { command: process.env["SHELL"] || "/bin/zsh", args: ["-l"], injection: true };
  }
  return { command: process.env["SHELL"] || "/bin/bash", args: ["-l"], injection: true };
}

function existsSync(p: string): boolean {
  try {
    // Lazy require to avoid pulling fs at module top.
    return require("node:fs").existsSync(p);
  } catch {
    return false;
  }
}

function buildEnv(injection: boolean | undefined): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
    TINDER_TERMINAL: "1"
  };
  if (injection && process.platform !== "win32") {
    // Have bash/zsh source the integration script via env var (read by ENV/BASH_ENV)
    env.TINDER_SHELL_INTEGRATION = join(shellIntegrationDir(), "shellIntegration-posix.sh");
    env.BASH_ENV = env.TINDER_SHELL_INTEGRATION;
    env.ENV = env.TINDER_SHELL_INTEGRATION;
  }
  return env;
}

function flushSession(session: PtySession, win: BrowserWindow): void {
  if (session.disposed) return;
  if (session.buffer.length === 0) return;
  const data = session.buffer;
  session.buffer = "";
  if (!win.isDestroyed()) {
    win.webContents.send(`terminal:data:${session.id}`, data);
  }
}

export function registerTerminalHandlers(): void {
  ipcMain.handle(
    "terminal:create",
    (event: IpcMainInvokeEvent, opts: { cwd?: string; cols?: number; rows?: number }) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) throw new Error("No browser window for terminal:create");

      const { command, args, injection } = resolveShell();
      const cwd = opts.cwd && opts.cwd.length > 0 ? opts.cwd : homedir();
      const cols = Math.max(2, opts.cols ?? 80);
      const rows = Math.max(2, opts.rows ?? 24);

      const pty = ptySpawn(command, args, {
        cwd,
        cols,
        rows,
        env: buildEnv(injection) as Record<string, string>,
        useConpty: process.platform === "win32"
      });

      const id = nextId++;
      const session: PtySession = {
        id,
        pty,
        windowId: win.id,
        flushTimer: null,
        buffer: "",
        disposed: false
      };
      sessions.set(id, session);

      pty.onData((chunk) => {
        if (session.disposed) return;
        session.buffer += chunk;
        if (session.flushTimer == null) {
          session.flushTimer = setTimeout(() => {
            session.flushTimer = null;
            flushSession(session, win);
          }, FRAME_INTERVAL_MS);
        }
      });

      pty.onExit(({ exitCode, signal }) => {
        flushSession(session, win);
        if (!win.isDestroyed()) {
          win.webContents.send(`terminal:exit:${id}`, { exitCode, signal });
        }
        session.disposed = true;
        if (session.flushTimer) {
          clearTimeout(session.flushTimer);
          session.flushTimer = null;
        }
        sessions.delete(id);
      });

      win.once("closed", () => {
        if (!session.disposed) {
          try {
            pty.kill();
          } catch {
            /* ignore */
          }
          session.disposed = true;
          sessions.delete(id);
        }
      });

      return { id, shell: command };
    }
  );

  ipcMain.handle("terminal:write", (_event, id: number, data: string) => {
    const session = sessions.get(id);
    if (!session || session.disposed) return;
    session.pty.write(data);
  });

  ipcMain.handle("terminal:resize", (_event, id: number, cols: number, rows: number) => {
    const session = sessions.get(id);
    if (!session || session.disposed) return;
    try {
      session.pty.resize(Math.max(2, cols), Math.max(2, rows));
    } catch {
      /* pty may have exited */
    }
  });

  ipcMain.handle("terminal:dispose", (_event, id: number) => {
    const session = sessions.get(id);
    if (!session) return;
    session.disposed = true;
    if (session.flushTimer) {
      clearTimeout(session.flushTimer);
      session.flushTimer = null;
    }
    try {
      session.pty.kill();
    } catch {
      /* ignore */
    }
    sessions.delete(id);
  });
}
