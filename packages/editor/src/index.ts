export type SupportedLanguage =
  | "cpp"
  | "c"
  | "python"
  | "go"
  | "rust"
  | "typescript"
  | "javascript"
  | "json"
  | "yaml"
  | "markdown"
  | "shell"
  | "powershell"
  | "lua"
  | "plaintext";

export interface EditorDocument {
  uri: string;
  language: SupportedLanguage;
  content: string;
  version: number;
}

export interface EditorSelection {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface Formatter {
  readonly id: string;
  readonly language: SupportedLanguage;
  format(document: EditorDocument): Promise<string>;
}

export interface Diagnostic {
  uri: string;
  range: EditorSelection;
  severity: "error" | "warning" | "info" | "hint";
  message: string;
  source?: string;
}

export interface DiagnosticSink {
  push(diagnostic: Diagnostic): void;
  clear(uri: string): void;
}

const EXT_TO_LANGUAGE: Record<string, SupportedLanguage> = {
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  h: "cpp",
  c: "c",
  py: "python",
  go: "go",
  rs: "rust",
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  json: "json",
  yml: "yaml",
  yaml: "yaml",
  md: "markdown",
  sh: "shell",
  ps1: "powershell",
  lua: "lua"
};

export function detectLanguage(filename: string): SupportedLanguage {
  const dot = filename.lastIndexOf(".");
  if (dot < 0) return "plaintext";
  const ext = filename.slice(dot + 1).toLowerCase();
  return EXT_TO_LANGUAGE[ext] ?? "plaintext";
}
