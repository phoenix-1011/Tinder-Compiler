import * as monaco from "monaco-editor";
import { Registry } from "monaco-textmate";
import { wireTmGrammars } from "monaco-editor-textmate";
import { loadWASM } from "onigasm";
// onigasm WASM is bundled by Vite via ?url
import onigasmWasm from "onigasm/lib/onigasm.wasm?url";

import cpp from "../../../resources/grammars/cpp.tmLanguage.json";
import c from "../../../resources/grammars/c.tmLanguage.json";
import python from "../../../resources/grammars/MagicPython.tmLanguage.json";
import go from "../../../resources/grammars/go.tmLanguage.json";
import rust from "../../../resources/grammars/rust.tmLanguage.json";
import typescript from "../../../resources/grammars/TypeScript.tmLanguage.json";
import tsx from "../../../resources/grammars/TypeScriptReact.tmLanguage.json";
import markdown from "../../../resources/grammars/markdown.tmLanguage.json";

interface GrammarSpec {
  language: string;
  scopeName: string;
  grammar: unknown;
  /** File extensions Monaco should associate with this language. */
  extensions: string[];
}

const GRAMMARS: GrammarSpec[] = [
  { language: "cpp", scopeName: "source.cpp", grammar: cpp, extensions: [".cpp", ".cc", ".cxx", ".hpp", ".hh", ".hxx", ".h"] },
  { language: "c", scopeName: "source.c", grammar: c, extensions: [".c"] },
  { language: "python", scopeName: "source.python", grammar: python, extensions: [".py"] },
  { language: "go", scopeName: "source.go", grammar: go, extensions: [".go"] },
  { language: "rust", scopeName: "source.rust", grammar: rust, extensions: [".rs"] },
  { language: "typescript", scopeName: "source.ts", grammar: typescript, extensions: [".ts"] },
  { language: "typescriptreact", scopeName: "source.tsx", grammar: tsx, extensions: [".tsx"] },
  { language: "markdown", scopeName: "text.html.markdown", grammar: markdown, extensions: [".md", ".markdown"] }
];

let initPromise: Promise<void> | null = null;

export async function initTextMate(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    // 1. Boot oniguruma WASM (regex engine — TextMate grammars need it).
    await loadWASM(onigasmWasm);

    // 2. Build the registry.
    const registry = new Registry({
      getGrammarDefinition: async (scopeName: string) => {
        const spec = GRAMMARS.find((g) => g.scopeName === scopeName);
        if (!spec) return null as any;
        return {
          format: "json",
          content: spec.grammar as object
        };
      }
    });

    // 3. Register the languages with Monaco so it knows their extension mapping
    //    and can pick the right grammar when a file is opened.
    for (const spec of GRAMMARS) {
      const existing = monaco.languages.getLanguages().some((l) => l.id === spec.language);
      if (!existing) {
        monaco.languages.register({ id: spec.language, extensions: spec.extensions });
      }
    }

    // 4. Wire grammar -> language. Must be called after languages are registered.
    const grammars = new Map<string, string>(GRAMMARS.map((g) => [g.language, g.scopeName]));
    await wireTmGrammars(monaco, registry, grammars);
  })();
  return initPromise;
}
