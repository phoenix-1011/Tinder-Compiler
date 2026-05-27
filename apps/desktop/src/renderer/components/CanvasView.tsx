import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Viewport } from "@xyflow/react";
import { useCa } from "../state/ChainAssemblyContext";
import { useUI } from "../state/UIContext";
import { useWorkspace } from "../state/WorkspaceContext";
import {
  collectProfileV2Resources,
  flattenLeaves
} from "../state/chainAssemblyStorage";
import {
  buildCanvasProjection,
  lensNeighborTokens,
  type CanvasProjection
} from "../state/canvasProjection";
import {
  useCanvasPersistedState,
  type CanvasSelection
} from "../state/canvasState";
import { profileResourceBranchId } from "@tinder/nextstep";
import { CanvasInspector } from "./CanvasInspector";
import { CanvasBatchCandidatePanel } from "./CanvasBatchCandidatePanel";
import { CanvasSharedBranchDialog } from "./CanvasSharedBranchDialog";
import {
  CanvasFreeformBody,
  type CanvasFreeformHandle,
  CLUSTER_LABELS,
  clusterColor
} from "./CanvasFreeformBody";
import { ContextMenu, useContextMenu, type ContextMenuItem } from "./ContextMenu";

// ──────────────────────────────────────────────────────────────────
// Cluster Picker — browser-search-bar style dropdown for quick
// navigation to any cluster. Input at top, filtered list below.
// ──────────────────────────────────────────────────────────────────

/** All cluster entries for the picker — order matches kill-chain progression. */
const CLUSTER_ENTRIES = Object.entries(CLUSTER_LABELS).map(([slug, label]) => ({ slug, label }));

function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

function ClusterPicker({
  open,
  onClose,
  onPick
}: {
  open: boolean;
  onClose: () => void;
  onPick: (slug: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!query.trim()) return CLUSTER_ENTRIES;
    return CLUSTER_ENTRIES.filter((e) => fuzzyMatch(query, e.label) || fuzzyMatch(query, e.slug));
  }, [query]);

  useEffect(() => {
    if (activeIdx >= filtered.length) setActiveIdx(Math.max(0, filtered.length - 1));
  }, [filtered.length, activeIdx]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  if (!open) return null;

  const pick = (slug: string) => { onClose(); onPick(slug); };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(filtered.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const item = filtered[activeIdx];
      if (item) pick(item.slug);
    }
  };

  return (
    <div className="cluster-picker-backdrop" onMouseDown={onClose}>
      <div className="cluster-picker" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="cluster-picker-input"
          placeholder="搜索簇…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActiveIdx(0); }}
          onKeyDown={onKeyDown}
          spellCheck={false}
        />
        {filtered.length === 0 ? (
          <div className="cluster-picker-empty">无匹配簇</div>
        ) : (
          <ul className="cluster-picker-list" ref={listRef}>
            {filtered.map((entry, idx) => (
              <li
                key={entry.slug}
                data-idx={idx}
                className={`cluster-picker-row${idx === activeIdx ? " is-active" : ""}`}
                onMouseEnter={() => setActiveIdx(idx)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(entry.slug)}
              >
                <span
                  className="cluster-picker-dot"
                  style={{ background: clusterColor(entry.slug) }}
                  aria-hidden="true"
                />
                <span className="cluster-picker-label">{entry.label}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Freeform canvas (D-series): @xyflow/react viewport with draggable
 * category clusters, free-positioned custom nodes, pan/zoom, and
 * the existing inspector / library / checkpoint semantics carried
 * from the C-series phases.
 */
export function CanvasView() {
  const { canvasProfileId, enterCanvasMode, exitCanvasMode, openResourceBranch } =
    useWorkspace();
  const { sidebarVisible, toggleSidebar } = useUI();
  const ca = useCa();
  const { disk } = ca;
  const cm = useContextMenu();
  const freeformRef = useRef<CanvasFreeformHandle>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [clusterPickerOpen, setClusterPickerOpen] = useState(false);

  // Shared-branch guard pending state — non-null while the dialog
  // is open. Carries the requested jump target so accepting either
  // action knows what was originally requested.
  const [sharedGuard, setSharedGuard] = useState<{
    target: {
      resourceKind: "standard" | "custom";
      resourceInstanceId: string;
      branchId: string;
    };
    usageCount: number;
  } | null>(null);

  const profile = useMemo(() => {
    if (!canvasProfileId || !disk) return null;
    return disk.profiles.find((p) => p.id === canvasProfileId) ?? null;
  }, [canvasProfileId, disk]);

  // ────────── Checkpoint model (UX4) ──────────────────────────────
  // Architectural note: canvas writes are LIVE — every action
  // already hits profile JSON on disk (C1). The checkpoint model
  // sits on top: a baseline snapshot (in-memory, serialized JSON)
  // marks the user's last "保存" point. 保存 advances the baseline
  // to current; 重置 writes the baseline back to disk to undo all
  // changes since the last 保存. The `dirty` flag is derived from
  // comparing the live profile.project to the baseline.
  const baselineRef = useRef<string | null>(null);
  // savedAt drives the status pill's "已保存 N 秒前" text and acts
  // as the re-render hook when 保存 / canvas-enter advances the
  // baseline (mutations to a ref alone don't re-render).
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Re-snapshot baseline on canvas-enter or profile-switch. The
  // dep is profile?.id so switching profiles via the top-bar
  // dropdown also resets the baseline cleanly.
  useEffect(() => {
    if (!profile) {
      baselineRef.current = null;
      setSavedAt(null);
      return;
    }
    baselineRef.current = JSON.stringify(profile.project);
    setSavedAt(Date.now());
  }, [profile?.id]);

  // Live serialization of profile.project. We compute this regardless
  // of `dirty` because it's reused by the save / reset handlers below.
  const liveSerialized = useMemo(
    () => (profile ? JSON.stringify(profile.project) : null),
    [profile?.project]
  );
  const dirty = useMemo(
    () =>
      profile != null &&
      baselineRef.current != null &&
      liveSerialized != null &&
      liveSerialized !== baselineRef.current,
    // savedAt forces a recompute when 保存 advances the baseline,
    // since baselineRef is a ref and doesn't trigger renders.
    [profile, liveSerialized, savedAt]
  );

  const onSave = useCallback(() => {
    if (!profile || !liveSerialized) return;
    baselineRef.current = liveSerialized;
    setSavedAt(Date.now());
  }, [profile, liveSerialized]);

  const onReset = useCallback(async () => {
    if (!profile || baselineRef.current === null) return;
    const ok = await ca.dialogConfirm({
      title: "重置画布到上次保存",
      message:
        "自上次保存以来的所有改动将被撤销，profile JSON 会被覆盖回到上次保存的状态。继续？",
      destructive: true,
      okLabel: "重置"
    });
    if (!ok) return;
    try {
      await window.tinder.writeText(profile.id, baselineRef.current);
      await ca.reload();
      // baselineRef stays where it was; after reload the new
      // profile.project will match the baseline and `dirty` clears.
    } catch (err) {
      await ca.dialogNotify({
        title: "重置失败",
        message: String(err)
      });
    }
  }, [profile, ca]);

  /**
   * Exit guard for all canvas-mode exit paths (← 返回, C13 jump,
   * C21 jump, double-click full-editor, profile-dropdown switch,
   * `+ 新建档案`). When dirty, present a save/discard/cancel
   * dialog before calling `proceed`. Save commits the checkpoint
   * but leaves disk content alone (already current). Discard
   * writes the baseline back to disk first (undo). Cancel keeps
   * the user in canvas with their changes intact.
   */
  const guardedExit = useCallback(
    async (proceed: () => void | Promise<void>) => {
      if (!dirty || !profile || baselineRef.current === null) {
        await proceed();
        return;
      }
      const choice = await ca.dialogPickOne({
        title: "未保存的改动",
        message:
          "当前画布有未保存的改动。继续之前要怎么处理？",
        options: [
          { id: "save", label: "保存改动并继续（标记当前为新检查点）" },
          {
            id: "discard",
            label: "放弃改动并继续（恢复到上次保存）"
          }
        ]
      });
      if (choice === null) return; // cancel → stay in canvas
      if (choice === "save") {
        onSave();
        await proceed();
        return;
      }
      // discard → revert disk, then proceed
      try {
        await window.tinder.writeText(profile.id, baselineRef.current);
        await ca.reload();
      } catch (err) {
        await ca.dialogNotify({
          title: "回滚失败",
          message: String(err)
        });
        return;
      }
      await proceed();
    },
    [dirty, profile, ca, onSave]
  );

  const tinderDir = disk?.paths.tinderDir ?? null;
  const { state, setState, pruneStalePositions, loaded } = useCanvasPersistedState(
    tinderDir,
    profile?.id ?? null
  );

  const v2Resources = useMemo(
    () =>
      disk && profile ? collectProfileV2Resources(disk, profile.project) : [],
    [disk, profile]
  );
  const flatCustom = useMemo(
    () => (disk ? flattenLeaves(disk.customTree) : []),
    [disk]
  );

  // D6: coverage filter withdrawn — always show all 84 chain nodes.
  const projection = useMemo<CanvasProjection | null>(() => {
    if (!profile) return null;
    return buildCanvasProjection(
      profile.project,
      v2Resources,
      flatCustom,
      false
    );
  }, [profile, v2Resources, flatCustom]);

  const lensTokens = useMemo(
    () =>
      projection
        ? lensNeighborTokens(projection, state.selection)
        : null,
    [projection, state.selection]
  );

  const setSelection = useCallback(
    (next: CanvasSelection | null) => {
      setState({ selection: next });
    },
    [setState]
  );

  const onCanvasKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelection(null);
        return;
      }
      const mod = event.ctrlKey || event.metaKey;
      // Ctrl+\ — fit all nodes into view
      if (mod && event.key === "\\") {
        event.preventDefault();
        freeformRef.current?.fitAll();
        return;
      }
      // Ctrl+Shift+\ — fit selected node / cluster into view
      if (mod && event.shiftKey && event.key === "|") {
        event.preventDefault();
        freeformRef.current?.fitSelection();
        return;
      }
    },
    [setSelection]
  );

  /**
   * Count how many profile slots (across all profiles) currently
   * reference (kind, resourceInstanceId, branchId). >1 means the
   * branch is shared and the C13 guard must intercept the jump.
   */
  const countBranchUsage = useCallback(
    (
      kind: "standard" | "custom",
      resourceInstanceId: string,
      branchId: string
    ): number => {
      if (!disk) return 0;
      let count = 0;
      for (const p of disk.profiles) {
        for (const ref of p.project.resources ?? []) {
          if (ref.kind !== kind) continue;
          if (ref.resource_instance_id !== resourceInstanceId) continue;
          if (profileResourceBranchId(ref) !== branchId) continue;
          count += 1;
        }
      }
      return count;
    },
    [disk]
  );

  /**
   * Execute the actual C21 jump-out: secondary confirmation, exit
   * canvas, open the ResourceBranchView tab. Shared branches go
   * through `onOpenFullEditor` first which routes them through the
   * C13 dialog before invoking this directly.
   */
  const proceedJumpToFullEditor = useCallback(
    async (target: {
      resourceKind: "standard" | "custom";
      resourceInstanceId: string;
      branchId: string;
    }) => {
      const ok = await ca.dialogConfirm({
        title: "切换到「配置档案编辑」？",
        message:
          `即将打开 ${target.resourceInstanceId} / ${target.branchId} 的完整编辑器。\n` +
          `画布将退出，UI 状态 (聚焦 / 折叠 / scroll / inspector dock) 已保存，可下次回到画布恢复。`,
        okLabel: "继续"
      });
      if (!ok) return;
      // Route through guardedExit so any unsaved checkpoint state
      // triggers the save/discard/cancel prompt before the jump.
      void guardedExit(() => {
        exitCanvasMode();
        openResourceBranch({
          scope: "global",
          resourceId: target.resourceInstanceId,
          resourceKind: target.resourceKind,
          branchId: target.branchId,
          displayName: target.resourceInstanceId
        });
      });
    },
    [ca, guardedExit, exitCanvasMode, openResourceBranch]
  );

  /**
   * C21 jump entry point invoked from the inspector. Wraps the
   * actual jump with the C13 shared-branch guard: if the branch is
   * referenced by more than one profile slot, the dialog opens so
   * the user can either create a profile-local branch or proceed
   * with the global edit.
   */
  const onOpenFullEditor = useCallback(
    (target: {
      resourceKind: "standard" | "custom";
      resourceInstanceId: string;
      branchId: string;
    }) => {
      if (!profile) return;
      const usageCount = countBranchUsage(
        target.resourceKind,
        target.resourceInstanceId,
        target.branchId
      );
      if (usageCount > 1) {
        setSharedGuard({ target, usageCount });
        return;
      }
      void proceedJumpToFullEditor(target);
    },
    [profile, countBranchUsage, proceedJumpToFullEditor]
  );

  const onCreateProfileBranchFromGuard = useCallback(async () => {
    if (!profile || !sharedGuard) return;
    const newBranchId = await ca.createProfileBranchFromCurrent(
      profile.id,
      sharedGuard.target.resourceKind,
      sharedGuard.target.resourceInstanceId
    );
    setSharedGuard(null);
    if (!newBranchId) return;
    // No jump — the user wanted to keep editing in canvas. Just
    // selecting the new coverage card on the canvas keeps the UX
    // coherent: future edits target the new branch automatically
    // via the pin transfer that createProfileBranchFromCurrent
    // performed internally.
  }, [profile, sharedGuard, ca]);

  const onJumpFromGuard = useCallback(() => {
    if (!sharedGuard) return;
    const target = sharedGuard.target;
    setSharedGuard(null);
    void proceedJumpToFullEditor(target);
  }, [sharedGuard, proceedJumpToFullEditor]);

  // Profile-dropdown change: route through guardedExit so any
  // unsaved checkpoint state for the *current* profile triggers
  // the save/discard prompt before switching.
  const onProfileDropdownChange = useCallback(
    (nextValue: string) => {
      if (nextValue === "__new__") {
        void guardedExit(async () => {
          const newPath = await ca.newProfile();
          if (newPath) enterCanvasMode(newPath);
        });
        return;
      }
      if (!profile || nextValue === profile.id) return;
      void guardedExit(() => {
        enterCanvasMode(nextValue);
      });
    },
    [profile, guardedExit, ca, enterCanvasMode]
  );

  // ← 返回 button — same exit guard.
  const onBackClick = useCallback(() => {
    void guardedExit(() => exitCanvasMode());
  }, [guardedExit, exitCanvasMode]);

  // Stable callback ref for context menu — avoids a new arrow on
  // every render that would invalidate the rfNodes useMemo in
  // CanvasFreeformBody and trigger a full node-tree rebuild (A1).
  const onCardContextMenu = useCallback(
    (e: React.MouseEvent, items: ContextMenuItem[]) => cm.open(e, items),
    [cm]
  );

  const onClusterDragEnd = useCallback(
    (docSlug: string, position: { x: number; y: number }) => {
      setState({ clusterPositions: { [docSlug]: position } });
    },
    [setState]
  );

  // Phase 5: persist floating custom node position. Called when a
  // library item is dropped far from any cluster (initial position)
  // or when a floating custom is dragged to a new position.
  const onCustomDragEnd = useCallback(
    (arrayIndex: number, position: { x: number; y: number }) => {
      setState({ customPositions: { [arrayIndex]: position } });
    },
    [setState]
  );

  const onViewportChange = useCallback(
    (viewport: Viewport) => {
      setState({ viewport });
    },
    [setState]
  );

  // A3: prune stale position keys from canvas.json when the
  // projection changes (e.g. a cluster slug is removed from the
  // override table, or a custom usage is deleted). Uses
  // `pruneStalePositions` which does a full-replace (not additive
  // merge) so deleted keys don't reappear.
  useEffect(() => {
    if (!projection) return;
    const validSlugs = new Set(projection.groups.map((g) => g.docSlug));
    // Phase 5: collect valid custom arrayIndices so floating custom
    // positions survive pruning.
    const validCustomIdxs = new Set<number>();
    for (const g of projection.groups) {
      for (const n of g.allNodes) {
        if (n.kind === "custom") validCustomIdxs.add(n.arrayIndex);
      }
    }
    pruneStalePositions(validSlugs, validCustomIdxs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projection]);

  // Profile not loaded: render the same minimal apologetic shell as
  // earlier phases so the back button is always reachable.
  if (!profile) {
    return (
      <div className="canvas-view">
        <div className="canvas-view-topbar">
          <button
            type="button"
            className="canvas-view-back-btn"
            onClick={exitCanvasMode}
            title="返回配置档案编辑"
          >
            ← 返回配置档案编辑
          </button>
          <span className="canvas-view-profile-label">画布编辑</span>
        </div>
        <div className="canvas-view-empty-hint">
          {canvasProfileId
            ? `找不到配置档案 ${canvasProfileId}（可能已删除）。`
            : "未指定配置档案。"}
        </div>
      </div>
    );
  }

  const bodyClass = [
    "canvas-view-body",
    `is-dock-${state.inspector.dock}`,
    state.inspector.collapsed ? "is-inspector-collapsed" : "is-inspector-expanded"
  ].join(" ");

  return (
    <div className="canvas-view" onKeyDown={onCanvasKeyDown} tabIndex={-1}>
      <div className="canvas-view-topbar">
        {/* ─── Left: icon-only navigation ─────────────────────── */}
        <button
          type="button"
          className="canvas-view-icon-btn"
          onClick={onBackClick}
          title="返回配置档案编辑（C3）"
          aria-label="返回配置档案编辑"
        >
          <span className="codicon codicon-arrow-left" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`canvas-view-icon-btn${sidebarVisible ? " is-active" : ""}`}
          onClick={toggleSidebar}
          title={sidebarVisible ? "隐藏计算实例库（更多画布空间）" : "显示计算实例库"}
          aria-label={sidebarVisible ? "隐藏侧栏" : "显示侧栏"}
        >
          <span
            className="codicon codicon-layout-sidebar-left"
            aria-hidden="true"
          />
        </button>

        {/* ─── Profile dropdown (replaces the static label) ──── */}
        <select
          className="canvas-view-profile-select"
          value={profile.id}
          onChange={(e) => onProfileDropdownChange(e.target.value)}
          title={profile.id}
        >
          {disk?.profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value="__new__">＋ 新建档案…</option>
        </select>

        {/* ─── Save status pill ─── */}
        <span
          className={`canvas-view-save-pill${dirty ? " is-dirty" : " is-clean"}`}
          title={
            dirty
              ? "自上次保存以来有未保存的改动"
              : savedAt
                ? `已保存 · ${new Date(savedAt).toLocaleTimeString()}`
                : "未变更"
          }
        >
          <span className="canvas-view-save-dot" aria-hidden="true" />
          {dirty ? "未保存" : "已保存"}
        </span>

        {/* ─── Right: actions + save/reset ────────────────────── */}
        <div className="canvas-view-topbar-actions">
          {/* Phase 6: fit-all / fit-selection */}
          <button
            type="button"
            className="canvas-view-icon-btn"
            onClick={() => freeformRef.current?.fitAll()}
            title="适应全部 (Ctrl+\)"
            aria-label="适应全部"
          >
            <span className="codicon codicon-screen-full" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="canvas-view-icon-btn"
            onClick={() => freeformRef.current?.fitSelection()}
            title="适应选中 (Ctrl+Shift+\)"
            aria-label="适应选中"
          >
            <span className="codicon codicon-target" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="canvas-view-icon-btn"
            onClick={() => setClusterPickerOpen(true)}
            title="定位到簇"
            aria-label="定位到簇"
          >
            <span className="codicon codicon-compass" aria-hidden="true" />
          </button>

          <button
            type="button"
            className="canvas-view-action-btn"
            onClick={() => setBatchOpen(true)}
            title="批量调整每个 chain node 的实现函数（C24c）"
          >
            批量候选
          </button>
          <button
            type="button"
            className="canvas-view-action-btn"
            onClick={() => void ca.promptNewResource("custom")}
            title="新建自定义计算实例（C14）"
          >
            + 自定义节点
          </button>

          {/* Save / reset */}
          <button
            type="button"
            className={`canvas-view-action-btn${dirty ? " is-primary" : ""}`}
            onClick={onSave}
            disabled={!dirty}
            title="将当前 disk 状态标记为新检查点（保存）"
          >
            保存
          </button>
          <button
            type="button"
            className="canvas-view-action-btn is-destructive"
            onClick={() => void onReset()}
            disabled={!dirty}
            title="恢复到上次保存的状态（撤销自上次保存以来的所有改动）"
          >
            重置
          </button>
        </div>
      </div>

      <div className={bodyClass}>
        <div className="canvas-view-main rf-canvas-host" role="region" aria-label="画布视口">
          {!loaded ? (
            <div className="canvas-view-empty-hint">读取画布状态…</div>
          ) : (
            <CanvasFreeformBody
              projection={projection}
              canvasState={state}
              selection={state.selection}
              lensTokens={lensTokens}
              onSelectionChange={setSelection}
              onOpenFullEditor={onOpenFullEditor}
              onCardContextMenu={onCardContextMenu}
              profileId={profile.id}
              onViewportChange={onViewportChange}
              onClusterDragEnd={onClusterDragEnd}
              onCustomDragEnd={onCustomDragEnd}
              freeformRef={freeformRef}
            />
          )}
        </div>
        <CanvasInspector
          profile={profile}
          projection={projection}
          selection={state.selection}
          collapsed={state.inspector.collapsed}
          dock={state.inspector.dock}
          onSelectionChange={setSelection}
          onToggleCollapsed={() =>
            setState({
              inspector: { ...state.inspector, collapsed: !state.inspector.collapsed }
            })
          }
          onToggleDock={() =>
            setState({
              inspector: {
                ...state.inspector,
                dock: state.inspector.dock === "right" ? "bottom" : "right"
              }
            })
          }
          onOpenFullEditor={onOpenFullEditor}
        />
      </div>

      {cm.state && (
        <ContextMenu
          x={cm.state.x}
          y={cm.state.y}
          items={cm.state.items}
          onClose={cm.close}
        />
      )}

      <CanvasBatchCandidatePanel
        profile={profile}
        open={batchOpen}
        onClose={() => setBatchOpen(false)}
      />

      <CanvasSharedBranchDialog
        open={!!sharedGuard}
        usageCount={sharedGuard?.usageCount ?? 0}
        resourceInstanceId={sharedGuard?.target.resourceInstanceId ?? ""}
        branchId={sharedGuard?.target.branchId ?? ""}
        onCreateProfileBranch={() => void onCreateProfileBranchFromGuard()}
        onJumpToGlobalEditor={onJumpFromGuard}
        onCancel={() => setSharedGuard(null)}
      />

      <ClusterPicker
        open={clusterPickerOpen}
        onClose={() => setClusterPickerOpen(false)}
        onPick={(slug) => freeformRef.current?.fitCluster(slug)}
      />
    </div>
  );
}

