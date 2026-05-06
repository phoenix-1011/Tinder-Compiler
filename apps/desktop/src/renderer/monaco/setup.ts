import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import { registerAllThemes } from "./theme";
import { initTextMate } from "./textmate";
import { registerSnippets } from "./snippets";

function safeStep(label: string, fn: () => void): void {
  try {
    fn();
  } catch (err) {
    // Never let a single setup step abort the whole renderer; log loudly so
    // DevTools surfaces it.
    // eslint-disable-next-line no-console
    console.error(`[tinder] setup step "${label}" failed:`, err);
  }
}

export function setupMonacoEnvironment(): void {
  safeStep("worker environment", () => {
    self.MonacoEnvironment = {
      getWorker(_workerId: string, label: string) {
        switch (label) {
          case "json":
            return new jsonWorker();
          case "css":
          case "scss":
          case "less":
            return new cssWorker();
          case "html":
          case "handlebars":
          case "razor":
            return new htmlWorker();
          case "typescript":
          case "javascript":
            return new tsWorker();
          default:
            return new editorWorker();
        }
      }
    };
  });

  safeStep("themes", registerAllThemes);
  safeStep("snippets", registerSnippets);

  // TextMate is async; let the editor render with Monarch fallback if it fails.
  void initTextMate().catch((err) => {
    // eslint-disable-next-line no-console
    console.warn("[tinder] TextMate init failed, falling back to Monarch:", err);
  });
}
