import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import type { RunStartOptions, RunExitInfo } from "../../preload";

export type RunStatus = "running" | "success" | "failed" | "killed" | "error";

export interface RunRecord {
  id: number;
  command: string;
  args: string[];
  cwd: string;
  label?: string;
  startedAt: number;
  endedAt?: number;
  status: RunStatus;
  exitCode?: number;
  /** Concatenated stdout/stderr stream — capped at OUTPUT_LIMIT chars. */
  output: string;
  errorMessage?: string;
}

const OUTPUT_LIMIT = 200_000; // ~200KB per task

interface RunContextValue {
  runs: RunRecord[];
  activeRunId: number | null;
  setActiveRun(id: number | null): void;
  start(opts: RunStartOptions): Promise<number>;
  kill(id: number): Promise<void>;
  clear(id: number): void;
  recentCommands: string[];
}

const RunContext = createContext<RunContextValue | null>(null);

export function RunProvider({ children }: { children: ReactNode }) {
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [activeRunId, setActiveRun] = useState<number | null>(null);
  const [recentCommands, setRecentCommands] = useState<string[]>([]);

  // Disposers per run id, so we can clean up listeners when a run is removed.
  const disposersRef = useRef<Map<number, Array<() => void>>>(new Map());

  useEffect(() => {
    const map = disposersRef.current;
    return () => {
      for (const list of map.values()) for (const d of list) d();
      map.clear();
    };
  }, []);

  const appendOutput = useCallback((id: number, chunk: string) => {
    setRuns((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const next = (r.output + chunk).slice(-OUTPUT_LIMIT);
        return { ...r, output: next };
      })
    );
  }, []);

  const start = useCallback(
    async (opts: RunStartOptions): Promise<number> => {
      const result = await window.tinder.run.start(opts);
      const record: RunRecord = {
        id: result.id,
        command: opts.command,
        args: opts.args ?? [],
        cwd: opts.cwd ?? "",
        label: opts.label,
        startedAt: result.startedAt,
        status: "running",
        output: ""
      };
      setRuns((prev) => [...prev, record]);
      setActiveRun(result.id);

      const cmdLine = [opts.command, ...(opts.args ?? [])].join(" ").trim();
      setRecentCommands((prev) => {
        const filtered = prev.filter((c) => c !== cmdLine);
        return [cmdLine, ...filtered].slice(0, 10);
      });

      const disposers: Array<() => void> = [];
      disposers.push(
        window.tinder.run.onStdout(result.id, (chunk) => appendOutput(result.id, chunk))
      );
      disposers.push(
        window.tinder.run.onStderr(result.id, (chunk) => appendOutput(result.id, chunk))
      );
      disposers.push(
        window.tinder.run.onError(result.id, (err) => {
          setRuns((prev) =>
            prev.map((r) =>
              r.id === result.id ? { ...r, status: "error", errorMessage: err.message } : r
            )
          );
        })
      );
      disposers.push(
        window.tinder.run.onExit(result.id, (info: RunExitInfo) => {
          setRuns((prev) =>
            prev.map((r) => {
              if (r.id !== result.id) return r;
              let status: RunStatus;
              if (info.killed) status = "killed";
              else if (info.exitCode === 0) status = "success";
              else status = "failed";
              return {
                ...r,
                status,
                exitCode: info.exitCode,
                endedAt: r.startedAt + info.durationMs
              };
            })
          );
          // Drop disposers for this run.
          const list = disposersRef.current.get(result.id);
          if (list) {
            for (const d of list) d();
            disposersRef.current.delete(result.id);
          }
        })
      );
      disposersRef.current.set(result.id, disposers);

      return result.id;
    },
    [appendOutput]
  );

  const kill = useCallback(async (id: number) => {
    await window.tinder.run.kill(id);
  }, []);

  const clear = useCallback((id: number) => {
    setRuns((prev) => prev.filter((r) => r.id !== id));
    const list = disposersRef.current.get(id);
    if (list) {
      for (const d of list) d();
      disposersRef.current.delete(id);
    }
    setActiveRun((current) => (current === id ? null : current));
  }, []);

  const value = useMemo<RunContextValue>(
    () => ({ runs, activeRunId, setActiveRun, start, kill, clear, recentCommands }),
    [runs, activeRunId, start, kill, clear, recentCommands]
  );

  return <RunContext.Provider value={value}>{children}</RunContext.Provider>;
}

export function useRun(): RunContextValue {
  const ctx = useContext(RunContext);
  if (!ctx) throw new Error("useRun must be used within RunProvider");
  return ctx;
}
