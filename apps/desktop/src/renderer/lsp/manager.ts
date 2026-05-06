import { startLanguageClient, type LanguageClient } from "./client";

interface ServerSpec {
  id: string;
  command: string;
  args?: string[];
  documentSelector: string[];
}

/**
 * Default servers Tinder tries to launch when a folder is opened. Each one is
 * a best-effort: if the binary isn't on PATH the renderer ignores it.
 */
const DEFAULT_SERVERS: ServerSpec[] = [
  {
    id: "clangd",
    command: "clangd",
    args: ["--background-index", "--clang-tidy", "--header-insertion=never"],
    documentSelector: ["cpp", "c"]
  },
  {
    id: "pyright",
    command: "pyright-langserver",
    args: ["--stdio"],
    documentSelector: ["python"]
  },
  {
    id: "gopls",
    command: "gopls",
    args: [],
    documentSelector: ["go"]
  },
  {
    id: "rust-analyzer",
    command: "rust-analyzer",
    args: [],
    documentSelector: ["rust"]
  }
];

const active = new Map<string, LanguageClient>();
let lastWorkspace: string | null = null;

function pathToFileUri(p: string): string {
  const normalised = p.replace(/\\/g, "/");
  return normalised.startsWith("/") ? `file://${normalised}` : `file:///${normalised}`;
}

export async function syncLanguageServers(workspacePath: string): Promise<void> {
  if (workspacePath === lastWorkspace) return;
  await stopAll();
  lastWorkspace = workspacePath;

  const workspaceFolderUri = pathToFileUri(workspacePath);

  for (const spec of DEFAULT_SERVERS) {
    try {
      const client = await startLanguageClient(
        {
          command: spec.command,
          args: spec.args,
          cwd: workspacePath
        },
        {
          id: spec.id,
          documentSelector: spec.documentSelector,
          workspaceFolderUri,
          workspacePath
        }
      );
      active.set(spec.id, client);
      // eslint-disable-next-line no-console
      console.info(`[tinder lsp] ${spec.id} ready`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.info(
        `[tinder lsp] ${spec.id} not available (${(err as Error).message ?? err}) — skipping`
      );
    }
  }
}

export async function stopAll(): Promise<void> {
  const list = Array.from(active.values());
  active.clear();
  await Promise.all(list.map((c) => c.stop()));
}
