import { useCallback, useMemo, useState } from "react";
import { useWorkspace, type OpenDocument } from "../state/WorkspaceContext";
import { MonacoEditor } from "./MonacoEditor";
import { WelcomeView } from "./WelcomeView";
import { ContextMenu, useContextMenu, type ContextMenuItem } from "./ContextMenu";
import { Breadcrumbs } from "./Breadcrumbs";
import { HelpDocTab } from "./HelpDocTab";
import { ChainEditorView } from "./ChainEditorView";
import { ProfileLifecycleView } from "./ProfileLifecycleView";
import { ResourceEditorView } from "./ResourceEditorView";
import { ResourceBranchView } from "./ResourceBranchView";

/**
 * Items rendered along the tab strip. A "standalone" item is a single
 * tab; a "group" item bundles all profile-related tabs (chain-editor +
 * profile-lifecycle) for one profile under a leading pill label so they
 * read as a single workspace context.
 */
type TabStripItem =
  | { kind: "standalone"; doc: OpenDocument }
  | {
      kind: "group";
      profileId: string;
      profileDisplayName: string;
      docs: OpenDocument[];
    };

function isProfileChild(doc: OpenDocument): boolean {
  return (
    (doc.kind === "chain-editor" ||
      doc.kind === "profile-lifecycle" ||
      doc.kind === "resource-branch") &&
    !!doc.profileId
  );
}

export function EditorArea() {
  const {
    documents,
    activeUri,
    setActive,
    closeFile,
    pinDocument,
    updateContent,
    saveDocument,
    revealRequest,
    reorderTabs,
    folder
  } = useWorkspace();
  const active = documents.find((d) => d.uri === activeUri) ?? null;
  const tabMenu = useContextMenu();
  const [draggedUri, setDraggedUri] = useState<string | null>(null);
  const [dropTargetUri, setDropTargetUri] = useState<string | null>(null);

  const reveal =
    revealRequest && active && revealRequest.uri === active.uri
      ? { line: revealRequest.line, column: revealRequest.column, token: revealRequest.token }
      : null;

  const onTabContextMenu = useCallback(
    (event: React.MouseEvent, uri: string) => {
      const idx = documents.findIndex((d) => d.uri === uri);
      const items: ContextMenuItem[] = [
        { id: "close", label: "关闭", run: () => closeFile(uri) },
        {
          id: "closeOthers",
          label: "关闭其他",
          disabled: documents.length <= 1,
          run: () => {
            for (const d of documents) if (d.uri !== uri) closeFile(d.uri);
          }
        },
        {
          id: "closeRight",
          label: "关闭右侧",
          disabled: idx === documents.length - 1,
          run: () => {
            for (const d of documents.slice(idx + 1)) closeFile(d.uri);
          }
        },
        {
          id: "closeAll",
          label: "全部关闭",
          run: () => {
            for (const d of documents) closeFile(d.uri);
          }
        },
        { separator: true },
        {
          id: "copyPath",
          label: "复制完整路径",
          run: () => navigator.clipboard.writeText(uri)
        }
      ];
      tabMenu.open(event, items);
    },
    [documents, closeFile, tabMenu]
  );

  const onTabAuxClick = useCallback(
    (event: React.MouseEvent, uri: string) => {
      if (event.button === 1) {
        event.preventDefault();
        closeFile(uri);
      }
    },
    [closeFile]
  );

  // Cluster profile-related tabs together. We walk the documents list in
  // order; the first time we see a profileId, we collect every doc that
  // shares it into a single group and emit it at that position. Standalone
  // tabs (files, help docs, resource-editor, …) flow through unchanged.
  const stripItems = useMemo<TabStripItem[]>(() => {
    const consumed = new Set<string>();
    const items: TabStripItem[] = [];
    for (const doc of documents) {
      if (consumed.has(doc.uri)) continue;
      if (isProfileChild(doc)) {
        const profileId = doc.profileId!;
        const siblings = documents.filter(
          (d) => isProfileChild(d) && d.profileId === profileId
        );
        siblings.forEach((s) => consumed.add(s.uri));
        items.push({
          kind: "group",
          profileId,
          profileDisplayName:
            doc.profileDisplayName ?? profileId,
          docs: siblings
        });
      } else {
        items.push({ kind: "standalone", doc });
      }
    }
    return items;
  }, [documents]);

  const renderTab = (doc: OpenDocument, isInGroup: boolean) => (
    <div
      key={doc.uri}
      role="tab"
      aria-selected={doc.uri === activeUri}
      title={doc.tooltip ?? doc.uri}
      draggable
      className={`editor-tab${doc.uri === activeUri ? " is-active" : ""}${
        dropTargetUri === doc.uri ? " is-drop-target" : ""
      }${doc.preview ? " is-preview" : ""}${
        isInGroup ? " is-group-child" : ""
      }`}
      onClick={() => setActive(doc.uri)}
      onDoubleClick={() => pinDocument(doc.uri)}
      onAuxClick={(e) => onTabAuxClick(e, doc.uri)}
      onContextMenu={(e) => onTabContextMenu(e, doc.uri)}
      onDragStart={(e) => {
        setDraggedUri(doc.uri);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", doc.uri);
      }}
      onDragEnd={() => {
        setDraggedUri(null);
        setDropTargetUri(null);
      }}
      onDragOver={(e) => {
        if (!draggedUri || draggedUri === doc.uri) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDropTargetUri(doc.uri);
      }}
      onDragLeave={(e) => {
        if ((e.relatedTarget as HTMLElement)?.closest?.(".editor-tab") === null) {
          setDropTargetUri((cur) => (cur === doc.uri ? null : cur));
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (draggedUri && draggedUri !== doc.uri) {
          reorderTabs(draggedUri, doc.uri);
        }
        setDraggedUri(null);
        setDropTargetUri(null);
      }}
    >
      <span className="editor-tab-name">{doc.name}</span>
      <button
        className="editor-tab-close"
        aria-label={doc.dirty ? `${doc.name}（未保存）— 关闭` : `关闭 ${doc.name}`}
        onClick={(e) => {
          e.stopPropagation();
          closeFile(doc.uri);
        }}
      >
        {doc.dirty ? (
          <span className="editor-tab-dirty" aria-hidden="true" />
        ) : (
          <span className="codicon codicon-close" aria-hidden="true" />
        )}
      </button>
    </div>
  );

  return (
    <section className="editor-area" aria-label="编辑器">
      <div className="editor-tabs" role="tablist">
        {stripItems.map((item) =>
          item.kind === "standalone" ? (
            renderTab(item.doc, false)
          ) : (
            <div
              key={`group:${item.profileId}`}
              className="editor-tab-group"
              role="group"
              aria-label={`配置档案 ${item.profileDisplayName}`}
            >
              <div
                className="editor-tab-group-label"
                title={`配置档案 ${item.profileDisplayName}`}
              >
                <span className="editor-tab-group-name">
                  {item.profileDisplayName}
                </span>
                <button
                  type="button"
                  className="editor-tab-close editor-tab-group-close"
                  aria-label={`关闭 ${item.profileDisplayName} 分组的所有 tab`}
                  onClick={(e) => {
                    e.stopPropagation();
                    for (const d of item.docs) closeFile(d.uri);
                  }}
                  title="关闭整个分组"
                >
                  <span className="codicon codicon-close" aria-hidden="true" />
                </button>
              </div>
              {item.docs.map((d) => renderTab(d, true))}
            </div>
          )
        )}
      </div>
      {active && active.kind === "file" && (
        <Breadcrumbs workspacePath={folder?.path ?? null} filePath={active.uri} />
      )}
      <div className="editor-host">
        {!active ? (
          <WelcomeView />
        ) : active.kind === "help-doc" ? (
          <HelpDocTab key={active.uri} nodeId={active.helpNodeId ?? ""} />
        ) : active.kind === "chain-editor" ? (
          <ChainEditorView
            key={active.uri}
            profileId={active.profileId ?? ""}
            tabUri={active.uri}
          />
        ) : active.kind === "profile-lifecycle" ? (
          <ProfileLifecycleView
            key={active.uri}
            profileId={active.profileId ?? ""}
            tabUri={active.uri}
          />
        ) : active.kind === "resource-editor" ? (
          // `key={active.uri}` forces a fresh component instance per tab
          // so internal state (currentSourcePath, draft, baseline, …)
          // doesn't bleed across resources when the user switches tabs.
          <ResourceEditorView
            key={active.uri}
            resourceId={active.resourceId ?? ""}
            resourceKind={active.resourceKind ?? "standard"}
            sourcePath={active.resourceSourcePath ?? null}
            tabUri={active.uri}
          />
        ) : active.kind === "resource-branch" ? (
          <ResourceBranchView
            key={active.uri}
            tabUri={active.uri}
            scope={active.resourceBranchScope ?? "global"}
            profileId={active.profileId}
            resourceId={active.resourceId ?? ""}
            resourceKind={active.resourceKind ?? "standard"}
            initialBranchId={active.resourceBranchId ?? "default"}
          />
        ) : (
          <MonacoEditor
            key={active.uri}
            value={active.content}
            language={active.language}
            onChange={(next) => updateContent(active.uri, next)}
            onSave={() => void saveDocument(active.uri)}
            reveal={reveal}
          />
        )}
      </div>
      {tabMenu.state && (
        <ContextMenu
          x={tabMenu.state.x}
          y={tabMenu.state.y}
          items={tabMenu.state.items}
          onClose={tabMenu.close}
        />
      )}
    </section>
  );
}
