import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { useWorkspace } from "./WorkspaceContext";

export interface ProjectTask {
  id: string;
  label: string;
  command: string;
  args?: string[];
  cwd?: string;
  pinned?: boolean;
}

export interface ProjectConfig {
  name?: string;
  buildSystem?: "xmake" | "cmake" | "go" | "python" | "custom";
  tasks?: ProjectTask[];
  /** Legacy project-level AI provider override. Prefer aiModelPresetId. */
  aiProviderId?: string;
  aiModelPresetId?: string;
  aiMode?: "chat" | "auto" | "plan" | "debug";
}

const EMPTY: ProjectConfig = { tasks: [] };

interface ProjectContextValue {
  /** Latest config loaded from `.tinder/project.json`, or EMPTY when no folder. */
  config: ProjectConfig;
  /** True while the initial read is in flight after a folder change. */
  loading: boolean;
  /** Read error, if any. */
  error: string | null;
  /** Whether the .tinder/project.json file already exists on disk. */
  exists: boolean;
  reload(): Promise<void>;
  save(next: ProjectConfig): Promise<boolean>;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

function stripJsonc(input: string): string {
  let out = "";
  const n = input.length;
  let i = 0;
  while (i < n) {
    const ch = input[i];
    const next = input[i + 1];
    if (ch === '"') {
      const start = i;
      i++;
      while (i < n) {
        const c = input[i];
        if (c === "\\" && i + 1 < n) { i += 2; continue; }
        if (c === '"') { i++; break; }
        i++;
      }
      out += input.slice(start, i);
      continue;
    }
    if (ch === "/" && next === "/") {
      while (i < n && input[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < n - 1 && !(input[i] === "*" && input[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    out += ch;
    i++;
  }
  return out.replace(/,(\s*[}\]])/g, "$1");
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { folder } = useWorkspace();
  const [config, setConfig] = useState<ProjectConfig>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exists, setExists] = useState(false);

  const reload = useCallback(async () => {
    if (!folder) {
      setConfig(EMPTY);
      setExists(false);
      setError(null);
      return;
    }
    // Defensive: stale preload may not expose `project` yet.
    const api = window.tinder?.project;
    if (!api || typeof api.read !== "function") {
      setError("preload 中缺少 project API，请重启 pnpm dev");
      setConfig(EMPTY);
      return;
    }
    setLoading(true);
    try {
      const raw = await api.read(folder.path);
      if (raw === null) {
        setConfig(EMPTY);
        setExists(false);
      } else {
        try {
          const parsed = JSON.parse(stripJsonc(raw)) as ProjectConfig;
          setConfig(parsed);
          setExists(true);
        } catch (parseErr) {
          setError(`无法解析 .tinder/project.json：${(parseErr as Error).message}`);
          setConfig(EMPTY);
          setExists(true);
        }
      }
    } catch (err) {
      setError((err as Error).message ?? String(err));
    } finally {
      setLoading(false);
    }
  }, [folder]);

  useEffect(() => {
    setError(null);
    void reload();
  }, [reload]);

  const save = useCallback(
    async (next: ProjectConfig): Promise<boolean> => {
      if (!folder) return false;
      const api = window.tinder?.project;
      if (!api || typeof api.write !== "function") {
        setError("preload 中缺少 project API");
        return false;
      }
      try {
        const json = JSON.stringify(next, null, 2);
        await api.write(folder.path, json);
        setConfig(next);
        setExists(true);
        setError(null);
        return true;
      } catch (err) {
        setError((err as Error).message ?? String(err));
        return false;
      }
    },
    [folder]
  );

  const value = useMemo<ProjectContextValue>(
    () => ({ config, loading, error, exists, reload, save }),
    [config, loading, error, exists, reload, save]
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used within ProjectProvider");
  return ctx;
}
