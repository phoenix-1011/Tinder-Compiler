import { useEffect, useRef } from "react";
import * as monaco from "monaco-editor";
import { setActiveEditor } from "../monaco/registry";
import { useTheme } from "../state/ThemeContext";
import { useSettings } from "../state/SettingsContext";

interface RevealTarget {
  line: number;
  column: number;
  /** Increments on every reveal; the editor only reacts when this changes. */
  token: number;
}

interface MonacoEditorProps {
  value: string;
  language: string;
  onChange?(value: string): void;
  onSave?(): void;
  /** When set, jump the editor to this position. */
  reveal?: RevealTarget | null;
}

export function MonacoEditor({ value, language, onChange, onSave, reveal }: MonacoEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const lastRevealTokenRef = useRef<number>(reveal?.token ?? -1);
  const { current: themeId } = useTheme();
  const { settings } = useSettings();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    if (!hostRef.current) return;
    const s = settingsRef.current;
    const editor = monaco.editor.create(hostRef.current, {
      value,
      language,
      theme: themeId,
      automaticLayout: true,
      fontFamily: s.fontFamily,
      fontSize: s.fontSize,
      tabSize: s.tabSize,
      insertSpaces: s.insertSpaces,
      wordWrap: s.wordWrap,
      lineNumbers: s.lineNumbers,
      renderWhitespace: s.renderWhitespace,
      cursorBlinking: s.cursorBlinking,
      minimap: { enabled: s.minimap },
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: "active", indentation: true },
      cursorSmoothCaretAnimation: "on",
      formatOnType: false,
      formatOnPaste: false
    });
    editorRef.current = editor;

    // Bind Ctrl/Cmd+S inside Monaco — global keydown does not fire while
    // Monaco has focus because Monaco preventDefaults it.
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSaveRef.current?.();
    });

    const sub = editor.onDidChangeModelContent(() => {
      onChange?.(editor.getValue());
    });

    const onFocus = editor.onDidFocusEditorText(() => setActiveEditor(editor));
    const onBlur = editor.onDidBlurEditorWidget(() => {
      // Keep active set unless another editor takes focus.
    });
    setActiveEditor(editor);

    return () => {
      sub.dispose();
      onFocus.dispose();
      onBlur.dispose();
      setActiveEditor(null);
      editor.dispose();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (editor.getValue() !== value) editor.setValue(value);
  }, [value]);

  useEffect(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (model) monaco.editor.setModelLanguage(model, language);
  }, [language]);

  // Live-apply settings changes without recreating the editor.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.updateOptions({
      fontFamily: settings.fontFamily,
      fontSize: settings.fontSize,
      tabSize: settings.tabSize,
      insertSpaces: settings.insertSpaces,
      wordWrap: settings.wordWrap,
      lineNumbers: settings.lineNumbers,
      renderWhitespace: settings.renderWhitespace,
      cursorBlinking: settings.cursorBlinking,
      minimap: { enabled: settings.minimap }
    });
  }, [settings]);

  // React to theme switches.
  useEffect(() => {
    monaco.editor.setTheme(themeId);
  }, [themeId]);

  // Reveal/jump support — driven by token bump from WorkspaceContext.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !reveal) return;
    if (reveal.token === lastRevealTokenRef.current) return;
    lastRevealTokenRef.current = reveal.token;

    const lineNumber = Math.max(1, reveal.line);
    const column = Math.max(1, reveal.column);
    editor.revealLineInCenterIfOutsideViewport(lineNumber, monaco.editor.ScrollType.Smooth);
    editor.setPosition({ lineNumber, column });
    editor.focus();
  }, [reveal]);

  return <div ref={hostRef} className="monaco-host" />;
}
