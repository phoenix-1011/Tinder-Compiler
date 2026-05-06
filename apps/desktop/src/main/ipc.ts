import { app, dialog, ipcMain, BrowserWindow, shell } from "electron";
import { promises as fs } from "node:fs";
import { join, basename, dirname, resolve, sep } from "node:path";
import { addRecentFolder } from "./recent.js";

export interface DirEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

const TEXT_FILE_LIMIT_BYTES = 5 * 1024 * 1024;

function senderWindow(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender);
}

export function registerIpcHandlers(): void {
  ipcMain.handle("dialog:openDirectory", async (event) => {
    const win = senderWindow(event);
    const result = await dialog.showOpenDialog(win ?? undefined!, {
      properties: ["openDirectory"]
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const root = resolve(result.filePaths[0]!);
    await addRecentFolder(root);
    return { name: basename(root) || root, path: root };
  });

  ipcMain.handle(
    "fs:openFolder",
    async (_event, root: string): Promise<{ name: string; path: string }> => {
      const resolved = resolve(root);
      await addRecentFolder(resolved);
      return { name: basename(resolved) || resolved, path: resolved };
    }
  );

  ipcMain.handle("fs:list", async (_event, dirPath: string): Promise<DirEntry[]> => {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries
      .map((entry) => ({
        name: entry.name,
        path: join(dirPath, entry.name),
        isDirectory: entry.isDirectory()
      }))
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  });

  ipcMain.handle("fs:readText", async (_event, filePath: string): Promise<string> => {
    const stat = await fs.stat(filePath);
    if (stat.size > TEXT_FILE_LIMIT_BYTES) {
      throw new Error(`File too large: ${stat.size} bytes (limit ${TEXT_FILE_LIMIT_BYTES})`);
    }
    return fs.readFile(filePath, "utf8");
  });

  ipcMain.handle("fs:writeText", async (_event, filePath: string, contents: string): Promise<void> => {
    await fs.mkdir(dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, contents, "utf8");
  });

  ipcMain.handle("path:join", (_event, ...segments: string[]): string => join(...segments));

  ipcMain.handle("path:relative", (_event, root: string, target: string): string => {
    const r = resolve(root);
    const t = resolve(target);
    if (!t.startsWith(r)) return t;
    const rel = t.slice(r.length);
    return rel.startsWith(sep) ? rel.slice(1) : rel;
  });

  ipcMain.handle("fs:walk", async (_event, root: string, opts?: { limit?: number }) => {
    return walkWorkspace(root, opts?.limit ?? 10000);
  });

  ipcMain.handle("fs:createFile", async (_event, path: string): Promise<void> => {
    await fs.mkdir(dirname(path), { recursive: true });
    // Use 'wx' so we never overwrite an existing file silently.
    const handle = await fs.open(path, "wx");
    await handle.close();
  });

  ipcMain.handle("fs:createDir", async (_event, path: string): Promise<void> => {
    await fs.mkdir(path, { recursive: false });
  });

  ipcMain.handle(
    "fs:rename",
    async (_event, from: string, to: string): Promise<void> => {
      await fs.mkdir(dirname(to), { recursive: true });
      await fs.rename(from, to);
    }
  );

  ipcMain.handle("fs:trash", async (_event, path: string): Promise<void> => {
    // shell.trashItem moves to OS recycle bin — recoverable.
    await shell.trashItem(path);
  });

  ipcMain.handle("fs:revealInOs", async (_event, path: string): Promise<void> => {
    shell.showItemInFolder(path);
  });

  // ---- User config files (keybindings.json, etc.) ----
  ipcMain.handle("userConfig:keybindingsPath", () => {
    return join(app.getPath("userData"), "keybindings.json");
  });

  ipcMain.handle("userConfig:keybindings", async (): Promise<string> => {
    const path = join(app.getPath("userData"), "keybindings.json");
    try {
      return await fs.readFile(path, "utf8");
    } catch {
      // Seed with empty array so the file exists on first edit.
      const seed = "// 用户自定义键绑定（VS Code 兼容格式）\n[\n]\n";
      await fs.mkdir(dirname(path), { recursive: true });
      await fs.writeFile(path, seed, "utf8");
      return seed;
    }
  });

  // ---- Project-level config (.tinder/project.json) ----
  ipcMain.handle("project:read", async (_event, root: string): Promise<string | null> => {
    const path = join(root, ".tinder", "project.json");
    try {
      return await fs.readFile(path, "utf8");
    } catch {
      return null;
    }
  });

  ipcMain.handle(
    "project:write",
    async (_event, root: string, contents: string): Promise<void> => {
      const dir = join(root, ".tinder");
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(join(dir, "project.json"), contents, "utf8");
    }
  );
}

const IGNORE_NAMES = new Set([
  "node_modules",
  ".git",
  ".pnpm-store",
  "dist",
  "build",
  "out",
  "release",
  "coverage",
  ".vite",
  ".turbo",
  ".next",
  ".tinder"
]);

interface WalkEntry {
  path: string;
  relativePath: string;
  name: string;
}

async function walkWorkspace(root: string, limit: number): Promise<WalkEntry[]> {
  const r = resolve(root);
  const out: WalkEntry[] = [];
  const queue: string[] = [r];

  while (queue.length > 0 && out.length < limit) {
    const dir = queue.shift()!;
    let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true, encoding: "utf8" });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const name = entry.name;
      if (IGNORE_NAMES.has(name)) continue;
      const full = join(dir, name);
      if (entry.isDirectory()) {
        queue.push(full);
      } else if (entry.isFile()) {
        if (out.length >= limit) break;
        const rel = full.slice(r.length).replace(/^[/\\]+/, "").replace(/\\/g, "/");
        out.push({ path: full, relativePath: rel, name });
      }
    }
  }

  return out;
}
