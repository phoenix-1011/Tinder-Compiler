import { useCallback, useEffect, useRef, useState } from "react";
import { ensureDir, join } from "./chainAssemblyStorage";

/**
 * Canvas-only UI state, persisted per profile to
 * `<dataRoot>/.tinder/state/canvas.json` (C1, C15). This file is a
 * pure UI projection and never enters profile JSON or runtime export.
 *
 * Persisted fields: `inspector` (dock + collapsed), `selection`,
 * `focus` (deprecated D6), `viewport` (pan + zoom), `clusterPositions`
 * (per-cluster drag coords), `customPositions` (per-custom-usage drag
 * coords). Legacy fields `coverageFilter`, `flowLineVisible`,
 * `collapsedGroups` are retained for back-compat with older files.
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

/**
 * react-flow viewport (pan + zoom). Persisted so the user re-enters
 * the same view they left. New profiles default to the
 * DEFAULT_VIEWPORT below (a near-origin position at 85 % zoom that
 * fits the first row of the default swimlane in a standard editor
 * window). Per D5 / D12 of profile-canvas-freeform-uiux.
 */
export interface CanvasViewportState {
  x: number;
  y: number;
  zoom: number;
}

export interface CanvasPerProfileState {
  /**
   * @deprecated D6 — coverage filter is withdrawn in the freeform
   * canvas. Kept in the schema only for back-compat with canvas.json
   * files written by the previous canvas. Always treated as `false`.
   */
  coverageFilter: boolean;
  /**
   * @deprecated D6 — flow-line visibility toggle is withdrawn (the
   * directional edges are always shown). Kept for back-compat.
   */
  flowLineVisible: boolean;
  collapsedGroups: string[];
  inspector: CanvasInspectorState;
  /** Currently selected canvas entity; null when nothing is selected. */
  selection: CanvasSelection | null;
  /**
   * @deprecated D6 — locked focus heavy layer is withdrawn (pan +
   * zoom replaces it). Kept for back-compat; future writes leave
   * the default values.
   */
  focus: CanvasFocusState;
  /**
   * react-flow viewport (pan + zoom). Persisted per profile per D5.
   * `onViewportChange` writes here through the debounced setter.
   */
  viewport: CanvasViewportState;
  /**
   * Per-cluster (x, y) keyed by docSlug — D5. Clusters absent from
   * the map fall back to the default horizontal-swimlane layout
   * computed at projection time.
   */
  clusterPositions: Record<string, { x: number; y: number }>;
  /**
   * Per-custom-usage (x, y) keyed by the usage's array index in
   * `profile.custom_node_usages` (the same stable id used by
   * reorder mutations) — D5. Entries absent from the map fall back
   * to a default position next to the canonical anchor's cluster.
   */
  customPositions: Record<number, { x: number; y: number }>;
}

interface CanvasStateFile {
  schema_version: 1;
  profiles: Record<string, CanvasPerProfileState>;
}

export const CANVAS_STATE_DIR = "state";
export const CANVAS_STATE_FILE = "canvas.json";

/**
 * Default viewport — chosen to fit the first row of the default
 * horizontal swimlane (~2000 px wide at zoom 1) inside a standard
 * editor window. The user can pan / zoom from there.
 */
export const DEFAULT_VIEWPORT: CanvasViewportState = {
  x: 0,
  y: 0,
  zoom: 0.85
};

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
  focus: { locked: false, target: null, radius: 2 },
  viewport: DEFAULT_VIEWPORT,
  clusterPositions: {},
  customPositions: {}
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
  // Freeform-canvas additions (D5) — all three are additive and
  // back-compat: older files written by the previous canvas have
  // none of these and hydrate to defaults via normalization below.
  if (v.viewport !== undefined && v.viewport !== null) {
    if (typeof v.viewport !== "object") return false;
  }
  if (v.clusterPositions !== undefined && v.clusterPositions !== null) {
    if (typeof v.clusterPositions !== "object") return false;
  }
  if (v.customPositions !== undefined && v.customPositions !== null) {
    if (typeof v.customPositions !== "object") return false;
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
  const rawViewport = raw.viewport as
    | Partial<CanvasViewportState>
    | undefined
    | null;
  const viewport: CanvasViewportState = {
    x: typeof rawViewport?.x === "number" ? rawViewport.x : DEFAULT_VIEWPORT.x,
    y: typeof rawViewport?.y === "number" ? rawViewport.y : DEFAULT_VIEWPORT.y,
    zoom:
      typeof rawViewport?.zoom === "number" && rawViewport.zoom > 0
        ? rawViewport.zoom
        : DEFAULT_VIEWPORT.zoom
  };
  return {
    ...raw,
    selection: raw.selection ?? null,
    focus,
    viewport,
    clusterPositions: raw.clusterPositions ?? {},
    customPositions: raw.customPositions ?? {}
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
 * Patch shape accepted by `setState`. Nested objects (`inspector`,
 * `focus`) are themselves Partial so callers can update a single
 * sub-field without re-specifying the full sub-object.
 * `clusterPositions` and `customPositions` merge additively
 * (spread prev + patch) — use `pruneStalePositions` for key removal.
 */
export type CanvasStatePatch = Partial<
  Omit<CanvasPerProfileState, "inspector" | "focus">
> & {
  inspector?: Partial<CanvasInspectorState>;
  focus?: Partial<CanvasFocusState>;
};

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
export function useCanvasPersistedState(
  tinderDir: string | null,
  profileId: string | null
): {
  state: CanvasPerProfileState;
  setState: (patch: CanvasStatePatch) => void;
  /**
   * Remove position keys that no longer map to a live projection
   * entity. Unlike `setState` (which merges positions additively),
   * this replaces both position maps with the pruned copies.
   */
  pruneStalePositions: (
    validClusterSlugs: Set<string>,
    validCustomIdxs: Set<number>
  ) => void;
  /**
   * Clear all saved cluster positions, reverting to the computed
   * default layout. Custom node positions are preserved.
   */
  resetClusterPositions: () => void;
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
  // Debounce + unmount-flush plumbing. The pending payload captures
  // `profileId` at the time of the setState call — critical because
  // the debounce may outlast a profile-dropdown switch in canvas
  // mode (G2): if we read `profileId` from the closure at flush
  // time, the previous profile's state could be written into the
  // new profile's canvas.json slot, corrupting both.
  const writeTimerRef = useRef<number | null>(null);
  const pendingWriteRef = useRef<{
    tinderDir: string;
    profileId: string;
    state: CanvasPerProfileState;
  } | null>(null);

  const flushPending = useCallback(async () => {
    if (writeTimerRef.current != null) {
      window.clearTimeout(writeTimerRef.current);
      writeTimerRef.current = null;
    }
    const pending = pendingWriteRef.current;
    pendingWriteRef.current = null;
    if (!pending) return;
    // Use the captured profileId from the pending entry, NOT the
    // current closure value — otherwise a profile-dropdown switch
    // during the debounce window writes the previous profile's
    // state into the new profile's slot (G2).
    const nextFile: CanvasStateFile = {
      schema_version: 1,
      profiles: {
        ...fileRef.current.profiles,
        [pending.profileId]: pending.state
      }
    };
    fileRef.current = nextFile;
    try {
      await writeCanvasFile(pending.tinderDir, nextFile);
    } catch {
      /* Persistence failure is non-fatal: state stays in memory and
         the next change will retry the write. */
    }
  }, []);

  // Reset state when the keying inputs change. Important so opening
  // a different profile in canvas mode doesn't briefly show the
  // previous profile's preferences. Declared *after* `flushPending`
  // so the in-effect call resolves to the defined callback.
  useEffect(() => {
    let cancelled = false;
    // Flush any pending write from the previous profile before
    // switching. The pending payload already carries its own
    // profileId (G2 fix) so the write lands in the correct slot
    // even if the user is in the middle of switching profiles.
    // We don't await because the next read overlaps the write
    // cycle harmlessly (different file slots).
    void flushPending();
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
    // flushPending has stable identity (useCallback with []) so it
    // doesn't need to be in the deps list — including it would re-
    // trigger the loader on every render, which loses the cancel
    // semantics. Effect re-runs only on keying-input changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tinderDir, profileId]);

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
          focus: { ...prev.focus, ...(patch.focus ?? {}) },
          clusterPositions: { ...prev.clusterPositions, ...(patch.clusterPositions ?? {}) },
          customPositions: { ...prev.customPositions, ...(patch.customPositions ?? {}) }
        };
        if (tinderDir && profileId) {
          // Capture profileId NOW so the write — possibly fired after
          // the user switches profiles — still targets the slot the
          // edit was meant for.
          pendingWriteRef.current = { tinderDir, profileId, state: merged };
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

  const pruneStalePositions = useCallback(
    (validClusterSlugs: Set<string>, validCustomIdxs: Set<number>) => {
      _setState((prev) => {
        let changed = false;
        const nextCluster: Record<string, { x: number; y: number }> = {};
        for (const [k, v] of Object.entries(prev.clusterPositions)) {
          if (validClusterSlugs.has(k)) {
            nextCluster[k] = v;
          } else {
            changed = true;
          }
        }
        const nextCustom: Record<number, { x: number; y: number }> = {};
        for (const [k, v] of Object.entries(prev.customPositions)) {
          const idx = Number(k);
          if (validCustomIdxs.has(idx)) {
            nextCustom[idx] = v;
          } else {
            changed = true;
          }
        }
        if (!changed) return prev;
        const merged: CanvasPerProfileState = {
          ...prev,
          clusterPositions: nextCluster,
          customPositions: nextCustom
        };
        if (tinderDir && profileId) {
          pendingWriteRef.current = { tinderDir, profileId, state: merged };
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

  const resetClusterPositions = useCallback(() => {
    _setState((prev) => {
      if (Object.keys(prev.clusterPositions).length === 0) return prev;
      const merged: CanvasPerProfileState = {
        ...prev,
        clusterPositions: {}
      };
      if (tinderDir && profileId) {
        pendingWriteRef.current = { tinderDir, profileId, state: merged };
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
  }, [tinderDir, profileId, flushPending]);

  return { state, setState, pruneStalePositions, resetClusterPositions, loaded };
}
