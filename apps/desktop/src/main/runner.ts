import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

interface RunSession {
  id: number;
  child: ChildProcessWithoutNullStreams;
  windowId: number;
  startedAt: number;
  command: string;
  args: string[];
  cwd: string;
  killed: boolean;
}

const sessions = new Map<number, RunSession>();
let nextId = 1;

export interface RunStartOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  /** Optional human label echoed back to the renderer in events. */
  label?: string;
}

export function registerRunnerHandlers(): void {
  ipcMain.handle("run:start", (event: IpcMainInvokeEvent, opts: RunStartOptions) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) throw new Error("No browser window for run:start");
    if (!opts.command || opts.command.trim().length === 0) {
      throw new Error("命令不能为空");
    }

    const args = opts.args ?? [];
    const cwd = opts.cwd && opts.cwd.length > 0 ? opts.cwd : process.cwd();

    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(opts.command, args, {
        cwd,
        env: { ...process.env, ...(opts.env ?? {}) },
        shell: true, // Honour PATH lookup, allow `npm run` etc on Windows.
        windowsHide: true
      });
    } catch (err) {
      throw new Error(`无法启动进程: ${(err as Error).message}`);
    }

    const id = nextId++;
    const session: RunSession = {
      id,
      child,
      windowId: win.id,
      startedAt: Date.now(),
      command: opts.command,
      args,
      cwd,
      killed: false
    };
    sessions.set(id, session);

    const emit = (channel: string, payload: unknown) => {
      if (!win.isDestroyed()) win.webContents.send(channel, payload);
    };

    emit(`run:started:${id}`, {
      id,
      command: opts.command,
      args,
      cwd,
      label: opts.label,
      pid: child.pid ?? null,
      startedAt: session.startedAt
    });

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk: string) => {
      emit(`run:stdout:${id}`, chunk);
    });
    child.stderr.on("data", (chunk: string) => {
      emit(`run:stderr:${id}`, chunk);
    });

    child.on("error", (err) => {
      emit(`run:error:${id}`, { message: err.message });
    });

    child.on("close", (code, signal) => {
      emit(`run:exit:${id}`, {
        exitCode: code ?? -1,
        signal,
        killed: session.killed,
        durationMs: Date.now() - session.startedAt
      });
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

    return { id, pid: child.pid ?? null, startedAt: session.startedAt };
  });

  ipcMain.handle("run:write", (_event, id: number, data: string) => {
    const session = sessions.get(id);
    if (!session) return;
    session.child.stdin.write(data);
  });

  ipcMain.handle("run:kill", (_event, id: number, signal: NodeJS.Signals = "SIGTERM") => {
    const session = sessions.get(id);
    if (!session) return;
    session.killed = true;
    try {
      session.child.kill(signal);
    } catch {
      /* ignore */
    }
  });

  ipcMain.handle("run:list", () => {
    return Array.from(sessions.values()).map((s) => ({
      id: s.id,
      command: s.command,
      args: s.args,
      cwd: s.cwd,
      pid: s.child.pid ?? null,
      startedAt: s.startedAt
    }));
  });
}
