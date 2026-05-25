/**
 * Phase 4 shared-branch guard dialog (C13).
 *
 * Triggered when the user clicks `↗ 打开完整编辑` on a coverage /
 * custom card whose selected branch is shared (referenced by more
 * than one profile slot across the project). Per C13 the dialog
 * offers two actions:
 *   - `创建当前档案分支` → copies the branch in-place and updates the
 *     profile's pin to the copy, then proceeds with the original
 *     intent in canvas (no jump).
 *   - `在计算实例中修改` → confirms exiting canvas, then issues the
 *     C21 jump-out to open the full ResourceBranchView tab.
 *
 * For Phase 4 we render as a styled overlay (not an in-canvas
 * bubble per the spec); the bubble visual is a polish follow-up.
 */
interface CanvasSharedBranchDialogProps {
  open: boolean;
  usageCount: number;
  resourceInstanceId: string;
  branchId: string;
  onCreateProfileBranch: () => void;
  onJumpToGlobalEditor: () => void;
  onCancel: () => void;
}

export function CanvasSharedBranchDialog(props: CanvasSharedBranchDialogProps) {
  if (!props.open) return null;
  return (
    <div
      className="canvas-shared-branch-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onCancel();
      }}
    >
      <div
        className="canvas-shared-branch-dialog"
        role="dialog"
        aria-label="共享分支守卫"
      >
        <header className="canvas-shared-branch-header">
          <span className="canvas-shared-branch-title">共享分支守卫（C13）</span>
          <button
            type="button"
            className="canvas-shared-branch-close"
            onClick={props.onCancel}
            aria-label="取消"
          >
            ×
          </button>
        </header>
        <div className="canvas-shared-branch-body">
          <p>
            分支 <code>{props.resourceInstanceId}</code> /{" "}
            <code>{props.branchId}</code> 被{" "}
            <strong>{props.usageCount}</strong> 个档案槽位使用。在共享分支上编辑会影响其它档案，请选择：
          </p>
          <div className="canvas-shared-branch-actions">
            <button
              type="button"
              className="canvas-shared-branch-action is-primary"
              onClick={props.onCreateProfileBranch}
              title="复制此分支为当前档案私有 + 自动切换 pin（B8 radio）"
            >
              创建当前档案分支
            </button>
            <button
              type="button"
              className="canvas-shared-branch-action"
              onClick={props.onJumpToGlobalEditor}
              title="切换到「配置档案编辑」并在计算实例中打开完整编辑器（C21 跳出）"
            >
              在计算实例中修改
            </button>
            <button
              type="button"
              className="canvas-shared-branch-action is-cancel"
              onClick={props.onCancel}
            >
              取消
            </button>
          </div>
          <p className="canvas-shared-branch-hint">
            创建当前档案分支后，当前 pin 自动切到新分支，后续编辑不会再影响共享分支。
          </p>
        </div>
      </div>
    </div>
  );
}
