import { useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  CustomNodeConfig,
  PlatformResourceInstance,
  ProfileResourceFolder
} from "@tinder/nextstep";
import {
  profileResourceRefKey,
  profileResourcesByFolder,
  validateProject
} from "@tinder/nextstep";
import { ContextMenu, useContextMenu, type ContextMenuItem } from "./ContextMenu";
import { useCa } from "../state/ChainAssemblyContext";
import {
  basenameNoExt,
  dragState,
  flattenLeaves,
  profileFolderKey,
  profileResourceItems,
  type CollapseState,
  type DragPayload,
  type FolderNode,
  type LeafNode,
  type ProfileEntry,
  type ProfileResourceItem,
  type TreeNode
} from "../state/chainAssemblyStorage";
import {
  buildChainProjection,
  type ChainProjectionRow
} from "../state/chainProjection";
import { useWorkspace } from "../state/WorkspaceContext";
import { useChainHelp } from "../help/ChainHelpContext";

// ─────────────────────────────────────────────────────────────────────────────
// Drop zone — wraps the "资源" row + (when expanded) its children
// ─────────────────────────────────────────────────────────────────────────────

function DropZone({
  onDrop,
  children
}: {
  onDrop: (payload: DragPayload) => void;
  children: ReactNode;
}) {
  const [over, setOver] = useState(false);
  // Each event handler calls stopPropagation so nested drop zones (subfolders
  // inside section roots) own the most specific drop. Without it, the outer
  // zone would also fire and override the inner zone's intended folder.
  return (
    <div
      className={`ca-drop-zone${over ? " is-drop-over" : ""}`}
      onDragOver={(e) => {
        if (!dragState.value) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragEnter={(e) => {
        if (!dragState.value) return;
        e.stopPropagation();
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        if (dragState.value) onDrop(dragState.value);
        dragState.value = null;
      }}
    >
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// View body
// ─────────────────────────────────────────────────────────────────────────────

export function ChainAssemblyView() {
  const ca = useCa();
  const cm = useContextMenu();
  const { setActiveView } = useWorkspace();
  const help = useChainHelp();
  const { dataRoot, disk, loading, loadError, collapse, setCollapse } = ca;

  const flatStandard = useMemo(
    () => (disk ? flattenLeaves(disk.standardTree) : []),
    [disk]
  );
  const flatCustom = useMemo(
    () => (disk ? flattenLeaves(disk.customTree) : []),
    [disk]
  );

  const openChainNodeInHelp = (nodeId: string) => {
    help.selectNode(nodeId);
    setActiveView("help");
  };
  const activeProfile = useMemo(
    () => disk?.profiles.find((p) => p.id === ca.activeProfileId) ?? null,
    [disk, ca.activeProfileId]
  );

  useEffect(() => {
    if (!activeProfile) return;
    const issues = validateProject(activeProfile.project, null);
    // eslint-disable-next-line no-console
    console.log("[chain-assembly] validateProject", activeProfile.id, issues);
  }, [activeProfile]);

  const toggleSection = (key: keyof CollapseState["sections"]) =>
    setCollapse((prev) => ({
      ...prev,
      sections: { ...prev.sections, [key]: !prev.sections[key] }
    }));
  const toggleStandardSub = () =>
    setCollapse((prev) => ({ ...prev, standardSub: !prev.standardSub }));
  const toggleCustomSub = () =>
    setCollapse((prev) => ({ ...prev, customSub: !prev.customSub }));
  const toggleFolder = (id: string) =>
    setCollapse((prev) => ({
      ...prev,
      folders: { ...(prev.folders ?? {}), [id]: !prev.folders?.[id] }
    }));
  const toggleProfile = (id: string) => {
    setCollapse((prev) => ({
      ...prev,
      profiles: { ...(prev.profiles ?? {}), [id]: !prev.profiles?.[id] }
    }));
    ca.setActiveProfileId(id);
  };
  const toggleProfileActive = (id: string) =>
    setCollapse((prev) => ({
      ...prev,
      profileActive: { ...prev.profileActive, [id]: !prev.profileActive[id] }
    }));
  const toggleProfileDisabled = (id: string) =>
    setCollapse((prev) => ({
      ...prev,
      profileDisabled: { ...prev.profileDisabled, [id]: !prev.profileDisabled[id] }
    }));
  const toggleProfileFolder = (
    profileId: string,
    section: "active" | "disabled",
    folderPath: string
  ) => {
    const key = profileFolderKey(profileId, section, folderPath);
    setCollapse((prev) => ({
      ...prev,
      profileFolders: { ...prev.profileFolders, [key]: !prev.profileFolders[key] }
    }));
  };
  const toggleProfileUsage = (id: string) =>
    setCollapse((prev) => ({
      ...prev,
      profileUsage: { ...prev.profileUsage, [id]: !prev.profileUsage[id] }
    }));
  const toggleProfileChain = (id: string) =>
    setCollapse((prev) => ({
      ...prev,
      profileChain: { ...prev.profileChain, [id]: !prev.profileChain[id] }
    }));

  const profileMenu = (e: React.MouseEvent, profile: ProfileEntry): void => {
    cm.open(e, [
      { id: "rename", label: "重命名…", run: () => ca.renameProfileById(profile) },
      { separator: true },
      { id: "delete", label: "删除", run: () => ca.deleteProfileById(profile) }
    ]);
  };
  const folderMenu = (e: React.MouseEvent, folder: FolderNode<unknown>): void => {
    cm.open(e, [
      { id: "rename", label: "重命名…", run: () => ca.renameFolder(folder) },
      { separator: true },
      { id: "delete", label: "删除", run: () => ca.deleteFolder(folder) }
    ]);
  };
  const joinProfileMenuItems = (
    payload: DragPayload
  ): ContextMenuItem[] => {
    const profileId = ca.activeProfileId;
    if (!profileId) {
      return [{ id: "join-disabled", label: "加入档案（需先选中档案）", disabled: true }];
    }
    return [
      {
        id: "join-active",
        label: "加入档案 / 活跃资源",
        run: () => ca.dropToProfile(profileId, payload, true)
      },
      {
        id: "join-disabled",
        label: "加入档案 / 停用资源",
        run: () => ca.dropToProfile(profileId, payload, false)
      }
    ];
  };
  const standardLeafMenu = (
    e: React.MouseEvent,
    leaf: LeafNode<PlatformResourceInstance>
  ): void => {
    cm.open(e, [
      ...joinProfileMenuItems({ kind: "standard", resource: leaf.data }),
      { separator: true },
      { id: "rename", label: "重命名…", run: () => ca.renameLeaf("standard", leaf) },
      { separator: true },
      { id: "delete", label: "删除", run: () => ca.deleteLeaf(leaf.id, leaf.name) }
    ]);
  };
  const customLeafMenu = (e: React.MouseEvent, leaf: LeafNode<CustomNodeConfig>): void => {
    cm.open(e, [
      ...joinProfileMenuItems({ kind: "custom", node: leaf.data }),
      { separator: true },
      { id: "rename", label: "重命名…", run: () => ca.renameLeaf("custom", leaf) },
      { separator: true },
      { id: "delete", label: "删除", run: () => ca.deleteLeaf(leaf.id, leaf.name) }
    ]);
  };
  const profileResourceMenu = (
    e: React.MouseEvent,
    profileId: string,
    item: ProfileResourceItem,
    currentFolder: string
  ): ContextMenuItem[] | void => {
    const toggle: ContextMenuItem = item.enabled
      ? {
          id: "deactivate",
          label: "停用",
          run: () => ca.setProfileResourceEnabled(profileId, item, false)
        }
      : {
          id: "activate",
          label: "激活",
          run: () => ca.setProfileResourceEnabled(profileId, item, true)
        };
    const items: ContextMenuItem[] = [toggle];
    if (item.kind === "custom" && item.enabled) {
      const customLeaf = flatCustom.find(
        (c) => (c.resource_instance_id ?? c.custom_node_id) === item.resourceId
      );
      const nodeId = customLeaf?.node_id ?? customLeaf?.custom_node_id ?? item.resourceId;
      items.push({
        id: "add-to-chain",
        label: "添加到链路…",
        run: () => ca.promptAddCustomUsage(profileId, item.resourceId, nodeId)
      });
    }
    items.push({
      id: "move",
      label: "移到…",
      run: () => ca.promptMoveResourceFolder(profileId, item, currentFolder)
    });
    items.push({ separator: true });
    items.push({
      id: "delete",
      label: "从档案中移除",
      run: () => ca.removeFromProfile(profileId, item)
    });
    cm.open(e, items);
  };

  const customUsageMenu = (
    e: React.MouseEvent,
    profileId: string,
    row: ChainProjectionRow & { kind: "custom" }
  ): void => {
    const items: ContextMenuItem[] = [
      {
        id: "up",
        label: "上移",
        run: () => ca.shiftCustomUsage(profileId, row.arrayIndex, -1)
      },
      {
        id: "down",
        label: "下移",
        run: () => ca.shiftCustomUsage(profileId, row.arrayIndex, 1)
      },
      {
        id: "move",
        label: "移到锚点…",
        run: () => ca.promptMoveCustomUsage(profileId, row.arrayIndex)
      },
      { separator: true },
      row.usage.enabled
        ? {
            id: "disable",
            label: "停用",
            run: () => ca.setCustomUsageEnabled(profileId, row.arrayIndex, false)
          }
        : {
            id: "enable",
            label: "激活",
            run: () => ca.setCustomUsageEnabled(profileId, row.arrayIndex, true)
          },
      {
        id: "remove",
        label: "移出链路",
        run: () => ca.removeCustomUsage(profileId, row.arrayIndex)
      }
    ];
    cm.open(e, items);
  };

  const renderResourceTree = <L,>(
    nodes: TreeNode<L>[],
    depth: number,
    where: "standard" | "custom",
    makeDragPayload: (data: L) => DragPayload,
    leafMenu: (e: React.MouseEvent, leaf: LeafNode<L>) => void
  ): ReactNode => {
    return nodes.map((node) => {
      if (node.kind === "leaf") {
        return (
          <Row
            key={node.id}
            depth={depth}
            label={node.name}
            onClick={() => {}}
            draggable
            dragPayload={makeDragPayload(node.data)}
            onContextMenu={(e) => leafMenu(e, node)}
          />
        );
      }
      const open = collapse.folders?.[node.id] ?? false;
      return (
        <div key={node.id}>
          <Row
            depth={depth}
            label={node.name}
            expandable
            expanded={open}
            onClick={() => toggleFolder(node.id)}
            onContextMenu={(e) => folderMenu(e, node as FolderNode<unknown>)}
            actions={[
              {
                id: `new-folder-${node.id}`,
                icon: "new-folder",
                title: "新建子目录",
                onClick: () => ca.promptNewFolder(where, node.id)
              }
            ]}
          />
          {open &&
            renderResourceTree(node.children, depth + 1, where, makeDragPayload, leafMenu)}
        </div>
      );
    });
  };

  if (!dataRoot) {
    return (
      <div className="ca-empty">
        <p className="sidebar-hint">尚未选择数据根目录。</p>
        <button className="primary-button" onClick={ca.pickDataRoot}>
          选择数据根目录
        </button>
      </div>
    );
  }

  return (
    <div className="chain-assembly">
      {loadError && <div className="ca-error">{loadError}</div>}
      {loading && !disk && <div className="sidebar-hint" style={{ padding: 16 }}>加载中…</div>}

      {disk && (
        <>
          <Section
            title="配置档案"
            expanded={collapse.sections.profiles}
            onToggle={() => toggleSection("profiles")}
            actions={[
              { id: "new-profile", icon: "add", title: "新建配置档案", onClick: ca.newProfile },
              { id: "refresh", icon: "refresh", title: "刷新", onClick: ca.reload }
            ]}
          >
            {disk.profiles.map((profile) => {
              const expanded = collapse.profiles?.[profile.id] ?? false;
              const isActive = profile.id === ca.activeProfileId;
              const activeOpen = collapse.profileActive[profile.id] ?? false;
              const disabledOpen = collapse.profileDisabled[profile.id] ?? false;
              const refs = profile.project.resources ?? [];
              const activeRefs = refs.filter((r) => r.enabled);
              const disabledRefs = refs.filter((r) => !r.enabled);

              // Build item lookup tables keyed by ref so the recursive folder
              // walker can resolve label/menu data per ref without re-running
              // the full mapping for each render branch.
              const buildItemMap = (subset: typeof refs) => {
                const items = profileResourceItems(subset, flatStandard);
                const map = new Map<string, ProfileResourceItem>();
                subset.forEach((ref, i) => {
                  const item = items[i];
                  if (item) map.set(profileResourceRefKey(ref), item);
                });
                return map;
              };
              const activeItemMap = buildItemMap(activeRefs);
              const disabledItemMap = buildItemMap(disabledRefs);

              const activeRoot = profileResourcesByFolder(activeRefs);
              const disabledRoot = profileResourcesByFolder(disabledRefs);
              const chainOpen = collapse.profileChain[profile.id] ?? false;
              const projection = chainOpen
                ? buildChainProjection(profile.project, flatStandard, flatCustom)
                : null;

              return (
                <div key={profile.id}>
                  <Row
                    depth={0}
                    label={profile.name}
                    expandable
                    expanded={expanded}
                    active={isActive}
                    onClick={() => toggleProfile(profile.id)}
                    onContextMenu={(e) => profileMenu(e, profile)}
                  />
                  {expanded && (
                    <>
                      <Row
                        depth={1}
                        label="链路"
                        expandable
                        expanded={chainOpen}
                        onClick={() => toggleProfileChain(profile.id)}
                      />
                      {chainOpen &&
                        projection!.map((row, idx) =>
                          renderChainProjectionRow(
                            row,
                            idx,
                            openChainNodeInHelp,
                            (e, r) => customUsageMenu(e, profile.id, r)
                          )
                        )}
                      <DropZone
                        onDrop={(payload) =>
                          ca.dropToProfile(profile.id, payload, true)
                        }
                      >
                        <Row
                          depth={1}
                          label="活跃资源"
                          expandable
                          expanded={activeOpen}
                          onClick={() => toggleProfileActive(profile.id)}
                        />
                        {activeOpen && renderProfileFolderContents(
                          activeRoot,
                          2,
                          profile.id,
                          "active",
                          true,
                          activeItemMap,
                          collapse.profileFolders,
                          toggleProfileFolder,
                          profileResourceMenu,
                          ca.dropToProfile
                        )}
                      </DropZone>
                      <DropZone
                        onDrop={(payload) =>
                          ca.dropToProfile(profile.id, payload, false)
                        }
                      >
                        <Row
                          depth={1}
                          label="停用资源"
                          expandable
                          expanded={disabledOpen}
                          onClick={() => toggleProfileDisabled(profile.id)}
                        />
                        {disabledOpen && renderProfileFolderContents(
                          disabledRoot,
                          2,
                          profile.id,
                          "disabled",
                          false,
                          disabledItemMap,
                          collapse.profileFolders,
                          toggleProfileFolder,
                          profileResourceMenu,
                          ca.dropToProfile
                        )}
                      </DropZone>
                      <Row
                        depth={1}
                        label="使用与版本"
                        expandable
                        expanded={collapse.profileUsage[profile.id] ?? false}
                        onClick={() => toggleProfileUsage(profile.id)}
                      />
                      {(collapse.profileUsage[profile.id] ?? false) && (
                        <>
                          <Row
                            depth={2}
                            label={`路径：${basenameNoExt(profile.id) || "(无)"}`}
                            hint={profile.id}
                            onClick={() => ca.revealProfileInOs(profile)}
                          />
                          <Row
                            depth={2}
                            label={`Schema：v${profile.project.version ?? 1}`}
                            muted
                            onClick={() => {}}
                          />
                          <Row
                            depth={2}
                            label="创建副本…"
                            onClick={() => ca.duplicateProfile(profile)}
                          />
                          <Row
                            depth={2}
                            label="重命名…"
                            onClick={() => ca.renameProfileById(profile)}
                          />
                          <Row
                            depth={2}
                            label="在文件管理器中显示"
                            onClick={() => ca.revealProfileInOs(profile)}
                          />
                          <Row
                            depth={2}
                            label="删除档案"
                            onClick={() => ca.deleteProfileById(profile)}
                          />
                        </>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </Section>

          <Section
            title="计算实例"
            expanded={collapse.sections.resources}
            onToggle={() => toggleSection("resources")}
          >
            <Row
              depth={0}
              label="标准"
              expandable
              expanded={collapse.standardSub}
              onClick={toggleStandardSub}
              actions={[
                {
                  id: "new-standard",
                  icon: "add",
                  title: "新建标准实例",
                  onClick: ca.newStandardInstance
                },
                {
                  id: "new-standard-folder",
                  icon: "new-folder",
                  title: "新建子目录",
                  onClick: () => ca.promptNewFolder("standard", null)
                }
              ]}
            />
            {collapse.standardSub &&
              renderResourceTree<PlatformResourceInstance>(
                disk.standardTree,
                1,
                "standard",
                (r) => ({ kind: "standard", resource: r }),
                standardLeafMenu
              )}

            <Row
              depth={0}
              label="自定义"
              expandable
              expanded={collapse.customSub}
              onClick={toggleCustomSub}
              actions={[
                { id: "new-custom", icon: "add", title: "新建自定义节点", onClick: ca.newCustomNode },
                {
                  id: "new-custom-folder",
                  icon: "new-folder",
                  title: "新建子目录",
                  onClick: () => ca.promptNewFolder("custom", null)
                }
              ]}
            />
            {collapse.customSub &&
              renderResourceTree<CustomNodeConfig>(
                disk.customTree,
                1,
                "custom",
                (n) => ({ kind: "custom", node: n }),
                customLeafMenu
              )}
          </Section>
        </>
      )}

      {cm.state && (
        <ContextMenu x={cm.state.x} y={cm.state.y} items={cm.state.items} onClose={cm.close} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section
// ─────────────────────────────────────────────────────────────────────────────

interface SectionAction {
  id: string;
  icon: string;
  title: string;
  onClick(): void;
}
interface SectionProps {
  title: string;
  expanded: boolean;
  onToggle(): void;
  actions?: SectionAction[];
  children: ReactNode;
}
function Section({ title, expanded, onToggle, actions, children }: SectionProps) {
  return (
    <div className="ca-section">
      <div className="ca-section-header" onClick={onToggle}>
        <span
          className={`codicon ca-section-chevron codicon-${
            expanded ? "chevron-down" : "chevron-right"
          }`}
          aria-hidden="true"
        />
        <span className="ca-section-title">{title}</span>
        {actions && actions.length > 0 && (
          <div className="ca-section-actions">
            {actions.map((action) => (
              <button
                key={action.id}
                type="button"
                className="ca-action-btn"
                title={action.title}
                aria-label={action.title}
                onClick={(e) => {
                  e.stopPropagation();
                  action.onClick();
                }}
              >
                <span className={`codicon codicon-${action.icon}`} aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
      </div>
      {expanded && <div className="ca-section-body">{children}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Row
// ─────────────────────────────────────────────────────────────────────────────

interface RowAction {
  id: string;
  icon: string;
  title: string;
  onClick(): void;
}
interface RowProps {
  depth: number;
  label: string;
  onClick(): void;
  expandable?: boolean;
  expanded?: boolean;
  active?: boolean;
  muted?: boolean;
  /** Native tooltip; useful for long file paths and other overflow content. */
  hint?: string;
  actions?: RowAction[];
  draggable?: boolean;
  dragPayload?: DragPayload;
  onContextMenu?: (e: React.MouseEvent) => void;
}

function rowPadding(depth: number): number {
  if (depth <= 0) return 22;
  if (depth === 1) return 32;
  return 40 + (depth - 2) * 8;
}
const CHEVRON_HALF = 7;

function Row({
  depth,
  label,
  onClick,
  expandable,
  expanded,
  active,
  muted,
  hint,
  actions,
  draggable,
  dragPayload,
  onContextMenu
}: RowProps) {
  const pad = rowPadding(depth);
  const guideX = depth > 0 ? rowPadding(depth - 1) + CHEVRON_HALF : 0;
  const indent = {
    paddingLeft: `${pad}px`,
    "--ca-guide-x": `${guideX}px`
  } as React.CSSProperties;
  const className = ["explorer-row", active ? "is-active" : "", muted ? "is-muted" : ""]
    .filter(Boolean)
    .join(" ");
  const chevronIcon = expandable ? (expanded ? "chevron-down" : "chevron-right") : "";
  return (
    <div
      className={className}
      style={indent}
      data-depth={depth}
      title={hint}
      onClick={onClick}
      onContextMenu={onContextMenu}
      draggable={draggable}
      onDragStart={(e) => {
        if (!dragPayload) return;
        dragState.value = dragPayload;
        e.dataTransfer.effectAllowed = "copy";
        try {
          e.dataTransfer.setData("application/x-tinder-resource", "1");
        } catch {
          /* ignore */
        }
      }}
      onDragEnd={() => {
        dragState.value = null;
      }}
    >
      <span
        className={`codicon explorer-chevron${chevronIcon ? ` codicon-${chevronIcon}` : ""}`}
        aria-hidden="true"
      />
      <span className="explorer-name">{label}</span>
      {actions && actions.length > 0 && (
        <div className="ca-row-actions">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              className="ca-action-btn"
              title={action.title}
              aria-label={action.title}
              onClick={(e) => {
                e.stopPropagation();
                action.onClick();
              }}
            >
              <span className={`codicon codicon-${action.icon}`} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// `链路` projection rows
// ─────────────────────────────────────────────────────────────────────────────

function renderChainProjectionRow(
  row: ChainProjectionRow,
  idx: number,
  openChainNodeInHelp: (nodeId: string) => void,
  onCustomContextMenu: (
    e: React.MouseEvent,
    row: ChainProjectionRow & { kind: "custom" }
  ) => void
): ReactNode {
  if (row.kind === "custom") {
    const hint = `自定义节点 · ${row.usage.resource_instance_id}/${row.usage.node_id}`;
    return (
      <Row
        key={`custom-${idx}-${row.arrayIndex}`}
        depth={2}
        label={`⌬ ${row.displayName}`}
        hint={hint}
        muted={!row.usage.enabled}
        onClick={() => {}}
        onContextMenu={(e) => onCustomContextMenu(e, row)}
      />
    );
  }
  const statusLabel =
    row.coverage.status === "missing"
      ? "缺失"
      : row.coverage.status === "covered"
        ? "已覆盖"
        : `多实现 ×${row.coverage.count}`;
  const label =
    row.coverage.status === "multi"
      ? `${row.order}. ${row.displayName} (×${row.coverage.count})`
      : `${row.order}. ${row.displayName}`;
  return (
    <Row
      key={`chain-${row.nodeId}`}
      depth={2}
      label={label}
      muted={row.coverage.status === "missing"}
      hint={`${row.nodeId} · ${statusLabel}`}
      onClick={() => openChainNodeInHelp(row.nodeId)}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Recursive folder render for `活跃资源` / `停用资源`
// ─────────────────────────────────────────────────────────────────────────────

type DropToProfile = (
  profileId: string,
  payload: DragPayload,
  enabled: boolean,
  folder?: string
) => Promise<void>;

type ProfileResourceMenuOpener = (
  e: React.MouseEvent,
  profileId: string,
  item: ProfileResourceItem,
  currentFolder: string
) => void;

/**
 * Render one folder level: direct resources first, then nested subfolders
 * each wrapped in their own DropZone so drops land at the most specific
 * folder. Called once per section root and recurses for subfolders.
 */
function renderProfileFolderContents(
  folder: ProfileResourceFolder,
  depth: number,
  profileId: string,
  section: "active" | "disabled",
  enabled: boolean,
  itemMap: Map<string, ProfileResourceItem>,
  profileFolders: Record<string, boolean>,
  toggleFolder: (id: string, section: "active" | "disabled", path: string) => void,
  openMenu: ProfileResourceMenuOpener,
  dropToProfile: DropToProfile
): ReactNode {
  const isEmpty =
    folder.resources.length === 0 && folder.children.length === 0;
  if (isEmpty && folder.path === "") {
    return <Row depth={depth} label="(无)" muted onClick={() => {}} />;
  }
  return (
    <>
      {folder.resources.map((ref) => {
        const item = itemMap.get(profileResourceRefKey(ref));
        if (!item) return null;
        return (
          <Row
            key={item.id}
            depth={depth}
            label={item.label}
            onClick={() => {}}
            onContextMenu={(e) => openMenu(e, profileId, item, ref.folder ?? "")}
          />
        );
      })}
      {folder.children.map((child) => {
        const key = profileFolderKey(profileId, section, child.path);
        const isOpen = profileFolders[key] ?? false;
        return (
          <DropZone
            key={key}
            onDrop={(payload) =>
              dropToProfile(profileId, payload, enabled, child.path)
            }
          >
            <Row
              depth={depth}
              label={child.name}
              expandable
              expanded={isOpen}
              onClick={() => toggleFolder(profileId, section, child.path)}
            />
            {isOpen &&
              renderProfileFolderContents(
                child,
                depth + 1,
                profileId,
                section,
                enabled,
                itemMap,
                profileFolders,
                toggleFolder,
                openMenu,
                dropToProfile
              )}
          </DropZone>
        );
      })}
    </>
  );
}
