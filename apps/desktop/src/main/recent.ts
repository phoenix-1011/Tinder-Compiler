import { app, ipcMain } from "electron";
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import { join, basename } from "node:path";

export interface RecentFolder {
  name: string;
  path: string;
  openedAt: number;
}

interface RecentFile {
  folders: RecentFolder[];
}

const MAX_RECENT = 10;

function storePath(): string {
  return join(app.getPath("userData"), "recent.json");
}

async function read(): Promise<RecentFile> {
  try {
    const raw = await fs.readFile(storePath(), "utf8");
    const parsed = JSON.parse(raw) as RecentFile;
    if (!parsed || !Array.isArray(parsed.folders)) return { folders: [] };
    return parsed;
  } catch {
    return { folders: [] };
  }
}

async function write(state: RecentFile): Promise<void> {
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  await fs.writeFile(storePath(), JSON.stringify(state, null, 2), "utf8");
}

export async function listRecentFolders(): Promise<RecentFolder[]> {
  const { folders } = await read();
  // Drop entries whose folder no longer exists.
  return folders.filter((f) => existsSync(f.path));
}

export async function addRecentFolder(path: string): Promise<RecentFolder[]> {
  const state = await read();
  const next: RecentFolder = { name: basename(path) || path, path, openedAt: Date.now() };
  const filtered = state.folders.filter((f) => f.path !== path);
  state.folders = [next, ...filtered].slice(0, MAX_RECENT);
  await write(state);
  return state.folders;
}

export async function removeRecentFolder(path: string): Promise<RecentFolder[]> {
  const state = await read();
  state.folders = state.folders.filter((f) => f.path !== path);
  await write(state);
  return state.folders;
}

export function registerRecentHandlers(): void {
  ipcMain.handle("recent:list", () => listRecentFolders());
  ipcMain.handle("recent:add", (_e, path: string) => addRecentFolder(path));
  ipcMain.handle("recent:remove", (_e, path: string) => removeRecentFolder(path));
}
