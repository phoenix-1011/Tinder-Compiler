import * as monaco from "monaco-editor";

/**
 * Lightweight registry of mounted Monaco editor instances. Used by global
 * commands (find / goto-line / etc.) that need to drive whichever editor is
 * currently active without prop-drilling refs through the React tree.
 */

let active: monaco.editor.IStandaloneCodeEditor | null = null;

export function setActiveEditor(editor: monaco.editor.IStandaloneCodeEditor | null): void {
  active = editor;
}

export function getActiveEditor(): monaco.editor.IStandaloneCodeEditor | null {
  return active;
}

/**
 * Trigger one of Monaco's built-in editor actions on the active editor.
 * Returns true if the action was found and dispatched. Callers use this to
 * fall back to other behaviour when no editor is focused.
 *
 * Common action ids:
 *   actions.find                                  — open find widget
 *   editor.action.startFindReplaceAction          — open find+replace widget
 *   editor.action.gotoLine                        — jump to line
 *   editor.action.commentLine                     — toggle line comment
 *   editor.action.formatDocument                  — format document
 *   editor.action.revealDefinition                — go to definition
 */
export function runEditorAction(actionId: string): boolean {
  const editor = active;
  if (!editor) return false;
  const action = editor.getAction(actionId);
  if (!action) return false;
  void action.run();
  return true;
}
