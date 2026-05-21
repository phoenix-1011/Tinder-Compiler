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
import { CHAIN_CATALOG } from "../help/chain-catalog.generated";
import { runEditorAction } from "../monaco/registry";

export type EolKind = "lf" | "crlf";

export type DocumentKind =
  | "file"
  | "help-doc"
  | "chain-editor"
  | "profile-lifecycle"
  | "resource-editor"
  | "resource-branch";

export type ResourceEditorKind = "standard" | "custom";

export interface OpenDocument {
  uri: string;
  /**
   * Short display label shown on the tab itself. Kept compact for the
   * lightweight tab strip; full descriptive text lives in `tooltip`.
   */
  name: string;
  /**
   * Long-form descriptive text shown on hover (rendered as the tab's
   * `title` attribute). Falls back to the URI when absent.
   */
  tooltip?: string;
  /**
   * Classifies what kind of content this tab holds. `file` uses Monaco;
   * `help-doc` renders a chain catalog node section as Markdown;
   * `chain-editor` and `profile-lifecycle` host the chain-assembly main
   * views inside the regular tab strip; `resource-editor` hosts the
   * compute resource editor.
   */
  kind: DocumentKind;
  /**
   * Preview tabs render with an italic name and are replaced by the next
   * preview-mode open. Pinned tabs (`preview: false`) survive until the
   * user closes them explicitly.
   */
  preview: boolean;
  language: string;
  content: string;
  dirty: boolean;
  /** Last persisted content — used to detect "dirty" on undo and to support revert. */
  baseline: string;
  /** Detected/chosen line ending. */
  eol: EolKind;
  /** Help-doc tabs carry the canonical chain node id they render. */
  helpNodeId?: string;
  /** Profile id for chain-editor / profile-lifecycle tabs. */
  profileId?: string;
  /**
   * Profile display name carried alongside `profileId`. Used by the
   * tab strip to label the parent profile-group pill so chain-editor /
   * profile-lifecycle children can drop the profile prefix from their
   * own labels.
   */
  profileDisplayName?: string;
  /** Resource instance id for resource-editor tabs. */
  resourceId?: string;
  /** Standard vs custom for resource-editor tabs. */
  resourceKind?: ResourceEditorKind;
  /** Branch id for resource-branch tabs. */
  resourceBranchId?: string;
  /** Whether a resource-branch tab was opened from profile or global scope. */
  resourceBranchScope?: "profile" | "global";
  /**
   * Disk location used to reload the resource. v2 packages point at the
   * package directory; legacy single-file resources point at the JSON path.
   * Null means a draft that has not been saved yet.
   */
  resourceSourcePath?: string | null;
}

export type ActivityView =
  | "explorer"
  | "search"
  | "run"
  | "chain-assembly"
  | "help"
  | "ai";

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
  /** Whether a previous activeView is reachable via goBack(). */
  canGoBack: boolean;
  /** Whether a popped activeView is reachable via goForward(). */
  canGoForward: boolean;
}

export type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "error"; message: string };

export interface OpenFileOptions {
  /** Editor position to reveal after the file opens. */
  position?: EditorPosition;
  /**
   * `true` (default) opens a preview tab that replaces any existing preview
   * tab. `false` pins the tab so subsequent previews don't replace it.
   */
  preview?: boolean;
}

export interface OpenHelpDocOptions {
  preview?: boolean;
}

interface WorkspaceActions {
  openFolder(): Promise<void>;
  openFolderByPath(path: string): Promise<void>;
  setActiveView(view: ActivityView): void;
  /** Pop the previous activeView from history. No-op when canGoBack is false. */
  goBack(): void;
  /** Push back into a previously popped activeView. */
  goForward(): void;
  openFile(path: string, options?: OpenFileOptions): Promise<void>;
  /**
   * Open a chain catalog node section as a tab. The tab renders Markdown
   * via the help renderer and is keyed by `help://<nodeId>` so duplicate
   * opens focus the existing tab.
   */
  openHelpDoc(nodeId: string, options?: OpenHelpDocOptions): void;
  /**
   * Open the chain editor for a configuration profile as a tab.
   * Synthetic uri `chain-editor://<profileId>` — re-opening focuses the
   * existing tab.
   */
  openChainEditor(profileId: string, displayName: string): void;
  /** Open the profile lifecycle view as a tab. Same pattern as openChainEditor. */
  openProfileLifecycle(profileId: string, displayName: string): void;
  /**
   * Open the compute resource editor as a tab. Synthetic uri
   * `resource-editor://<resourceKind>/<resourceId>` — re-opening focuses
   * the existing tab. `sourcePath` lets the editor reload the on-disk
   * resource; pass `null` for unsaved drafts.
   */
  openResourceEditor(params: {
    resourceId: string;
    resourceKind: ResourceEditorKind;
    displayName: string;
    sourcePath: string | null;
  }): void;
  openResourceBranch(params: {
    scope: "profile" | "global";
    profileId?: string;
    profileDisplayName?: string;
    resourceId: string;
    resourceKind: ResourceEditorKind;
    branchId: string;
    displayName: string;
  }): void;
  closeFile(uri: string): void;
  closeActiveFile(): void;
  cycleTab(direction: 1 | -1): void;
  setActive(uri: string): void;
  /** Promote a preview tab to a pinned tab. No-op when already pinned. */
  pinDocument(uri: string): void;
  updateContent(uri: string, content: string): void;
  /**
   * Drive the dirty dot on a synthetic tab (chain-editor / profile-lifecycle
   * / resource-editor) without going through Monaco. Lets non-Monaco editors
   * surface unsaved-changes state to the tab strip.
   */
  setSyntheticDirty(uri: string, dirty: boolean): void;
  /**
   * Register a save handler for a synthetic tab so the global Ctrl+S /
   * `saveActive` flow routes there instead of trying to write the URI
   * itself as a file path. Returns a deregister callback for the
   * component's useEffect cleanup.
   *
   * The handler should perform whatever "save" means for the editor
   * (e.g. the resource editor persists resource.json via
   * `saveResourceConfig`) and resolve `true` on success.
   */
  registerSyntheticSave(uri: string, handler: () => Promise<boolean>): () => void;
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

const VIEW_HISTORY_LIMIT = 50;

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [folder, setFolder] = useState<OpenedFolder | null>(null);
  const [activeView, _setActiveView] = useState<ActivityView>("explorer");
  const [viewBack, setViewBack] = useState<ActivityView[]>([]);
  const [viewForward, setViewForward] = useState<ActivityView[]>([]);
  const activeViewRef = useRef<ActivityView>(activeView);
  activeViewRef.current = activeView;

  const setActiveView = useCallback((view: ActivityView) => {
    if (view === activeViewRef.current) return;
    setViewBack((prev) => {
      const next = [...prev, activeViewRef.current];
      return next.length > VIEW_HISTORY_LIMIT
        ? next.slice(next.length - VIEW_HISTORY_LIMIT)
        : next;
    });
    setViewForward([]);
    _setActiveView(view);
  }, []);

  const goBack = useCallback(() => {
    setViewBack((prevBack) => {
      if (prevBack.length === 0) return prevBack;
      const target = prevBack[prevBack.length - 1]!;
      setViewForward((prevFwd) => [activeViewRef.current, ...prevFwd]);
      _setActiveView(target);
      return prevBack.slice(0, -1);
    });
  }, []);

  const goForward = useCallback(() => {
    setViewForward((prevFwd) => {
      if (prevFwd.length === 0) return prevFwd;
      const target = prevFwd[0]!;
      setViewBack((prevBack) => [...prevBack, activeViewRef.current]);
      _setActiveView(target);
      return prevFwd.slice(1);
    });
  }, []);

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
    async (path: string, options?: OpenFileOptions) => {
      const preview = options?.preview ?? true;
      const position = options?.position;
      const existing = docsRef.current.find((d) => d.uri === path);
      if (existing) {
        setActiveUri(path);
        if (position) revealAt(path, position);
        // Re-opening an existing tab through a non-preview path (e.g. an
        // explicit pin) should promote it. Opening through preview leaves
        // its current state alone.
        if (!preview && existing.preview) {
          setDocuments((prev) =>
            prev.map((d) => (d.uri === path ? { ...d, preview: false } : d))
          );
        }
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
        kind: "file",
        preview,
        language: languageFor(name),
        content,
        baseline: content,
        dirty: false,
        eol
      };
      // Preview tabs replace any other preview tab in place; pinned tabs
      // append. Replacement keeps the slot index stable so the tab strip
      // doesn't jump when the user clicks through files.
      setDocuments((prev) => {
        if (!preview) return [...prev, doc];
        const previewIdx = prev.findIndex((d) => d.preview);
        if (previewIdx < 0) return [...prev, doc];
        const next = prev.slice();
        next[previewIdx] = doc;
        return next;
      });
      setActiveUri(path);
      if (position) revealAt(path, position);
    },
    [revealAt]
  );

  const openHelpDoc = useCallback(
    (nodeId: string, options?: OpenHelpDocOptions) => {
      const preview = options?.preview ?? true;
      const uri = `help://${nodeId}`;
      const existing = docsRef.current.find((d) => d.uri === uri);
      if (existing) {
        setActiveUri(uri);
        if (!preview && existing.preview) {
          setDocuments((prev) =>
            prev.map((d) => (d.uri === uri ? { ...d, preview: false } : d))
          );
        }
        return;
      }
      const catalogNode = CHAIN_CATALOG.nodes[nodeId];
      const name = catalogNode?.displayName ?? nodeId;
      const doc: OpenDocument = {
        uri,
        name,
        kind: "help-doc",
        preview,
        language: "markdown",
        content: "",
        baseline: "",
        dirty: false,
        eol: "lf",
        helpNodeId: nodeId
      };
      setDocuments((prev) => {
        if (!preview) return [...prev, doc];
        const previewIdx = prev.findIndex((d) => d.preview);
        if (previewIdx < 0) return [...prev, doc];
        const next = prev.slice();
        next[previewIdx] = doc;
        return next;
      });
      setActiveUri(uri);
    },
    []
  );

  const pinDocument = useCallback((uri: string) => {
    setDocuments((prev) =>
      prev.map((d) => (d.uri === uri && d.preview ? { ...d, preview: false } : d))
    );
  }, []);

  /**
   * Open or focus a synthetic tab for one of the chain-assembly views.
   * Shared by openChainEditor / openProfileLifecycle so they don't
   * duplicate the preview-replacement logic.
   */
  const openSyntheticTab = useCallback(
    (params: {
      uri: string;
      name: string;
      tooltip?: string;
      kind: Extract<
        DocumentKind,
        "chain-editor" | "profile-lifecycle" | "resource-editor" | "resource-branch"
      >;
      profileId?: string;
      profileDisplayName?: string;
      resourceId?: string;
      resourceKind?: ResourceEditorKind;
      resourceBranchId?: string;
      resourceBranchScope?: "profile" | "global";
      resourceSourcePath?: string | null;
      preview: boolean;
    }) => {
      const existing = docsRef.current.find((d) => d.uri === params.uri);
      if (existing) {
        setActiveUri(params.uri);
        if (!params.preview && existing.preview) {
          setDocuments((prev) =>
            prev.map((d) =>
              d.uri === params.uri ? { ...d, preview: false } : d
            )
          );
        }
        // Refresh source path so a saved draft can teach the existing tab
        // where its on-disk package now lives.
        if (
          params.resourceSourcePath !== undefined &&
          existing.resourceSourcePath !== params.resourceSourcePath
        ) {
          setDocuments((prev) =>
            prev.map((d) =>
              d.uri === params.uri
                ? { ...d, resourceSourcePath: params.resourceSourcePath }
                : d
            )
          );
        }
        if (params.kind === "resource-branch") {
          setDocuments((prev) =>
            prev.map((d) =>
              d.uri === params.uri
                ? {
                    ...d,
                    name: params.name,
                    tooltip: params.tooltip,
                    profileId: params.profileId,
                    profileDisplayName: params.profileDisplayName,
                    resourceId: params.resourceId,
                    resourceKind: params.resourceKind,
                    resourceBranchId: params.resourceBranchId,
                    resourceBranchScope: params.resourceBranchScope
                  }
                : d
            )
          );
        }
        return;
      }
      const doc: OpenDocument = {
        uri: params.uri,
        name: params.name,
        tooltip: params.tooltip,
        kind: params.kind,
        preview: params.preview,
        language: "plaintext",
        content: "",
        baseline: "",
        dirty: false,
        eol: "lf",
        profileId: params.profileId,
        profileDisplayName: params.profileDisplayName,
        resourceId: params.resourceId,
        resourceKind: params.resourceKind,
        resourceBranchId: params.resourceBranchId,
        resourceBranchScope: params.resourceBranchScope,
        resourceSourcePath: params.resourceSourcePath
      };
      setDocuments((prev) => {
        if (!params.preview) return [...prev, doc];
        const previewIdx = prev.findIndex((d) => d.preview);
        if (previewIdx < 0) return [...prev, doc];
        const next = prev.slice();
        next[previewIdx] = doc;
        return next;
      });
      setActiveUri(params.uri);
    },
    []
  );

  const openChainEditor = useCallback(
    (profileId: string, displayName: string) => {
      // Chain-editor tabs default to pinned so they survive subsequent
      // preview opens; the user opens the editor with intent, not as a
      // throwaway look. Short label is "链路" — the profile prefix is
      // shown by the parent group pill instead.
      openSyntheticTab({
        uri: `chain-editor://${profileId}`,
        name: "链路",
        tooltip: `${displayName} · 链路`,
        kind: "chain-editor",
        profileId,
        profileDisplayName: displayName,
        preview: false
      });
    },
    [openSyntheticTab]
  );

  const openProfileLifecycle = useCallback(
    (profileId: string, displayName: string) => {
      openSyntheticTab({
        uri: `profile-lifecycle://${profileId}`,
        name: "使用与版本",
        tooltip: `${displayName} · 使用与版本`,
        kind: "profile-lifecycle",
        profileId,
        profileDisplayName: displayName,
        preview: false
      });
    },
    [openSyntheticTab]
  );

  const openResourceEditor = useCallback(
    (params: {
      resourceId: string;
      resourceKind: ResourceEditorKind;
      displayName: string;
      sourcePath: string | null;
    }) => {
      openSyntheticTab({
        uri: `resource-editor://${params.resourceKind}/${params.resourceId}`,
        // Tab label is just the resource's display name; the descriptive
        // suffix lives in the hover tooltip per the lightweight tab spec.
        name: params.displayName,
        tooltip: `${params.displayName} · 计算实例`,
        kind: "resource-editor",
        resourceId: params.resourceId,
        resourceKind: params.resourceKind,
        resourceSourcePath: params.sourcePath,
        preview: false
      });
    },
    [openSyntheticTab]
  );

  const openResourceBranch = useCallback(
    (params: {
      scope: "profile" | "global";
      profileId?: string;
      profileDisplayName?: string;
      resourceId: string;
      resourceKind: ResourceEditorKind;
      branchId: string;
      displayName: string;
    }) => {
      const profilePart =
        params.scope === "profile" && params.profileId
          ? `/${encodeURIComponent(params.profileId)}`
          : "";
      const uri =
        params.scope === "profile"
          ? `resource-branch://profile${profilePart}/${params.resourceKind}/${params.resourceId}`
          : `resource-branch://global/${params.resourceKind}/${params.resourceId}`;
      openSyntheticTab({
        uri,
        name: params.displayName,
        tooltip:
          params.scope === "profile" && params.profileDisplayName
            ? `${params.profileDisplayName} / ${params.displayName} / ${params.branchId}`
            : `${params.displayName} / ${params.branchId}`,
        kind: "resource-branch",
        profileId: params.profileId,
        profileDisplayName: params.profileDisplayName,
        resourceId: params.resourceId,
        resourceKind: params.resourceKind,
        resourceBranchId: params.branchId,
        resourceBranchScope: params.scope,
        preview: false
      });
    },
    [openSyntheticTab]
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

  const setSyntheticDirty = useCallback((uri: string, dirty: boolean) => {
    setDocuments((prev) =>
      prev.map((d) => (d.uri === uri ? { ...d, dirty } : d))
    );
  }, []);

  // Synthetic-tab save dispatch: keyed by tab uri. Used by Ctrl+S /
  // `saveActive` on tabs whose URI is not a writable filesystem path.
  const syntheticSaveHandlersRef = useRef(new Map<string, () => Promise<boolean>>());
  const registerSyntheticSave = useCallback(
    (uri: string, handler: () => Promise<boolean>) => {
      syntheticSaveHandlersRef.current.set(uri, handler);
      return () => {
        const map = syntheticSaveHandlersRef.current;
        if (map.get(uri) === handler) map.delete(uri);
      };
    },
    []
  );

  const updateContent = useCallback((uri: string, content: string) => {
    // Editing a preview tab pins it — matches VS Code's behaviour and keeps
    // unsaved edits from being clobbered by the next single-click open.
    setDocuments((prev) =>
      prev.map((d) => {
        if (d.uri !== uri) return d;
        const dirty = content !== d.baseline;
        return {
          ...d,
          content,
          dirty,
          preview: d.preview && !dirty ? d.preview : false
        };
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
    // Synthetic tabs (resource-editor / chain-editor / profile-lifecycle /
    // help-doc) cannot be written as files — their URI is not a path.
    // Route to a registered handler if the synthetic editor opted in,
    // otherwise no-op so Ctrl+S doesn't try to write to the URI string.
    if (doc.kind !== "file") {
      const handler = syntheticSaveHandlersRef.current.get(uri);
      if (handler) return handler();
      return true;
    }
    if (!doc.dirty) return true; // No-op
    setSaveStatus((s) => ({ ...s, [uri]: { kind: "saving" } }));
    try {
      // Optional: trigger format-on-save through the registered editor before
      // we read the latest content.
      try {
        const formatOnSave = JSON.parse(
          localStorage.getItem("tinder.settings") ?? "{}"
        ).formatOnSave;
        if (formatOnSave) {
          runEditorAction("editor.action.formatDocument");
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

  const canGoBack = viewBack.length > 0;
  const canGoForward = viewForward.length > 0;

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      folder,
      activeView,
      documents,
      activeUri,
      saveStatus,
      revealRequest,
      canGoBack,
      canGoForward,
      openFolder,
      openFolderByPath,
      setActiveView,
      goBack,
      goForward,
      openFile,
      openHelpDoc,
      openChainEditor,
      openProfileLifecycle,
      openResourceEditor,
      openResourceBranch,
      closeFile,
      closeActiveFile,
      cycleTab,
      setActive,
      pinDocument,
      updateContent,
      setSyntheticDirty,
      registerSyntheticSave,
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
      canGoBack,
      canGoForward,
      openFolder,
      openFolderByPath,
      setActiveView,
      goBack,
      goForward,
      openFile,
      openHelpDoc,
      openChainEditor,
      openProfileLifecycle,
      openResourceEditor,
      openResourceBranch,
      closeFile,
      closeActiveFile,
      cycleTab,
      setActive,
      pinDocument,
      updateContent,
      setSyntheticDirty,
      registerSyntheticSave,
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
