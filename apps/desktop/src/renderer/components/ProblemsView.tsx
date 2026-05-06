import { useEffect, useMemo, useState } from "react";
import * as monaco from "monaco-editor";
import { useWorkspace } from "../state/WorkspaceContext";

interface ProblemRow {
  uri: string;
  marker: monaco.editor.IMarker;
}

const SEVERITY_LABELS: Record<number, string> = {
  [monaco.MarkerSeverity.Error]: "错误",
  [monaco.MarkerSeverity.Warning]: "警告",
  [monaco.MarkerSeverity.Info]: "信息",
  [monaco.MarkerSeverity.Hint]: "提示"
};

const SEVERITY_ICONS: Record<number, { icon: string; color: string }> = {
  [monaco.MarkerSeverity.Error]: { icon: "error", color: "#f48771" },
  [monaco.MarkerSeverity.Warning]: { icon: "warning", color: "#cca700" },
  [monaco.MarkerSeverity.Info]: { icon: "info", color: "#75beff" },
  [monaco.MarkerSeverity.Hint]: { icon: "lightbulb", color: "#999999" }
};

/** Aggregates Monaco markers (filled by LSP `publishDiagnostics`). */
export function ProblemsView() {
  const { openFile } = useWorkspace();
  const [problems, setProblems] = useState<ProblemRow[]>([]);

  useEffect(() => {
    const refresh = () => {
      const markers = monaco.editor.getModelMarkers({});
      setProblems(
        markers
          // Drop hints by default — they're noisy and not "problems".
          .filter((m) => m.severity !== monaco.MarkerSeverity.Hint)
          .map((m) => ({ uri: m.resource.toString(), marker: m }))
      );
    };

    refresh();
    const sub = monaco.editor.onDidChangeMarkers(refresh);
    return () => sub.dispose();
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, ProblemRow[]>();
    for (const row of problems) {
      const arr = map.get(row.uri) ?? [];
      arr.push(row);
      map.set(row.uri, arr);
    }
    // Sort markers within each file by line number then severity (error first).
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        if (a.marker.severity !== b.marker.severity) {
          return a.marker.severity > b.marker.severity ? -1 : 1;
        }
        return a.marker.startLineNumber - b.marker.startLineNumber;
      });
    }
    return Array.from(map.entries());
  }, [problems]);

  if (problems.length === 0) {
    return <p className="panel-placeholder">未检测到问题。</p>;
  }

  const errorCount = problems.filter((p) => p.marker.severity === monaco.MarkerSeverity.Error).length;
  const warnCount = problems.filter((p) => p.marker.severity === monaco.MarkerSeverity.Warning).length;

  return (
    <div className="problems-view">
      <div className="problems-summary">
        <span className="problems-count">
          <span className="codicon codicon-error" style={{ color: "#f48771" }} /> {errorCount}
        </span>
        <span className="problems-count">
          <span className="codicon codicon-warning" style={{ color: "#cca700" }} /> {warnCount}
        </span>
        <span className="problems-count problems-count-total">{problems.length} 个问题</span>
      </div>
      <div className="problems-list">
        {grouped.map(([uri, rows]) => (
          <FileGroup key={uri} uri={uri} rows={rows} onPick={openFile} />
        ))}
      </div>
    </div>
  );
}

function FileGroup({
  uri,
  rows,
  onPick
}: {
  uri: string;
  rows: ProblemRow[];
  onPick(path: string, position?: { line: number; column: number }): void;
}) {
  const fsPath = uriToPath(uri);
  const name = fsPath.split(/[\\/]/).pop() ?? fsPath;
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="problems-group">
      <div className="problems-group-header" onClick={() => setCollapsed((v) => !v)}>
        <span
          className={`codicon codicon-${collapsed ? "chevron-right" : "chevron-down"}`}
        />
        <span className="problems-group-name">{name}</span>
        <span className="problems-group-path">{fsPath}</span>
        <span className="problems-group-count">{rows.length}</span>
      </div>
      {!collapsed && (
        <div className="problems-group-body">
          {rows.map((row, idx) => {
            const m = row.marker;
            const sev = SEVERITY_ICONS[m.severity] ?? SEVERITY_ICONS[monaco.MarkerSeverity.Info];
            return (
              <div
                key={`${m.startLineNumber}-${m.startColumn}-${idx}`}
                className="problems-item"
                onClick={() => onPick(fsPath, { line: m.startLineNumber, column: m.startColumn })}
                title={`${SEVERITY_LABELS[m.severity] ?? ""} · ${m.source ?? ""}`}
              >
                <span
                  className={`codicon codicon-${sev.icon} problems-item-icon`}
                  style={{ color: sev.color }}
                />
                <span className="problems-item-msg">{m.message}</span>
                {m.code && <span className="problems-item-code">[{String(m.code)}]</span>}
                <span className="problems-item-loc">
                  {m.startLineNumber}:{m.startColumn}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function uriToPath(uri: string): string {
  // Convert "file:///D:/foo/bar.cpp" → "D:/foo/bar.cpp"
  if (!uri.startsWith("file://")) return uri;
  let p = uri.slice("file://".length);
  if (p.startsWith("/") && /^\/[a-zA-Z]:/.test(p)) p = p.slice(1);
  try {
    return decodeURIComponent(p);
  } catch {
    return p;
  }
}
