import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import type { OpenedFolder } from "../../preload";

export type EolKind = "lf" | "crlf";

export interface OpenDocument {
  uri: string;
  name: string;
  language: string;
  content: string;
  dirty: boolean;
  /** Last persisted content — used to detect "dirty" on undo and to support revert. */
  baseline: string;
  /** Detected/chosen line ending. */
  eol: EolKind;
}

export type ActivityView = "explorer" | "search" | "run" | "chain-assembly" | "ai";

export type MainView = "editor" | "settings";

export interface EditorPosition {
  line: number;
  column: number;
}

export interface RevealRequest {
  uri: string;
  line: number;
  column: number;
  /** Monotonically increasing — used by listeners to detect new requests. */
  token: number;
}

interface WorkspaceState {
  folder: OpenedFolder | null;
  activeView: ActivityView;
  documents: OpenDocument[];
  activeUri: string | null;
  /** uri → last save status. */
  saveStatus: Record<string, SaveStatus>;
  revealRequest: RevealRequest | null;
}

export type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "error"; message: string };

interface WorkspaceActions {
  openFolder(): Promise<void>;
  openFolderByPath(path: string): Promise<void>;
  setActiveView(view: ActivityView): void;
  openFile(path: string, position?: EditorPosition): Promise<void>;
  closeFile(uri: string): void;
  closeActiveFile(): void;
  cycleTab(direction: 1 | -1): void;
  setActive(uri: string): void;
  updateContent(uri: string, content: string): void;
  saveDocument(uri: string): Promise<boolean>;
  saveActive(): Promise<boolean>;
  revealAt(uri: string, position: EditorPosition): void;
  setLanguage(uri: string, language: string): void;
  setEol(uri: string, eol: EolKind): void;
  reorderTabs(fromUri: string, toUri: string): void;
}

type WorkspaceContextValue = WorkspaceState & WorkspaceActions;

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

const LANGUAGE_BY_EXT: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  json: "json",
  md: "markdown",
  py: "python",
  go: "go",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  c: "c",
  h: "cpp",
  hpp: "cpp",
  yml: "yaml",
  yaml: "yaml",
  toml: "ini",
  lua: "lua",
  rs: "rust",
  sh: "shell",
  ps1: "powershell",
  html: "html",
  css: "css"
};

function languageFor(name: string): string {
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  return LANGUAGE_BY_EXT[ext] ?? "plaintext";
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [folder, setFolder] = useState<OpenedFolder | null>(null);
  const [activeView, setActiveView] = useState<ActivityView>("explorer");
  const [documents, setDocuments] = useState<OpenDocument[]>([]);
  const [activeUri, setActiveUri] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<Record<string, SaveStatus>>({});
  const [revealRequest, setRevealRequest] = useState<RevealRequest | null>(null);
  const revealTokenRef = useRef<number>(0);

  // Always read latest documents inside async save flow without re-creating callbacks.
  const docsRef = useRef<OpenDocument[]>(documents);
  docsRef.current = documents;
  const activeUriRef = useRef<string | null>(activeUri);
  activeUriRef.current = activeUri;

  const openFolder = useCallback(async () => {
    const next = await window.tinder.openFolder();
    if (next) setFolder(next);
  }, []);

  const openFolderByPath = useCallback(async (path: string) => {
    const next = await window.tinder.openFolderByPath(path);
    if (next) setFolder(next);
  }, []);

  const revealAt = useCallback((uri: string, position: EditorPosition) => {
    revealTokenRef.current += 1;
    setRevealRequest({
      uri,
      line: position.line,
      column: position.column,
      token: revealTokenRef.current
    });
  }, []);

  const openFile = useCallback(
    async (path: string, position?: EditorPosition) => {
      const existing = docsRef.current.find((d) => d.uri === path);
      if (existing) {
        setActiveUri(path);
        if (position) revealAt(path, position);
        return;
      }
      const content = await window.tinder.readText(path);
      const name = path.split(/[\\/]/).pop() ?? path;
      // Detect EOL by comparing first \r\n vs \n occurrence.
      const crlfIdx = content.indexOf("\r\n");
      const lfIdx = content.indexOf("\n");
      const eol: EolKind =
        crlfIdx !== -1 && (lfIdx === -1 || crlfIdx <= lfIdx) ? "crlf" : "lf";
      const doc: OpenDocument = {
        uri: path,
        name,
        language: languageFor(name),
        content,
        baseline: content,
        dirty: false,
        eol
      };
      setDocuments((prev) => [...prev, doc]);
      setActiveUri(path);
      if (position) revealAt(path, position);
    },
    [revealAt]
  );

  const closeFile = useCallback((uri: string) => {
    setDocuments((prev) => prev.filter((d) => d.uri !== uri));
    setActiveUri((current) => {
      if (current !== uri) return current;
      const remaining = docsRef.current.filter((d) => d.uri !== uri);
      return remaining.length > 0 ? remaining[remaining.length - 1]!.uri : null;
    });
    setSaveStatus((prev) => {
      if (!(uri in prev)) return prev;
      const { [uri]: _drop, ...rest } = prev;
      return rest;
    });
  }, []);

  const setActive = useCallback((uri: string) => setActiveUri(uri), []);

  const closeActiveFile = useCallback(() => {
    const uri = activeUriRef.current;
    if (!uri) return;
    setDocuments((prev) => prev.filter((d) => d.uri !== uri));
    const remaining = docsRef.current.filter((d) => d.uri !== uri);
    setActiveUri(remaining.length > 0 ? remaining[remaining.length - 1]!.uri : null);
  }, []);

  const cycleTab = useCallback((direction: 1 | -1) => {
    const docs = docsRef.current;
    if (docs.length === 0) return;
    const cur = activeUriRef.current;
    const idx = cur ? docs.findIndex((d) => d.uri === cur) : -1;
    const nextIdx = (idx + direction + docs.length) % docs.length;
    setActiveUri(docs[nextIdx]!.uri);
  }, []);

  const updateContent = useCallback((uri: string, content: string) => {
    setDocuments((prev) =>
      prev.map((d) => {
        if (d.uri !== uri) return d;
        return { ...d, content, dirty: content !== d.baseline };
      })
    );
  }, []);

  const setLanguage = useCallback((uri: string, language: string) => {
    setDocuments((prev) => prev.map((d) => (d.uri === uri ? { ...d, language } : d)));
  }, []);

  const setEol = useCallback((uri: string, eol: EolKind) => {
    setDocuments((prev) =>
      prev.map((d) => {
        if (d.uri !== uri) return d;
        // Normalise the in-memory content to the new EOL so save sees the
        // right bytes. Mark dirty since the on-disk content will differ.
        const normalised = d.content.replace(/\r?\n/g, eol === "crlf" ? "\r\n" : "\n");
        return { ...d, eol, content: normalised, dirty: normalised !== d.baseline };
      })
    );
  }, []);

  const reorderTabs = useCallback((fromUri: string, toUri: string) => {
    if (fromUri === toUri) return;
    setDocuments((prev) => {
      const fromIdx = prev.findIndex((d) => d.uri === fromUri);
      const toIdx = prev.findIndex((d) => d.uri === toUri);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const next = prev.slice();
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved!);
      return next;
    });
  }, []);

  const saveDocument = useCallback(async (uri: string): Promise<boolean> => {
    const doc = docsRef.current.find((d) => d.uri === uri);
    if (!doc) return false;
    if (!doc.dirty) return true; // No-op
    setSaveStatus((s) => ({ ...s, [uri]: { kind: "saving" } }));
    try {
      // Optional: trigger format-on-save through the registered editor before
      // we read the latest content. We import lazily to avoid circular deps.
      try {
        const formatOnSave = JSON.parse(
          localStorage.getItem("tinder.settings") ?? "{}"
        ).formatOnSave;
        if (formatOnSave) {
          const reg = await import("../monaco/registry");
          reg.runEditorAction("editor.action.formatDocument");
          // Allow the formatter's edit to flush into our React state before
          // we serialize. One microtask is enough since onDidChangeModelContent
          // is synchronous from setValue.
          await new Promise((r) => setTimeout(r, 0));
        }
      } catch {
        /* never block save on a formatter failure */
      }

      const latest = docsRef.current.find((d) => d.uri === uri) ?? doc;
      await window.tinder.writeText(uri, latest.content);
      setDocuments((prev) =>
        prev.map((d) =>
          d.uri === uri ? { ...d, baseline: latest.content, dirty: d.content !== latest.content } : d
        )
      );
      setSaveStatus((s) => ({ ...s, [uri]: { kind: "saved", at: Date.now() } }));
      return true;
    } catch (err) {
      setSaveStatus((s) => ({
        ...s,
        [uri]: { kind: "error", message: (err as Error).message ?? String(err) }
      }));
      return false;
    }
  }, []);

  const saveActive = useCallback(async (): Promise<boolean> => {
    const uri = activeUriRef.current;
    if (!uri) return false;
    return saveDocument(uri);
  }, [saveDocument]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      folder,
      activeView,
      documents,
      activeUri,
      saveStatus,
      revealRequest,
      openFolder,
      openFolderByPath,
      setActiveView,
      openFile,
      closeFile,
      closeActiveFile,
      cycleTab,
      setActive,
      updateContent,
      saveDocument,
      saveActive,
      revealAt,
      setLanguage,
      setEol,
      reorderTabs
    }),
    [
      folder,
      activeView,
      documents,
      activeUri,
      saveStatus,
      revealRequest,
      openFolder,
      openFolderByPath,
      openFile,
      closeFile,
      setActive,
      updateContent,
      saveDocument,
      saveActive,
      revealAt,
      setLanguage,
      setEol,
      reorderTabs
    ]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
