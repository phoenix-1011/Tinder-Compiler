import { useEffect, useRef } from "react";
import { useSettings } from "./SettingsContext";
import { useWorkspace } from "./WorkspaceContext";

/**
 * Auto-save scheduler — when settings.autoSave === "afterDelay", schedules
 * a save for each dirty document `delayMs` after the last edit. Renders
 * nothing.
 */
export function AutoSave() {
  const { settings } = useSettings();
  const { documents, saveDocument } = useWorkspace();
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (settings.autoSave !== "afterDelay") {
      // Clear any pending timers when auto-save is disabled.
      for (const timer of timersRef.current.values()) clearTimeout(timer);
      timersRef.current.clear();
      return;
    }

    // For every currently dirty document, ensure a debounced save is scheduled.
    for (const doc of documents) {
      const existing = timersRef.current.get(doc.uri);
      if (existing) clearTimeout(existing);
      if (!doc.dirty) {
        timersRef.current.delete(doc.uri);
        continue;
      }
      const timer = setTimeout(() => {
        timersRef.current.delete(doc.uri);
        void saveDocument(doc.uri);
      }, settings.autoSaveDelayMs);
      timersRef.current.set(doc.uri, timer);
    }

    return () => {
      // We don't clear timers on every effect run — only when auto-save is
      // disabled (handled above) or on unmount.
    };
  }, [documents, settings.autoSave, settings.autoSaveDelayMs, saveDocument]);

  // Cleanup on unmount.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  return null;
}
