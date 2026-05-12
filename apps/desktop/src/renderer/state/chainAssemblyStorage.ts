import type {
  CustomNodeConfig,
  GuiProjectFile,
  PlatformResourceInstance,
  ProfileResourceRef
} from "@tinder/nextstep";
import { migrateProfileFromV1 } from "@tinder/nextstep";

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
  /** Whether each profile's `活跃资源` subsection is expanded. */
  profileActive: Record<string, boolean>;
  /** Whether each profile's `停用资源` subsection is expanded. */
  profileDisabled: Record<string, boolean>;
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
  profileActive: {},
  profileDisabled: {},
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
      profileActive: parsed.profileActive ?? {},
      profileDisabled: parsed.profileDisabled ?? {},
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

/**
 * Render-ready items for a list of v2 profile resource refs. Used by both
 * `活跃资源` and `停用资源` after the caller filters by `enabled`.
 */
export function profileResourceItems(
  refs: ProfileResourceRef[],
  standardCatalog: PlatformResourceInstance[],
  customCatalog?: CustomNodeConfig[]
): ProfileResourceItem[] {
  return refs.map((ref) => {
    if (ref.kind === "standard") {
      const found = standardCatalog.find(
        (r) => r.resource_instance_id === ref.resource_instance_id
      );
      return {
        id: profileResourceListItemId(ref),
        label: found?.display_name ?? ref.resource_instance_id,
        kind: "standard",
        source: ref.variant_id === "default" ? "extra-standard" : "binding",
        resourceId: ref.resource_instance_id
      };
    }
    const found = customCatalog?.find(
      (c) => c.custom_node_id === ref.resource_instance_id
    );
    return {
      id: profileResourceListItemId(ref),
      label: found?.display_name ?? ref.resource_instance_id,
      kind: "custom",
      source: "profile-custom",
      resourceId: ref.resource_instance_id
    };
  });
}

/**
 * Whole-profile convenience that returns items for every ref regardless of
 * `enabled`. Kept for callers that still want a flat resource list.
 */
export function profileResourceList(
  profile: GuiProjectFile,
  _extras: ProfileExtras | null,
  standardCatalog: PlatformResourceInstance[],
  customCatalog?: CustomNodeConfig[]
): ProfileResourceItem[] {
  return profileResourceItems(
    profile.resources ?? [],
    standardCatalog,
    customCatalog
  );
}

/** Stable id used by the sidebar row's React key. */
function profileResourceListItemId(ref: ProfileResourceRef): string {
  return ref.kind === "standard"
    ? `std:${ref.resource_instance_id}#${ref.variant_id}`
    : `custom:${ref.resource_instance_id}`;
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
  const [rawProfiles, standardTree, customTree, extras] = await Promise.all([
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
  // Apply lazy v1 → v2 migration so downstream code can rely on
  // `project.resources[]` being populated. Disk shape is left untouched
  // until the user explicitly saves a profile.
  const profiles = rawProfiles.map((entry) => ({
    ...entry,
    project: migrateProfileFromV1(entry.project, extras[entry.extrasKey])
  }));
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
