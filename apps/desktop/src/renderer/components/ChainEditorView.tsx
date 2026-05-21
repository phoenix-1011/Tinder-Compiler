import { useMemo, useState } from "react";
import type { ChainContractRow, ChainNodeEntry } from "@tinder/nextstep";
import { ContextMenu, useContextMenu, type ContextMenuItem } from "./ContextMenu";
import { useCa } from "../state/ChainAssemblyContext";
import { useWorkspace } from "../state/WorkspaceContext";
import {
  collectProfileV2Resources,
  collectProjectV2Resources,
  flattenLeaves
} from "../state/chainAssemblyStorage";
import {
  buildChainProjection,
  buildExecutionProjection,
  type ChainProjectionRow,
  type ExecutionRow
} from "../state/chainProjection";
import {
  buildRuntimeConfig,
  buildRuntimeReport,
  type RuntimeReport
} from "../state/runtimeReport";
import { RuntimeReportModal } from "./RuntimeReportModal";
import { CHAIN_CATALOG } from "../help/chain-catalog.generated";
import { MarkdownInline } from "../help/Markdown";

/**
 * Main-pane chain editor for the active profile. Opens when the user clicks
 * `链路` under a profile in the chain assembly sidebar.
 *
 * Layout: header (profile name + close button) over the projection table
 * showing canonical chain coverage plus active custom node placements.
 */
interface ChainEditorViewProps {
  profileId: string;
  /** Synthetic tab uri — used by the close button to call closeFile. */
  tabUri: string;
}

export function ChainEditorView({ profileId, tabUri }: ChainEditorViewProps) {
  const ca = useCa();
  const { openHelpDoc, closeFile } = useWorkspace();
  const cm = useContextMenu();
  const [reportState, setReportState] = useState<{
    report: RuntimeReport;
    exportPath: string;
  } | null>(null);
  const [nodeInfo, setNodeInfo] = useState<{
    nodeId: string;
    kind: ChainNodeInfoKind;
  } | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  /**
   * Two distinct views:
   *
   * - `full`: the 81 canonical chain nodes in canonical order, one row
   *   each, regardless of whether a resource covers them. This is the
   *   reference view for understanding chain shape.
   * - `execution`: one row per active compute node — driven by what's
   *   wired up. A canonical chain node with two covering resources gets
   *   two rows; one with no coverage gets none. There's no `缺失`
   *   concept by construction.
   */
  const [chainMode, setChainMode] = useState<"full" | "execution">("full");
  /**
   * Optional chain-doc group filter. `all` shows everything; otherwise
   * the value is a chain doc slug (e.g. `10-platform-chain`) and only
   * nodes owned by that doc render. Custom rows whose anchor falls
   * outside the selected group are hidden too so the projection stays
   * coherent.
   */
  const [groupFilter, setGroupFilter] = useState<string>("all");

  const profile = useMemo(() => {
    if (!ca.disk || !profileId) return null;
    return ca.disk.profiles.find((p) => p.id === profileId) ?? null;
  }, [ca.disk, profileId]);

  const flatCustom = useMemo(
    () => (ca.disk ? flattenLeaves(ca.disk.customTree) : []),
    [ca.disk]
  );
  /**
   * v2 form of every compute resource — includes legacy single-file
   * resources via the on-read migration. Used by runtime report/config
   * builders so the export reflects implementation.runtime_artifact and
   * variant-resolved effective candidates.
   */
  const v2Resources = useMemo(
    () =>
      ca.disk && profile
        ? collectProfileV2Resources(ca.disk, profile.project)
        : [],
    [ca.disk, profile]
  );
  const projectV2Resources = useMemo(
    () => (ca.disk ? collectProjectV2Resources(ca.disk) : []),
    [ca.disk]
  );

  const fullProjection = useMemo(
    () =>
      profile
        ? buildChainProjection(profile.project, v2Resources, flatCustom)
        : [],
    [profile, v2Resources, flatCustom]
  );
  const executionProjection = useMemo(
    () =>
      profile
        ? buildExecutionProjection(profile.project, v2Resources, flatCustom)
        : [],
    [profile, v2Resources, flatCustom]
  );

  const visibleFull = useMemo(() => {
    return fullProjection.filter((row) => {
      if (row.kind === "chain-node") {
        return groupFilter === "all" || row.docSlug === groupFilter;
      }
      return false;
    });
  }, [fullProjection, groupFilter]);

  const visibleExecution = useMemo(() => {
    const visibleChainIds = new Set<string>();
    for (const row of executionProjection) {
      if (row.kind !== "exec-standard") continue;
      if (groupFilter !== "all" && row.docSlug !== groupFilter) continue;
      visibleChainIds.add(row.chainNodeId);
    }
    return executionProjection.filter((row) => {
      if (row.kind === "exec-standard") {
        return groupFilter === "all" || row.docSlug === groupFilter;
      }
      if (groupFilter !== "all") {
        if (!row.anchorChainId) return false;
        return visibleChainIds.has(row.anchorChainId);
      }
      return true;
    });
  }, [executionProjection, groupFilter]);

  if (!profile) {
    return (
      <div className="chain-editor-empty">
        <p className="sidebar-hint">未选中可编辑的配置档案。</p>
        <button
          type="button"
          className="primary-button"
          onClick={() => closeFile(tabUri)}
        >
          关闭链路编辑
        </button>
      </div>
    );
  }

  const customMenu = (e: React.MouseEvent, row: ChainProjectionRow): void => {
    if (row.kind !== "custom") return;
    const items: ContextMenuItem[] = [
      {
        id: "up",
        label: "上移",
        run: () => ca.shiftCustomUsage(profile.id, row.arrayIndex, -1)
      },
      {
        id: "down",
        label: "下移",
        run: () => ca.shiftCustomUsage(profile.id, row.arrayIndex, 1)
      },
      {
        id: "move",
        label: "移到锚点…",
        run: () => ca.promptMoveCustomUsage(profile.id, row.arrayIndex)
      },
      { separator: true },
      row.usage.enabled
        ? {
            id: "disable",
            label: "停用",
            run: () => ca.setCustomUsageEnabled(profile.id, row.arrayIndex, false)
          }
        : {
            id: "enable",
            label: "激活",
            run: () => ca.setCustomUsageEnabled(profile.id, row.arrayIndex, true)
          },
      {
        id: "remove",
        label: "移出链路",
        run: () => ca.removeCustomUsage(profile.id, row.arrayIndex)
      }
    ];
    cm.open(e, items);
  };

  /**
   * Default runtime export path: sibling of the profile JSON with a
   * `.runtime.json` suffix. The engine-effective path detection described
   * by D31 is deferred — this is the staging default.
   */
  const runtimeExportPath = `${profile.id.replace(/\.json$/i, "")}.runtime.json`;

  const onSave = async () => {
    // The MVP authoring path already writes profile changes through to disk
    // on every action; this button re-serialises and writes the current
    // in-memory profile so users have an explicit save affordance and a
    // visible confirmation that nothing is pending.
    setSaveStatus("saving");
    try {
      await window.tinder.writeText(
        profile.id,
        JSON.stringify(profile.project, null, 2)
      );
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 1500);
    } catch {
      setSaveStatus("idle");
    }
  };

  const onGenerate = () => {
    const report = buildRuntimeReport(
      profile.project,
      v2Resources,
      projectV2Resources
    );
    setReportState({ report, exportPath: runtimeExportPath });
  };

  const onExport = async () => {
    if (!reportState) return;
    const config = buildRuntimeConfig(profile.project, v2Resources);
    await window.tinder.writeText(
      reportState.exportPath,
      JSON.stringify(config, null, 2)
    );
    setReportState(null);
  };

  return (
    <div className="chain-editor" title={profile.id}>
      <div className="chain-editor-toolbar">
        <select
          className="chain-editor-mode-select"
          value={chainMode}
          onChange={(e) => setChainMode(e.target.value as "full" | "execution")}
          title="切换视图"
          aria-label="视图模式"
        >
          <option value="full">完整链路节点</option>
          <option value="execution">实际执行链路</option>
        </select>
        <select
          className="chain-editor-group-select"
          value={groupFilter}
          onChange={(e) => setGroupFilter(e.target.value)}
          title="按链路文档分类筛选"
          aria-label="按分类筛选"
        >
          <option value="all">全部分类</option>
          {CHAIN_CATALOG.groups.map((g) => (
            <option key={g.docSlug} value={g.docSlug}>
              {g.title}
            </option>
          ))}
        </select>
        <div className="chain-editor-toolbar-actions">
          <button
            type="button"
            className="chain-editor-action-btn"
            onClick={() => void onSave()}
            disabled={saveStatus === "saving"}
            title="保存当前 profile JSON"
          >
            {saveStatus === "saved" ? "已保存" : "保存编辑"}
          </button>
          <button
            type="button"
            className="chain-editor-action-btn is-primary"
            onClick={onGenerate}
            title="预检并导出运行配置"
          >
            生成运行配置
          </button>
        </div>
      </div>

      <div
        className={`chain-editor-list is-mode-${chainMode}`}
      >
        <div className="chain-editor-list-header">
          {chainMode === "full" ? (
            <>
              <span>#</span>
              <span>节点</span>
              <span>类型</span>
              <span>分类</span>
              <span>信息</span>
            </>
          ) : (
            <>
              <span>#</span>
              <span>链路节点</span>
              <span>计算实例</span>
              <span>类型</span>
              <span>分类</span>
              <span>信息</span>
            </>
          )}
        </div>
        {chainMode === "full" ? (
          visibleFull.length === 0 ? (
            <div className="chain-editor-empty-list">
              当前分类下没有节点。
            </div>
          ) : (
            visibleFull.map((row, idx) =>
              renderFullRow(row, idx, setNodeInfo, openHelpDoc, customMenu)
            )
          )
        ) : visibleExecution.length === 0 ? (
          <div className="chain-editor-empty-list">
            当前档案没有有效计算实例。先把标准资源加入档案，或切换回「完整链路节点」。
          </div>
        ) : (
          visibleExecution.map((row, idx) =>
            renderExecutionRow(row, idx, setNodeInfo, openHelpDoc, customMenu)
          )
        )}
      </div>

      {cm.state && (
        <ContextMenu x={cm.state.x} y={cm.state.y} items={cm.state.items} onClose={cm.close} />
      )}

      {reportState && (
        <RuntimeReportModal
          report={reportState.report}
          exportPath={reportState.exportPath}
          onExport={() => void onExport()}
          onClose={() => setReportState(null)}
        />
      )}
      {nodeInfo && (
        <ChainNodeInfoModal
          nodeId={nodeInfo.nodeId}
          kind={nodeInfo.kind}
          onClose={() => setNodeInfo(null)}
        />
      )}
    </div>
  );
}

type CustomMenuOpener = (
  e: React.MouseEvent,
  row: ChainProjectionRow & { kind: "custom" }
) => void;

type ChainNodeInfoKind = "summary" | "responsibility" | "io";

type NodeInfoOpener = (next: { nodeId: string; kind: ChainNodeInfoKind }) => void;

/**
 * `完整链路节点` row layout. Columns: order/doc · 名称 · 类型 · 分类 · 状态.
 */
function renderFullRow(
  row: ChainProjectionRow,
  idx: number,
  openNodeInfo: NodeInfoOpener,
  openHelpDoc: (nodeId: string) => void,
  customMenu: CustomMenuOpener
) {
  if (row.kind === "custom") {
    return (
      <div
        key={`custom-${idx}-${row.arrayIndex}`}
        className={`chain-editor-row is-custom${row.usage.enabled ? "" : " is-disabled"}`}
        onContextMenu={(e) => customMenu(e, row)}
        title={
          row.usage.enabled
            ? `${row.usage.resource_instance_id}/${row.usage.node_id}`
            : `${row.usage.resource_instance_id}/${row.usage.node_id} · 停用`
        }
      >
        <span className="chain-editor-row-marker">⌬</span>
        <span className="chain-editor-row-label">{row.displayName}</span>
        <span className="chain-editor-row-type is-custom">自定义</span>
        <span className="chain-editor-row-category is-custom">自定义</span>
        <span className="chain-editor-row-info-actions" />
      </div>
    );
  }
  return (
    <div
      key={`chain-${row.nodeId}`}
      className={`chain-editor-row is-chain is-${row.coverage.status}`}
      title={
        row.coverage.status === "multi"
          ? `${row.nodeId} · 多实现 ×${row.coverage.count}`
          : row.nodeId
      }
    >
      <div className="chain-editor-row-order-cell">
        <span className="chain-editor-row-order">{row.order}</span>
        <button
          type="button"
          className="chain-editor-row-doc"
          title="在新建标签页中查看链路文档"
          onClick={(e) => {
            e.stopPropagation();
            openHelpDoc(row.nodeId);
          }}
        >
          查看文档
        </button>
      </div>
      <span className="chain-editor-row-label">{row.displayName}</span>
      <span className="chain-editor-row-type">标准</span>
      <span className="chain-editor-row-category" title={row.docSlug}>
        {row.docTitle}
      </span>
      {renderNodeInfoButtons(row.nodeId, openNodeInfo)}
    </div>
  );
}

/**
 * `实际执行链路` row layout. Columns: order/doc · 链路节点 · 计算实例 · 类型 · 分类.
 * Standard rows render once per covering resource; custom rows interleave
 * with the same layout shape (resource column doubles as the custom usage's
 * resource_instance_id for visual continuity).
 */
function renderExecutionRow(
  row: ExecutionRow,
  idx: number,
  openNodeInfo: NodeInfoOpener,
  openHelpDoc: (nodeId: string) => void,
  customMenu: CustomMenuOpener
) {
  if (row.kind === "custom") {
    return (
      <div
        key={`exec-custom-${idx}-${row.arrayIndex}`}
        className={`chain-editor-row is-custom${row.usage.enabled ? "" : " is-disabled"}`}
        onContextMenu={(e) => customMenu(e, row)}
        title={`${row.usage.resource_instance_id}/${row.usage.node_id}`}
      >
        <span className="chain-editor-row-marker">⌬</span>
        <span className="chain-editor-row-label">{row.displayName}</span>
        <span className="chain-editor-row-resource">
          {row.usage.resource_instance_id}
        </span>
        <span className="chain-editor-row-type is-custom">自定义</span>
        <span className="chain-editor-row-category is-custom">自定义</span>
        <span className="chain-editor-row-info-actions" />
      </div>
    );
  }
  return (
    <div
      key={`exec-${idx}-${row.chainNodeId}-${row.resourceId}-${row.variantId}`}
      className="chain-editor-row is-chain is-covered"
      title={row.chainNodeId}
    >
      <div className="chain-editor-row-order-cell">
        <span className="chain-editor-row-order">{row.order}</span>
        <button
          type="button"
          className="chain-editor-row-doc"
          title="在新建标签页中查看链路文档"
          onClick={(e) => {
            e.stopPropagation();
            openHelpDoc(row.chainNodeId);
          }}
        >
          查看文档
        </button>
      </div>
      <span className="chain-editor-row-label">{row.chainDisplayName}</span>
      <span
        className="chain-editor-row-resource"
        title={`${row.resourceId} · ${row.variantId}`}
      >
        {row.resourceDisplayName}
      </span>
      <span className="chain-editor-row-type">标准</span>
      <span className="chain-editor-row-category" title={row.docSlug}>
        {row.docTitle}
      </span>
      {renderNodeInfoButtons(row.chainNodeId, openNodeInfo)}
    </div>
  );
}

function renderNodeInfoButtons(nodeId: string, openNodeInfo: NodeInfoOpener) {
  return (
    <span className="chain-editor-row-info-actions">
      {[
        ["summary", "摘要"],
        ["responsibility", "职责"],
        ["io", "输入输出"]
      ].map(([kind, label]) => (
        <button
          key={kind}
          type="button"
          className="chain-editor-row-info-btn"
          onClick={(e) => {
            e.stopPropagation();
            openNodeInfo({ nodeId, kind: kind as ChainNodeInfoKind });
          }}
        >
          {label}
        </button>
      ))}
    </span>
  );
}

function ChainNodeInfoModal({
  nodeId,
  kind,
  onClose
}: {
  nodeId: string;
  kind: ChainNodeInfoKind;
  onClose(): void;
}) {
  const node = CHAIN_CATALOG.nodes[nodeId];
  const doc = node ? CHAIN_CATALOG.docs[node.docSlug] : undefined;
  const title = kind === "summary" ? "摘要" : kind === "responsibility" ? "职责" : "输入输出";

  return (
    <div className="chain-node-info-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="chain-node-info-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`${node?.displayName ?? nodeId} ${title}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="chain-node-info-header">
          <div>
            <div className="chain-node-info-kicker">{title}</div>
            <h2>{node?.displayName ?? nodeId}</h2>
            <code>{nodeId}</code>
          </div>
          <button type="button" className="chain-node-info-close" onClick={onClose}>
            关闭
          </button>
        </header>
        <div className="chain-node-info-source">
          来源：{doc?.title ?? node?.docSlug ?? "未找到链路文档"}
        </div>
        <div className="chain-node-info-body">
          {node ? <ChainNodeInfoContent node={node} kind={kind} /> : <p>未找到该节点的文档信息。</p>}
        </div>
      </section>
    </div>
  );
}

function ChainNodeInfoContent({
  node,
  kind
}: {
  node: ChainNodeEntry;
  kind: ChainNodeInfoKind;
}) {
  if (kind === "summary") {
    return (
      <div className="chain-node-info-stack">
        <InfoField title="目的">
          {node.purpose ? <MarkdownInline source={node.purpose} /> : "文档中暂无目的摘要。"}
        </InfoField>
        <InfoMetaGrid
          rows={[
            ["执行序号", node.order ? String(node.order) : "-"],
            ["分类", CHAIN_CATALOG.docs[node.docSlug]?.title ?? node.docSlug],
            ["Fallback", node.fallback ?? "-"]
          ]}
        />
      </div>
    );
  }

  if (kind === "responsibility") {
    return (
      <div className="chain-node-info-stack">
        <InfoField title="运行时契约">
          {node.runtimeContract && node.runtimeContract.length > 0 ? (
            <ul className="chain-node-info-list">
              {node.runtimeContract.map((line, i) => (
                <li key={i}>
                  <MarkdownInline source={line} />
                </li>
              ))}
            </ul>
          ) : (
            "文档中暂无运行时契约。"
          )}
        </InfoField>
        <InfoField title="状态与保留">
          {node.state ? <MarkdownInline source={node.state} /> : "文档中暂无状态与保留说明。"}
        </InfoField>
      </div>
    );
  }

  return (
    <div className="chain-node-info-io">
      <ContractInfoTable title="输入" rows={node.inputs ?? []} kind="input" />
      <ContractInfoTable title="输出" rows={node.outputs ?? []} kind="output" />
    </div>
  );
}

function InfoField({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="chain-node-info-field">
      <h3>{title}</h3>
      <div>{children}</div>
    </section>
  );
}

function InfoMetaGrid({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="chain-node-info-meta-grid">
      {rows.map(([label, value]) => (
        <div key={label} className="chain-node-info-meta-row">
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function ContractInfoTable({
  title,
  rows,
  kind
}: {
  title: string;
  rows: ChainContractRow[];
  kind: "input" | "output";
}) {
  return (
    <section className="chain-node-info-field">
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <div className="chain-node-info-empty">文档中暂无{title} contract。</div>
      ) : (
        <table className="chain-node-info-table">
          <thead>
            <tr>
              <th>Contract</th>
              <th>{kind === "input" ? "来源" : "目标"}</th>
              <th>{kind === "input" ? "必需" : "生命周期"}</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <td>
                  <MarkdownInline source={row.contract} />
                </td>
                <td>
                  <MarkdownInline source={row.endpoint} />
                </td>
                <td>
                  <MarkdownInline source={row.qualifier ?? ""} />
                </td>
                <td>
                  <MarkdownInline source={row.note ?? ""} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
