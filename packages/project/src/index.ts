export interface WorkspaceFolder {
  name: string;
  path: string;
}

export type BuildSystem = "xmake" | "cmake" | "go" | "python" | "custom";

export interface ProjectConfig {
  name?: string;
  buildSystem?: BuildSystem;
  /** Project-level commands surfaced in the Run panel */
  tasks?: ProjectTask[];
  /** Legacy project-level AI provider override. Prefer aiModelPresetId. */
  aiProviderId?: string;
  /** Project-level AI model preset override */
  aiModelPresetId?: string;
  /** Project-level AI mode override */
  aiMode?: "chat" | "auto" | "plan" | "debug";
  /** Optional language server overrides keyed by Monaco language id. */
  languageServers?: Record<string, ProjectLanguageServer>;
}

export interface ProjectTask {
  id: string;
  label: string;
  command: string;
  args?: string[];
  cwd?: string;
  /** When true, surface in the title bar / quick run menu */
  pinned?: boolean;
}

export interface ProjectLanguageServer {
  command: string;
  args?: string[];
  enabled?: boolean;
}

/** Default config used when .tinder/project.json doesn't exist. */
export const EMPTY_PROJECT_CONFIG: ProjectConfig = {
  tasks: []
};

export interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
}

export interface ProjectService {
  load(rootPath: string): Promise<ProjectConfig>;
  save(config: ProjectConfig): Promise<void>;
  walk(rootPath: string, options?: WalkOptions): AsyncIterable<FileNode>;
}

export interface WalkOptions {
  maxDepth?: number;
  ignore?: (relativePath: string) => boolean;
}

export const DEFAULT_IGNORE_PATTERNS: readonly string[] = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  ".tinder"
];

export function isIgnored(name: string, patterns: readonly string[] = DEFAULT_IGNORE_PATTERNS): boolean {
  return patterns.includes(name);
}
