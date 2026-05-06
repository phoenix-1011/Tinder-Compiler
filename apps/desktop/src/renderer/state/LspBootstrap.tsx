import { useEffect } from "react";
import { useWorkspace } from "./WorkspaceContext";
import { syncLanguageServers, stopAll } from "../lsp/manager";

/**
 * Mounted once near the top of the app. Whenever the active workspace folder
 * changes, asks the LSP manager to start the right set of language servers.
 * Servers that aren't on PATH are silently skipped.
 */
export function LspBootstrap() {
  const { folder } = useWorkspace();

  useEffect(() => {
    if (!folder) return;
    let cancelled = false;
    void (async () => {
      try {
        await syncLanguageServers(folder.path);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[tinder] LSP bootstrap failed:", err);
      }
      if (cancelled) await stopAll();
    })();
    return () => {
      cancelled = true;
    };
  }, [folder?.path]);

  useEffect(() => {
    return () => {
      void stopAll();
    };
  }, []);

  return null;
}
