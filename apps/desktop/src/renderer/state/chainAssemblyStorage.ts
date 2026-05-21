import type {
  ComputeResourceBranch,
  ComputeResourceFamilyFile,
  ComputeResourceTemplate,
  ComputeResourceV2,
  CustomComputeResourceBranch,
  CustomComputeResource,
  CustomNodeConfig,
  GuiProjectFile,
  PlatformResourceInstance,
  ProfileResourceRef,
  StandardComputeResourceBranch,
  StandardComputeResource
} from "@tinder/nextstep";
import {
  branchKey,
  branchToComputeResourceV2,
  computeResourceV2ToBranches,
  computeResourceV2ToFamily,
  DEFAULT_BRANCH_ID,
  familyBranchSummary,
  isComputeResourceFamilyFile,
  migrateProfileFromV1,
  parseComputeResource,
  parseComputeResourceBranchFile,
  parseComputeResourceFamilyFile,
  profileResourceBranchId,
  projectCustomBranchToV1,
  projectCustomResourceToV1,
  projectStandardBranchToV1,
  projectStandardResourceToV1
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
  /**
   * Per-leaf v2 metadata attached during disk load. Existing chain assembly
   * consumers continue reading `data` (legacy v1 shape); the resource editor
   * (slice 3b+) reads `resource` and `packagePath` instead.
   *
   * `packagePath` is the directory containing `resource.json` for v2 packages
   * and `null` for legacy single-file resources.
   */
  resource?: ComputeResourceV2;
  packagePath?: string | null;
}
export type TreeNode<L> = FolderNode<L> | LeafNode<L>;

export interface ComputeResourceBranchEntry {
  branch: ComputeResourceBranch;
  branchDir: string;
  metadataPath: string;
}

export interface ResourceFamilyEntry {
  kind: "standard" | "custom";
  family: ComputeResourceFamilyFile;
  familyDir: string;
  metadataPath: string;
  branches: ComputeResourceBranchEntry[];
  legacyV2?: {
    sourcePath: string;
    resource: ComputeResourceV2;
    projectedBranchIds: string[];
  };
}

export interface BranchResourceIndex {
  familyByKey: Map<string, ResourceFamilyEntry>;
  branchByKey: Map<string, ComputeResourceBranchEntry>;
}

export interface ProfileExtras {
  extraStandardIds: string[];
  profileFolders?: {
    active?: string[];
    disabled?: string[];
  };
}

export type DragPayload =
  | {
      kind: "standard";
      resource: PlatformResourceInstance;
      /** Source disk path — package dir for v2, JSON file for legacy. Used
       *  by the sidebar's folder drop targets to move the resource on disk. */
      sourcePath?: string | null;
    }
  | {
      kind: "custom";
      node: CustomNodeConfig;
      sourcePath?: string | null;
    }
  | {
      kind: "profile-resource";
      profileId: string;
      item: ProfileResourceItem;
    };

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
  /**
   * Expansion state for profile-local virtual subfolders under
   * `活跃资源` / `停用资源`. Keys are `${profileId}::${section}::${folderPath}`
   * where section is `"active"` or `"disabled"`.
   */
  profileFolders: Record<string, boolean>;
  folders: Record<string, boolean>;
}

export interface DiskState {
  profiles: ProfileEntry[];
  standardTree: TreeNode<PlatformResourceInstance>[];
  customTree: TreeNode<CustomNodeConfig>[];
  resourceFamilies: {
    standard: ResourceFamilyEntry[];
    custom: ResourceFamilyEntry[];
  };
  resourceIndex: BranchResourceIndex;
  /** Keyed by profile basename (extrasKey) so it survives root rename / 另存为. */
  extras: Record<string, ProfileExtras>;
  /**
   * Resource templates available for the create-resource dialog. Combines
   * built-in templates (shipped with the app) and project templates
   * discovered under `.tinder/resource-templates/`. Built-in templates are
   * loaded by the consumer (chain assembly context) and merged before this
   * shape leaves the renderer.
   */
  templates: ComputeResourceTemplate[];
  paths: {
    tinderDir: string;
    profilesDir: string;
    standardDir: string;
    customDir: string;
    templatesDir: string;
  };
}

export interface ProfileResourceItem {
  id: string;
  label: string;
  kind: "standard" | "custom";
  source: "binding" | "extra-standard" | "profile-custom";
  resourceId: string;
  branchId: string;
  /** Mirrors the underlying `ProfileResourceRef.enabled` so menus can show the right action. */
  enabled: boolean;
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
  profileFolders: {},
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
      profileFolders: parsed.profileFolders ?? {},
      folders: parsed.folders ?? {}
    };
  } catch {
    return INITIAL_COLLAPSE;
  }
}

/** Build the localStorage key for a profile subfolder's open/closed flag. */
export function profileFolderKey(
  profileId: string,
  section: "active" | "disabled",
  folderPath: string
): string {
  return `${profileId}::${section}::${folderPath}`;
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
      const branchId = profileResourceBranchId(ref);
      const baseLabel = found?.display_name ?? ref.resource_instance_id;
      return {
        id: profileResourceListItemId(ref),
        label: `${baseLabel} · ${branchId}`,
        kind: "standard",
        source: branchId === "default" ? "extra-standard" : "binding",
        resourceId: ref.resource_instance_id,
        branchId,
        enabled: ref.enabled
      };
    }
    const found = customCatalog?.find(
      (c) => c.custom_node_id === ref.resource_instance_id
    );
    const branchId = profileResourceBranchId(ref);
    const baseLabel = found?.display_name ?? ref.resource_instance_id;
    return {
      id: profileResourceListItemId(ref),
      label: `${baseLabel} · ${branchId}`,
      kind: "custom",
      source: "profile-custom",
      resourceId: ref.resource_instance_id,
      branchId,
      enabled: ref.enabled
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
  return `${ref.kind}:${ref.resource_instance_id}`;
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
/** Canonical metadata file inside a v2 resource package directory. */
export const RESOURCE_PACKAGE_FILE = "resource.json";
/** Branch-aware package layout. */
export const RESOURCE_BRANCHES_DIR = "branches";
export const RESOURCE_BRANCH_FILE = "branch.json";
export const LEGACY_BACKUP_DIR = "_legacy-backup";
export const LEGACY_V2_RESOURCE_FILE = "resource.v2.json";
/** Subdirectories created in new resource packages. */
export const RESOURCE_SRC_DIR = "src";
export const RESOURCE_INCLUDE_DIR = "include";
export const RESOURCE_ARTIFACT_DIR = "artifact";
/** Project-template store. */
export const RESOURCE_TEMPLATES_DIR = "resource-templates";

export async function join(...segs: string[]): Promise<string> {
  return window.tinder.joinPath(...segs);
}
export async function pathExists(p: string): Promise<boolean> {
  return window.tinder.exists(p);
}
export async function ensureDir(p: string): Promise<void> {
  if (await window.tinder.exists(p)) return;
  await window.tinder.createDir(p);
}
export async function ensureRootStructure(root: string): Promise<{
  tinderDir: string;
  profilesDir: string;
  standardDir: string;
  customDir: string;
  templatesDir: string;
}> {
  const tinderDir = await join(root, TINDER_DIR);
  const profilesDir = await join(tinderDir, PROFILES_DIR);
  const resourcesDir = await join(tinderDir, RESOURCES_DIR);
  const standardDir = await join(resourcesDir, STANDARD_DIR);
  const customDir = await join(resourcesDir, CUSTOM_DIR);
  const templatesDir = await join(tinderDir, RESOURCE_TEMPLATES_DIR);
  await ensureDir(tinderDir);
  await ensureDir(profilesDir);
  await ensureDir(resourcesDir);
  await ensureDir(standardDir);
  await ensureDir(customDir);
  // templatesDir is *not* eagerly created — keeping it absent until the user
  // saves their first project template avoids polluting fresh roots with
  // empty directories.
  return { tinderDir, profilesDir, standardDir, customDir, templatesDir };
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

/**
 * Cheap probe: a v2 resource package is a directory that directly contains
 * `resource.json`. We check by attempting a read; absence is treated as
 * "not a package" and the caller continues recursing as a virtual folder.
 */
async function readResourcePackageFile(
  dirPath: string
): Promise<string | null> {
  const candidate = await join(dirPath, RESOURCE_PACKAGE_FILE);
  try {
    return await window.tinder.tryReadText(candidate);
  } catch {
    return null;
  }
}

function dirname(p: string): string {
  const idx = Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/"));
  return idx >= 0 ? p.slice(0, idx) : "";
}

async function branchMetadataPath(branchDir: string): Promise<string> {
  return join(branchDir, RESOURCE_BRANCH_FILE);
}

function buildResourceIndex(
  standard: ResourceFamilyEntry[],
  custom: ResourceFamilyEntry[]
): BranchResourceIndex {
  const familyByKey = new Map<string, ResourceFamilyEntry>();
  const branchByKey = new Map<string, ComputeResourceBranchEntry>();
  for (const entry of [...standard, ...custom]) {
    familyByKey.set(`${entry.kind}:${entry.family.resource_instance_id}`, entry);
    for (const branch of entry.branches) {
      branchByKey.set(
        branchKey(entry.kind, entry.family.resource_instance_id, branch.branch.branch_id),
        branch
      );
    }
  }
  return { familyByKey, branchByKey };
}

function legacyV2Entry(
  kind: "standard" | "custom",
  sourcePath: string,
  resource: ComputeResourceV2
): ResourceFamilyEntry {
  const family = computeResourceV2ToFamily(resource);
  const branches = computeResourceV2ToBranches(resource).map((branch) => ({
    branch,
    branchDir: sourcePath.endsWith(".json") ? dirname(sourcePath) : sourcePath,
    metadataPath: sourcePath
  }));
  return {
    kind,
    family,
    familyDir: sourcePath.endsWith(".json") ? dirname(sourcePath) : sourcePath,
    metadataPath: sourcePath,
    branches,
    legacyV2: {
      sourcePath,
      resource,
      projectedBranchIds: branches.map((b) => b.branch.branch_id)
    }
  };
}

async function readBranchEntries(
  familyDir: string,
  family: ComputeResourceFamilyFile
): Promise<ComputeResourceBranchEntry[]> {
  const branchesDir = await join(familyDir, RESOURCE_BRANCHES_DIR);
  const out: ComputeResourceBranchEntry[] = [];
  for (const summary of family.branches) {
    const branchDir = await join(branchesDir, summary.branch_id);
    const metadataPath = await branchMetadataPath(branchDir);
    try {
      const text = await window.tinder.readText(metadataPath);
      const branch = parseComputeResourceBranchFile(text);
      out.push({ branch, branchDir, metadataPath });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[chain-assembly] skipping malformed branch", metadataPath, err);
    }
  }
  return out;
}

async function loadResourceFamilies(
  dir: string,
  kind: "standard" | "custom"
): Promise<ResourceFamilyEntry[]> {
  const items = await window.tinder.listDir(dir);
  const out: ResourceFamilyEntry[] = [];
  for (const item of items) {
    if (item.isDirectory) {
      const packageText = await readResourcePackageFile(item.path);
      if (packageText !== null) {
        try {
          const parsed = JSON.parse(packageText) as unknown;
          const metadataPath = await join(item.path, RESOURCE_PACKAGE_FILE);
          if (isComputeResourceFamilyFile(parsed)) {
            const family = parseComputeResourceFamilyFile(packageText);
            out.push({
              kind,
              family,
              familyDir: item.path,
              metadataPath,
              branches: await readBranchEntries(item.path, family)
            });
          } else {
            const resource = parseComputeResource(packageText, kind);
            out.push(legacyV2Entry(kind, item.path, resource));
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn("[chain-assembly] skipping malformed resource family", item.path, err);
        }
        continue;
      }
      out.push(...(await loadResourceFamilies(item.path, kind)));
    } else if (item.name.endsWith(".json")) {
      try {
        const text = await window.tinder.readText(item.path);
        const resource = parseComputeResource(text, kind);
        out.push(legacyV2Entry(kind, item.path, resource));
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[chain-assembly] skipping malformed legacy resource", item.path, err);
      }
    }
  }
  return out;
}

/**
 * Builds the legacy-shape sidebar tree from `.tinder/resources/<kind>/`.
 *
 * Each leaf can come from one of two on-disk shapes:
 *
 * 1. Legacy single file: `<kind>/<id>.json` parsed directly as v1.
 * 2. v2 package: `<kind>/<id>/resource.json` parsed as `ComputeResourceV2`,
 *    then down-projected to v1 so the existing sidebar/chain projection code
 *    keeps working. The leaf also carries the parsed v2 object and
 *    `packagePath` so the resource editor can reload the same source.
 *
 * Virtual subfolders (sidebar grouping) are still supported: a directory
 * without `resource.json` is treated as a folder and recursed into.
 */
async function loadResourceTree<L>(
  dir: string,
  kind: "standard" | "custom",
  projectV2: (resource: ComputeResourceV2) => L,
  parseV1: (text: string) => L,
  leafLabel: (data: L) => string
): Promise<TreeNode<L>[]> {
  const items = await window.tinder.listDir(dir);
  const out: TreeNode<L>[] = [];
  for (const item of items) {
    if (item.isDirectory) {
      const packageText = await readResourcePackageFile(item.path);
      if (packageText !== null) {
        try {
          const parsed = JSON.parse(packageText) as unknown;
          if (isComputeResourceFamilyFile(parsed)) {
            const family = parseComputeResourceFamilyFile(packageText);
            const branches = await readBranchEntries(item.path, family);
            const selected =
              branches.find((b) => b.branch.branch_id === family.default_branch_id) ??
              branches[0];
            if (!selected) {
              continue;
            }
            const resource = branchToComputeResourceV2(family, selected.branch);
            const data =
              kind === "standard"
                ? (projectStandardBranchToV1(
                    family,
                    selected.branch as StandardComputeResourceBranch
                  ) as L)
                : (projectCustomBranchToV1(
                    family,
                    selected.branch as CustomComputeResourceBranch
                  ) as L);
            out.push({
              kind: "leaf",
              id: item.path,
              name: leafLabel(data) || family.display_name || item.name,
              data,
              resource,
              packagePath: item.path
            });
            continue;
          }
          const resource = parseComputeResource(packageText, kind);
          const data = projectV2(resource);
          out.push({
            kind: "leaf",
            id: item.path,
            name: leafLabel(data) || resource.display_name || item.name,
            data,
            resource,
            packagePath: item.path
          });
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn(
            "[chain-assembly] skipping malformed resource package",
            item.path,
            err
          );
        }
        continue;
      }
      // Not a package — treat as a virtual subfolder and recurse.
      const children = await loadResourceTree(
        item.path,
        kind,
        projectV2,
        parseV1,
        leafLabel
      );
      out.push({ kind: "folder", id: item.path, name: item.name, children });
    } else if (item.name.endsWith(".json")) {
      try {
        const text = await window.tinder.readText(item.path);
        const data = parseV1(text);
        let resource: ComputeResourceV2 | undefined;
        try {
          resource = parseComputeResource(text, kind);
        } catch {
          resource = undefined;
        }
        out.push({
          kind: "leaf",
          id: item.path,
          name: leafLabel(data) || item.name.replace(/\.json$/, ""),
          data,
          resource,
          packagePath: null
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
  // Silent on ENOENT — the extras file is created lazily on first write.
  const text = await window.tinder.tryReadText(extrasPath);
  if (text === null) return {};
  try {
    return JSON.parse(text) as Record<string, ProfileExtras>;
  } catch {
    return {};
  }
}

/**
 * Load project-scope resource templates from `.tinder/resource-templates/`.
 * Each file is a single template JSON; malformed entries are skipped with
 * a warning so one broken template can't block the whole pane.
 *
 * The `source` field is forced to `"project"` regardless of what the file
 * declares — built-in templates come from a different code path and the
 * editor uses this field for the source badge.
 */
export async function loadResourceTemplates(
  templatesDir: string
): Promise<ComputeResourceTemplate[]> {
  // tryListDir returns null when the directory hasn't been created yet
  // (e.g. fresh workspace before the first `另存为模板`). Treat that the
  // same as an empty directory.
  const items = await window.tinder.tryListDir(templatesDir);
  if (!items) return [];
  const out: ComputeResourceTemplate[] = [];
  for (const item of items) {
    if (item.isDirectory || !item.name.endsWith(".json")) continue;
    try {
      const text = await window.tinder.readText(item.path);
      const parsed = JSON.parse(text) as ComputeResourceTemplate;
      out.push({ ...parsed, source: "project" });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        "[chain-assembly] skipping malformed resource template",
        item.path,
        err
      );
    }
  }
  return out;
}

export async function loadFromDisk(
  root: string,
  builtInTemplates: ComputeResourceTemplate[] = []
): Promise<DiskState> {
  const paths = await ensureRootStructure(root);
  const [
    rawProfiles,
    standardTree,
    customTree,
    standardFamilies,
    customFamilies,
    extras,
    projectTemplates
  ] = await Promise.all([
    loadProfiles(paths.profilesDir),
    loadResourceTree<PlatformResourceInstance>(
      paths.standardDir,
      "standard",
      (resource) =>
        projectStandardResourceToV1(resource as StandardComputeResource),
      (text) => JSON.parse(text) as PlatformResourceInstance,
      (data) => data.display_name ?? data.resource_instance_id
    ),
    loadResourceTree<CustomNodeConfig>(
      paths.customDir,
      "custom",
      (resource) =>
        projectCustomResourceToV1(resource as CustomComputeResource),
      (text) => JSON.parse(text) as CustomNodeConfig,
      (data) => data.display_name ?? data.custom_node_id
    ),
    loadResourceFamilies(paths.standardDir, "standard"),
    loadResourceFamilies(paths.customDir, "custom"),
    loadExtras(paths.tinderDir),
    loadResourceTemplates(paths.templatesDir)
  ]);
  // Apply lazy v1 → v2 migration so downstream code can rely on
  // `project.resources[]` being populated. Disk shape is left untouched
  // until the user explicitly saves a profile.
  const profiles = rawProfiles.map((entry) => ({
    ...entry,
    project: migrateProfileFromV1(entry.project, extras[entry.extrasKey])
  }));
  // Project templates win on conflict with the same `template_id` — matches
  // the dev-docs decision (R21): project layer overrides built-in.
  const projectIds = new Set(projectTemplates.map((t) => t.template_id));
  const templates: ComputeResourceTemplate[] = [
    ...builtInTemplates
      .filter((t) => !projectIds.has(t.template_id))
      .map((t) => ({ ...t, source: "built_in" as const })),
    ...projectTemplates
  ];
  return {
    profiles,
    standardTree,
    customTree,
    resourceFamilies: {
      standard: standardFamilies,
      custom: customFamilies
    },
    resourceIndex: buildResourceIndex(standardFamilies, customFamilies),
    extras,
    templates,
    paths
  };
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

// ─────────────────────────────────────────────────────────────────────────────
// v2 resource package read/write
//
// Persistence helpers used by the compute resource editor. Kept independent
// of `loadResourceTree` so the resource editor can read/write a single
// resource without touching the sidebar's projection cache.
// ─────────────────────────────────────────────────────────────────────────────

/** Absolute path of `.tinder/resources/<kind>/<resource_instance_id>`. */
export async function resourcePackageDir(
  paths: DiskState["paths"],
  kind: "standard" | "custom",
  resourceInstanceId: string
): Promise<string> {
  const root = kind === "standard" ? paths.standardDir : paths.customDir;
  return await join(root, resourceInstanceId);
}

/** Absolute path of the `resource.json` inside a package directory. */
export async function resourcePackageMetadataPath(
  packageDir: string
): Promise<string> {
  return await join(packageDir, RESOURCE_PACKAGE_FILE);
}

/**
 * Read and parse a v2 resource package from `<packageDir>/resource.json`.
 * Caller must ensure the package directory exists; legacy single-file
 * resources should go through `readLegacyResourceFile` instead.
 */
export async function readResourcePackage(
  packageDir: string,
  kind: "standard" | "custom"
): Promise<ComputeResourceV2> {
  const metadataPath = await resourcePackageMetadataPath(packageDir);
  const text = await window.tinder.readText(metadataPath);
  return parseComputeResource(text, kind);
}

/**
 * Read a legacy single-file resource JSON (`.tinder/resources/<kind>/x.json`)
 * and return its v2 in-memory shape.
 */
export async function readLegacyResourceFile(
  filePath: string,
  kind: "standard" | "custom"
): Promise<ComputeResourceV2> {
  const text = await window.tinder.readText(filePath);
  return parseComputeResource(text, kind);
}

/**
 * Walk both standard and custom resource trees and return every leaf that
 * carries a parsed v2 `ComputeResourceV2`. Useful for cross-resource
 * validation such as global `action_index` allocation.
 */
export function collectV2Resources(disk: DiskState): ComputeResourceV2[] {
  const out: ComputeResourceV2[] = [];
  function walk<L>(nodes: TreeNode<L>[]): void {
    for (const node of nodes) {
      if (node.kind === "folder") walk(node.children);
      else if (node.resource) out.push(node.resource);
    }
  }
  walk(disk.standardTree);
  walk(disk.customTree);
  return out;
}

export function collectProjectV2Resources(disk: DiskState): ComputeResourceV2[] {
  const out: ComputeResourceV2[] = [];
  for (const family of [
    ...disk.resourceFamilies.standard,
    ...disk.resourceFamilies.custom
  ]) {
    for (const entry of family.branches) {
      out.push(branchToComputeResourceV2(family.family, entry.branch));
    }
  }
  // Include old tree leaves that are not represented by the branch-aware
  // index, mainly malformed/legacy edge cases kept for compatibility.
  const seen = new Set(
    out.map((r) => `${r.resource_kind}:${r.resource_instance_id}`)
  );
  for (const resource of collectV2Resources(disk)) {
    const key = `${resource.resource_kind}:${resource.resource_instance_id}`;
    if (!seen.has(key)) out.push(resource);
  }
  return out;
}

export function collectProfileV2Resources(
  disk: DiskState,
  profile: GuiProjectFile
): ComputeResourceV2[] {
  const out: ComputeResourceV2[] = [];
  const fallback = collectV2Resources(disk);
  for (const ref of profile.resources ?? []) {
    const branchId = profileResourceBranchId(ref);
    const branch = disk.resourceIndex.branchByKey.get(
      branchKey(ref.kind, ref.resource_instance_id, branchId)
    );
    const family = disk.resourceIndex.familyByKey.get(
      `${ref.kind}:${ref.resource_instance_id}`
    );
    if (branch && family) {
      out.push(
        branchToComputeResourceV2(family.family, branch.branch, {
          effectiveCandidateOverrides:
            ref.kind === "standard"
              ? ref.overrides?.effective_candidates
              : undefined
        })
      );
      continue;
    }
    const legacy = fallback.find(
      (r) => r.resource_kind === ref.kind && r.resource_instance_id === ref.resource_instance_id
    );
    if (legacy) out.push(legacy);
  }
  return out;
}

/**
 * Action indexes already claimed across all known sources:
 * - branch-aware custom resources' `custom_nodes[].action_index`
 * - v2 custom resources' `custom_nodes[].action_index`
 * - legacy v1 single-file custom resources' `action_index`
 * - profile-embedded `custom_nodes[].action_index`
 *
 * Skips entries for an optional `excludeResourceInstanceId` so the resource
 * editor can exclude its own current draft from the global pool while
 * computing the next free index.
 */
export function collectAllCustomActionIndexes(
  disk: DiskState,
  excludeResourceInstanceId?: string
): Set<number> {
  const used = new Set<number>();
  for (const family of disk.resourceFamilies.custom) {
    if (family.family.resource_instance_id === excludeResourceInstanceId) {
      continue;
    }
    for (const entry of family.branches) {
      if (entry.branch.resource_kind !== "custom") continue;
      for (const node of entry.branch.custom_nodes) {
        if (typeof node.action_index === "number") used.add(node.action_index);
      }
    }
  }
  for (const resource of collectV2Resources(disk)) {
    if (resource.resource_kind !== "custom") continue;
    if (resource.resource_instance_id === excludeResourceInstanceId) continue;
    for (const node of (resource as CustomComputeResource).custom_nodes) {
      if (typeof node.action_index === "number") used.add(node.action_index);
    }
  }
  // Legacy v1 custom leaves without a v2 resource attached.
  for (const leaf of flattenLeaves(disk.customTree)) {
    if (
      leaf.resource_instance_id === excludeResourceInstanceId ||
      leaf.custom_node_id === excludeResourceInstanceId
    ) {
      continue;
    }
    if (typeof leaf.action_index === "number") used.add(leaf.action_index);
  }
  for (const profile of disk.profiles) {
    for (const node of profile.project.custom_nodes) {
      if (typeof node.action_index === "number") used.add(node.action_index);
    }
  }
  return used;
}

/**
 * Create the package directory layout and write `resource.json`. Sibling
 * `src/`, `include/`, and `artifact/` subdirectories are created lazily so
 * draft resources without source files don't pollute the tree.
 *
 * Returns the absolute path of the written `resource.json`.
 */
export async function writeResourcePackage(
  paths: DiskState["paths"],
  resource: ComputeResourceV2,
  options: { ensureSubdirs?: boolean } = {}
): Promise<{ packageDir: string; metadataPath: string }> {
  const kind: "standard" | "custom" = resource.resource_kind;
  const packageDir = await resourcePackageDir(
    paths,
    kind,
    resource.resource_instance_id
  );
  await ensureDir(packageDir);
  if (options.ensureSubdirs) {
    await ensureDir(await join(packageDir, RESOURCE_SRC_DIR));
    await ensureDir(await join(packageDir, RESOURCE_INCLUDE_DIR));
    await ensureDir(await join(packageDir, RESOURCE_ARTIFACT_DIR));
  }
  const metadataPath = await resourcePackageMetadataPath(packageDir);
  await window.tinder.writeText(metadataPath, JSON.stringify(resource, null, 2));
  return { packageDir, metadataPath };
}
