import * as monaco from "monaco-editor";
import type { Diagnostic, PublishDiagnosticsParams } from "vscode-languageserver-protocol";
import { mapSeverity } from "./kind-mapper";

function toMarker(d: Diagnostic): monaco.editor.IMarkerData {
  return {
    severity: mapSeverity(d.severity),
    message: d.message,
    code: d.code != null ? String(d.code) : undefined,
    source: d.source,
    startLineNumber: d.range.start.line + 1,
    startColumn: d.range.start.character + 1,
    endLineNumber: d.range.end.line + 1,
    endColumn: d.range.end.character + 1
  };
}

/** Apply LSP diagnostics to the matching Monaco model. No-op if no model exists. */
export function applyDiagnostics(owner: string, params: PublishDiagnosticsParams): void {
  const model = monaco.editor.getModels().find((m) => m.uri.toString() === params.uri);
  if (!model) return;
  monaco.editor.setModelMarkers(model, owner, params.diagnostics.map(toMarker));
}
