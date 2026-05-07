import type {
  CustomNodeConfig,
  GuiProjectFile,
  PlatformResourceInstance
} from "@tinder/nextstep";

// ─────────────────────────────────────────────────────────────────────────────
// Domain types
// ─────────────────────────────────────────────────────────────────────────────

export interface ProfileEntry {
  /** Full filesystem path of the profile JSON. */
  id: string;
  /** Display name (project_name). */
  name: string;
  /**
   * Stable cross-root key used for `profile-extras.json` lookups. Equals the
   * file basename without `.json`. Survives `另存为` because the basename
   * is preserved when the .tinder tree is copied to a new root.
   */
  extrasKey: string;
  project: GuiProjectFile;
}

export interface FolderNode<L> {
  kind: "folder";
  id: string;
  name: string;
  children: TreeNode<L>[];
}
export interface LeafNode<L> {
  kind: "leaf";
  id: string;
  name: string;
  data: L;
}
export type TreeNode<L> = FolderNode<L> | LeafNode<L>;

export interface ProfileExtras {
  extraStandardIds: string[];
}

export type DragPayload =
  | { kind: "standard"; resource: PlatformResourceInstance }
  | { kind: "custom"; node: CustomNodeConfig };

/**
 * Cross-component drag handoff. Held in an object so the export reference
 * stays stable while consumers mutate `.value`. Single drag at a time fits
 * the in-window tree → profile workflow.
 */
export const dragState: { value: DragPayload | null } = { value: null };

export interface CollapseState {
  sections: { profiles: boolean; resources: boolean };
  standardSub: boolean;
  customSub: boolean;
  profiles: Record<string, boolean>;
  profileResources: Record<string, boolean>;
  folders: Record<string, boolean>;
}

export interface DiskState {
  profiles: ProfileEntry[];
  standardTree: TreeNode<PlatformResourceInstance>[];
  customTree: TreeNode<CustomNodeConfig>[];
  /** Keyed by profile basename (extrasKey) so it survives root rename / 另存为. */
  extras: Record<string, ProfileExtras>;
  paths: { tinderDir: string; profilesDir: string; standardDir: string; customDir: string };
}

export interface ProfileResourceItem {
  id: string;
  label: string;
  kind: "standard" | "custom";
  source: "binding" | "extra-standard" | "profile-custom";
  resourceId: string;
  bindingRef?: { domain: "platform" | "signal" | "environment"; node_id: string };
}

// ─────────────────────────────────────────────────────────────────────────────
// localStorage keys & helpers
// ─────────────────────────────────────────────────────────────────────────────

export const COLLAPSE_STORAGE_KEY = "tinder.chainAssembly.collapse.v2";
export const ROOT_STORAGE_KEY = "tinder.chainAssembly.dataRoot";

export const INITIAL_COLLAPSE: CollapseState = {
  sections: { profiles: true, resources: true },
  standardSub: true,
  customSub: true,
  profiles: {},
  profileResources: {},
  folders: {}
};

export function loadCollapse(): CollapseState {
  try {
    const raw = localStorage.getItem(COLLAPSE_STORAGE_KEY);
    if (!raw) return INITIAL_COLLAPSE;
    const parsed = JSON.parse(raw) as Partial<CollapseState>;
    return {
      ...INITIAL_COLLAPSE,
      ...parsed,
      sections: { ...INITIAL_COLLAPSE.sections, ...(parsed.sections ?? {}) },
      profiles: parsed.profiles ?? {},
      profileResources: parsed.profileResources ?? {},
      folders: parsed.folders ?? {}
    };
  } catch {
    return INITIAL_COLLAPSE;
  }
}
export function saveCollapse(state: CollapseState): void {
  try {
    localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}
export function loadDataRoot(): string | null {
  try {
    return localStorage.getItem(ROOT_STORAGE_KEY);
  } catch {
    return null;
  }
}
export function saveDataRoot(path: string | null): void {
  try {
    if (path) localStorage.setItem(ROOT_STORAGE_KEY, path);
    else localStorage.removeItem(ROOT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────────

export function flattenLeaves<L>(roots: TreeNode<L>[]): L[] {
  const out: L[] = [];
  const walk = (nodes: TreeNode<L>[]) => {
    for (const n of nodes) {
      if (n.kind === "leaf") out.push(n.data);
      else walk(n.children);
    }
  };
  walk(roots);
  return out;
}

export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9一-龥]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || `item-${Math.random().toString(36).slice(2, 8)}`;
}

export function basenameNoExt(filePath: string, ext: string = ".json"): string {
  const base = filePath.split(/[\\/]/).pop() ?? "";
  return base.endsWith(ext) ? base.slice(0, -ext.length) : base;
}

export function profileResourceList(
  profile: GuiProjectFile,
  extras: ProfileExtras,
  standardCatalog: PlatformResourceInstance[]
): ProfileResourceItem[] {
  const seen = new Set<string>();
  const out: ProfileResourceItem[] = [];
  for (const cfg of profile.builtin_node_configs) {
    const rid = cfg.binding_resource_id;
    if (!rid) continue;
    const key = `binding:${cfg.domain}.${cfg.node_id}:${rid}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const found = standardCatalog.find((r) => r.resource_instance_id === rid);
    out.push({
      id: `std:${rid}@${cfg.domain}.${cfg.node_id}`,
      label: found?.display_name ?? rid,
      kind: "standard",
      source: "binding",
      resourceId: rid,
      bindingRef: { domain: cfg.domain, node_id: cfg.node_id }
    });
  }
  for (const rid of extras.extraStandardIds) {
    const key = `extra:${rid}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const found = standardCatalog.find((r) => r.resource_instance_id === rid);
    out.push({
      id: `std-extra:${rid}`,
      label: found?.display_name ?? rid,
      kind: "standard",
      source: "extra-standard",
      resourceId: rid
    });
  }
  for (const cn of profile.custom_nodes) {
    out.push({
      id: `custom:${cn.custom_node_id}`,
      label: cn.display_name || cn.custom_node_id,
      kind: "custom",
      source: "profile-custom",
      resourceId: cn.custom_node_id
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Disk paths
// ─────────────────────────────────────────────────────────────────────────────

export const TINDER_DIR = ".tinder";
export const PROFILES_DIR = "profiles";
export const RESOURCES_DIR = "resources";
export const STANDARD_DIR = "standard";
export const CUSTOM_DIR = "custom";
export const EXTRAS_FILE = "profile-extras.json";

export async function join(...segs: string[]): Promise<string> {
  return window.tinder.joinPath(...segs);
}
export async function pathExists(p: string): Promise<boolean> {
  try {
    await window.tinder.readText(p);
    return true;
  } catch {
    try {
      await window.tinder.listDir(p);
      return true;
    } catch {
      return false;
    }
  }
}
export async function ensureDir(p: string): Promise<void> {
  try {
    await window.tinder.listDir(p);
  } catch {
    await window.tinder.createDir(p);
  }
}
export async function ensureRootStructure(root: string): Promise<{
  tinderDir: string;
  profilesDir: string;
  standardDir: string;
  customDir: string;
}> {
  const tinderDir = await join(root, TINDER_DIR);
  const profilesDir = await join(tinderDir, PROFILES_DIR);
  const resourcesDir = await join(tinderDir, RESOURCES_DIR);
  const standardDir = await join(resourcesDir, STANDARD_DIR);
  const customDir = await join(resourcesDir, CUSTOM_DIR);
  await ensureDir(tinderDir);
  await ensureDir(profilesDir);
  await ensureDir(resourcesDir);
  await ensureDir(standardDir);
  await ensureDir(customDir);
  return { tinderDir, profilesDir, standardDir, customDir };
}
export async function uniqueFilePath(
  dir: string,
  baseName: string,
  ext: string
): Promise<string> {
  let candidate = await join(dir, `${baseName}${ext}`);
  let n = 2;
  while (await pathExists(candidate)) {
    candidate = await join(dir, `${baseName}-${n}${ext}`);
    n += 1;
  }
  return candidate;
}
export async function uniqueDirPath(dir: string, baseName: string): Promise<string> {
  let candidate = await join(dir, baseName);
  let n = 2;
  while (await pathExists(candidate)) {
    candidate = await join(dir, `${baseName}-${n}`);
    n += 1;
  }
  return candidate;
}

// ─────────────────────────────────────────────────────────────────────────────
// Disk loading
// ─────────────────────────────────────────────────────────────────────────────

async function loadProfiles(profilesDir: string): Promise<ProfileEntry[]> {
  const items = await window.tinder.listDir(profilesDir);
  const out: ProfileEntry[] = [];
  for (const item of items) {
    if (item.isDirectory || !item.name.endsWith(".json")) continue;
    try {
      const text = await window.tinder.readText(item.path);
      const parsed = JSON.parse(text) as GuiProjectFile;
      out.push({
        id: item.path,
        extrasKey: item.name.replace(/\.json$/, ""),
        name: parsed.project_name ?? item.name.replace(/\.json$/, ""),
        project: parsed
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[chain-assembly] skipping malformed profile", item.path, err);
    }
  }
  return out;
}

async function loadResourceTree<L>(
  dir: string,
  parseLeaf: (text: string) => L,
  leafLabel: (data: L) => string
): Promise<TreeNode<L>[]> {
  const items = await window.tinder.listDir(dir);
  const out: TreeNode<L>[] = [];
  for (const item of items) {
    if (item.isDirectory) {
      const children = await loadResourceTree(item.path, parseLeaf, leafLabel);
      out.push({ kind: "folder", id: item.path, name: item.name, children });
    } else if (item.name.endsWith(".json")) {
      try {
        const text = await window.tinder.readText(item.path);
        const data = parseLeaf(text);
        out.push({
          kind: "leaf",
          id: item.path,
          name: leafLabel(data) || item.name.replace(/\.json$/, ""),
          data
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[chain-assembly] skipping malformed resource", item.path, err);
      }
    }
  }
  return out;
}

async function loadExtras(tinderDir: string): Promise<Record<string, ProfileExtras>> {
  const extrasPath = await join(tinderDir, EXTRAS_FILE);
  try {
    const text = await window.tinder.readText(extrasPath);
    return JSON.parse(text) as Record<string, ProfileExtras>;
  } catch {
    return {};
  }
}

export async function loadFromDisk(root: string): Promise<DiskState> {
  const paths = await ensureRootStructure(root);
  const [profiles, standardTree, customTree, extras] = await Promise.all([
    loadProfiles(paths.profilesDir),
    loadResourceTree<PlatformResourceInstance>(
      paths.standardDir,
      (text) => JSON.parse(text) as PlatformResourceInstance,
      (data) => data.display_name ?? data.resource_instance_id
    ),
    loadResourceTree<CustomNodeConfig>(
      paths.customDir,
      (text) => JSON.parse(text) as CustomNodeConfig,
      (data) => data.display_name ?? data.custom_node_id
    ),
    loadExtras(paths.tinderDir)
  ]);
  return { profiles, standardTree, customTree, extras, paths };
}

export async function copyTree(src: string, dst: string): Promise<void> {
  await ensureDir(dst);
  const items = await window.tinder.listDir(src);
  for (const item of items) {
    const childDst = await join(dst, item.name);
    if (item.isDirectory) await copyTree(item.path, childDst);
    else {
      const text = await window.tinder.readText(item.path);
      await window.tinder.writeText(childDst, text);
    }
  }
}
