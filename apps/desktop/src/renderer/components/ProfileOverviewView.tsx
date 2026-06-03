import { useMemo, useState } from "react";
import type {
  ProfileResourceRef
} from "@tinder/nextstep";
import {
  normalizeProfileExportConfig,
  profileResourceBranchId
} from "@tinder/nextstep";
import { useCa } from "../state/ChainAssemblyContext";
import { useWorkspace } from "../state/WorkspaceContext";
import {
  collectProfileV2Resources,
  collectProjectV2Resources,
  flattenLeaves
} from "../state/chainAssemblyStorage";
import { targetLabel } from "../state/profilePlatformExport";
import { buildExecutionProjection } from "../state/chainProjection";
import { buildRuntimeReport, type RuntimeReport } from "../state/runtimeReport";
import { ProfileExportConfigDialog } from "./ProfileExportConfigDialog";

interface ProfileOverviewViewProps {
  profileId: string;
}

interface ResourceSlotRow {
  key: string;
  ref: ProfileResourceRef;
  label: string;
  branchLabel: string;
  branchId: string;
  executionOrders: number[];
  exists: boolean;
  branchExists: boolean;
  parseStatus: string;
  parseSeverity: "blocking" | "warning" | null;
}

function resourceBranchKey(kind: string, resourceId: string, branchId: string): string {
  return `${kind}:${resourceId}:${branchId}`;
}

function resourceIssuesById(report: RuntimeReport | null): Map<
  string,
  { blocking: number; warning: number }
> {
  const out = new Map<string, { blocking: number; warning: number }>();
  const add = (locator: string | undefined, severity: "blocking" | "warning") => {
    if (!locator) return;
    const match = locator.match(/^(?:resource|usage):([^/]+)/);
    if (!match) return;
    const cur = out.get(match[1]) ?? { blocking: 0, warning: 0 };
    cur[severity] += 1;
    out.set(match[1], cur);
  };
  for (const issue of report?.blocking ?? []) add(issue.locator, "blocking");
  for (const issue of report?.warning ?? []) add(issue.locator, "warning");
  return out;
}

export function ProfileOverviewView({ profileId }: ProfileOverviewViewProps) {
  const ca = useCa();
  const { closeProfileGroup, openChainEditor, openFile } = useWorkspace();
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportDialogTargetId, setExportDialogTargetId] = useState<string>();
  const [createExportTargetRequest, setCreateExportTargetRequest] = useState(0);
  const profile = useMemo(() => {
    if (!ca.disk || !profileId) return null;
    return ca.disk.profiles.find((p) => p.id === profileId) ?? null;
  }, [ca.disk, profileId]);

  const runtimeReport = useMemo(() => {
    if (!ca.disk || !profile) return null;
    return buildRuntimeReport(
      profile.project,
      collectProfileV2Resources(ca.disk, profile.project),
      collectProjectV2Resources(ca.disk)
    );
  }, [ca.disk, profile]);

  const resourceRows = useMemo<ResourceSlotRow[]>(() => {
    if (!ca.disk || !profile) return [];
    const profileResources = collectProfileV2Resources(ca.disk, profile.project);
    const customLeaves = flattenLeaves(ca.disk.customTree);
    const executionRows = buildExecutionProjection(
      profile.project,
      profileResources,
      customLeaves
    );
    const ordersByResourceBranch = new Map<string, number[]>();
    executionRows.forEach((row, index) => {
      const key =
        row.kind === "exec-standard"
          ? resourceBranchKey("standard", row.resourceId, row.variantId)
          : resourceBranchKey(
              "custom",
              row.usage.resource_instance_id,
              row.branchId ?? "default"
            );
      const orders = ordersByResourceBranch.get(key) ?? [];
      orders.push(index + 1);
      ordersByResourceBranch.set(key, orders);
    });
    const issuesByResourceId = resourceIssuesById(runtimeReport);

    return (profile.project.resources ?? []).map((ref, index) => {
      const branchId = profileResourceBranchId(ref);
      const rowKey = resourceBranchKey(ref.kind, ref.resource_instance_id, branchId);
      const family = ca.disk?.resourceIndex.familyByKey.get(
        `${ref.kind}:${ref.resource_instance_id}`
      );
      const branch = family?.branches.find(
        (entry) => entry.branch.branch_id === branchId
      );
      const exists = Boolean(family);
      const branchExists = Boolean(branch);
      const issues = issuesByResourceId.get(ref.resource_instance_id);
      const parseSeverity =
        !exists || !branchExists || (issues?.blocking ?? 0) > 0
          ? "blocking"
          : (issues?.warning ?? 0) > 0
            ? "warning"
            : null;
      const parseStatus = !exists
        ? "缺失计算实例"
        : !branchExists
          ? "缺失分支"
          : (issues?.blocking ?? 0) > 0
            ? `${issues?.blocking} 项阻断`
            : (issues?.warning ?? 0) > 0
              ? `${issues?.warning} 项警告`
              : "OK";
      return {
        key: `${rowKey}:${index}`,
        ref,
        label: family?.family.display_name ?? ref.resource_instance_id,
        branchLabel: branch?.branch.display_name ?? branchId,
        branchId,
        executionOrders: ordersByResourceBranch.get(rowKey) ?? [],
        exists,
        branchExists,
        parseStatus,
        parseSeverity
      };
    });
  }, [ca.disk, profile, runtimeReport]);

  const customUsages = profile?.project.custom_node_usages ?? [];

  if (!profile) {
    return (
      <div className="chain-editor-empty">
        <p className="sidebar-hint">未选中配置档案。</p>
        <button
          type="button"
          className="primary-button"
          onClick={() => closeProfileGroup(profileId)}
        >
          关闭
        </button>
      </div>
    );
  }

  const activeCount = resourceRows.filter((row) => row.ref.enabled).length;
  const disabledCount = resourceRows.length - activeCount;
  const issueCount =
    (runtimeReport?.blocking.length ?? 0) + (runtimeReport?.warning.length ?? 0);
  const associatedModelTargets = normalizeProfileExportConfig(
    profile.project.export_config
  ).platform_model_targets;
  const openAssociatedModel = (targetId: string) => {
    setExportDialogTargetId(targetId);
    setExportDialogOpen(true);
  };
  const createAssociatedModel = () => {
    setExportDialogTargetId(undefined);
    setCreateExportTargetRequest((cur) => cur + 1);
    setExportDialogOpen(true);
  };

  return (
    <div className="chain-editor" title={profile.id}>
      <div className="profile-lifecycle">
        <section className="profile-lifecycle-section">
          <div className="profile-overview-title-row">
            <div className="profile-overview-title-main">
              <h2>{profile.name}</h2>
              <span className="profile-overview-path">{profile.id}</span>
            </div>
            <div className="profile-lifecycle-buttons">
              <button
                type="button"
                className="chain-editor-action-btn"
                onClick={() => openChainEditor(profile.id, profile.name)}
              >
                查看链路
              </button>
              <button
                type="button"
                className="chain-editor-action-btn"
                onClick={() => void openFile(profile.id, { preview: false })}
              >
                查看 JSON
              </button>
              <button
                type="button"
                className="chain-editor-action-btn"
                onClick={() => void ca.revealProfileInOs(profile)}
              >
                打开目录
              </button>
            </div>
          </div>
          <div className="profile-lifecycle-section-body">
            <dl className="profile-lifecycle-grid">
              <dt>Schema</dt>
              <dd>v{profile.project.version ?? 1}</dd>
              <dt>资源 slot</dt>
              <dd>
                {resourceRows.length} 个（活跃 {activeCount} / 停用 {disabledCount}）
              </dd>
              <dt>自定义用法</dt>
              <dd>{customUsages.length} 个</dd>
              <dt>检查结果</dt>
              <dd>{issueCount === 0 ? "无阻断或警告" : `${issueCount} 项需关注`}</dd>
              <dt className="profile-associated-model-label">
                <span>关联型号</span>
                <button
                  type="button"
                  className="section-add-btn"
                  title="新增关联型号"
                  aria-label="新增关联型号"
                  onClick={createAssociatedModel}
                >
                  <span className="codicon codicon-add" aria-hidden="true" />
                </button>
              </dt>
              <dd>
                {associatedModelTargets.length === 0 ? (
                  "未配置"
                ) : (
                  <div className="profile-associated-model-list">
                    {associatedModelTargets.map((target) => (
                      <button
                        key={target.target_id}
                        type="button"
                        className="profile-associated-model-btn"
                        onClick={() => openAssociatedModel(target.target_id)}
                      >
                        {targetLabel(target)}
                      </button>
                    ))}
                  </div>
                )}
              </dd>
            </dl>
          </div>
        </section>

        <section className="profile-lifecycle-section">
          <h2>计算资源</h2>
          <div className="profile-lifecycle-section-body">
            <table className="resource-editor-files-table profile-resource-summary-table">
              <colgroup>
                <col className="profile-resource-col-instance" />
                <col className="profile-resource-col-branch" />
                <col className="profile-resource-col-type" />
                <col className="profile-resource-col-status" />
                <col className="profile-resource-col-order" />
                <col className="profile-resource-col-parse" />
              </colgroup>
              <thead>
                <tr>
                  <th>实例</th>
                  <th>分支</th>
                  <th>类型</th>
                  <th>状态</th>
                  <th>执行序号</th>
                  <th>解析</th>
                </tr>
              </thead>
              <tbody>
                {resourceRows.map((row) => (
                  <tr
                    key={row.key}
                    className={row.ref.enabled ? undefined : "profile-resource-row-disabled"}
                  >
                    <td>{row.label}</td>
                    <td>{row.branchLabel}</td>
                    <td>{row.ref.kind === "standard" ? "标准" : "自定义"}</td>
                    <td>
                      <span
                        className={
                          row.ref.enabled
                            ? "profile-resource-status is-active"
                            : "profile-resource-status is-disabled"
                        }
                      >
                        {row.ref.enabled ? "活跃" : "停用"}
                      </span>
                    </td>
                    <td>
                      {row.executionOrders.length > 0
                        ? row.executionOrders.join("、")
                        : "-"}
                    </td>
                    <td
                      className={
                        row.parseSeverity === "blocking"
                          ? "profile-resource-parse is-error"
                          : row.parseSeverity === "warning"
                            ? "profile-resource-parse is-warning"
                            : undefined
                      }
                    >
                      {row.parseStatus}
                    </td>
                  </tr>
                ))}
                {resourceRows.length === 0 && (
                  <tr>
                    <td colSpan={6}>暂无计算资源。</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {runtimeReport && issueCount > 0 && (
          <section className="profile-lifecycle-section">
            <h2>检查结果</h2>
            <div className="profile-lifecycle-section-body">
              <table className="resource-editor-files-table">
                <tbody>
                  {[...runtimeReport.blocking, ...runtimeReport.warning].map(
                    (issue) => {
                      const blocking = runtimeReport.blocking.includes(issue);
                      return (
                        <tr
                          key={issue.id}
                          className={
                            blocking
                              ? "profile-contract-issue-row is-blocking"
                              : "profile-contract-issue-row is-warning"
                          }
                        >
                          <td>{blocking ? "阻断" : "警告"}</td>
                          <td>{issue.title}</td>
                          <td>{issue.detail ?? "-"}</td>
                        </tr>
                      );
                    }
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className="profile-lifecycle-section">
          <h2>结构快照</h2>
          <div className="profile-lifecycle-section-body">
            <details className="profile-overview-json-block">
              <summary>resources[] JSON</summary>
              <pre>{JSON.stringify(profile.project.resources ?? [], null, 2)}</pre>
            </details>
            <details className="profile-overview-json-block">
              <summary>custom_node_usages[] JSON</summary>
              <pre>
                {JSON.stringify(profile.project.custom_node_usages ?? [], null, 2)}
              </pre>
            </details>
          </div>
        </section>
      </div>
      <ProfileExportConfigDialog
        open={exportDialogOpen}
        profile={profile}
        initialTargetId={exportDialogTargetId}
        createRequestId={createExportTargetRequest}
        onClose={() => setExportDialogOpen(false)}
      />
    </div>
  );
}
