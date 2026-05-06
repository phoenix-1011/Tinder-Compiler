import * as monaco from "monaco-editor";

import cpp from "../../../resources/snippets/cpp.json";
import c from "../../../resources/snippets/c.json";
import python from "../../../resources/snippets/python.json";
import go from "../../../resources/snippets/go.json";
import rust from "../../../resources/snippets/rust.json";
import typescript from "../../../resources/snippets/typescript.json";
import javascript from "../../../resources/snippets/javascript.json";

interface VsCodeSnippet {
  prefix: string | string[];
  body: string | string[];
  description?: string;
  scope?: string;
}

type SnippetMap = Record<string, VsCodeSnippet>;

interface LanguageSnippets {
  language: string;
  snippets: SnippetMap;
}

const SNIPPETS: LanguageSnippets[] = [
  { language: "cpp", snippets: cpp as SnippetMap },
  { language: "c", snippets: c as SnippetMap },
  { language: "python", snippets: python as SnippetMap },
  { language: "go", snippets: go as SnippetMap },
  { language: "rust", snippets: rust as SnippetMap },
  { language: "typescript", snippets: typescript as SnippetMap },
  { language: "typescriptreact", snippets: typescript as SnippetMap },
  { language: "javascript", snippets: javascript as SnippetMap },
  { language: "javascriptreact", snippets: javascript as SnippetMap }
];

interface FlatSnippet {
  name: string;
  prefix: string;
  body: string;
  description?: string;
}

function flatten(map: SnippetMap): FlatSnippet[] {
  const out: FlatSnippet[] = [];
  for (const [name, raw] of Object.entries(map)) {
    if (!raw || typeof raw !== "object" || !raw.prefix || !raw.body) continue;
    const prefixes = Array.isArray(raw.prefix) ? raw.prefix : [raw.prefix];
    const body = Array.isArray(raw.body) ? raw.body.join("\n") : raw.body;
    for (const prefix of prefixes) {
      out.push({ name, prefix, body, description: raw.description });
    }
  }
  return out;
}

export function registerSnippets(): void {
  for (const { language, snippets } of SNIPPETS) {
    const flat = flatten(snippets);
    if (flat.length === 0) continue;

    monaco.languages.registerCompletionItemProvider(language, {
      // Trigger on typing any letter — Monaco's filtering does the rest.
      triggerCharacters: undefined,
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position);
        const range = new monaco.Range(
          position.lineNumber,
          word.startColumn,
          position.lineNumber,
          word.endColumn
        );
        return {
          suggestions: flat.map<monaco.languages.CompletionItem>((s) => ({
            label: s.prefix,
            kind: monaco.languages.CompletionItemKind.Snippet,
            documentation: s.description ? { value: s.description } : undefined,
            detail: s.name,
            insertText: s.body,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range
          }))
        };
      }
    });
  }
}
