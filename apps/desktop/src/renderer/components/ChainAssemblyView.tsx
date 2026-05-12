import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { CustomNodeConfig, PlatformResourceInstance } from "@tinder/nextstep";
import { validateProject } from "@tinder/nextstep";
import { ContextMenu, useContextMenu, type ContextMenuItem } from "./ContextMenu";
import { useCa } from "../state/ChainAssemblyContext";
import {
  dragState,
  flattenLeaves,
  profileResourceItems,
  type CollapseState,
  type DragPayload,
  type FolderNode,
  type LeafNode,
  type ProfileEntry,
  type ProfileResourceItem,
  type TreeNode
} from "../state/chainAssemblyStorage";

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
  return (
    <div
      className={`ca-drop-zone${over ? " is-drop-over" : ""}`}
      onDragOver={(e) => {
        if (!dragState.value) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragEnter={() => {
        if (dragState.value) setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
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
  const { dataRoot, disk, loading, loadError, collapse, setCollapse } = ca;

  const flatStandard = useMemo(
    () => (disk ? flattenLeaves(disk.standardTree) : []),
    [disk]
  );
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
    item: ProfileResourceItem
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
    cm.open(e, [
      toggle,
      { separator: true },
      { id: "delete", label: "从档案中移除", run: () => ca.removeFromProfile(profileId, item) }
    ]);
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
              const activeItems = profileResourceItems(
                refs.filter((r) => r.enabled),
                flatStandard
              );
              const disabledItems = profileResourceItems(
                refs.filter((r) => !r.enabled),
                flatStandard
              );
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
                      <Row depth={1} label="链路" onClick={() => {}} />
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
                        {activeOpen && activeItems.length === 0 && (
                          <Row depth={2} label="(无)" muted onClick={() => {}} />
                        )}
                        {activeOpen &&
                          activeItems.map((r) => (
                            <Row
                              key={r.id}
                              depth={2}
                              label={r.label}
                              onClick={() => {}}
                              onContextMenu={(e) =>
                                profileResourceMenu(e, profile.id, r)
                              }
                            />
                          ))}
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
                        {disabledOpen && disabledItems.length === 0 && (
                          <Row depth={2} label="(无)" muted onClick={() => {}} />
                        )}
                        {disabledOpen &&
                          disabledItems.map((r) => (
                            <Row
                              key={r.id}
                              depth={2}
                              label={r.label}
                              onClick={() => {}}
                              onContextMenu={(e) =>
                                profileResourceMenu(e, profile.id, r)
                              }
                            />
                          ))}
                      </DropZone>
                      <Row depth={1} label="使用与版本" onClick={() => {}} />
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
