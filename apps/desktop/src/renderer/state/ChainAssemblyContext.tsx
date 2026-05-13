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
import type {
  BuiltinExecutionAnchor,
  ComputeResourceImplementation,
  ComputeResourceTemplate,
  ComputeResourceV2,
  CustomComputeNodeDef,
  CustomComputeResource,
  CustomNodeConfig,
  CustomNodeUsage,
  GuiProjectFile,
  ImplementationFileRef,
  ImplementationKind,
  PlatformResourceInstance,
  ProfileResourceRef,
  ResourceModelVariant,
  StandardComputeCandidate,
  StandardComputeResource
} from "@tinder/nextstep";
import {
  DEFAULT_PROFILE_VARIANT_ID,
  createEmptyProject,
  nextCustomActionIndex,
  profileResourceRefKey
} from "@tinder/nextstep";
import { BUILT_IN_RESOURCE_TEMPLATES } from "./builtInResourceTemplates";
import {
  executeGenerationPlan,
  hashText,
  planResourceGeneration,
  type GenerationApproval,
  type GenerationPlan,
  type GenerationResult
} from "./interfaceGeneration";
import { installTestData, TEST_DATA_FILE_COUNT } from "./testData";
import { CHAIN_CATALOG } from "../help/chain-catalog.generated";
import {
  EXTRAS_FILE,
  TINDER_DIR,
  basenameNoExt,
  collectAllCustomActionIndexes,
  copyTree,
  flattenLeaves,
  loadCollapse,
  loadDataRoot,
  loadFromDisk,
  pathExists,
  resourcePackageDir,
  saveCollapse,
  saveDataRoot,
  slugify,
  uniqueDirPath,
  uniqueFilePath,
  writeResourcePackage,
  ensureDir,
  join,
  RESOURCE_SRC_DIR,
  RESOURCE_INCLUDE_DIR,
  RESOURCE_ARTIFACT_DIR,
  RESOURCE_TEMPLATES_DIR,
  type CollapseState,
  type DiskState,
  type DragPayload,
  type FolderNode,
  type LeafNode,
  type ProfileEntry,
  type ProfileExtras,
  type ProfileResourceItem
} from "./chainAssemblyStorage";
import { DialogModal, useDialog } from "../components/ChainAssemblyDialog";
import {
  NewResourceDialog,
  useNewResourceDialog,
  type NewResourceDialogResult
} from "../components/NewResourceDialog";

export interface ChainAssemblyValue {
  dataRoot: string | null;
  disk: DiskState | null;
  loading: boolean;
  loadError: string | null;
  collapse: CollapseState;
  setCollapse: (updater: (prev: CollapseState) => CollapseState) => void;
  activeProfileId: string | null;
  setActiveProfileId: (id: string | null) => void;

  pickDataRoot: () => Promise<void>;
  saveAsNewRoot: () => Promise<void>;
  reload: () => Promise<void>;

  newProfile: () => Promise<void>;
  /**
   * Open the new-resource creation dialog. Returns the new resource info on
   * success so callers can immediately open the editor on it, or `null`
   * when the user cancels. `kind` seeds the initial type toggle but the
   * user can still flip it inside the dialog.
   */
  promptNewResource: (
    kind: "standard" | "custom"
  ) => Promise<
    | {
        resourceInstanceId: string;
        packagePath: string;
        displayName: string;
        kind: "standard" | "custom";
      }
    | null
  >;
  promptNewFolder: (where: "standard" | "custom", parentPath: string | null) => Promise<void>;
  /**
   * Move a resource (v2 package dir or legacy single JSON) from its current
   * on-disk location into `targetFolderDir`. The dragged payload carries
   * `sourcePath`; if absent the call is a no-op. Reloads disk state on
   * success so the sidebar re-renders.
   */
  moveResourceToFolder: (
    payload: DragPayload,
    targetFolderDir: string
  ) => Promise<void>;

  renameProfileById: (entry: ProfileEntry) => Promise<void>;
  deleteProfileById: (entry: ProfileEntry) => Promise<void>;
  /** Clone a profile JSON next to the original with a user-supplied name. */
  duplicateProfile: (entry: ProfileEntry) => Promise<void>;
  /** Open the OS file manager pointed at the profile JSON. */
  revealProfileInOs: (entry: ProfileEntry) => Promise<void>;
  renameLeaf: (
    where: "standard" | "custom",
    leaf: LeafNode<PlatformResourceInstance> | LeafNode<CustomNodeConfig>
  ) => Promise<void>;
  deleteLeaf: (leafId: string, name: string) => Promise<void>;
  renameFolder: (folder: FolderNode<unknown>) => Promise<void>;
  deleteFolder: (folder: FolderNode<unknown>) => Promise<void>;

  /**
   * Add or update a profile resource ref from a drag/drop. `enabled` is
   * driven by which drop zone received the payload (活跃 → true,
   * 停用 → false); `folder` is the profile-local virtual folder path,
   * `undefined`/empty for the section root.
   */
  dropToProfile: (
    profileId: string,
    payload: DragPayload,
    enabled: boolean,
    folder?: string
  ) => Promise<void>;
  removeFromProfile: (profileId: string, item: ProfileResourceItem) => Promise<void>;
  /** Flip an existing profile resource ref between 活跃 and 停用. */
  setProfileResourceEnabled: (
    profileId: string,
    item: ProfileResourceItem,
    enabled: boolean
  ) => Promise<void>;
  /** Move an existing profile resource ref into a new virtual subfolder. */
  setProfileResourceFolder: (
    profileId: string,
    item: ProfileResourceItem,
    folder: string
  ) => Promise<void>;
  /** Prompt the user for a target folder, then delegate to setProfileResourceFolder. */
  promptMoveResourceFolder: (
    profileId: string,
    item: ProfileResourceItem,
    currentFolder: string
  ) => Promise<void>;

  // ──────────── Custom node placement (custom_node_usages[]) ─────────────

  /**
   * Append a new custom_node_usages entry. `order` is auto-allocated to the
   * end of the same-anchor bucket so the new usage renders last under that
   * anchor.
   */
  addCustomUsage: (
    profileId: string,
    customResourceId: string,
    nodeId: string,
    anchor: BuiltinExecutionAnchor | null
  ) => Promise<void>;
  /** Open the anchor picker and call addCustomUsage with the choice. */
  promptAddCustomUsage: (
    profileId: string,
    customResourceId: string,
    nodeId: string
  ) => Promise<void>;
  /** Re-anchor an existing usage via the picker. */
  promptMoveCustomUsage: (
    profileId: string,
    arrayIndex: number
  ) => Promise<void>;
  /** Shift a usage up/down within its anchor by swapping the order field with a neighbour. */
  shiftCustomUsage: (
    profileId: string,
    arrayIndex: number,
    direction: 1 | -1
  ) => Promise<void>;
  /** Toggle usage.enabled. Disabled usages still exist in the profile but do not render in 链路 or runtime exports. */
  setCustomUsageEnabled: (
    profileId: string,
    arrayIndex: number,
    enabled: boolean
  ) => Promise<void>;
  /** Remove a usage entry entirely. */
  removeCustomUsage: (profileId: string, arrayIndex: number) => Promise<void>;

  // ─────────────── Compute resource editor (slice 3b) ────────────────

  /**
   * Persist a v2 compute resource into its package directory. Writes
   * `.tinder/resources/<kind>/<resource_instance_id>/resource.json` and
   * reloads disk state so the sidebar and other consumers see the update.
   * Returns the absolute path of the package directory (the editor's new
   * `resourceSourcePath`).
   */
  saveResourceConfig: (
    resource: ComputeResourceV2,
    options?: {
      previousSourcePath?: string | null;
      /**
       * Hash captured when the editor loaded the on-disk resource.json. If
       * the on-disk file's current hash drifts from this value, the save
       * will throw a `SaveExternallyModifiedError` so the editor can prompt
       * the user (reload vs overwrite vs cancel). Pass `null` to skip the
       * check (used for first-time creates).
       */
      expectedDiskHash?: string | null;
      /**
       * Set to true to overwrite even when expectedDiskHash mismatches.
       * Resets the externally-modified state.
       */
      overwriteExternal?: boolean;
    }
  ) => Promise<{ packagePath: string; diskHash: string }>;
  /**
   * Copy a compute resource into a new package. When `copyCode` is true,
   * source files are duplicated under the new package's `src/` (or
   * `include/`) and refs are rewritten as managed paths. When false, only
   * structural metadata is copied; source refs and runtime artifact path
   * are cleared.
   */
  copyResource: (
    resource: ComputeResourceV2,
    options: {
      newDisplayName: string;
      copyCode: boolean;
      sourcePath: string | null;
    }
  ) => Promise<{ resourceInstanceId: string; packagePath: string }>;
  /**
   * Two-step dialog wrapper around `copyResource`. Prompts for a new
   * display name, asks whether to duplicate code implementation, and runs
   * the copy. Returns the created resource info, or `null` if the user
   * cancelled at any prompt or no v2 metadata is available on the leaf.
   */
  promptCopyResource: (
    leaf:
      | LeafNode<PlatformResourceInstance>
      | LeafNode<CustomNodeConfig>
  ) => Promise<
    | {
        resourceInstanceId: string;
        packagePath: string;
        displayName: string;
        kind: "standard" | "custom";
      }
    | null
  >;

  /**
   * Thin wrappers around the shared dialog instance. Re-exposed so child
   * components (resource editor, future capability editors) can drive the
   * same modal without instantiating their own.
   */
  dialogPrompt: (opts: {
    title: string;
    defaultValue?: string;
    placeholder?: string;
    okLabel?: string;
    multiline?: boolean;
  }) => Promise<string | null>;
  dialogConfirm: (opts: {
    title: string;
    message?: string;
    okLabel?: string;
    destructive?: boolean;
  }) => Promise<boolean>;
  dialogNotify: (opts: {
    title: string;
    message?: string;
  }) => Promise<void>;
  /**
   * Searchable single-pick dialog. Same `pickOne` from
   * `ChainAssemblyDialog` re-exposed for inner editors (e.g. resource
   * capability tab's "add candidate" picker) so they can reuse the
   * shared modal instance instead of instantiating their own.
   */
  dialogPickOne: (opts: {
    title: string;
    placeholder?: string;
    options: Array<{
      id: string;
      label: string;
      hint?: string;
      categoryId?: string;
    }>;
    initialOptionId?: string;
    categories?: Array<{ id: string; label: string }>;
    categoryLabel?: string;
  }) => Promise<string | null>;

  /**
   * Rename a managed source file on disk and return the new
   * package-relative path. Caller is responsible for updating the
   * `implementation.source_files[].path` ref in their draft and saving
   * the resource JSON. Throws when the resource has not been saved (no
   * package dir) or when the target name collides.
   */
  renameManagedSourceFile: (params: {
    packageDir: string;
    currentRelPath: string;
    newBaseName: string;
  }) => Promise<{ newRelPath: string }>;

  // ─────────────── Dev test data ────────────────────────────────────

  /**
   * Install the canned dev test data (`installTestData`) into the
   * current data root and reload disk state. Returns `true` on success,
   * `false` when the user cancels the confirm prompt or the install
   * throws. Intended for dev mode only; UI entry points should gate on
   * `import.meta.env.DEV`.
   */
  loadTestData: () => Promise<boolean>;

  // ─────────────── Compute resource templates (slice 3d) ─────────────

  /**
   * Create a new draft compute resource from the given inputs, optionally
   * prefilled by a template. Writes a fresh package directory with
   * `status = draft`, suggested category/description/tags, and (for
   * standard resources) the suggested model variant or standard nodes.
   *
   * Returns the new resource info so the caller can immediately open the
   * editor on it.
   */
  createDraftResource: (params: {
    kind: "standard" | "custom";
    displayName: string;
    /** Required: defines the auto-generated initial code file set. */
    implementationKind: ImplementationKind;
    template?: ComputeResourceTemplate | null;
  }) => Promise<{
    resourceInstanceId: string;
    packagePath: string;
    displayName: string;
    kind: "standard" | "custom";
  }>;

  /**
   * Persist the current resource as a *project* template under
   * `.tinder/resource-templates/<template_id>.json`. The export strips
   * implementation source files, runtime artifact, generated state, and
   * profile usage; only reusable structure and suggestions are kept.
   */
  saveResourceAsTemplate: (
    resource: ComputeResourceV2,
    options: {
      templateId: string;
      templateVersion: string;
      displayName: string;
    }
  ) => Promise<{ templatePath: string }>;

  // ─────────────── Interface generation (slice 3f) ───────────────────

  /**
   * Build a generation plan for the given resource against the current
   * on-disk state. The plan lists every source file that would be written
   * and the human-readable summary of resource.json fields that would
   * change. Returns warnings instead of throwing for unsupported
   * configurations (e.g. C++ in this slice).
   */
  planResourceInterface: (
    resource: ComputeResourceV2,
    packagePath: string | null
  ) => Promise<GenerationPlan>;

  /**
   * Execute a generation plan that the user has approved. External files
   * require explicit per-file approval via `approvedExternalFileIds`; any
   * external file not in the set is skipped (not overwritten).
   *
   * The result includes an `updatedResource` that the caller should pass
   * to `saveResourceConfig` so the resource JSON picks up the new marker
   * statuses. Source-file writes happen inside this action; resource.json
   * is *not* written here.
   */
  executeResourceInterface: (
    resource: ComputeResourceV2,
    plan: GenerationPlan,
    approval: GenerationApproval
  ) => Promise<GenerationResult>;
}

const ChainAssemblyContext = createContext<ChainAssemblyValue | null>(null);

/**
 * Thrown by `saveResourceConfig` when the on-disk resource.json content
 * hash differs from the hash the editor captured at load. Editors should
 * catch this and prompt the user before retrying with `overwriteExternal`.
 */
export class SaveExternallyModifiedError extends Error {
  public readonly currentDiskHash: string;
  public readonly expectedHash: string;
  constructor(opts: { currentDiskHash: string; expectedHash: string }) {
    super(
      `Resource JSON was modified externally (disk hash ${opts.currentDiskHash}, expected ${opts.expectedHash}).`
    );
    this.name = "SaveExternallyModifiedError";
    this.currentDiskHash = opts.currentDiskHash;
    this.expectedHash = opts.expectedHash;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Anchor helpers (used by custom node placement actions)
// ──────────────────────────────────────────────────────────────────────────

const ANCHOR_TAIL_ID = "__tail__";

/** Stable string key for an anchor — null becomes the tail sentinel. */
function serializeAnchor(anchor: BuiltinExecutionAnchor | null): string {
  if (!anchor) return ANCHOR_TAIL_ID;
  if (anchor.kind === "builtin_core_chain") return `core:${anchor.chain_id}`;
  return `domain:${anchor.domain}:${anchor.node_id}`;
}

/**
 * Open the dialog's pick-one selector with one option per canonical chain
 * node plus a `(末尾)` row. Returns the chosen anchor (`null` for tail)
 * or `undefined` if cancelled.
 */
async function promptForAnchor(
  dialog: ReturnType<typeof useDialog>,
  current: BuiltinExecutionAnchor | null,
  title: string
): Promise<BuiltinExecutionAnchor | null | undefined> {
  const options = [
    { id: ANCHOR_TAIL_ID, label: "(末尾) 在最后一个内建节点之后", hint: "无锚点" },
    ...CHAIN_CATALOG.orderedNodes.map((n) => ({
      id: n.nodeId,
      label: `${n.order}. ${n.displayName}`,
      hint: n.nodeId
    }))
  ];
  const initial = current?.kind === "builtin_core_chain" ? current.chain_id : ANCHOR_TAIL_ID;
  const picked = await dialog.pickOne({
    title,
    placeholder: "输入名称或 canonical id 搜索…",
    options,
    initialOptionId: initial
  });
  if (picked === null) return undefined;
  if (picked === ANCHOR_TAIL_ID) return null;
  return { kind: "builtin_core_chain", chain_id: picked };
}

export function useCa(): ChainAssemblyValue {
  const ctx = useContext(ChainAssemblyContext);
  if (!ctx) throw new Error("useCa must be used within ChainAssemblyProvider");
  return ctx;
}

interface CopyImplementationSummary {
  refs: ImplementationFileRef[];
  suggestedArtifact?: ComputeResourceV2["implementation"]["runtime_artifact"];
  warnings: string[];
}

/**
 * Copy a resource's source files into a new package's `src/` or `include/`
 * subdirectory. Managed refs are rebased against the original package dir;
 * external refs are read by absolute path. Either way the resulting refs in
 * the new package are `storage: "managed"` with package-relative paths.
 *
 * Naming conflicts inside the new package are resolved by appending `-2`,
 * `-3`, etc. so the operation never silently overwrites a file.
 */
async function copyImplementationFiles(
  resource: ComputeResourceV2,
  newPackageDir: string,
  originalSourcePath: string | null
): Promise<CopyImplementationSummary> {
  const warnings: string[] = [];
  const refs: ImplementationFileRef[] = [];
  const originalPackageDir =
    originalSourcePath && !originalSourcePath.endsWith(".json")
      ? originalSourcePath
      : null;

  let suggestedArtifact: CopyImplementationSummary["suggestedArtifact"];
  const oldArtifactPath = resource.implementation.runtime_artifact.path ?? "";

  for (const ref of resource.implementation.source_files) {
    // Resolve the on-disk source path.
    let srcAbs: string | null = null;
    if (ref.storage === "managed" && originalPackageDir) {
      srcAbs = await window.tinder.joinPath(originalPackageDir, ref.path);
    } else if (ref.storage === "external") {
      srcAbs = ref.path;
    } else {
      warnings.push(`无法定位源文件 ${ref.path}，已跳过`);
      continue;
    }

    // Decide which sub-directory to drop the copy into.
    const isHeader = ref.role === "header" || /\.(h|hpp|hxx)$/i.test(ref.path);
    const subdir = isHeader ? RESOURCE_INCLUDE_DIR : RESOURCE_SRC_DIR;
    const subdirAbs = await window.tinder.joinPath(newPackageDir, subdir);
    try {
      await window.tinder.createDir(subdirAbs);
    } catch {
      /* already exists */
    }
    const basename =
      ref.path.split(/[\\/]/).pop() ?? `source-${refs.length + 1}`;
    const dotIdx = basename.lastIndexOf(".");
    const stem = dotIdx > 0 ? basename.slice(0, dotIdx) : basename;
    const ext = dotIdx > 0 ? basename.slice(dotIdx) : "";

    // Resolve naming conflict by appending -2, -3, …
    let candidateName = basename;
    let candidateAbs = await window.tinder.joinPath(subdirAbs, candidateName);
    let n = 2;
    while (await pathExistsLocal(candidateAbs)) {
      candidateName = `${stem}-${n}${ext}`;
      candidateAbs = await window.tinder.joinPath(subdirAbs, candidateName);
      n += 1;
    }
    if (candidateName !== basename) {
      warnings.push(`目标已存在同名文件，复制为 ${candidateName}`);
    }

    try {
      const text = await window.tinder.readText(srcAbs);
      await window.tinder.writeText(candidateAbs, text);
    } catch (err) {
      warnings.push(`复制 ${ref.path} 失败：${String(err)}`);
      continue;
    }

    const relPath = `${subdir}/${candidateName}`;
    refs.push({
      file_id: `${resource.resource_instance_id}:${refs.length + 1}`,
      path: relPath,
      storage: "managed",
      role: ref.role,
      language: ref.language,
      generated_region_status: "unknown"
    });

    if (oldArtifactPath && srcAbs && oldArtifactPath === ref.path) {
      suggestedArtifact = {
        path: relPath,
        kind: resource.implementation.runtime_artifact.kind,
        required_for_export:
          resource.implementation.runtime_artifact.required_for_export
      };
    }
  }

  return { refs, suggestedArtifact, warnings };
}

async function pathExistsLocal(p: string): Promise<boolean> {
  return window.tinder.exists(p);
}

export function ChainAssemblyProvider({ children }: { children: ReactNode }) {
  const [dataRoot, setDataRoot] = useState<string | null>(() => loadDataRoot());
  const [disk, setDisk] = useState<DiskState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [collapse, _setCollapse] = useState<CollapseState>(() => loadCollapse());
  const dialog = useDialog();
  const newResourceDialog = useNewResourceDialog();

  /** Monotonic load token — newer loads invalidate in-flight previous loads. */
  const loadVersionRef = useRef(0);

  const setCollapse = useCallback(
    (updater: (prev: CollapseState) => CollapseState) => {
      _setCollapse((prev) => {
        const next = updater(prev);
        saveCollapse(next);
        return next;
      });
    },
    []
  );

  useEffect(() => {
    if (!dataRoot) {
      setDisk(null);
      return;
    }
    const myToken = ++loadVersionRef.current;
    setLoading(true);
    setLoadError(null);
    loadFromDisk(dataRoot, BUILT_IN_RESOURCE_TEMPLATES)
      .then((d) => {
        if (myToken !== loadVersionRef.current) return;
        setDisk(d);
        setActiveProfileId((cur) => cur ?? d.profiles[0]?.id ?? null);
      })
      .catch((err) => {
        if (myToken !== loadVersionRef.current) return;
        setLoadError(String(err?.message ?? err));
      })
      .finally(() => {
        if (myToken === loadVersionRef.current) setLoading(false);
      });
  }, [dataRoot]);

  const reload = useCallback(async () => {
    if (!dataRoot) return;
    const myToken = ++loadVersionRef.current;
    setLoading(true);
    try {
      const d = await loadFromDisk(dataRoot, BUILT_IN_RESOURCE_TEMPLATES);
      if (myToken !== loadVersionRef.current) return;
      setDisk(d);
    } catch (err) {
      if (myToken !== loadVersionRef.current) return;
      setLoadError(String(err));
    } finally {
      if (myToken === loadVersionRef.current) setLoading(false);
    }
  }, [dataRoot]);

  const writeExtras = useCallback(
    async (next: Record<string, ProfileExtras>) => {
      if (!disk) return;
      const path = await join(disk.paths.tinderDir, EXTRAS_FILE);
      await window.tinder.writeText(path, JSON.stringify(next, null, 2));
    },
    [disk]
  );

  const pickDataRoot = useCallback(async () => {
    const folder = await window.tinder.openFolder();
    if (!folder) return;
    saveDataRoot(folder.path);
    setDataRoot(folder.path);
  }, []);

  const saveAsNewRoot = useCallback(async () => {
    if (!dataRoot || !disk) return;
    const folder = await window.tinder.openFolder();
    if (!folder) return;
    if (folder.path === dataRoot) {
      await dialog.notify({ title: "另存为", message: "新路径与当前路径相同。" });
      return;
    }
    setLoading(true);
    try {
      const newTinder = await join(folder.path, TINDER_DIR);
      if (await pathExists(newTinder)) {
        const ok = await dialog.confirm({
          title: "目标已存在数据",
          message: "目标目录已包含 .tinder/，是否覆盖？",
          destructive: true,
          okLabel: "覆盖"
        });
        if (!ok) return;
      }
      await copyTree(disk.paths.tinderDir, newTinder);
      saveDataRoot(folder.path);
      setDataRoot(folder.path);
    } catch (err) {
      await dialog.notify({ title: "另存为失败", message: String(err) });
    } finally {
      setLoading(false);
    }
  }, [dataRoot, disk, dialog]);

  const promptNewFolder = useCallback(
    async (where: "standard" | "custom", parentPath: string | null) => {
      if (!disk) return;
      const name = await dialog.prompt({ title: "新建子目录", placeholder: "目录名" });
      if (!name?.trim()) return;
      const trimmed = name.trim();
      const baseDir =
        parentPath ?? (where === "standard" ? disk.paths.standardDir : disk.paths.customDir);
      try {
        const newDir = await uniqueDirPath(baseDir, slugify(trimmed));
        await window.tinder.createDir(newDir);
        setCollapse((prev) => ({
          ...prev,
          folders: { ...(prev.folders ?? {}), [newDir]: true }
        }));
        await reload();
      } catch (err) {
        await dialog.notify({ title: "创建失败", message: String(err) });
      }
    },
    [disk, dialog, reload, setCollapse]
  );

  const newProfile = useCallback(async () => {
    if (!disk) return;
    const name = await dialog.prompt({ title: "新建配置档案", placeholder: "档案名" });
    if (!name?.trim()) return;
    const trimmed = name.trim();
    try {
      const path = await uniqueFilePath(disk.paths.profilesDir, slugify(trimmed), ".json");
      const project: GuiProjectFile = { ...createEmptyProject(null), project_name: trimmed };
      await window.tinder.writeText(path, JSON.stringify(project, null, 2));
      await reload();
      setActiveProfileId(path);
      setCollapse((prev) => ({
        ...prev,
        profiles: { ...(prev.profiles ?? {}), [path]: true }
      }));
    } catch (err) {
      await dialog.notify({ title: "创建失败", message: String(err) });
    }
  }, [disk, dialog, reload, setCollapse]);

  const renameProfileById = useCallback(
    async (entry: ProfileEntry) => {
      if (!disk) return;
      const next = await dialog.prompt({ title: "重命名档案", defaultValue: entry.name });
      if (!next?.trim() || next.trim() === entry.name) return;
      const trimmed = next.trim();
      try {
        const newPath = await uniqueFilePath(disk.paths.profilesDir, slugify(trimmed), ".json");
        const newExtrasKey = basenameNoExt(newPath);
        const updated: GuiProjectFile = { ...entry.project, project_name: trimmed };
        await window.tinder.writeText(newPath, JSON.stringify(updated, null, 2));
        if (newPath !== entry.id) {
          await window.tinder.trash(entry.id);
          if (entry.extrasKey !== newExtrasKey && disk.extras[entry.extrasKey]) {
            const nextExtras = { ...disk.extras };
            nextExtras[newExtrasKey] = nextExtras[entry.extrasKey]!;
            delete nextExtras[entry.extrasKey];
            await writeExtras(nextExtras);
          }
        }
        await reload();
        setActiveProfileId((cur) => (cur === entry.id ? newPath : cur));
      } catch (err) {
        await dialog.notify({ title: "重命名失败", message: String(err) });
      }
    },
    [disk, dialog, reload, writeExtras]
  );

  const duplicateProfile = useCallback(
    async (entry: ProfileEntry) => {
      if (!disk) return;
      const next = await dialog.prompt({
        title: "创建副本",
        placeholder: "新档案名",
        defaultValue: `${entry.name} 副本`
      });
      if (!next?.trim() || next.trim() === entry.name) return;
      const trimmed = next.trim();
      try {
        const newPath = await uniqueFilePath(
          disk.paths.profilesDir,
          slugify(trimmed),
          ".json"
        );
        const cloned: GuiProjectFile = {
          ...entry.project,
          project_name: trimmed
        };
        await window.tinder.writeText(newPath, JSON.stringify(cloned, null, 2));
        await reload();
        setActiveProfileId(newPath);
        setCollapse((prev) => ({
          ...prev,
          profiles: { ...(prev.profiles ?? {}), [newPath]: true }
        }));
      } catch (err) {
        await dialog.notify({ title: "创建副本失败", message: String(err) });
      }
    },
    [disk, dialog, reload, setCollapse]
  );

  const revealProfileInOs = useCallback(
    async (entry: ProfileEntry) => {
      try {
        await window.tinder.revealInOs(entry.id);
      } catch (err) {
        await dialog.notify({ title: "打开失败", message: String(err) });
      }
    },
    [dialog]
  );

  const deleteProfileById = useCallback(
    async (entry: ProfileEntry) => {
      const ok = await dialog.confirm({
        title: "删除档案",
        message: `确认删除「${entry.name}」？此操作不可撤销。`,
        destructive: true
      });
      if (!ok) return;
      try {
        await window.tinder.trash(entry.id);
        if (disk && disk.extras[entry.extrasKey]) {
          const nextExtras = { ...disk.extras };
          delete nextExtras[entry.extrasKey];
          await writeExtras(nextExtras);
        }
        await reload();
        setActiveProfileId((cur) => (cur === entry.id ? null : cur));
      } catch (err) {
        await dialog.notify({ title: "删除失败", message: String(err) });
      }
    },
    [disk, dialog, reload, writeExtras]
  );

  const renameLeaf = useCallback(
    async (
      where: "standard" | "custom",
      leaf: LeafNode<PlatformResourceInstance> | LeafNode<CustomNodeConfig>
    ) => {
      if (!disk) return;
      const next = await dialog.prompt({ title: "重命名", defaultValue: leaf.name });
      if (!next?.trim() || next.trim() === leaf.name) return;
      const trimmed = next.trim();
      try {
        const parentDir = await window.tinder.joinPath(leaf.id, "..");
        const newPath = await uniqueFilePath(parentDir, slugify(trimmed), ".json");
        const data =
          where === "standard"
            ? { ...(leaf.data as PlatformResourceInstance), display_name: trimmed }
            : { ...(leaf.data as CustomNodeConfig), display_name: trimmed };
        await window.tinder.writeText(newPath, JSON.stringify(data, null, 2));
        if (newPath !== leaf.id) await window.tinder.trash(leaf.id);
        await reload();
      } catch (err) {
        await dialog.notify({ title: "重命名失败", message: String(err) });
      }
    },
    [disk, dialog, reload]
  );

  const deleteLeaf = useCallback(
    async (leafId: string, name: string) => {
      const ok = await dialog.confirm({
        title: "删除",
        message: `确认删除「${name}」？`,
        destructive: true
      });
      if (!ok) return;
      try {
        await window.tinder.trash(leafId);
        await reload();
      } catch (err) {
        await dialog.notify({ title: "删除失败", message: String(err) });
      }
    },
    [dialog, reload]
  );

  const renameFolder = useCallback(
    async (folder: FolderNode<unknown>) => {
      const next = await dialog.prompt({ title: "重命名子目录", defaultValue: folder.name });
      if (!next?.trim() || next.trim() === folder.name) return;
      try {
        const parentDir = await window.tinder.joinPath(folder.id, "..");
        const newPath = await uniqueDirPath(parentDir, slugify(next.trim()));
        await window.tinder.rename(folder.id, newPath);
        await reload();
      } catch (err) {
        await dialog.notify({ title: "重命名失败", message: String(err) });
      }
    },
    [dialog, reload]
  );

  const deleteFolder = useCallback(
    async (folder: FolderNode<unknown>) => {
      const ok = await dialog.confirm({
        title: "删除子目录",
        message: `确认删除「${folder.name}」？其下所有项一并删除。`,
        destructive: true
      });
      if (!ok) return;
      try {
        await window.tinder.trash(folder.id);
        await reload();
      } catch (err) {
        await dialog.notify({ title: "删除失败", message: String(err) });
      }
    },
    [dialog, reload]
  );

  const moveResourceToFolder = useCallback(
    async (payload: DragPayload, targetFolderDir: string) => {
      const sourcePath = payload.sourcePath;
      if (!sourcePath) {
        await dialog.notify({
          title: "无法移动",
          message: "该资源没有可用的磁盘路径，可能是尚未保存的草稿。"
        });
        return;
      }
      try {
        const parentDir = await window.tinder.joinPath(sourcePath, "..");
        // No-op when dropping back onto the same folder.
        if (parentDir === targetFolderDir) return;
        // Preserve the original basename when moving into the target.
        const segments = sourcePath.split(/[\\/]/).filter(Boolean);
        const basename = segments[segments.length - 1] ?? "";
        if (!basename) {
          await dialog.notify({
            title: "无法移动",
            message: "无法从资源路径中解析出文件名。"
          });
          return;
        }
        const targetPath = await window.tinder.joinPath(
          targetFolderDir,
          basename
        );
        // Refuse to overwrite an existing entry at the destination.
        if (await window.tinder.exists(targetPath)) {
          await dialog.notify({
            title: "目标已存在",
            message: `目标目录下已存在「${basename}」，请先重命名后再移动。`
          });
          return;
        }
        await window.tinder.rename(sourcePath, targetPath);
        // Keep the target folder expanded so the user sees the moved entry.
        setCollapse((prev) => ({
          ...prev,
          folders: { ...(prev.folders ?? {}), [targetFolderDir]: true }
        }));
        await reload();
      } catch (err) {
        await dialog.notify({ title: "移动失败", message: String(err) });
      }
    },
    [dialog, reload, setCollapse]
  );

  const dropToProfile = useCallback(
    async (
      profileId: string,
      payload: DragPayload,
      enabled: boolean,
      folder?: string
    ) => {
      if (!disk) return;
      const target = disk.profiles.find((p) => p.id === profileId);
      if (!target) return;
      const folderValue = folder?.trim() || undefined;
      try {
        let updatedProject: GuiProjectFile = target.project;
        let newRef: ProfileResourceRef;

        if (payload.kind === "standard") {
          newRef = {
            kind: "standard",
            resource_instance_id: payload.resource.resource_instance_id,
            variant_id: DEFAULT_PROFILE_VARIANT_ID,
            enabled,
            ...(folderValue ? { folder: folderValue } : {})
          };
        } else {
          // Custom resources still live as inline `custom_nodes[]` entries in
          // v1 storage; clone the source node into the target profile so the
          // ref has a stable id, then point `resources[]` at the clone. The
          // broader custom-resource refactor (multi-node, action_index
          // allocation, etc.) is owned by the resource-editor task package.
          const orig = payload.node;
          const suffix = Math.random().toString(36).slice(2, 6);
          const customNodeId = `${orig.custom_node_id}-${suffix}`;
          const cloned: CustomNodeConfig = {
            ...orig,
            custom_node_id: customNodeId,
            resource_instance_id: `${orig.resource_instance_id || orig.custom_node_id}-${suffix}`,
            node_id: orig.node_id || orig.custom_node_id,
            module_id: `${orig.module_id || orig.custom_node_id}-${suffix}`,
            action_index: nextCustomActionIndex(target.project.custom_nodes),
            input: ""
          };
          updatedProject = {
            ...updatedProject,
            custom_nodes: [...updatedProject.custom_nodes, cloned]
          };
          newRef = {
            kind: "custom",
            resource_instance_id: customNodeId,
            enabled,
            ...(folderValue ? { folder: folderValue } : {})
          };
        }

        const currentRefs = updatedProject.resources ?? [];
        const key = profileResourceRefKey(newRef);
        const existingIdx = currentRefs.findIndex(
          (r) => profileResourceRefKey(r) === key
        );
        const nextRefs =
          existingIdx >= 0
            ? currentRefs.map((r, i) =>
                i === existingIdx
                  ? {
                      ...r,
                      enabled,
                      // Update folder only when an explicit value is supplied.
                      // Dropping back onto the section root clears it.
                      folder: folderValue,
                    }
                  : r
              )
            : [...currentRefs, newRef];
        updatedProject = {
          ...updatedProject,
          resources: nextRefs,
          custom_node_usages: updatedProject.custom_node_usages ?? []
        };

        await window.tinder.writeText(
          target.id,
          JSON.stringify(updatedProject, null, 2)
        );
        await reload();
        setCollapse((prev) => ({
          ...prev,
          profileActive: enabled
            ? { ...prev.profileActive, [profileId]: true }
            : prev.profileActive,
          profileDisabled: !enabled
            ? { ...prev.profileDisabled, [profileId]: true }
            : prev.profileDisabled
        }));
      } catch (err) {
        await dialog.notify({ title: "加入档案失败", message: String(err) });
      }
    },
    [disk, dialog, reload, setCollapse]
  );

  const setProfileResourceEnabled = useCallback(
    async (profileId: string, item: ProfileResourceItem, enabled: boolean) => {
      if (!disk) return;
      const target = disk.profiles.find((p) => p.id === profileId);
      if (!target) return;
      const refs = target.project.resources ?? [];
      const matchIdx = refs.findIndex((r) =>
        item.kind === "standard"
          ? r.kind === "standard" && r.resource_instance_id === item.resourceId
          : r.kind === "custom" && r.resource_instance_id === item.resourceId
      );
      if (matchIdx < 0 || refs[matchIdx]!.enabled === enabled) return;
      const nextRefs = refs.map((r, i) =>
        i === matchIdx ? { ...r, enabled } : r
      );
      const updatedProject: GuiProjectFile = {
        ...target.project,
        resources: nextRefs,
        custom_node_usages: target.project.custom_node_usages ?? []
      };
      try {
        await window.tinder.writeText(
          target.id,
          JSON.stringify(updatedProject, null, 2)
        );
        await reload();
        setCollapse((prev) => ({
          ...prev,
          profileActive: enabled
            ? { ...prev.profileActive, [profileId]: true }
            : prev.profileActive,
          profileDisabled: !enabled
            ? { ...prev.profileDisabled, [profileId]: true }
            : prev.profileDisabled
        }));
      } catch (err) {
        await dialog.notify({
          title: enabled ? "激活失败" : "停用失败",
          message: String(err)
        });
      }
    },
    [disk, dialog, reload, setCollapse]
  );

  const setProfileResourceFolder = useCallback(
    async (profileId: string, item: ProfileResourceItem, folder: string) => {
      if (!disk) return;
      const target = disk.profiles.find((p) => p.id === profileId);
      if (!target) return;
      const folderValue = folder.trim() || undefined;
      const refs = target.project.resources ?? [];
      const matchIdx = refs.findIndex((r) =>
        item.kind === "standard"
          ? r.kind === "standard" && r.resource_instance_id === item.resourceId
          : r.kind === "custom" && r.resource_instance_id === item.resourceId
      );
      if (matchIdx < 0) return;
      const current = refs[matchIdx]!;
      if ((current.folder ?? undefined) === folderValue) return;
      const nextRefs = refs.map((r, i) =>
        i === matchIdx ? { ...r, folder: folderValue } : r
      );
      const updatedProject: GuiProjectFile = {
        ...target.project,
        resources: nextRefs,
        custom_node_usages: target.project.custom_node_usages ?? []
      };
      try {
        await window.tinder.writeText(
          target.id,
          JSON.stringify(updatedProject, null, 2)
        );
        await reload();
      } catch (err) {
        await dialog.notify({ title: "移动失败", message: String(err) });
      }
    },
    [disk, dialog, reload]
  );

  const promptMoveResourceFolder = useCallback(
    async (
      profileId: string,
      item: ProfileResourceItem,
      currentFolder: string
    ) => {
      const next = await dialog.prompt({
        title: "移动到子目录",
        placeholder: "目录路径，如 雷达/主雷达；留空表示根",
        defaultValue: currentFolder
      });
      if (next === null || next === undefined) return;
      await setProfileResourceFolder(profileId, item, next);
    },
    [dialog, setProfileResourceFolder]
  );

  const removeFromProfile = useCallback(
    async (profileId: string, item: ProfileResourceItem) => {
      if (!disk) return;
      const ok = await dialog.confirm({
        title: "从档案中移除资源",
        message: `确认移除「${item.label}」？`,
        destructive: true
      });
      if (!ok) return;
      const target = disk.profiles.find((p) => p.id === profileId);
      if (!target) return;
      try {
        // Primary v2 path: drop the matching ref from `resources[]`. Match by
        // (kind, resource_instance_id) so we hit both the active and disabled
        // variants if they ever exist for the same id.
        let updatedProject: GuiProjectFile = {
          ...target.project,
          resources: (target.project.resources ?? []).filter((ref) => {
            if (item.kind === "standard")
              return !(
                ref.kind === "standard" &&
                ref.resource_instance_id === item.resourceId
              );
            return !(
              ref.kind === "custom" &&
              ref.resource_instance_id === item.resourceId
            );
          })
        };

        // Custom resources still live inline in `custom_nodes[]` until the
        // resource-editor task package extracts them; drop the matching node
        // so the profile file doesn't keep an orphan definition.
        if (item.kind === "custom") {
          updatedProject = {
            ...updatedProject,
            custom_nodes: updatedProject.custom_nodes.filter(
              (cn) => cn.custom_node_id !== item.resourceId
            )
          };
        }

        // Legacy v1 cleanup: clear binding fields and the extras entry so a
        // future re-load doesn't migrate the ref back in.
        if (item.kind === "standard") {
          updatedProject = {
            ...updatedProject,
            builtin_node_configs: updatedProject.builtin_node_configs.map((cfg) =>
              cfg.binding_resource_id === item.resourceId
                ? (() => {
                    const { binding_resource_id: _drop, ...rest } = cfg;
                    return rest;
                  })()
                : cfg
            )
          };
          const cur = disk.extras[target.extrasKey];
          if (cur?.extraStandardIds.includes(item.resourceId)) {
            const nextExtras = {
              ...disk.extras,
              [target.extrasKey]: {
                ...cur,
                extraStandardIds: cur.extraStandardIds.filter(
                  (rid) => rid !== item.resourceId
                )
              }
            };
            await writeExtras(nextExtras);
          }
        }

        await window.tinder.writeText(
          target.id,
          JSON.stringify(updatedProject, null, 2)
        );
        await reload();
      } catch (err) {
        await dialog.notify({ title: "移除失败", message: String(err) });
      }
    },
    [disk, dialog, reload, writeExtras]
  );

  // ─── Custom node placement helpers ──────────────────────────────────────

  /** Shared write path: serialise a profile to disk + reload. */
  const writeProfile = useCallback(
    async (
      target: ProfileEntry,
      project: GuiProjectFile,
      errorTitle: string
    ): Promise<boolean> => {
      try {
        await window.tinder.writeText(
          target.id,
          JSON.stringify(project, null, 2)
        );
        await reload();
        return true;
      } catch (err) {
        await dialog.notify({ title: errorTitle, message: String(err) });
        return false;
      }
    },
    [dialog, reload]
  );

  const addCustomUsage = useCallback(
    async (
      profileId: string,
      customResourceId: string,
      nodeId: string,
      anchor: BuiltinExecutionAnchor | null
    ) => {
      if (!disk) return;
      const target = disk.profiles.find((p) => p.id === profileId);
      if (!target) return;
      const usages = target.project.custom_node_usages ?? [];
      // Allocate order at the end of the same-anchor bucket so the new
      // usage appears last under its anchor without disturbing siblings.
      const anchorKey = serializeAnchor(anchor);
      const sameAnchorOrders = usages
        .filter((u) => serializeAnchor(u.insert_before ?? null) === anchorKey)
        .map((u) => u.order);
      const nextOrder =
        sameAnchorOrders.length > 0 ? Math.max(...sameAnchorOrders) + 1 : 0;
      const newUsage: CustomNodeUsage = {
        resource_instance_id: customResourceId,
        node_id: nodeId,
        enabled: true,
        insert_before: anchor,
        order: nextOrder
      };
      const updated: GuiProjectFile = {
        ...target.project,
        resources: target.project.resources ?? [],
        custom_node_usages: [...usages, newUsage]
      };
      await writeProfile(target, updated, "添加失败");
    },
    [disk, writeProfile]
  );

  const promptAddCustomUsage = useCallback(
    async (
      profileId: string,
      customResourceId: string,
      nodeId: string
    ) => {
      const anchor = await promptForAnchor(dialog, null, "添加到链路");
      if (anchor === undefined) return; // cancelled
      await addCustomUsage(profileId, customResourceId, nodeId, anchor);
    },
    [addCustomUsage, dialog]
  );

  const promptMoveCustomUsage = useCallback(
    async (profileId: string, arrayIndex: number) => {
      if (!disk) return;
      const target = disk.profiles.find((p) => p.id === profileId);
      if (!target) return;
      const usage = (target.project.custom_node_usages ?? [])[arrayIndex];
      if (!usage) return;
      const anchor = await promptForAnchor(
        dialog,
        usage.insert_before ?? null,
        "移动到锚点"
      );
      if (anchor === undefined) return;
      const anchorKey = serializeAnchor(anchor);
      const usages = target.project.custom_node_usages ?? [];
      const sameAnchorOrders = usages
        .filter(
          (u, i) =>
            i !== arrayIndex &&
            serializeAnchor(u.insert_before ?? null) === anchorKey
        )
        .map((u) => u.order);
      const nextOrder =
        sameAnchorOrders.length > 0 ? Math.max(...sameAnchorOrders) + 1 : 0;
      const updatedUsages = usages.map((u, i) =>
        i === arrayIndex
          ? { ...u, insert_before: anchor, order: nextOrder }
          : u
      );
      const updated: GuiProjectFile = {
        ...target.project,
        resources: target.project.resources ?? [],
        custom_node_usages: updatedUsages
      };
      await writeProfile(target, updated, "移动失败");
    },
    [dialog, disk, writeProfile]
  );

  const shiftCustomUsage = useCallback(
    async (profileId: string, arrayIndex: number, direction: 1 | -1) => {
      if (!disk) return;
      const target = disk.profiles.find((p) => p.id === profileId);
      if (!target) return;
      const usages = target.project.custom_node_usages ?? [];
      const usage = usages[arrayIndex];
      if (!usage) return;
      const anchorKey = serializeAnchor(usage.insert_before ?? null);
      // Find same-anchor siblings sorted by order; locate self and target neighbour.
      const siblings = usages
        .map((u, i) => ({ u, i }))
        .filter(({ u }) => serializeAnchor(u.insert_before ?? null) === anchorKey)
        .sort((a, b) => a.u.order - b.u.order);
      const selfIdx = siblings.findIndex(({ i }) => i === arrayIndex);
      const swapIdx = selfIdx + direction;
      if (swapIdx < 0 || swapIdx >= siblings.length) return;
      const neighbour = siblings[swapIdx]!;
      const updatedUsages = usages.map((u, i) => {
        if (i === arrayIndex) return { ...u, order: neighbour.u.order };
        if (i === neighbour.i) return { ...u, order: usage.order };
        return u;
      });
      const updated: GuiProjectFile = {
        ...target.project,
        resources: target.project.resources ?? [],
        custom_node_usages: updatedUsages
      };
      await writeProfile(target, updated, "调序失败");
    },
    [disk, writeProfile]
  );

  const setCustomUsageEnabled = useCallback(
    async (profileId: string, arrayIndex: number, enabled: boolean) => {
      if (!disk) return;
      const target = disk.profiles.find((p) => p.id === profileId);
      if (!target) return;
      const usages = target.project.custom_node_usages ?? [];
      if (!usages[arrayIndex] || usages[arrayIndex].enabled === enabled) return;
      const updatedUsages = usages.map((u, i) =>
        i === arrayIndex ? { ...u, enabled } : u
      );
      const updated: GuiProjectFile = {
        ...target.project,
        resources: target.project.resources ?? [],
        custom_node_usages: updatedUsages
      };
      await writeProfile(
        target,
        updated,
        enabled ? "激活失败" : "停用失败"
      );
    },
    [disk, writeProfile]
  );

  const removeCustomUsage = useCallback(
    async (profileId: string, arrayIndex: number) => {
      if (!disk) return;
      const target = disk.profiles.find((p) => p.id === profileId);
      if (!target) return;
      const usages = target.project.custom_node_usages ?? [];
      if (!usages[arrayIndex]) return;
      const ok = await dialog.confirm({
        title: "移出链路",
        message: `确认移除该自定义节点的链路放置？`,
        destructive: true
      });
      if (!ok) return;
      const updated: GuiProjectFile = {
        ...target.project,
        resources: target.project.resources ?? [],
        custom_node_usages: usages.filter((_, i) => i !== arrayIndex)
      };
      await writeProfile(target, updated, "移除失败");
    },
    [dialog, disk, writeProfile]
  );

  // ────────────────────────── Resource editor ──────────────────────────

  const saveResourceConfig = useCallback(
    async (
      resource: ComputeResourceV2,
      options: {
        previousSourcePath?: string | null;
        expectedDiskHash?: string | null;
        overwriteExternal?: boolean;
      } = {}
    ): Promise<{ packagePath: string; diskHash: string }> => {
      if (!disk) throw new Error("数据根目录未选择");

      // External-modification guard. We compare hashes against the file at
      // the previous source path: that's where the editor read its
      // baseline from. After the write we recompute the hash from the
      // serialized text so the caller has a fresh baseline to track.
      const prev = options.previousSourcePath ?? null;
      if (
        prev &&
        options.expectedDiskHash &&
        !options.overwriteExternal
      ) {
        // For package directories we compare against the inner resource.json.
        let currentDiskPath: string;
        if (prev.endsWith(".json")) {
          currentDiskPath = prev;
        } else {
          currentDiskPath = await join(prev, "resource.json");
        }
        let currentText: string;
        try {
          currentText = await window.tinder.readText(currentDiskPath);
        } catch {
          // File disappeared — treat as no conflict and proceed.
          currentText = "";
        }
        if (currentText) {
          const currentDiskHash = hashText(currentText);
          if (currentDiskHash !== options.expectedDiskHash) {
            throw new SaveExternallyModifiedError({
              currentDiskHash,
              expectedHash: options.expectedDiskHash
            });
          }
        }
      }

      const stamped: ComputeResourceV2 = {
        ...resource,
        updated_at: new Date().toISOString(),
        created_at: resource.created_at ?? new Date().toISOString()
      } as ComputeResourceV2;
      const { packageDir, metadataPath } = await writeResourcePackage(
        disk.paths,
        stamped
      );
      // If we are migrating from a legacy single-file resource on disk,
      // move the old file aside so the package directory becomes the
      // canonical source on the next reload. Skipped when the previous
      // source already was the same package directory.
      if (prev && prev !== packageDir) {
        try {
          await window.tinder.trash(prev);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn(
            "[resource-editor] failed to remove legacy resource at",
            prev,
            err
          );
        }
      }
      // Read back what we just wrote to compute a stable disk hash for the
      // next save's external-mod baseline. Doing this from disk (rather
      // than hashing the in-memory string) ensures the comparison is on
      // bytes the next compare will see.
      let writtenText: string;
      try {
        writtenText = await window.tinder.readText(metadataPath);
      } catch {
        writtenText = JSON.stringify(stamped, null, 2);
      }
      const diskHash = hashText(writtenText);
      await reload();
      return { packagePath: packageDir, diskHash };
    },
    [disk, reload]
  );

  const renameManagedSourceFile = useCallback(
    async (params: {
      packageDir: string;
      currentRelPath: string;
      newBaseName: string;
    }): Promise<{ newRelPath: string }> => {
      const baseTrim = params.newBaseName.trim();
      if (!baseTrim) throw new Error("文件名不能为空");
      // Keep the file in its current subdirectory (src/ or include/); we
      // only rename the basename. Cross-dir moves should go through a
      // dedicated UI when that becomes a feature.
      const segments = params.currentRelPath.split(/[\\/]/);
      if (segments.length < 2) {
        throw new Error("源文件路径异常，无法重命名");
      }
      const dir = segments.slice(0, -1).join("/");
      const newRelPath = `${dir}/${baseTrim}`;
      if (newRelPath === params.currentRelPath) return { newRelPath };
      const oldAbs = await join(params.packageDir, params.currentRelPath);
      const newAbs = await join(params.packageDir, newRelPath);
      if (await pathExists(newAbs)) {
        throw new Error(`同目录下已存在文件「${baseTrim}」`);
      }
      await window.tinder.rename(oldAbs, newAbs);
      return { newRelPath };
    },
    []
  );

  const copyResource = useCallback(
    async (
      resource: ComputeResourceV2,
      options: {
        newDisplayName: string;
        copyCode: boolean;
        sourcePath: string | null;
      }
    ): Promise<{ resourceInstanceId: string; packagePath: string }> => {
      if (!disk) throw new Error("数据根目录未选择");
      const newName = options.newDisplayName.trim();
      if (!newName) throw new Error("新名称不能为空");
      const kind = resource.resource_kind;
      const baseRoot =
        kind === "standard" ? disk.paths.standardDir : disk.paths.customDir;
      // Allocate a directory name from the slug; fall back to suffixed
      // variants when the slug collides with an existing resource package.
      const newPackageDir = await uniqueDirPath(baseRoot, slugify(newName));
      const newId = newPackageDir.split(/[\\/]/).pop() ?? slugify(newName);
      const now = new Date().toISOString();

      let copied: ComputeResourceV2;
      if (resource.resource_kind === "standard") {
        copied = {
          ...resource,
          resource_instance_id: newId,
          display_name: newName,
          status: "draft",
          created_at: now,
          updated_at: now,
          // Variants/candidates carry over structurally; clear effective
          // candidate maps so the user re-confirms in the new resource.
          model_variants: (resource.model_variants ?? []).map((v) => ({
            ...v,
            effective_candidates: {}
          })),
          compute_nodes: resource.compute_nodes.map((c) => ({ ...c }))
        } as StandardComputeResource;
      } else {
        // Reassign action_index globally for the copy so two resources
        // never share allocated indexes. The pool must include v2
        // custom resources' per-node indexes too — a v1-only walk only
        // sees the first node of each legacy custom resource and would
        // happily reuse indexes belonging to the 2nd+ nodes of a v2
        // resource.
        const taken = new Set<number>(
          collectAllCustomActionIndexes(disk, resource.resource_instance_id)
        );
        const customNodes = resource.custom_nodes.map((n) => {
          let idx = 0;
          while (taken.has(idx)) idx += 1;
          taken.add(idx);
          return { ...n, action_index: idx };
        });
        copied = {
          ...resource,
          resource_instance_id: newId,
          display_name: newName,
          status: "draft",
          created_at: now,
          updated_at: now,
          custom_nodes: customNodes
        } as CustomComputeResource;
      }

      const implementation: ComputeResourceV2["implementation"] = {
        ...resource.implementation,
        source_files: [],
        runtime_artifact: {
          ...resource.implementation.runtime_artifact,
          path: ""
        },
        status: { interface_status: "pending" }
      };
      copied = { ...copied, implementation };

      // Ensure base package directory exists. Source-file copies need the
      // src/ and include/ subdirs.
      await window.tinder.createDir(newPackageDir);

      if (options.copyCode) {
        const summary = await copyImplementationFiles(
          resource,
          newPackageDir,
          options.sourcePath ?? null
        );
        copied = {
          ...copied,
          implementation: {
            ...copied.implementation,
            source_files: summary.refs,
            runtime_artifact:
              summary.suggestedArtifact ?? copied.implementation.runtime_artifact
          }
        };
        if (summary.warnings.length > 0) {
          await dialog.notify({
            title: "复制结果",
            message: summary.warnings.join("\n")
          });
        }
      }

      await writeResourcePackage(disk.paths, copied, { ensureSubdirs: false });
      await reload();
      return { resourceInstanceId: newId, packagePath: newPackageDir };
    },
    [disk, dialog, reload]
  );

  const createDraftResource = useCallback(
    async (params: {
      kind: "standard" | "custom";
      displayName: string;
      implementationKind: ImplementationKind;
      template?: ComputeResourceTemplate | null;
    }) => {
      if (!disk) throw new Error("数据根目录未选择");
      const name = params.displayName.trim();
      if (!name) throw new Error("名称不能为空");
      const template = params.template ?? null;

      // Resource instance id derives from the user-provided name, not the
      // template — the name is the *thing* the user is creating, the
      // template is just suggestion prefill.
      const baseRoot =
        params.kind === "standard" ? disk.paths.standardDir : disk.paths.customDir;
      const newPackageDir = await uniqueDirPath(baseRoot, slugify(name));
      const newId = newPackageDir.split(/[\\/]/).pop() ?? slugify(name);
      const now = new Date().toISOString();

      const implementationKind = params.implementationKind;

      // Auto-generate the resource's code file set: 1 .py for python,
      // or .cpp + .h pair for C++. Sticks to the resource's slug as the
      // base name so a fresh resource immediately has something to edit.
      const ensureDirInPackage = async (sub: string): Promise<string> => {
        const abs = await join(newPackageDir, sub);
        await ensureDir(abs);
        return abs;
      };
      const generatedFiles: ImplementationFileRef[] = [];
      let artifactPath = "";
      if (implementationKind === "python_script") {
        const srcDir = await ensureDirInPackage(RESOURCE_SRC_DIR);
        const relPath = `${RESOURCE_SRC_DIR}/${newId}.py`;
        const absPath = await join(srcDir, `${newId}.py`);
        await window.tinder.writeText(
          absPath,
          `"""${name}\n\n资源主入口；由资源编辑器在创建时生成。\n"""\n`
        );
        generatedFiles.push({
          file_id: `${newId}:primary`,
          path: relPath,
          storage: "managed",
          role: "primary",
          language: "python",
          generated_region_status: "unknown"
        });
        artifactPath = relPath;
      } else {
        const srcDir = await ensureDirInPackage(RESOURCE_SRC_DIR);
        const includeDir = await ensureDirInPackage(RESOURCE_INCLUDE_DIR);
        const srcRel = `${RESOURCE_SRC_DIR}/${newId}.cpp`;
        const headerRel = `${RESOURCE_INCLUDE_DIR}/${newId}.h`;
        const guard =
          newId.toUpperCase().replace(/[^A-Z0-9]/g, "_") + "_H";
        await window.tinder.writeText(
          await join(srcDir, `${newId}.cpp`),
          `#include "${newId}.h"\n\n// ${name}\n// 由资源编辑器在创建时生成。\n`
        );
        await window.tinder.writeText(
          await join(includeDir, `${newId}.h`),
          `#ifndef ${guard}\n#define ${guard}\n\n// ${name}\n\n#endif // ${guard}\n`
        );
        generatedFiles.push(
          {
            file_id: `${newId}:src`,
            path: srcRel,
            storage: "managed",
            role: "source",
            language: "cpp",
            generated_region_status: "unknown"
          },
          {
            file_id: `${newId}:header`,
            path: headerRel,
            storage: "managed",
            role: "header",
            language: "c",
            generated_region_status: "unknown"
          }
        );
        // Suggested artifact path; the user wires a real build later.
        artifactPath = `${RESOURCE_ARTIFACT_DIR}/${newId}.dll`;
      }

      const implementation: ComputeResourceImplementation = {
        kind: implementationKind,
        source_files: generatedFiles,
        runtime_artifact: {
          path: artifactPath,
          kind:
            implementationKind === "cpp_library" ? "cpp_dylib" : "python_script",
          required_for_export: true
        },
        status: { interface_status: "unknown" }
      };

      let resource: ComputeResourceV2;
      if (params.kind === "standard") {
        const suggestedVariant: ResourceModelVariant | null = template?.suggested_variant
          ? {
              variant_id: slugify(template.suggested_variant.variant_name),
              display_name: template.suggested_variant.variant_name,
              effective_candidates: {},
              model_binding_required:
                template.suggested_variant.model_binding_required
            }
          : null;
        const suggestedCandidates: StandardComputeCandidate[] = (
          template?.suggested_standard_node_ids ?? []
        ).map((nodeId, i) => ({
          node_id: nodeId,
          display_name: nodeId,
          node_type: "pathway",
          candidate_id: `${slugify(nodeId)}-c${i + 1}`,
          status: "draft"
        }));
        resource = {
          schema_version: 2,
          resource_kind: "standard",
          resource_instance_id: newId,
          display_name: name,
          description: template?.default_description ?? "",
          tags: template?.default_tags ? [...template.default_tags] : [],
          resource_category: template?.category,
          template_origin: template
            ? {
                template_id: template.template_id,
                template_version: template.template_version
              }
            : undefined,
          status: "draft",
          implementation,
          compute_nodes: suggestedCandidates,
          model_variants: suggestedVariant ? [suggestedVariant] : [],
          created_at: now,
          updated_at: now
        };
      } else {
        // For custom: build empty CustomComputeNodeDef[] from suggestions.
        // action_index left undefined so allocation deferred until the user
        // confirms descriptions (description must be non-empty to allocate).
        const suggestedNodes: CustomComputeNodeDef[] = (
          template?.suggested_custom_actions ?? []
        ).map((action) => ({
          node_id: slugify(action.display_name),
          display_name: action.display_name,
          description: action.description,
          default_parameters: action.default_parameters,
          status: "draft"
        }));
        resource = {
          schema_version: 2,
          resource_kind: "custom",
          resource_instance_id: newId,
          display_name: name,
          description: template?.default_description ?? "",
          tags: template?.default_tags ? [...template.default_tags] : [],
          resource_category: template?.category,
          template_origin: template
            ? {
                template_id: template.template_id,
                template_version: template.template_version
              }
            : undefined,
          status: "draft",
          implementation,
          custom_nodes: suggestedNodes,
          created_at: now,
          updated_at: now
        };
      }

      // Allocate action_index for any suggested custom nodes that already
      // have a description (templates can pre-supply non-empty descriptions).
      // Pool includes every existing v1+v2 custom node + every profile-local
      // custom node so allocation is globally unique on first save.
      if (resource.resource_kind === "custom") {
        const taken = new Set<number>(
          collectAllCustomActionIndexes(disk, resource.resource_instance_id)
        );
        resource = {
          ...resource,
          custom_nodes: resource.custom_nodes.map((node) => {
            if (typeof node.action_index === "number") return node;
            if (!node.description?.trim()) return node;
            let idx = 0;
            while (taken.has(idx)) idx += 1;
            taken.add(idx);
            return { ...node, action_index: idx };
          })
        };
      }

      await writeResourcePackage(disk.paths, resource);
      await reload();
      return {
        resourceInstanceId: newId,
        packagePath: newPackageDir,
        displayName: name,
        kind: params.kind
      };
    },
    [disk, reload]
  );

  const saveResourceAsTemplate = useCallback(
    async (
      resource: ComputeResourceV2,
      options: {
        templateId: string;
        templateVersion: string;
        displayName: string;
      }
    ): Promise<{ templatePath: string }> => {
      if (!disk) throw new Error("数据根目录未选择");
      const templateId = options.templateId.trim();
      if (!templateId) throw new Error("template_id 不能为空");
      // Ensure target directory exists. This is the first place we
      // actually need .tinder/resource-templates/ on disk, so we lazily
      // create it.
      await ensureDir(disk.paths.templatesDir);

      // Build the lossy export. Implementation, runtime artifact, generated
      // state, and profile usage are intentionally stripped. Only reusable
      // structure and suggestions survive.
      const base: Pick<
        ComputeResourceTemplate,
        | "template_id"
        | "template_version"
        | "display_name"
        | "source"
        | "resource_kind"
        | "category"
        | "default_description"
        | "default_tags"
        | "default_implementation_kind"
      > = {
        template_id: templateId,
        template_version: options.templateVersion || "1.0.0",
        display_name: options.displayName.trim() || resource.display_name,
        source: "project",
        resource_kind: resource.resource_kind,
        category: resource.resource_category ?? "blank",
        default_description: resource.description ?? "",
        default_tags: resource.tags ? [...resource.tags] : [],
        default_implementation_kind: resource.implementation.kind
      };

      let template: ComputeResourceTemplate;
      if (resource.resource_kind === "standard") {
        const stdRes = resource as StandardComputeResource;
        const firstVariant = stdRes.model_variants[0];
        template = {
          ...base,
          suggested_standard_node_ids: Array.from(
            new Set(stdRes.compute_nodes.map((c) => c.node_id))
          ),
          suggested_variant: firstVariant
            ? {
                variant_name: firstVariant.display_name,
                model_binding_required:
                  firstVariant.model_binding_required ?? false
              }
            : undefined
        };
      } else {
        const customRes = resource as CustomComputeResource;
        template = {
          ...base,
          suggested_custom_actions: customRes.custom_nodes.map((n) => ({
            display_name: n.display_name,
            description: n.description,
            default_parameters: n.default_parameters
          }))
        };
      }

      const templatePath = await uniqueFilePath(
        disk.paths.templatesDir,
        slugify(templateId),
        ".json"
      );
      await window.tinder.writeText(
        templatePath,
        JSON.stringify(template, null, 2)
      );
      await reload();
      return { templatePath };
    },
    [disk, reload]
  );

  const planResourceInterface = useCallback(
    async (
      resource: ComputeResourceV2,
      packagePath: string | null
    ): Promise<GenerationPlan> => {
      // Note: planning never writes; safe to call regardless of disk state.
      const resolvedPackageDir =
        packagePath && !packagePath.endsWith(".json") ? packagePath : null;
      return planResourceGeneration(resource, resolvedPackageDir);
    },
    []
  );

  const executeResourceInterface = useCallback(
    async (
      resource: ComputeResourceV2,
      plan: GenerationPlan,
      approval: GenerationApproval
    ): Promise<GenerationResult> => {
      return executeGenerationPlan({ resource, plan, approval });
    },
    []
  );

  const promptNewResource = useCallback(
    async (initialKind: "standard" | "custom") => {
      if (!disk) return null;
      const result: NewResourceDialogResult | null =
        await newResourceDialog.open({
          templates: disk.templates,
          initialKind
        });
      if (!result) return null;
      try {
        const created = await createDraftResource({
          kind: result.kind,
          displayName: result.displayName,
          implementationKind: result.implementationKind,
          template: result.template
        });
        return created;
      } catch (err) {
        await dialog.notify({ title: "创建失败", message: String(err) });
        return null;
      }
    },
    [createDraftResource, dialog, disk, newResourceDialog]
  );

  const loadTestData = useCallback(async (): Promise<boolean> => {
    if (!disk) {
      await dialog.notify({
        title: "未选择数据根目录",
        message: "请先在侧边栏选择数据根目录后再载入测试数据。"
      });
      return false;
    }
    const ok = await dialog.confirm({
      title: "载入测试数据",
      message: `这会把 ${TEST_DATA_FILE_COUNT} 组示例文件写入当前数据根（.tinder/profiles, .tinder/resources, .tinder/resource-templates）。同名文件会被覆盖。继续？`,
      okLabel: "载入",
      destructive: true
    });
    if (!ok) return false;
    try {
      await installTestData(disk.paths);
      await reload();
      await dialog.notify({
        title: "测试数据已载入",
        message: `已写入 ${TEST_DATA_FILE_COUNT} 组示例文件并刷新侧边栏。`
      });
      return true;
    } catch (err) {
      await dialog.notify({
        title: "载入测试数据失败",
        message: String(err)
      });
      return false;
    }
  }, [dialog, disk, reload]);

  const promptCopyResource = useCallback(
    async (
      leaf:
        | LeafNode<PlatformResourceInstance>
        | LeafNode<CustomNodeConfig>
    ) => {
      if (!disk) return null;
      if (!leaf.resource) {
        await dialog.notify({
          title: "无法复制",
          message: "该资源缺少 v2 元数据，请先打开编辑器保存为新格式后再试。"
        });
        return null;
      }
      const newName = await dialog.prompt({
        title: "复制计算实例",
        placeholder: "新名称",
        defaultValue: `${leaf.name} 副本`
      });
      if (!newName?.trim()) return null;
      const copyCode = await dialog.confirm({
        title: "复制代码实现?",
        message:
          "选择「确定」将源文件复制到新资源包；选择「取消」仅复制结构，源文件和产物路径将清空。",
        okLabel: "复制代码实现"
      });
      try {
        const result = await copyResource(leaf.resource, {
          newDisplayName: newName.trim(),
          copyCode,
          sourcePath: leaf.packagePath ?? leaf.id
        });
        return {
          ...result,
          displayName: newName.trim(),
          kind: leaf.resource.resource_kind
        };
      } catch (err) {
        await dialog.notify({ title: "复制失败", message: String(err) });
        return null;
      }
    },
    [disk, dialog, copyResource]
  );

  const value = useMemo<ChainAssemblyValue>(
    () => ({
      dataRoot,
      disk,
      loading,
      loadError,
      collapse,
      setCollapse,
      activeProfileId,
      setActiveProfileId,
      pickDataRoot,
      saveAsNewRoot,
      reload,
      newProfile,
      promptNewResource,
      promptNewFolder,
      renameProfileById,
      deleteProfileById,
      duplicateProfile,
      revealProfileInOs,
      renameLeaf,
      deleteLeaf,
      renameFolder,
      deleteFolder,
      moveResourceToFolder,
      dropToProfile,
      removeFromProfile,
      setProfileResourceEnabled,
      setProfileResourceFolder,
      promptMoveResourceFolder,
      addCustomUsage,
      promptAddCustomUsage,
      promptMoveCustomUsage,
      shiftCustomUsage,
      setCustomUsageEnabled,
      removeCustomUsage,
      saveResourceConfig,
      renameManagedSourceFile,
      copyResource,
      promptCopyResource,
      createDraftResource,
      saveResourceAsTemplate,
      planResourceInterface,
      executeResourceInterface,
      loadTestData,
      dialogPrompt: dialog.prompt,
      dialogConfirm: dialog.confirm,
      dialogNotify: dialog.notify,
      dialogPickOne: dialog.pickOne
    }),
    [
      dataRoot,
      disk,
      loading,
      loadError,
      collapse,
      setCollapse,
      activeProfileId,
      pickDataRoot,
      saveAsNewRoot,
      reload,
      newProfile,
      promptNewResource,
      promptNewFolder,
      renameProfileById,
      deleteProfileById,
      duplicateProfile,
      revealProfileInOs,
      renameLeaf,
      deleteLeaf,
      renameFolder,
      deleteFolder,
      moveResourceToFolder,
      dropToProfile,
      removeFromProfile,
      setProfileResourceEnabled,
      setProfileResourceFolder,
      promptMoveResourceFolder,
      addCustomUsage,
      promptAddCustomUsage,
      promptMoveCustomUsage,
      shiftCustomUsage,
      setCustomUsageEnabled,
      removeCustomUsage,
      saveResourceConfig,
      renameManagedSourceFile,
      copyResource,
      promptCopyResource,
      createDraftResource,
      saveResourceAsTemplate,
      planResourceInterface,
      executeResourceInterface,
      loadTestData,
      dialog.prompt,
      dialog.confirm,
      dialog.notify,
      dialog.pickOne
    ]
  );

  return (
    <ChainAssemblyContext.Provider value={value}>
      {children}
      {dialog.state && <DialogModal state={dialog.state} />}
      {newResourceDialog.state && (
        <NewResourceDialog state={newResourceDialog.state} />
      )}
    </ChainAssemblyContext.Provider>
  );
}
