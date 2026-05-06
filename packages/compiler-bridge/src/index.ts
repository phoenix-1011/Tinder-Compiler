export type ToolchainKind = "xmake" | "cmake" | "python" | "go" | "cpp" | "shell";

export interface RunTask {
  id: string;
  label: string;
  kind: ToolchainKind;
  command: string;
  args?: string[];
  cwd: string;
  env?: Record<string, string>;
}

export interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface RunEvent {
  taskId: string;
  type: "stdout" | "stderr" | "exit" | "error";
  data: string;
  exitCode?: number;
}

export interface CompilerBridge {
  run(task: RunTask, onEvent?: (event: RunEvent) => void): Promise<RunResult>;
  detectToolchain(kind: ToolchainKind): Promise<ToolchainInfo | null>;
}

export interface ToolchainInfo {
  kind: ToolchainKind;
  binaryPath: string;
  version?: string;
}

export const TASK_ID_PREFIX = "tinder.task.";

export function isRunTask(value: unknown): value is RunTask {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<RunTask>;
  return typeof v.id === "string" && typeof v.command === "string" && typeof v.cwd === "string";
}
