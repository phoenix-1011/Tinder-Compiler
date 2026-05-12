import { useCallback, useState } from "react";
import { useWorkspace } from "../state/WorkspaceContext";
import { MonacoEditor } from "./MonacoEditor";
import { WelcomeView } from "./WelcomeView";
import { ContextMenu, useContextMenu, type ContextMenuItem } from "./ContextMenu";
import { Breadcrumbs } from "./Breadcrumbs";
import { HelpDocTab } from "./HelpDocTab";
import { ChainEditorView } from "./ChainEditorView";
import { ProfileLifecycleView } from "./ProfileLifecycleView";
import { ResourceEditorView } from "./ResourceEditorView";

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

  return (
    <section className="editor-area" aria-label="编辑器">
      <div className="editor-tabs" role="tablist">
        {documents.map((doc) => (
          <div
            key={doc.uri}
            role="tab"
            aria-selected={doc.uri === activeUri}
            draggable
            className={`editor-tab${doc.uri === activeUri ? " is-active" : ""}${
              dropTargetUri === doc.uri ? " is-drop-target" : ""
            }${doc.preview ? " is-preview" : ""}`}
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
              // Only clear if leaving to a non-tab target.
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
        ))}
      </div>
      {active && active.kind === "file" && (
        <Breadcrumbs workspacePath={folder?.path ?? null} filePath={active.uri} />
      )}
      <div className="editor-host">
        {!active ? (
          <WelcomeView />
        ) : active.kind === "help-doc" ? (
          <HelpDocTab nodeId={active.helpNodeId ?? ""} />
        ) : active.kind === "chain-editor" ? (
          <ChainEditorView profileId={active.profileId ?? ""} tabUri={active.uri} />
        ) : active.kind === "profile-lifecycle" ? (
          <ProfileLifecycleView
            profileId={active.profileId ?? ""}
            tabUri={active.uri}
          />
        ) : active.kind === "resource-editor" ? (
          <ResourceEditorView
            resourceId={active.resourceId ?? ""}
            resourceKind={active.resourceKind ?? "standard"}
            sourcePath={active.resourceSourcePath ?? null}
            tabUri={active.uri}
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
