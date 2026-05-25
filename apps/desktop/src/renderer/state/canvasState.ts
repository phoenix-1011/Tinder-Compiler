import { useCallback, useEffect, useRef, useState } from "react";
import { ensureDir, join } from "./chainAssemblyStorage";

/**
 * Canvas-only UI state, persisted per profile to
 * `<dataRoot>/.tinder/state/canvas.json` (C1, C15). This file is a
 * pure UI projection and never enters profile JSON or runtime export.
 *
 * Phase 2 persists a minimal subset of the requirement.md schema:
 * `coverageFilter`, `flowLineVisible`, `collapsedGroups`, and the
 * inspector dock/collapsed state (Phase 3 will use the dock fields).
 * Other fields (focus, scroll, selection, collapsedSlots) are added
 * in later phases.
 *
 * Loss-tolerant: missing or invalid file → defaults. Never blocks
 * profile loading.
 */

export interface CanvasInspectorState {
  dock: "right" | "bottom";
  collapsed: boolean;
}

/**
 * The currently selected canvas entity. Persisted so the inspector
 * shows the same selection across reloads. Slot is keyed by chain
 * node id; coverage by (chain node, resource); custom by its
 * `arrayIndex` into `profile.custom_node_usages` (the same key used
 * by reorder / shift mutations).
 */
export type CanvasSelection =
  | { kind: "slot"; chainNodeId: string }
  | {
      kind: "coverage";
      chainNodeId: string;
      resourceInstanceId: string;
      variantId: string;
    }
  | { kind: "custom"; usageArrayIndex: number };

/**
 * Locked focus state (C10). When `locked === true`, the canvas
 * filters its rendered nodes to `target ± radius` in canonical
 * execution order, folding non-windowed group panels to title
 * strips. `target === null` while locked means "no target yet" and
 * the canvas behaves as if unlocked.
 *
 * Radius counts ALL nodes (slot + custom) per Resolved Edge Case
 * "Locked Focus Geometry → Radius counting". Cross-group span is
 * allowed; coverage filter is applied first (in the projection),
 * then radius is computed over the filtered list.
 */
export interface CanvasFocusState {
  locked: boolean;
  target: CanvasSelection | null;
  /** ± N neighbors. Default 2 per Resolved Edge Cases. */
  radius: number;
}

export interface CanvasPerProfileState {
  coverageFilter: boolean;
  flowLineVisible: boolean;
  collapsedGroups: string[];
  inspector: CanvasInspectorState;
  /** Currently selected canvas entity; null when nothing is selected. */
  selection: CanvasSelection | null;
  /** Locked focus state (C10); see CanvasFocusState. */
  focus: CanvasFocusState;
}

interface CanvasStateFile {
  schema_version: 1;
  profiles: Record<string, CanvasPerProfileState>;
}

export const CANVAS_STATE_DIR = "state";
export const CANVAS_STATE_FILE = "canvas.json";

export const DEFAULT_CANVAS_PER_PROFILE: CanvasPerProfileState = {
  coverageFilter: true,
  flowLineVisible: true,
  collapsedGroups: [],
  // Inspector defaults to right + expanded (Phase 3+). Phase 1
  // started with `collapsed: true` because there was no content;
  // once we have real inspector content, expanded is the more
  // useful initial state per the C4 "self-sufficient canvas" intent.
  inspector: { dock: "right", collapsed: false },
  selection: null,
  focus: { locked: false, target: null, radius: 2 }
};

const DEBOUNCE_MS = 250;

function isPerProfileState(value: unknown): value is CanvasPerProfileState {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<CanvasPerProfileState>;
  if (typeof v.coverageFilter !== "boolean") return false;
  if (typeof v.flowLineVisible !== "boolean") return false;
  if (!Array.isArray(v.collapsedGroups)) return false;
  if (
    !v.inspector ||
    typeof v.inspector !== "object" ||
    (v.inspector.dock !== "right" && v.inspector.dock !== "bottom") ||
    typeof v.inspector.collapsed !== "boolean"
  ) {
    return false;
  }
  // `selection` is additive in Phase 3; older files may omit it. We
  // accept both `undefined`, `null`, and a structurally-valid value
  // and then normalize the hydrated state below.
  if (v.selection !== undefined && v.selection !== null) {
    if (typeof v.selection !== "object") return false;
    const sel = v.selection as { kind?: string };
    if (
      sel.kind !== "slot" &&
      sel.kind !== "coverage" &&
      sel.kind !== "custom"
    ) {
      return false;
    }
  }
  // `focus` is additive in Phase 5; allow missing or any
  // structurally-valid value. We re-normalize fields below.
  if (v.focus !== undefined && v.focus !== null) {
    if (typeof v.focus !== "object") return false;
  }
  return true;
}

/**
 * Normalize a hydrated slot — older files that pre-date Phase 3
 * may not include `selection`. Backfill defaults so downstream code
 * can treat the field as required.
 */
function normalizePerProfileState(
  raw: CanvasPerProfileState
): CanvasPerProfileState {
  const rawFocus = raw.focus as Partial<CanvasFocusState> | undefined | null;
  const focus: CanvasFocusState = {
    locked: typeof rawFocus?.locked === "boolean" ? rawFocus.locked : false,
    target: rawFocus?.target ?? null,
    radius:
      typeof rawFocus?.radius === "number" && rawFocus.radius >= 0
        ? rawFocus.radius
        : 2
  };
  return {
    ...raw,
    selection: raw.selection ?? null,
    focus
  };
}

async function readCanvasFile(
  tinderDir: string | null
): Promise<CanvasStateFile | null> {
  if (!tinderDir) return null;
  const stateDir = await join(tinderDir, CANVAS_STATE_DIR);
  const filePath = await join(stateDir, CANVAS_STATE_FILE);
  // tryReadText avoids throwing when the file doesn't yet exist —
  // first canvas-mode open is a no-file case.
  const raw = await window.tinder.tryReadText(filePath);
  if (raw == null) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      (parsed as CanvasStateFile).schema_version === 1 &&
      typeof (parsed as CanvasStateFile).profiles === "object"
    ) {
      return parsed as CanvasStateFile;
    }
    return null;
  } catch {
    return null;
  }
}

async function writeCanvasFile(
  tinderDir: string,
  file: CanvasStateFile
): Promise<void> {
  const stateDir = await join(tinderDir, CANVAS_STATE_DIR);
  await ensureDir(stateDir);
  const filePath = await join(stateDir, CANVAS_STATE_FILE);
  await window.tinder.writeText(filePath, JSON.stringify(file, null, 2));
}

/**
 * Load + persist canvas state for a single profile.
 *
 * - On mount (and whenever `profileId` / `tinderDir` change): reads
 *   the file, hydrates state from the matching per-profile slot, and
 *   falls back to defaults if absent or invalid.
 * - On state change: debounced write back to disk (DEBOUNCE_MS) that
 *   merges the patched slot into the existing file, preserving other
 *   profiles' state.
 * - On unmount: flushes any pending write so a fast mode-switch
 *   doesn't lose the latest change.
 *
 * Returns the per-profile state + a patcher. `loaded` is true once
 * the first read has resolved; callers can render skeleton UI before
 * that to avoid a brief flash of default state.
 */
/**
 * Patch shape accepted by `setState`. Nested objects (`inspector`,
 * `focus`) are themselves Partial so callers can update a single
 * sub-field without re-specifying the full sub-object.
 */
export type CanvasStatePatch = Partial<
  Omit<CanvasPerProfileState, "inspector" | "focus">
> & {
  inspector?: Partial<CanvasInspectorState>;
  focus?: Partial<CanvasFocusState>;
};

export function useCanvasPersistedState(
  tinderDir: string | null,
  profileId: string | null
): {
  state: CanvasPerProfileState;
  setState: (patch: CanvasStatePatch) => void;
  loaded: boolean;
} {
  const [state, _setState] = useState<CanvasPerProfileState>(
    DEFAULT_CANVAS_PER_PROFILE
  );
  const [loaded, setLoaded] = useState<boolean>(false);

  // Latest known file contents so we can merge per-profile writes
  // without clobbering other profiles' slots. Updated on read and
  // after each successful write.
  const fileRef = useRef<CanvasStateFile>({ schema_version: 1, profiles: {} });
  // Debounce + unmount-flush plumbing.
  const writeTimerRef = useRef<number | null>(null);
  const pendingWriteRef = useRef<{
    tinderDir: string;
    state: CanvasPerProfileState;
  } | null>(null);

  // Reset state when the keying inputs change. Important so opening
  // a different profile in canvas mode doesn't briefly show the
  // previous profile's preferences.
  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    _setState(DEFAULT_CANVAS_PER_PROFILE);

    if (!tinderDir || !profileId) {
      // Nothing to load; mark as loaded so consumers stop showing
      // the skeleton.
      setLoaded(true);
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      const file = await readCanvasFile(tinderDir);
      if (cancelled) return;
      if (file) {
        fileRef.current = file;
        const slot = file.profiles[profileId];
        if (slot && isPerProfileState(slot)) {
          _setState(normalizePerProfileState(slot));
        }
      }
      setLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [tinderDir, profileId]);

  const flushPending = useCallback(async () => {
    if (writeTimerRef.current != null) {
      window.clearTimeout(writeTimerRef.current);
      writeTimerRef.current = null;
    }
    const pending = pendingWriteRef.current;
    pendingWriteRef.current = null;
    if (!pending || !profileId) return;
    const nextFile: CanvasStateFile = {
      schema_version: 1,
      profiles: {
        ...fileRef.current.profiles,
        [profileId]: pending.state
      }
    };
    fileRef.current = nextFile;
    try {
      await writeCanvasFile(pending.tinderDir, nextFile);
    } catch {
      /* Persistence failure is non-fatal: state stays in memory and
         the next change will retry the write. */
    }
  }, [profileId]);

  // On unmount: flush whatever's pending. Don't await — unmount is
  // synchronous; an async tail kicked off here finishes in the
  // background before the renderer process tears down.
  useEffect(() => {
    return () => {
      void flushPending();
    };
  }, [flushPending]);

  const setState = useCallback(
    (patch: CanvasStatePatch) => {
      _setState((prev) => {
        const merged: CanvasPerProfileState = {
          ...prev,
          ...patch,
          inspector: { ...prev.inspector, ...(patch.inspector ?? {}) },
          focus: { ...prev.focus, ...(patch.focus ?? {}) }
        };
        if (tinderDir && profileId) {
          pendingWriteRef.current = { tinderDir, state: merged };
          if (writeTimerRef.current != null) {
            window.clearTimeout(writeTimerRef.current);
          }
          writeTimerRef.current = window.setTimeout(() => {
            writeTimerRef.current = null;
            void flushPending();
          }, DEBOUNCE_MS);
        }
        return merged;
      });
    },
    [tinderDir, profileId, flushPending]
  );

  return { state, setState, loaded };
}
