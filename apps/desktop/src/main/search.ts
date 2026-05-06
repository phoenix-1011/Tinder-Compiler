import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";

/**
 * Locate ripgrep. Preference order:
 *   1. @vscode/ripgrep bundled binary (if its postinstall managed to download)
 *   2. `rg` on the user's PATH
 *   3. throw — search disabled
 */
function resolveRipgrep(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { rgPath } = require("@vscode/ripgrep") as { rgPath: string };
    if (rgPath && existsSync(rgPath)) return rgPath;
  } catch {
    /* package may have failed to install */
  }
  return "rg"; // fall back to PATH lookup; spawn will surface ENOENT if missing
}

const RIPGREP = resolveRipgrep();

interface SearchSession {
  id: number;
  child: ChildProcessWithoutNullStreams;
  buffer: string;
  cancelled: boolean;
}

const sessions = new Map<number, SearchSession>();
let nextId = 1;

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

export function registerSearchHandlers(): void {
  ipcMain.handle("search:start", (event: IpcMainInvokeEvent, opts: SearchOptions) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) throw new Error("No browser window for search:start");
    if (!opts.query || opts.query.length === 0) throw new Error("查询字符串不能为空");
    if (!opts.cwd) throw new Error("缺少工作目录");

    const args: string[] = ["--json", "--max-columns=400", "--max-columns-preview"];
    if (!opts.isRegex) args.push("--fixed-strings");
    if (!opts.caseSensitive) args.push("--smart-case");
    if (opts.matchWholeWord) args.push("--word-regexp");
    if (typeof opts.maxResults === "number" && opts.maxResults > 0) {
      args.push(`--max-count=${opts.maxResults}`);
    }
    for (const inc of opts.includes ?? []) {
      if (inc.trim().length > 0) args.push("--glob", inc);
    }
    for (const exc of opts.excludes ?? []) {
      if (exc.trim().length > 0) args.push("--glob", `!${exc}`);
    }
    args.push("--", opts.query, opts.cwd);

    const child = spawn(RIPGREP, args, {
      cwd: opts.cwd,
      windowsHide: true,
      env: process.env,
      shell: RIPGREP === "rg" // PATH lookup on Windows requires shell:true
    });

    const id = nextId++;
    const session: SearchSession = { id, child, buffer: "", cancelled: false };
    sessions.set(id, session);

    const emit = (channel: string, payload: unknown) => {
      if (!win.isDestroyed()) win.webContents.send(channel, payload);
    };

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    let totalMatches = 0;

    child.stdout.on("data", (chunk: string) => {
      if (session.cancelled) return;
      session.buffer += chunk;
      let nl: number;
      while ((nl = session.buffer.indexOf("\n")) !== -1) {
        const line = session.buffer.slice(0, nl);
        session.buffer = session.buffer.slice(nl + 1);
        if (line.length === 0) continue;

        let parsed: any;
        try {
          parsed = JSON.parse(line);
        } catch {
          continue;
        }
        if (parsed.type !== "match") continue;
        const data = parsed.data;
        const lineText: string = data.lines.text ?? "";
        const submatches: Array<{ start: number; end: number }> = data.submatches ?? [];
        const path: string = data.path?.text ?? "";
        const lineNumber: number = data.line_number ?? 1;
        const relative = path.startsWith(opts.cwd)
          ? path.slice(opts.cwd.length).replace(/^[/\\]+/, "")
          : path;

        for (const sub of submatches) {
          totalMatches++;
          const match: SearchMatch = {
            path,
            relativePath: relative,
            line: lineNumber,
            column: sub.start + 1,
            preview: lineText.replace(/\r?\n$/, ""),
            matchStart: sub.start,
            matchEnd: sub.end
          };
          emit(`search:match:${id}`, match);
        }
      }
    });

    child.stderr.on("data", (chunk: string) => {
      emit(`search:stderr:${id}`, chunk);
    });

    child.on("close", (code) => {
      emit(`search:end:${id}`, {
        exitCode: code ?? -1,
        cancelled: session.cancelled,
        totalMatches
      });
      sessions.delete(id);
    });

    child.on("error", (err) => {
      emit(`search:end:${id}`, { exitCode: -1, error: err.message, totalMatches });
      sessions.delete(id);
    });

    return { id };
  });

  ipcMain.handle("search:cancel", (_event, id: number) => {
    const session = sessions.get(id);
    if (!session) return;
    session.cancelled = true;
    try {
      session.child.kill();
    } catch {
      /* ignore */
    }
    sessions.delete(id);
  });
}
