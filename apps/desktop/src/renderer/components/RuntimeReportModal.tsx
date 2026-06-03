import type { RuntimeReport, RuntimeReportItem } from "../state/runtimeReport";

export interface RuntimeReportModalProps {
  report: RuntimeReport;
  /** Target on-disk path where the export will land. */
  exportPath?: string;
  /** Called when the user confirms export. Only enabled when no blocking. */
  onExport?: () => void;
  onClose: () => void;
}

/**
 * Validation report for runtime config export. Three buckets:
 * Blocking (prevents export), Warning (informs but allows export), Info
 * (summary).
 */
export function RuntimeReportModal({
  report,
  exportPath,
  onExport,
  onClose
}: RuntimeReportModalProps) {
  const canExport = report.blocking.length === 0 && Boolean(onExport);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal-card runtime-report-card"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="ca-dialog-title">运行配置 · 预检</div>

        <Section
          kind="blocking"
          label={`Blocking (${report.blocking.length})`}
          hint="阻止导出，必须修复"
          items={report.blocking}
        />
        <Section
          kind="warning"
          label={`Warning (${report.warning.length})`}
          hint="允许导出但应留意"
          items={report.warning}
        />
        <Section
          kind="info"
          label={`Info (${report.info.length})`}
          hint="导出概要"
          items={report.info}
        />

        {exportPath ? (
          <div className="runtime-report-target">
            目标文件：<code title={exportPath}>{exportPath}</code>
          </div>
        ) : (
          <div className="runtime-report-target">
            完整 runtime config 请从配置档案概览的关联型号中导出。
          </div>
        )}

        <div className="ca-dialog-actions">
          <button type="button" className="ca-dialog-btn" onClick={onClose}>
            取消
          </button>
          {onExport && (
            <button
              type="button"
              className={`ca-dialog-btn ${canExport ? "is-primary" : ""}`}
              disabled={!canExport}
              onClick={onExport}
              title={canExport ? "" : "请先修复 Blocking 项"}
            >
              导出
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({
  kind,
  label,
  hint,
  items
}: {
  kind: "blocking" | "warning" | "info";
  label: string;
  hint: string;
  items: RuntimeReportItem[];
}) {
  return (
    <section className={`runtime-report-section is-${kind}`}>
      <header className="runtime-report-section-header">
        <span className="runtime-report-section-label">{label}</span>
        <span className="runtime-report-section-hint">{hint}</span>
      </header>
      {items.length === 0 ? (
        <p className="runtime-report-empty">无</p>
      ) : (
        <ul className="runtime-report-list">
          {items.map((item) => (
            <li key={item.id} className="runtime-report-item">
              <div className="runtime-report-item-title">{item.title}</div>
              {item.detail && (
                <div className="runtime-report-item-detail">{item.detail}</div>
              )}
              {item.locator && (
                <div className="runtime-report-item-locator">{item.locator}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
