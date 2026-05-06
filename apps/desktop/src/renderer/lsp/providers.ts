import * as monaco from "monaco-editor";
import type { MessageConnection } from "vscode-jsonrpc/browser";
import type {
  CompletionItem,
  CompletionList,
  Definition,
  DefinitionLink,
  Hover,
  Location,
  MarkupContent,
  ServerCapabilities
} from "vscode-languageserver-protocol";
import { mapCompletionKind } from "./kind-mapper";

/**
 * Register Monaco language providers (completion / hover / definition) that
 * forward requests to a connected LSP server. Returns disposers that must be
 * called when the client shuts down.
 *
 * `isOpen` is consulted before each request — if the document is unknown to
 * the server we return early instead of round-tripping.
 */
export function registerProviders(
  conn: MessageConnection,
  caps: ServerCapabilities,
  documentSelector: string[],
  isOpen: (uri: string) => boolean
): Array<() => void> {
  const disposers: Array<() => void> = [];

  if (caps.completionProvider) {
    const triggerCharacters = caps.completionProvider.triggerCharacters ?? [];
    for (const lang of documentSelector) {
      const reg = monaco.languages.registerCompletionItemProvider(lang, {
        triggerCharacters,
        provideCompletionItems: async (model, position) => {
          const uri = model.uri.toString();
          if (!isOpen(uri)) return { suggestions: [] };
          const raw = await conn.sendRequest("textDocument/completion", {
            textDocument: { uri },
            position: { line: position.lineNumber - 1, character: position.column - 1 }
          });
          const result = raw as CompletionItem[] | CompletionList | null;
          if (!result) return { suggestions: [] };
          const items = Array.isArray(result) ? result : result.items;
          const word = model.getWordUntilPosition(position);
          const range = new monaco.Range(
            position.lineNumber,
            word.startColumn,
            position.lineNumber,
            word.endColumn
          );
          return { suggestions: items.map((item) => completionToMonaco(item, range)) };
        }
      });
      disposers.push(() => reg.dispose());
    }
  }

  if (caps.hoverProvider) {
    for (const lang of documentSelector) {
      const reg = monaco.languages.registerHoverProvider(lang, {
        provideHover: async (model, position) => {
          const uri = model.uri.toString();
          if (!isOpen(uri)) return null;
          const raw = await conn.sendRequest("textDocument/hover", {
            textDocument: { uri },
            position: { line: position.lineNumber - 1, character: position.column - 1 }
          });
          const result = raw as Hover | null;
          if (!result) return null;
          const list = Array.isArray(result.contents) ? result.contents : [result.contents];
          return {
            contents: list.map((c) => {
              if (typeof c === "string") return { value: c };
              if ("language" in c) return { value: "```" + c.language + "\n" + c.value + "\n```" };
              return { value: (c as MarkupContent).value };
            })
          };
        }
      });
      disposers.push(() => reg.dispose());
    }
  }

  if (caps.definitionProvider) {
    for (const lang of documentSelector) {
      const reg = monaco.languages.registerDefinitionProvider(lang, {
        provideDefinition: async (model, position) => {
          const uri = model.uri.toString();
          if (!isOpen(uri)) return null;
          const raw = await conn.sendRequest("textDocument/definition", {
            textDocument: { uri },
            position: { line: position.lineNumber - 1, character: position.column - 1 }
          });
          const result = raw as Location | Location[] | DefinitionLink[] | null;
          if (!result) return null;
          const arr = Array.isArray(result) ? result : [result];
          return (arr as Array<Location | DefinitionLink>).map(definitionToMonaco);
        }
      });
      disposers.push(() => reg.dispose());
    }
  }

  return disposers;
}

function completionToMonaco(
  item: CompletionItem,
  range: monaco.Range
): monaco.languages.CompletionItem {
  const labelText =
    typeof item.label === "string" ? item.label : (item.label as { label: string }).label;
  return {
    label: labelText,
    kind: mapCompletionKind(item.kind),
    detail: item.detail,
    documentation: item.documentation
      ? typeof item.documentation === "string"
        ? item.documentation
        : { value: (item.documentation as MarkupContent).value }
      : undefined,
    insertText:
      (typeof item.insertText === "string" ? item.insertText : undefined) ?? labelText,
    range
  };
}

function definitionToMonaco(d: Location | DefinitionLink): monaco.languages.Location {
  const isLink = "targetUri" in d;
  const range = isLink ? d.targetSelectionRange : d.range;
  const uri = isLink ? d.targetUri : d.uri;
  return {
    uri: monaco.Uri.parse(uri),
    range: {
      startLineNumber: range.start.line + 1,
      startColumn: range.start.character + 1,
      endLineNumber: range.end.line + 1,
      endColumn: range.end.character + 1
    }
  };
}
