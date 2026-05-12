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
  CustomNodeConfig,
  CustomNodeUsage,
  GuiProjectFile,
  PlatformResourceInstance,
  ProfileResourceRef
} from "@tinder/nextstep";
import {
  DEFAULT_PROFILE_VARIANT_ID,
  createEmptyProject,
  nextCustomActionIndex,
  profileResourceRefKey
} from "@tinder/nextstep";
import { CHAIN_CATALOG } from "../help/chain-catalog.generated";
import {
  EXTRAS_FILE,
  TINDER_DIR,
  basenameNoExt,
  copyTree,
  flattenLeaves,
  loadCollapse,
  loadDataRoot,
  loadFromDisk,
  pathExists,
  saveCollapse,
  saveDataRoot,
  slugify,
  uniqueDirPath,
  uniqueFilePath,
  join,
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
  newStandardInstance: () => Promise<void>;
  newCustomNode: () => Promise<void>;
  promptNewFolder: (where: "standard" | "custom", parentPath: string | null) => Promise<void>;

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
}

const ChainAssemblyContext = createContext<ChainAssemblyValue | null>(null);

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

export function ChainAssemblyProvider({ children }: { children: ReactNode }) {
  const [dataRoot, setDataRoot] = useState<string | null>(() => loadDataRoot());
  const [disk, setDisk] = useState<DiskState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [collapse, _setCollapse] = useState<CollapseState>(() => loadCollapse());
  const dialog = useDialog();

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
    loadFromDisk(dataRoot)
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
      const d = await loadFromDisk(dataRoot);
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

  const newStandardInstance = useCallback(async () => {
    if (!disk) return;
    const name = await dialog.prompt({ title: "新建标准实例", placeholder: "实例名" });
    if (!name?.trim()) return;
    const trimmed = name.trim();
    try {
      const path = await uniqueFilePath(disk.paths.standardDir, slugify(trimmed), ".json");
      const data: PlatformResourceInstance = {
        resource_instance_id: slugify(trimmed),
        display_name: trimmed,
        compute_nodes: []
      };
      await window.tinder.writeText(path, JSON.stringify(data, null, 2));
      await reload();
    } catch (err) {
      await dialog.notify({ title: "创建失败", message: String(err) });
    }
  }, [disk, dialog, reload]);

  const newCustomNode = useCallback(async () => {
    if (!disk) return;
    const name = await dialog.prompt({ title: "新建自定义节点", placeholder: "节点名" });
    if (!name?.trim()) return;
    const trimmed = name.trim();
    try {
      const path = await uniqueFilePath(disk.paths.customDir, slugify(trimmed), ".json");
      const slug = slugify(trimmed);
      const globalCustomNodes = [
        ...disk.profiles.flatMap((profile) => profile.project.custom_nodes),
        ...flattenLeaves(disk.customTree)
      ];
      const data: CustomNodeConfig = {
        custom_node_id: slug,
        resource_instance_id: slug,
        node_id: slug,
        display_name: trimmed,
        description: "",
        module_id: slug,
        impl_kind: "python_script",
        location: `scripts/${slug}.py`,
        action_index: nextCustomActionIndex(globalCustomNodes),
        default_parameters: {},
        input: "",
        enabled: true
      };
      await window.tinder.writeText(path, JSON.stringify(data, null, 2));
      await reload();
    } catch (err) {
      await dialog.notify({ title: "创建失败", message: String(err) });
    }
  }, [disk, dialog, reload]);

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
      newStandardInstance,
      newCustomNode,
      promptNewFolder,
      renameProfileById,
      deleteProfileById,
      duplicateProfile,
      revealProfileInOs,
      renameLeaf,
      deleteLeaf,
      renameFolder,
      deleteFolder,
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
      removeCustomUsage
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
      newStandardInstance,
      newCustomNode,
      promptNewFolder,
      renameProfileById,
      deleteProfileById,
      duplicateProfile,
      revealProfileInOs,
      renameLeaf,
      deleteLeaf,
      renameFolder,
      deleteFolder,
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
      removeCustomUsage
    ]
  );

  return (
    <ChainAssemblyContext.Provider value={value}>
      {children}
      {dialog.state && <DialogModal state={dialog.state} />}
    </ChainAssemblyContext.Provider>
  );
}
