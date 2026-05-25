import { useMemo } from "react";
import { useCa } from "../state/ChainAssemblyContext";
import { useWorkspace } from "../state/WorkspaceContext";

/**
 * Phase 1 empty canvas shell.
 *
 * Renders a top bar with the `← 返回配置档案编辑` exit button (C3),
 * the active profile label, and placeholders for the canvas actions
 * (coverage filter, flow-line toggle, 批量候选, + 自定义节点). The main
 * area is intentionally empty pending Phase 2 (group panels + slot
 * nodes + flow line). A narrow collapsed inspector rail is reserved
 * on the right to validate the three-column layout footprint.
 *
 * Per C1 the canvas is a pure projection layer; this shell does not
 * read or write profile JSON yet.
 */
export function CanvasView() {
  const { canvasProfileId, exitCanvasMode } = useWorkspace();
  const { disk } = useCa();

  const profile = useMemo(() => {
    if (!canvasProfileId || !disk) return null;
    return disk.profiles.find((p) => p.id === canvasProfileId) ?? null;
  }, [canvasProfileId, disk]);

  // Profile not loaded: render an apologetic placeholder rather than a
  // blank screen, with a way back. This covers both "canvasProfileId is
  // stale (profile deleted)" and "disk not loaded yet" cases without
  // distinguishing them — Phase 2+ can refine.
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

  return (
    <div className="canvas-view">
      <div className="canvas-view-topbar">
        <button
          type="button"
          className="canvas-view-back-btn"
          onClick={exitCanvasMode}
          title="返回配置档案编辑（C3）"
        >
          ← 返回配置档案编辑
        </button>
        <span className="canvas-view-profile-label" title={profile.id}>
          画布编辑 · {profile.name}
        </span>
        {/* Phase 2+ will populate: coverage filter / 流程线 / 批量候选 /
            + 自定义节点 / profile dropdown. Placeholders kept disabled so
            the toolbar footprint is visible during layout review. */}
        <div className="canvas-view-topbar-actions">
          <button
            type="button"
            className="canvas-view-action-btn is-placeholder"
            disabled
            title="Phase 2: coverage filter 切换"
          >
            未配置过滤
          </button>
          <button
            type="button"
            className="canvas-view-action-btn is-placeholder"
            disabled
            title="Phase 2: 流程线显隐切换"
          >
            流程线
          </button>
          <button
            type="button"
            className="canvas-view-action-btn is-placeholder"
            disabled
            title="Phase 4: 批量候选面板"
          >
            批量候选
          </button>
          <button
            type="button"
            className="canvas-view-action-btn is-placeholder"
            disabled
            title="Phase 5: 新建自定义节点"
          >
            + 自定义节点
          </button>
        </div>
      </div>

      <div className="canvas-view-body">
        <div className="canvas-view-main">
          <div className="canvas-view-stub">
            <div className="canvas-view-stub-title">
              画布编辑（Phase 1 空壳）
            </div>
            <div className="canvas-view-stub-text">
              Phase 2 将在此渲染：
              <ul>
                <li>按 <code>CHAIN_CATALOG.groups</code> 折叠的分组面板（C5）</li>
                <li>每个槽位卡片堆叠标准覆盖（C7）</li>
                <li>有向流程线（C23）穿过两个槽位间的自定义节点（C22）</li>
                <li>默认开启的 coverage filter（C6 静默隐藏）</li>
              </ul>
            </div>
          </div>
        </div>
        {/* Reserved collapsed inspector rail — Phase 3 fills content
            and adds the right ↔ 下 dock toggle. The rail stays so the
            three-column footprint is verifiable in Phase 1. */}
        <aside className="canvas-view-inspector-rail" aria-label="Inspector（折叠）">
          <span className="canvas-view-inspector-rail-icon" aria-hidden="true">
            ⟩
          </span>
        </aside>
      </div>
    </div>
  );
}
