import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspace } from "../state/WorkspaceContext";
import type { DirEntry } from "../../preload";
import { fileIcon, folderIcon } from "./FileIcon";
import { ContextMenu, useContextMenu, type ContextMenuItem } from "./ContextMenu";

interface NodeProps {
  entry: DirEntry;
  depth: number;
  onContextMenu(event: React.MouseEvent, entry: DirEntry): void;
  refreshKey: number;
}

function FileNode({ entry, depth, onContextMenu, refreshKey }: NodeProps) {
  const { openFile, activeUri } = useWorkspace();
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<DirEntry[] | null>(null);

  // refreshKey lets parents force a re-list when the underlying directory changes.
  useEffect(() => {
    if (!entry.isDirectory || !expanded) return;
    let cancelled = false;
    window.tinder.listDir(entry.path).then((items) => {
      if (!cancelled) setChildren(items);
    });
    return () => {
      cancelled = true;
    };
  }, [entry, expanded, refreshKey]);

  const indent = { paddingLeft: `${depth * 12 + 8}px` };
  const isActive = activeUri === entry.path;

  if (entry.isDirectory) {
    const icon = folderIcon(entry.name, expanded);
    return (
      <>
        <div
          className={`explorer-row${expanded ? " is-expanded" : ""}`}
          style={indent}
          onClick={() => setExpanded((v) => !v)}
          onContextMenu={(e) => onContextMenu(e, entry)}
        >
          <span
            className={`codicon explorer-chevron codicon-${expanded ? "chevron-down" : "chevron-right"}`}
            aria-hidden="true"
          />
          <span
            className={`codicon explorer-icon codicon-${icon.icon}`}
            style={icon.color ? { color: icon.color } : undefined}
            aria-hidden="true"
          />
          <span className="explorer-name">{entry.name}</span>
        </div>
        {expanded && children?.map((child) => (
          <FileNode
            key={child.path}
            entry={child}
            depth={depth + 1}
            onContextMenu={onContextMenu}
            refreshKey={refreshKey}
          />
        ))}
      </>
    );
  }

  const icon = fileIcon(entry.name);
  return (
    <div
      className={`explorer-row${isActive ? " is-active" : ""}`}
      style={indent}
      onClick={() => openFile(entry.path)}
      onDoubleClick={() => openFile(entry.path, { preview: false })}
      onContextMenu={(e) => onContextMenu(e, entry)}
    >
      <span className="codicon explorer-chevron" aria-hidden="true" />
      <span
        className={`codicon explorer-icon codicon-${icon.icon}`}
        style={icon.color ? { color: icon.color } : undefined}
        aria-hidden="true"
      />
      <span className="explorer-name">{entry.name}</span>
    </div>
  );
}

export function ExplorerView() {
  const { folder, openFile, closeFile, documents } = useWorkspace();
  const [entries, setEntries] = useState<DirEntry[] | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const cm = useContextMenu();

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!folder) {
      setEntries(null);
      return;
    }
    let cancelled = false;
    window.tinder.listDir(folder.path).then((items) => {
      if (!cancelled) setEntries(items);
    });
    return () => {
      cancelled = true;
    };
  }, [folder, refreshKey]);

  const handleContextMenu = useCallback(
    (event: React.MouseEvent, entry: DirEntry) => {
      const items: ContextMenuItem[] = [];
      if (!entry.isDirectory) {
        items.push({
          id: "open",
          label: "打开",
          run: () => openFile(entry.path)
        });
        items.push({ separator: true });
      }
      items.push({
        id: "newFile",
        label: "新建文件…",
        run: async () => {
          const dir = entry.isDirectory ? entry.path : await window.tinder.joinPath(entry.path, "..");
          const name = window.prompt("新文件名");
          if (!name) return;
          const path = await window.tinder.joinPath(dir, name);
          try {
            await window.tinder.createFile(path);
            refresh();
            await openFile(path);
          } catch (err) {
            window.alert(`创建失败：${(err as Error).message}`);
          }
        }
      });
      items.push({
        id: "newDir",
        label: "新建文件夹…",
        run: async () => {
          const dir = entry.isDirectory ? entry.path : await window.tinder.joinPath(entry.path, "..");
          const name = window.prompt("新文件夹名");
          if (!name) return;
          const path = await window.tinder.joinPath(dir, name);
          try {
            await window.tinder.createDir(path);
            refresh();
          } catch (err) {
            window.alert(`创建失败：${(err as Error).message}`);
          }
        }
      });
      items.push({ separator: true });
      items.push({
        id: "rename",
        label: "重命名…",
        run: async () => {
          const next = window.prompt("新名称", entry.name);
          if (!next || next === entry.name) return;
          const dir = await window.tinder.joinPath(entry.path, "..");
          const target = await window.tinder.joinPath(dir, next);
          try {
            await window.tinder.rename(entry.path, target);
            // If the renamed file is open, swap the tab uri.
            const open = documents.find((d) => d.uri === entry.path);
            if (open) {
              closeFile(entry.path);
              await openFile(target);
            }
            refresh();
          } catch (err) {
            window.alert(`重命名失败：${(err as Error).message}`);
          }
        }
      });
      items.push({
        id: "trash",
        label: "移至回收站",
        run: async () => {
          if (!window.confirm(`将「${entry.name}」移至回收站？`)) return;
          try {
            await window.tinder.trash(entry.path);
            if (documents.some((d) => d.uri === entry.path)) closeFile(entry.path);
            refresh();
          } catch (err) {
            window.alert(`删除失败：${(err as Error).message}`);
          }
        }
      });
      items.push({ separator: true });
      items.push({
        id: "copyPath",
        label: "复制完整路径",
        run: () => navigator.clipboard.writeText(entry.path)
      });
      items.push({
        id: "copyRel",
        label: "复制相对路径",
        run: async () => {
          if (!folder) return;
          const rel = await window.tinder.relativePath(folder.path, entry.path);
          await navigator.clipboard.writeText(rel);
        }
      });
      items.push({
        id: "reveal",
        label: window.tinder.platform === "darwin" ? "在 Finder 中显示" : "在文件资源管理器中显示",
        run: () => window.tinder.revealInOs(entry.path)
      });
      cm.open(event, items);
    },
    [openFile, closeFile, documents, folder, refresh, cm]
  );

  if (!folder) return null;
  if (!entries) return <div className="sidebar-hint">加载中…</div>;

  return (
    <>
      <div className="explorer">
        {entries.map((entry) => (
          <FileNode
            key={entry.path}
            entry={entry}
            depth={0}
            onContextMenu={handleContextMenu}
            refreshKey={refreshKey}
          />
        ))}
      </div>
      {cm.state && (
        <ContextMenu x={cm.state.x} y={cm.state.y} items={cm.state.items} onClose={cm.close} />
      )}
    </>
  );
}
