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
  CustomNodeConfig,
  GuiProjectFile,
  PlatformResourceInstance
} from "@tinder/nextstep";
import { createEmptyProject } from "@tinder/nextstep";
import {
  EXTRAS_FILE,
  TINDER_DIR,
  basenameNoExt,
  copyTree,
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
  renameLeaf: (
    where: "standard" | "custom",
    leaf: LeafNode<PlatformResourceInstance> | LeafNode<CustomNodeConfig>
  ) => Promise<void>;
  deleteLeaf: (leafId: string, name: string) => Promise<void>;
  renameFolder: (folder: FolderNode<unknown>) => Promise<void>;
  deleteFolder: (folder: FolderNode<unknown>) => Promise<void>;

  dropToProfile: (profileId: string, payload: DragPayload) => Promise<void>;
  removeFromProfile: (profileId: string, item: ProfileResourceItem) => Promise<void>;
}

const ChainAssemblyContext = createContext<ChainAssemblyValue | null>(null);

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
      const data: CustomNodeConfig = {
        custom_node_id: slug,
        display_name: trimmed,
        description: "",
        module_id: slug,
        impl_kind: "python_script",
        location: `scripts/${slug}.py`,
        input: '{"action_index":0,"parameters":{}}',
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
    async (profileId: string, payload: DragPayload) => {
      if (!disk) return;
      const target = disk.profiles.find((p) => p.id === profileId);
      if (!target) return;
      try {
        if (payload.kind === "standard") {
          const cur = disk.extras[target.extrasKey] ?? { extraStandardIds: [] };
          if (cur.extraStandardIds.includes(payload.resource.resource_instance_id)) return;
          const nextExtras = {
            ...disk.extras,
            [target.extrasKey]: {
              ...cur,
              extraStandardIds: [...cur.extraStandardIds, payload.resource.resource_instance_id]
            }
          };
          await writeExtras(nextExtras);
        } else {
          const orig = payload.node;
          const suffix = Math.random().toString(36).slice(2, 6);
          const cloned: CustomNodeConfig = {
            ...orig,
            custom_node_id: `${orig.custom_node_id}-${suffix}`,
            module_id: `${orig.module_id || orig.custom_node_id}-${suffix}`
          };
          const updatedProject: GuiProjectFile = {
            ...target.project,
            custom_nodes: [...target.project.custom_nodes, cloned]
          };
          await window.tinder.writeText(target.id, JSON.stringify(updatedProject, null, 2));
        }
        await reload();
        setCollapse((prev) => ({
          ...prev,
          profileResources: { ...(prev.profileResources ?? {}), [profileId]: true }
        }));
      } catch (err) {
        await dialog.notify({ title: "复制失败", message: String(err) });
      }
    },
    [disk, dialog, reload, setCollapse, writeExtras]
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
        if (item.source === "extra-standard") {
          const cur = disk.extras[target.extrasKey];
          if (cur) {
            const nextExtras = {
              ...disk.extras,
              [target.extrasKey]: {
                ...cur,
                extraStandardIds: cur.extraStandardIds.filter((rid) => rid !== item.resourceId)
              }
            };
            await writeExtras(nextExtras);
          }
        } else if (item.source === "binding" && item.bindingRef) {
          const ref = item.bindingRef;
          const updatedProject: GuiProjectFile = {
            ...target.project,
            builtin_node_configs: target.project.builtin_node_configs.map((cfg) => {
              if (cfg.domain === ref.domain && cfg.node_id === ref.node_id) {
                const { binding_resource_id: _drop, ...rest } = cfg;
                return rest;
              }
              return cfg;
            })
          };
          await window.tinder.writeText(target.id, JSON.stringify(updatedProject, null, 2));
        } else if (item.source === "profile-custom") {
          const updatedProject: GuiProjectFile = {
            ...target.project,
            custom_nodes: target.project.custom_nodes.filter(
              (cn) => cn.custom_node_id !== item.resourceId
            )
          };
          await window.tinder.writeText(target.id, JSON.stringify(updatedProject, null, 2));
        }
        await reload();
      } catch (err) {
        await dialog.notify({ title: "移除失败", message: String(err) });
      }
    },
    [disk, dialog, reload, writeExtras]
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
      renameLeaf,
      deleteLeaf,
      renameFolder,
      deleteFolder,
      dropToProfile,
      removeFromProfile
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
      renameLeaf,
      deleteLeaf,
      renameFolder,
      deleteFolder,
      dropToProfile,
      removeFromProfile
    ]
  );

  return (
    <ChainAssemblyContext.Provider value={value}>
      {children}
      {dialog.state && <DialogModal state={dialog.state} />}
    </ChainAssemblyContext.Provider>
  );
}
