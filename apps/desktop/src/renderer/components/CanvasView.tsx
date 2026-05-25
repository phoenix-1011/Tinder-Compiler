import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCa } from "../state/ChainAssemblyContext";
import { useUI } from "../state/UIContext";
import { useWorkspace } from "../state/WorkspaceContext";
import {
  collectProfileV2Resources,
  flattenLeaves
} from "../state/chainAssemblyStorage";
import {
  applyLockedFocus,
  buildCanvasProjection,
  canvasNodeIdentity,
  lensNeighborTokens,
  type CanvasCustomNode,
  type CanvasGroup,
  type CanvasNode,
  type CanvasProjection,
  type CanvasSlotNode
} from "../state/canvasProjection";
import {
  useCanvasPersistedState,
  type CanvasSelection
} from "../state/canvasState";
import { canvasDragState } from "../state/canvasDrag";
import { profileResourceBranchId } from "@tinder/nextstep";
import { CanvasInspector } from "./CanvasInspector";
import { CanvasBatchCandidatePanel } from "./CanvasBatchCandidatePanel";
import { CanvasSharedBranchDialog } from "./CanvasSharedBranchDialog";
import { ContextMenu, useContextMenu, type ContextMenuItem } from "./ContextMenu";

/**
 * Phase 3 canvas: same read-only projection as Phase 2 plus a real
 * inspector panel (dockable right ↔ bottom, collapsible) backed by
 * canvas.json (C15), click-to-select with persisted selection (C11),
 * right-click activate/deactivate menus on cards (C24b), and the C21
 * code-edit / C13-style jump-out for opening the full ResourceBranchView
 * tab outside canvas mode.
 *
 * Library pin interactivity (C25) lives in CanvasLibrary; this file
 * stays focused on canvas-area rendering + inspector orchestration.
 */
export function CanvasView() {
  const { canvasProfileId, enterCanvasMode, exitCanvasMode, openResourceBranch } =
    useWorkspace();
  const { sidebarVisible, toggleSidebar } = useUI();
  const ca = useCa();
  const { disk } = ca;
  const cm = useContextMenu();
  const [batchOpen, setBatchOpen] = useState(false);
  // Transient drag-active state. Used to (S10) auto-show the flow
  // line for the entire track while dragging — not just the hovered
  // edge — and (S11) temporarily reveal coverage-filtered slots so
  // the user can drop on a slot that would otherwise be hidden.
  // Updated via document-level dragstart/dragend listeners so we
  // catch every canvas-mode drag without each source needing to
  // wire a callback.
  const [isDragActive, setIsDragActive] = useState(false);
  useEffect(() => {
    const onStart = () => {
      // Only react to drags that actually carry a canvas payload —
      // dragStart fires for arbitrary draggables elsewhere in the
      // window and we don't want those to perturb the canvas.
      if (canvasDragState.value) setIsDragActive(true);
    };
    const onEnd = () => setIsDragActive(false);
    document.addEventListener("dragstart", onStart);
    document.addEventListener("dragend", onEnd);
    // dragend fires on the source; drop fires on the target. We
    // need a backstop in case drop completes without dragend
    // bubbling (Esc-cancelled native drag).
    document.addEventListener("drop", onEnd);
    return () => {
      document.removeEventListener("dragstart", onStart);
      document.removeEventListener("dragend", onEnd);
      document.removeEventListener("drop", onEnd);
    };
  }, []);

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
  const { state, setState, loaded } = useCanvasPersistedState(
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

  const projectionBase = useMemo(() => {
    if (!profile) return null;
    // S11: while a drag is active, temporarily ignore the coverage
    // filter so the user can drop on slots that would otherwise be
    // hidden. The filter snaps back on drop / dragend / cancel.
    const effectiveCoverageFilter = state.coverageFilter && !isDragActive;
    return buildCanvasProjection(
      profile.project,
      v2Resources,
      flatCustom,
      effectiveCoverageFilter
    );
  }, [profile, v2Resources, flatCustom, state.coverageFilter, isDragActive]);

  // Locked focus (C10) windows the projection to ±radius around the
  // focus target. Composed AFTER the coverage filter per Resolved
  // Edge Cases. When unlocked or target missing, projection === base.
  const projection = useMemo<CanvasProjection | null>(() => {
    if (!projectionBase) return null;
    if (!state.focus.locked || !state.focus.target) return projectionBase;
    return applyLockedFocus(
      projectionBase,
      state.focus.target,
      state.focus.radius
    );
  }, [projectionBase, state.focus.locked, state.focus.target, state.focus.radius]);

  // Lens highlight (C10 light layer). null when no selection — the
  // FlowTrack treats null as "no fade applied".
  const lensTokens = useMemo(
    () =>
      projectionBase
        ? lensNeighborTokens(projectionBase, state.selection)
        : null,
    [projectionBase, state.selection]
  );

  const collapsedGroupSet = useMemo(
    () => new Set(state.collapsedGroups),
    [state.collapsedGroups]
  );

  const toggleGroup = (docSlug: string) => {
    const next = collapsedGroupSet.has(docSlug)
      ? state.collapsedGroups.filter((s) => s !== docSlug)
      : [...state.collapsedGroups, docSlug];
    setState({ collapsedGroups: next });
  };

  const setSelection = useCallback(
    (next: CanvasSelection | null) => {
      setState({ selection: next });
    },
    [setState]
  );

  /**
   * Enter / exit / toggle locked focus (C10 heavy layer).
   *   - enterLockedFocus(target): explicit set, used by double-click
   *   - toggleLockedFocus(): F shortcut — locks on current selection,
   *     or unlocks if already locked
   *   - exitLockedFocus(): explicit unlock, used by Esc and the
   *     unlock button on the canvas top bar.
   */
  const enterLockedFocus = useCallback(
    (target: CanvasSelection) => {
      setState({ focus: { locked: true, target } });
    },
    [setState]
  );
  const exitLockedFocus = useCallback(() => {
    setState({ focus: { locked: false } });
  }, [setState]);
  const toggleLockedFocus = useCallback(() => {
    if (state.focus.locked) {
      exitLockedFocus();
      return;
    }
    if (!state.selection) return;
    enterLockedFocus(state.selection);
  }, [state.focus.locked, state.selection, enterLockedFocus, exitLockedFocus]);

  const onCanvasKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      // Esc: unlock focus first, then clear selection. Pressing
      // twice in a row gets the user back to the default view.
      if (event.key === "Escape") {
        if (state.focus.locked) exitLockedFocus();
        else setSelection(null);
        return;
      }
      // F: toggle locked focus on the current selection (C10).
      // Ignore when an editable element is focused so it doesn't
      // hijack typing in form fields (the inspector has dropdowns
      // and the batch panel has selects).
      if (event.key === "f" || event.key === "F") {
        const tag = (event.target as HTMLElement | null)?.tagName ?? "";
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT"
        ) {
          return;
        }
        event.preventDefault();
        toggleLockedFocus();
      }
    },
    [state.focus.locked, exitLockedFocus, setSelection, toggleLockedFocus]
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

        {/* ─── Right: toggles + actions + save/reset ─────────── */}
        <div className="canvas-view-topbar-actions">
          {state.focus.locked && (
            <button
              type="button"
              className="canvas-view-action-btn is-active"
              onClick={exitLockedFocus}
              title="退出聚焦（Esc / F）"
            >
              聚焦中：± {state.focus.radius} ×
            </button>
          )}

          {/* iOS-style toggles for view-state flags */}
          <ToggleSwitch
            label="未配置过滤"
            on={state.coverageFilter}
            onChange={(next) => setState({ coverageFilter: next })}
            title="切换未覆盖槽位的显示（C6 默认隐藏）"
          />
          <ToggleSwitch
            label="流程线"
            on={state.flowLineVisible}
            onChange={(next) => setState({ flowLineVisible: next })}
            title="切换有向流程线的显示（C23 默认显示）"
          />

          {/* Action buttons */}
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
        <div
          className="canvas-view-main"
          onClick={(e) => {
            // Click on empty canvas background = clear selection. Only
            // fires when the click didn't land on (or bubble from) a
            // card; cards stop propagation in their own handlers.
            if (e.target === e.currentTarget) setSelection(null);
          }}
        >
          {!loaded ? (
            <div className="canvas-view-empty-hint">读取画布状态…</div>
          ) : (
            <CanvasBody
              projection={projection}
              // S10: while dragging, force the flow line on so every
              // edge is a visible drop target — not just the one
              // currently hovered.
              flowLineVisible={state.flowLineVisible || isDragActive}
              collapsedGroups={collapsedGroupSet}
              onToggleGroup={toggleGroup}
              selection={state.selection}
              onSelectionChange={setSelection}
              onEnterLockedFocus={enterLockedFocus}
              onOpenFullEditor={onOpenFullEditor}
              focusLocked={state.focus.locked}
              lensTokens={lensTokens}
              onCardContextMenu={(e, items) => cm.open(e, items)}
              profileId={profile.id}
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
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Body: group panels
// ──────────────────────────────────────────────────────────────────

/**
 * Shared open-full-editor signature, threaded from CanvasView down
 * to slot / coverage / custom cards so a double-click on a
 * resource-bearing card can dispatch the C13 shared-branch guard +
 * C21 jump-out without each card needing to know the implementation.
 */
type OpenFullEditorFn = (target: {
  resourceKind: "standard" | "custom";
  resourceInstanceId: string;
  branchId: string;
}) => void;

interface CanvasBodyProps {
  projection: ReturnType<typeof buildCanvasProjection> | null;
  flowLineVisible: boolean;
  collapsedGroups: Set<string>;
  onToggleGroup: (docSlug: string) => void;
  selection: CanvasSelection | null;
  onSelectionChange: (next: CanvasSelection | null) => void;
  onEnterLockedFocus: (target: CanvasSelection) => void;
  onOpenFullEditor: OpenFullEditorFn;
  focusLocked: boolean;
  lensTokens: Set<string> | null;
  onCardContextMenu: (event: React.MouseEvent, items: ContextMenuItem[]) => void;
  profileId: string;
}

function CanvasBody({
  projection,
  flowLineVisible,
  collapsedGroups,
  onToggleGroup,
  selection,
  onSelectionChange,
  onEnterLockedFocus,
  onOpenFullEditor,
  focusLocked,
  lensTokens,
  onCardContextMenu,
  profileId
}: CanvasBodyProps) {
  if (!projection) {
    return <div className="canvas-view-empty-hint">尚无可用数据。</div>;
  }

  const allGroups: CanvasGroup[] = projection.customOnly
    ? [...projection.groups, projection.customOnly]
    : projection.groups;

  const visibleGroups = allGroups.filter((g) => g.allNodes.length > 0);

  if (visibleGroups.length === 0) {
    return (
      <div className="canvas-view-empty-hint">
        此档案目前没有可显示的链路节点。<br />
        在左侧库中 pin 标准资源以覆盖槽位，或拖入自定义节点。
      </div>
    );
  }

  return (
    <div className={`canvas-groups${focusLocked ? " is-focus-locked" : ""}`}>
      {visibleGroups.map((group) => {
        // When locked focus is on, groups outside the radius window
        // have empty visibleNodes — render them as collapsed title
        // strips (no body) regardless of the user's per-group
        // collapsed preference. This satisfies the C10 "fold other
        // group panels to title strips" rule.
        const isFolded =
          focusLocked && group.visibleNodes.length === 0
            ? true
            : collapsedGroups.has(group.docSlug);
        return (
          <GroupPanel
            key={group.docSlug}
            group={group}
            collapsed={isFolded}
            forceFold={focusLocked && group.visibleNodes.length === 0}
            flowLineVisible={flowLineVisible}
            onToggle={() => onToggleGroup(group.docSlug)}
            selection={selection}
            onSelectionChange={onSelectionChange}
            onEnterLockedFocus={onEnterLockedFocus}
            onOpenFullEditor={onOpenFullEditor}
            lensTokens={lensTokens}
            onCardContextMenu={onCardContextMenu}
            profileId={profileId}
          />
        );
      })}
    </div>
  );
}

function GroupPanel({
  group,
  collapsed,
  forceFold,
  flowLineVisible,
  onToggle,
  selection,
  onSelectionChange,
  onEnterLockedFocus,
  onOpenFullEditor,
  lensTokens,
  onCardContextMenu,
  profileId
}: {
  group: CanvasGroup;
  collapsed: boolean;
  /**
   * Set to true when the group was folded by locked focus (not by
   * the user's collapsed-groups list). Used for a subtle visual
   * cue: title appears semi-transparent so the user can tell it's
   * folded by focus rather than by their own collapse.
   */
  forceFold: boolean;
  flowLineVisible: boolean;
  onToggle: () => void;
  selection: CanvasSelection | null;
  onSelectionChange: (next: CanvasSelection | null) => void;
  onEnterLockedFocus: (target: CanvasSelection) => void;
  onOpenFullEditor: OpenFullEditorFn;
  lensTokens: Set<string> | null;
  onCardContextMenu: (event: React.MouseEvent, items: ContextMenuItem[]) => void;
  profileId: string;
}) {
  return (
    <section
      className={`canvas-group${group.isCustomOnly ? " is-custom-only" : ""}${
        forceFold ? " is-force-folded" : ""
      }`}
    >
      <button
        type="button"
        className="canvas-group-header"
        onClick={onToggle}
        title={group.docSlug}
      >
        <span
          className={`codicon canvas-group-chevron codicon-${
            collapsed ? "chevron-right" : "chevron-down"
          }`}
          aria-hidden="true"
        />
        <span className="canvas-group-title">{group.docTitle}</span>
        {!group.isCustomOnly && (
          <span className="canvas-group-counts">
            覆盖 {group.coveredSlotCount} / {group.totalSlotCount}
            {group.hiddenSlotCount > 0 && (
              <> · 隐藏 {group.hiddenSlotCount}</>
            )}
            {forceFold && <> · 聚焦外</>}
          </span>
        )}
      </button>
      {!collapsed && (
        <div className="canvas-group-track">
          <FlowTrack
            nodes={group.visibleNodes}
            flowLineVisible={flowLineVisible}
            selection={selection}
            onSelectionChange={onSelectionChange}
            onEnterLockedFocus={onEnterLockedFocus}
            onOpenFullEditor={onOpenFullEditor}
            lensTokens={lensTokens}
            onCardContextMenu={onCardContextMenu}
            profileId={profileId}
          />
        </div>
      )}
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────
// Flow track: nodes + edges
// ──────────────────────────────────────────────────────────────────

function FlowTrack({
  nodes,
  flowLineVisible,
  selection,
  onSelectionChange,
  onEnterLockedFocus,
  onOpenFullEditor,
  lensTokens,
  onCardContextMenu,
  profileId
}: {
  nodes: CanvasNode[];
  flowLineVisible: boolean;
  selection: CanvasSelection | null;
  onSelectionChange: (next: CanvasSelection | null) => void;
  onEnterLockedFocus: (target: CanvasSelection) => void;
  onOpenFullEditor: OpenFullEditorFn;
  lensTokens: Set<string> | null;
  onCardContextMenu: (event: React.MouseEvent, items: ContextMenuItem[]) => void;
  profileId: string;
}) {
  const ca = useCa();
  const [dragOverEdgeIdx, setDragOverEdgeIdx] = useState<number | null>(null);

  if (nodes.length === 0) {
    return <div className="canvas-flow-empty">（空）</div>;
  }

  /**
   * Resolve the drop position from an "edge index" — the edge BETWEEN
   * nodes[idx-1] and nodes[idx]. The anchor is the chain id of the
   * first slot/anchor at or after nodes[idx]; when no such anchor
   * exists (drop on a trailing edge of the group), fall back to
   * scanning *backwards* from nodes[idx-1] for the most recent
   * anchor so the new custom stays in the same group instead of
   * silently landing in the custom-only virtual group (G7).
   *
   * The before-custom hint is set when nodes[idx] is a custom in
   * the same anchor bucket — preserves precise within-bucket
   * positioning for reorder.
   */
  const positionForEdge = (
    edgeIdx: number
  ): {
    anchorChainId: string | null;
    beforeCustomArrayIndex?: number;
  } => {
    let anchorChainId: string | null = null;
    // Forward scan from the drop position. This picks up the natural
    // "insert before X" anchor when there's a slot/anchored custom
    // following the drop point.
    for (let i = edgeIdx; i < nodes.length; i++) {
      const n = nodes[i]!;
      if (n.kind === "slot") {
        anchorChainId = n.nodeId;
        break;
      }
      if (n.kind === "custom" && n.anchorChainId) {
        anchorChainId = n.anchorChainId;
        break;
      }
    }
    // Fallback for tail-of-group drops: nothing follows the drop
    // point in this group's visible nodes, so the forward scan
    // produced null. The user clearly meant to add to THIS group,
    // not the custom-only catch-all — so reuse the preceding
    // slot's anchor (with insert_before that slot's downstream
    // sibling implicitly via the order-allocator).
    if (anchorChainId === null) {
      for (let i = edgeIdx - 1; i >= 0; i--) {
        const n = nodes[i]!;
        if (n.kind === "slot") {
          anchorChainId = n.nodeId;
          break;
        }
        if (n.kind === "custom" && n.anchorChainId) {
          anchorChainId = n.anchorChainId;
          break;
        }
      }
    }
    const nextNode = nodes[edgeIdx];
    if (nextNode?.kind === "custom") {
      return {
        anchorChainId,
        beforeCustomArrayIndex: nextNode.arrayIndex
      };
    }
    return { anchorChainId };
  };

  const onEdgeDragOver = (edgeIdx: number) => (e: React.DragEvent) => {
    if (!canvasDragState.value) return;
    e.preventDefault();
    e.dataTransfer.dropEffect =
      canvasDragState.value.kind === "library-custom-node" ? "copy" : "move";
    setDragOverEdgeIdx(edgeIdx);
  };
  const onEdgeDragLeave = () => {
    setDragOverEdgeIdx((cur) => (cur != null ? null : cur));
  };
  const onEdgeDrop = (edgeIdx: number) => async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverEdgeIdx(null);
    const payload = canvasDragState.value;
    canvasDragState.value = null;
    if (!payload) return;
    const position = positionForEdge(edgeIdx);
    const anchor = position.anchorChainId
      ? ({
          kind: "builtin_core_chain" as const,
          chain_id: position.anchorChainId
        })
      : null;
    if (payload.kind === "library-custom-node") {
      // Auto-pin (no-op if already pinned) then append the new
      // usage to the target anchor's bucket. Precise within-bucket
      // positioning is a Phase 4+ follow-up.
      const pinned = await ca.pinBranch(
        profileId,
        "custom",
        payload.resourceInstanceId,
        payload.branchId
      );
      if (!pinned) return;
      await ca.addCustomUsage(
        profileId,
        payload.resourceInstanceId,
        payload.nodeId,
        anchor
      );
      return;
    }
    // canvas-custom: re-anchor / reorder.
    await ca.moveCustomUsage(profileId, payload.arrayIndex, {
      anchorChainId: position.anchorChainId,
      beforeCustomArrayIndex: position.beforeCustomArrayIndex
    });
  };

  return (
    <div className="canvas-flow-track">
      {nodes.map((node, idx) => {
        const prev = idx > 0 ? nodes[idx - 1] : null;
        const edgeDashed = !!prev && (isDisabledCustom(prev) || isDisabledCustom(node));
        const isDragOver = dragOverEdgeIdx === idx;
        return (
          <Fragment key={canvasNodeKey(node, idx)}>
            {prev && (
              <span
                className={`canvas-edge${edgeDashed ? " is-dashed" : ""}${
                  isDragOver ? " is-drop-over" : ""
                }${!flowLineVisible && !isDragOver ? " is-line-hidden" : ""}`}
                aria-hidden="true"
                onDragOver={onEdgeDragOver(idx)}
                onDragLeave={onEdgeDragLeave}
                onDrop={onEdgeDrop(idx)}
              >
                {flowLineVisible || isDragOver ? "══►" : ""}
              </span>
            )}
            {node.kind === "slot" ? (
              <SlotCard
                node={node}
                selection={selection}
                onSelectionChange={onSelectionChange}
                onEnterLockedFocus={onEnterLockedFocus}
                onOpenFullEditor={onOpenFullEditor}
                lensTokens={lensTokens}
                onCardContextMenu={onCardContextMenu}
                profileId={profileId}
              />
            ) : (
              <CustomCard
                node={node}
                selection={selection}
                onSelectionChange={onSelectionChange}
                onOpenFullEditor={onOpenFullEditor}
                lensTokens={lensTokens}
                onCardContextMenu={onCardContextMenu}
                profileId={profileId}
              />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

function isDisabledCustom(node: CanvasNode): boolean {
  return node.kind === "custom" && !node.enabled;
}

function canvasNodeKey(node: CanvasNode, idx: number): string {
  if (node.kind === "slot") return `slot:${node.nodeId}`;
  return `cus:${node.arrayIndex}:${idx}`;
}

// ──────────────────────────────────────────────────────────────────
// Slot card (with stacked standard coverage cards)
// ──────────────────────────────────────────────────────────────────

function SlotCard({
  node,
  selection,
  onSelectionChange,
  onEnterLockedFocus,
  onOpenFullEditor,
  lensTokens,
  onCardContextMenu,
  profileId
}: {
  node: CanvasSlotNode;
  selection: CanvasSelection | null;
  onSelectionChange: (next: CanvasSelection | null) => void;
  onEnterLockedFocus: (target: CanvasSelection) => void;
  onOpenFullEditor: OpenFullEditorFn;
  lensTokens: Set<string> | null;
  onCardContextMenu: (e: React.MouseEvent, items: ContextMenuItem[]) => void;
  profileId: string;
}) {
  const ca = useCa();
  const cov = node.coverage;
  const STACK_LIMIT = 3;
  const [overflowOpen, setOverflowOpen] = useState(false);
  const visible = overflowOpen
    ? cov.resources
    : cov.resources.slice(0, STACK_LIMIT);
  const overflow = cov.resources.length - visible.length;
  const slotSelected =
    selection?.kind === "slot" && selection.chainNodeId === node.nodeId;
  // Lens classification (C10 light layer). When `lensTokens` is null
  // no selection exists — render normally. Otherwise the selected
  // node + its first-degree neighbors are "near"; everything else
  // fades.
  const lensClass = lensTokens
    ? lensTokens.has(canvasNodeIdentity(node))
      ? "is-lens-near"
      : "is-lens-far"
    : "";
  const slotClass = [
    "canvas-slot",
    cov.count === 0 ? "is-uncovered" : "",
    cov.count > 1 ? "is-multi" : "",
    slotSelected ? "is-selected" : "",
    lensClass
  ]
    .filter(Boolean)
    .join(" ");

  const onSlotClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectionChange({ kind: "slot", chainNodeId: node.nodeId });
  };
  const onSlotDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEnterLockedFocus({ kind: "slot", chainNodeId: node.nodeId });
  };

  return (
    <div className={slotClass} title={`${node.nodeId} · order ${node.order}`}>
      <header
        className="canvas-slot-header"
        onClick={onSlotClick}
        onDoubleClick={onSlotDoubleClick}
        role="button"
        tabIndex={0}
        title="单击选中 · 双击聚焦（F 切换）"
      >
        <span className="canvas-slot-order">{node.order}</span>
        <span className="canvas-slot-name">{node.displayName}</span>
      </header>
      <div className="canvas-slot-cards">
        {cov.count === 0 ? (
          <div className="canvas-slot-empty">未覆盖</div>
        ) : (
          <>
            {visible.map((r, idx) => {
              const coverageSelected =
                selection?.kind === "coverage" &&
                selection.chainNodeId === node.nodeId &&
                selection.resourceInstanceId === r.resourceId &&
                selection.variantId === r.variantId;
              const onCoverageClick = (e: React.MouseEvent) => {
                e.stopPropagation();
                onSelectionChange({
                  kind: "coverage",
                  chainNodeId: node.nodeId,
                  resourceInstanceId: r.resourceId,
                  variantId: r.variantId
                });
              };
              const onCoverageDoubleClick = (e: React.MouseEvent) => {
                e.stopPropagation();
                // C11: double-click on a card opens the standalone
                // ResourceBranchView (after C13 shared-branch guard
                // + C21 jump-out confirmation, both handled by
                // onOpenFullEditor in CanvasView).
                onOpenFullEditor({
                  resourceKind: "standard",
                  resourceInstanceId: r.resourceId,
                  branchId: r.variantId
                });
              };
              const onCoverageContextMenu = (e: React.MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                // Helper for the two select-then-act items that
                // need this card selected first so the inspector
                // shows the right context.
                const selectThis = () =>
                  onSelectionChange({
                    kind: "coverage",
                    chainNodeId: node.nodeId,
                    resourceInstanceId: r.resourceId,
                    variantId: r.variantId
                  });
                onCardContextMenu(e, [
                  {
                    // S3: spec calls for `切换分支…` here. Branch
                    // switching is the pin metaphor (C25), which
                    // lives in the library sidebar — selecting the
                    // coverage card draws the user's eye to the
                    // inspector's branch label, and the library
                    // shows the family with the current pin.
                    id: "switch-branch",
                    label: "切换分支…（在左侧库中 pin 其它分支）",
                    run: selectThis
                  },
                  {
                    // S3: `候选实现…` — select to reveal the
                    // candidate dropdown in the inspector (C24c
                    // single-slot variant).
                    id: "switch-candidate",
                    label: "候选实现…",
                    run: selectThis
                  },
                  { separator: true },
                  {
                    id: "deactivate",
                    label: "停用此覆盖",
                    run: () =>
                      void ca.setProfileResourceEnabled(
                        profileId,
                        {
                          id: `canvas::${r.resourceId}`,
                          label: r.displayName,
                          kind: "standard",
                          source: "binding",
                          resourceId: r.resourceId,
                          branchId: r.variantId,
                          enabled: true
                        },
                        false
                      )
                  },
                  {
                    id: "remove",
                    label: "从档案中移除",
                    run: () =>
                      void ca.unpinFamily(profileId, "standard", r.resourceId)
                  }
                ]);
              };
              return (
                <div
                  key={`${r.resourceId}:${r.variantId}:${idx}`}
                  className={`canvas-coverage-card${
                    coverageSelected ? " is-selected" : ""
                  }`}
                  title={`${r.resourceId} · ${r.variantId} · 双击打开完整编辑`}
                  onClick={onCoverageClick}
                  onDoubleClick={onCoverageDoubleClick}
                  onContextMenu={onCoverageContextMenu}
                  role="button"
                  tabIndex={0}
                >
                  <span className="canvas-coverage-marker" aria-hidden="true">
                    ⊞
                  </span>
                  <span className="canvas-coverage-label">
                    {r.displayName}
                    <span className="canvas-coverage-branch"> · {r.variantId}</span>
                  </span>
                </div>
              );
            })}
            {overflow > 0 && (
              <button
                type="button"
                className="canvas-coverage-overflow"
                onClick={(e) => {
                  e.stopPropagation();
                  setOverflowOpen(true);
                }}
                title={cov.resources
                  .slice(STACK_LIMIT)
                  .map((r) => `${r.displayName} · ${r.variantId}`)
                  .join("\n")}
              >
                +{overflow}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Custom node card (lives between slots on the flow line)
// ──────────────────────────────────────────────────────────────────

function CustomCard({
  node,
  selection,
  onSelectionChange,
  onOpenFullEditor,
  lensTokens,
  onCardContextMenu,
  profileId
}: {
  node: CanvasCustomNode;
  selection: CanvasSelection | null;
  onSelectionChange: (next: CanvasSelection | null) => void;
  onOpenFullEditor: OpenFullEditorFn;
  lensTokens: Set<string> | null;
  onCardContextMenu: (e: React.MouseEvent, items: ContextMenuItem[]) => void;
  profileId: string;
}) {
  const ca = useCa();
  const isSelected =
    selection?.kind === "custom" && selection.usageArrayIndex === node.arrayIndex;
  const lensClass = lensTokens
    ? lensTokens.has(canvasNodeIdentity(node))
      ? "is-lens-near"
      : "is-lens-far"
    : "";
  const cls = [
    "canvas-custom",
    node.enabled ? "is-enabled" : "is-disabled",
    isSelected ? "is-selected" : "",
    node.isOrphan ? "is-orphan" : "",
    lensClass
  ]
    .filter(Boolean)
    .join(" ");
  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectionChange({
      kind: "custom",
      usageArrayIndex: node.arrayIndex
    });
  };
  const onDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // C11: double-click opens the standalone ResourceBranchView
    // tab for this custom node's resource + branch. Falls back to
    // a no-op when branchId hasn't resolved (orphan / unresolved
    // resource — the inspector still works in that case).
    if (!node.branchId) return;
    onOpenFullEditor({
      resourceKind: "custom",
      resourceInstanceId: node.usage.resource_instance_id,
      branchId: node.branchId
    });
  };
  const onDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    canvasDragState.value = {
      kind: "canvas-custom",
      arrayIndex: node.arrayIndex
    };
    e.dataTransfer.effectAllowed = "move";
    try {
      e.dataTransfer.setData(
        "application/x-tinder-canvas-custom",
        String(node.arrayIndex)
      );
    } catch {
      /* ignore */
    }
  };
  const onDragEnd = () => {
    canvasDragState.value = null;
  };
  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onCardContextMenu(e, [
      // S4: parity with the list-view custom row menu
      // (上移 / 下移 / 移到段… / 停用 / 移出链路).
      {
        id: "up",
        label: "上移",
        run: () => void ca.shiftCustomUsage(profileId, node.arrayIndex, -1)
      },
      {
        id: "down",
        label: "下移",
        run: () => void ca.shiftCustomUsage(profileId, node.arrayIndex, 1)
      },
      {
        id: "move",
        label: "移到段…",
        run: () => void ca.promptMoveCustomUsage(profileId, node.arrayIndex)
      },
      { separator: true },
      node.enabled
        ? {
            id: "deactivate",
            label: "停用",
            run: () =>
              void ca.setCustomUsageEnabled(profileId, node.arrayIndex, false)
          }
        : {
            id: "activate",
            label: "激活",
            run: () =>
              void ca.setCustomUsageEnabled(profileId, node.arrayIndex, true)
          },
      {
        id: "remove",
        label: "移出链路",
        run: () => void ca.removeCustomUsage(profileId, node.arrayIndex)
      }
    ]);
  };
  const titleParts: string[] = [
    `${node.resourceDisplayName ?? ""} / ${node.usage.node_id}`
  ];
  if (!node.enabled) titleParts.push("停用");
  if (node.isOrphan)
    titleParts.push(
      "孤立 (orphan)：当前分支不再声明此节点。可删除此放置或切回原分支。"
    );
  titleParts.push(
    node.branchId ? "单击选中 · 双击打开完整编辑" : "单击选中"
  );
  return (
    <div
      className={cls}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      role="button"
      tabIndex={0}
      title={titleParts.join(" · ")}
    >
      <span className="canvas-custom-marker" aria-hidden="true">
        ⌬
      </span>
      <span className="canvas-custom-label">{node.displayName}</span>
      {node.branchId && (
        <span className="canvas-custom-branch">· {node.branchId}</span>
      )}
      {node.isOrphan && (
        <span
          className="canvas-custom-orphan-chip"
          title="孤立 usage（C26 soft-orphan）"
        >
          ⚠
        </span>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Top-bar toggle switch (iOS-style)
// ──────────────────────────────────────────────────────────────────

/**
 * Compact pill switch used for view-state toggles in the canvas
 * top bar (coverage filter, flow line). Reads as a horizontal
 * track with an animated knob — visually obvious on/off without
 * spelling out 开/关. Label sits before the switch.
 */
function ToggleSwitch({
  label,
  on,
  onChange,
  title
}: {
  label: string;
  on: boolean;
  onChange: (next: boolean) => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={`canvas-toggle${on ? " is-on" : ""}`}
      onClick={() => onChange(!on)}
      title={title}
      aria-pressed={on}
      role="switch"
    >
      <span className="canvas-toggle-label">{label}</span>
      <span className="canvas-toggle-track" aria-hidden="true">
        <span className="canvas-toggle-knob" />
      </span>
    </button>
  );
}
