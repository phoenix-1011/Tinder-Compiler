import { useMemo } from "react";
import type {
  BuiltinExecutionAnchor,
  CustomNodeUsage,
  ProfileResourceRef
} from "@tinder/nextstep";
import { profileResourceBranchId } from "@tinder/nextstep";
import { useCa } from "../state/ChainAssemblyContext";
import { useWorkspace } from "../state/WorkspaceContext";
import {
  basenameNoExt,
  collectProfileV2Resources,
  collectProjectV2Resources
} from "../state/chainAssemblyStorage";
import { buildRuntimeReport } from "../state/runtimeReport";
import { CHAIN_CATALOG } from "../help/chain-catalog.generated";

interface ProfileOverviewViewProps {
  profileId: string;
}

interface ResourceSlotRow {
  key: string;
  ref: ProfileResourceRef;
  label: string;
  branchLabel: string;
  branchId: string;
  folder: string;
  overrideCount: number;
  exists: boolean;
  branchExists: boolean;
}

function anchorLabel(anchor?: BuiltinExecutionAnchor | null): string {
  if (!anchor) return "末尾";
  if (anchor.kind === "builtin_core_chain") {
    const node = CHAIN_CATALOG.nodes[anchor.chain_id];
    return node?.displayName ?? `锚点缺失: ${anchor.chain_id}`;
  }
  const node = CHAIN_CATALOG.nodes[anchor.node_id];
  return node?.displayName ?? `${anchor.domain}/${anchor.node_id}`;
}

function isMissingCoreAnchor(anchor?: BuiltinExecutionAnchor | null): boolean {
  return (
    !!anchor &&
    anchor.kind === "builtin_core_chain" &&
    !CHAIN_CATALOG.nodes[anchor.chain_id]
  );
}

export function ProfileOverviewView({ profileId }: ProfileOverviewViewProps) {
  const ca = useCa();
  const { closeProfileGroup, openChainEditor, openFile, openProfileLifecycle } =
    useWorkspace();
  const profile = useMemo(() => {
    if (!ca.disk || !profileId) return null;
    return ca.disk.profiles.find((p) => p.id === profileId) ?? null;
  }, [ca.disk, profileId]);

  const resourceRows = useMemo<ResourceSlotRow[]>(() => {
    if (!ca.disk || !profile) return [];
    return (profile.project.resources ?? []).map((ref, index) => {
      const branchId = profileResourceBranchId(ref);
      const family = ca.disk?.resourceIndex.familyByKey.get(
        `${ref.kind}:${ref.resource_instance_id}`
      );
      const branch = family?.branches.find(
        (entry) => entry.branch.branch_id === branchId
      );
      return {
        key: `${ref.kind}:${ref.resource_instance_id}:${branchId}:${index}`,
        ref,
        label: family?.family.display_name ?? ref.resource_instance_id,
        branchLabel: branch?.branch.display_name ?? branchId,
        branchId,
        folder: ref.folder?.trim() || "-",
        overrideCount:
          ref.kind === "standard"
            ? Object.keys(ref.overrides?.effective_candidates ?? {}).length
            : 0,
        exists: Boolean(family),
        branchExists: Boolean(branch)
      };
    });
  }, [ca.disk, profile]);

  const customUsages = profile?.project.custom_node_usages ?? [];
  const runtimeReport = useMemo(() => {
    if (!ca.disk || !profile) return null;
    return buildRuntimeReport(
      profile.project,
      collectProfileV2Resources(ca.disk, profile.project),
      collectProjectV2Resources(ca.disk)
    );
  }, [ca.disk, profile]);

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

  return (
    <div className="chain-editor" title={profile.id}>
      <div className="profile-lifecycle">
        <section className="profile-lifecycle-section">
          <h2>{profile.name}</h2>
          <div className="profile-lifecycle-section-body">
            <dl className="profile-lifecycle-grid">
              <dt>文件名</dt>
              <dd>{basenameNoExt(profile.id) || "(无)"}</dd>
              <dt>路径</dt>
              <dd>
                <code>{profile.id}</code>
              </dd>
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
            </dl>
            <div className="profile-lifecycle-buttons">
              <button
                type="button"
                className="chain-editor-action-btn"
                onClick={() => openChainEditor(profile.id, profile.name)}
              >
                打开链路
              </button>
              <button
                type="button"
                className="chain-editor-action-btn"
                onClick={() => openProfileLifecycle(profile.id, profile.name)}
              >
                使用与版本
              </button>
              <button
                type="button"
                className="chain-editor-action-btn"
                onClick={() => void openFile(profile.id, { preview: false })}
              >
                打开 JSON
              </button>
            </div>
          </div>
        </section>

        <section className="profile-lifecycle-section">
          <h2>resources[]</h2>
          <div className="profile-lifecycle-section-body">
            <table className="resource-editor-files-table">
              <thead>
                <tr>
                  <th>状态</th>
                  <th>类型</th>
                  <th>计算实例</th>
                  <th>分支</th>
                  <th>文件夹</th>
                  <th>Override</th>
                  <th>解析</th>
                </tr>
              </thead>
              <tbody>
                {resourceRows.map((row) => (
                  <tr key={row.key}>
                    <td>{row.ref.enabled ? "活跃" : "停用"}</td>
                    <td>{row.ref.kind === "standard" ? "标准" : "自定义"}</td>
                    <td>
                      <code>{row.ref.resource_instance_id}</code>
                      <br />
                      {row.label}
                    </td>
                    <td>
                      <code>{row.branchId}</code>
                      <br />
                      {row.branchLabel}
                    </td>
                    <td>{row.folder}</td>
                    <td>{row.overrideCount}</td>
                    <td>
                      {!row.exists
                        ? "缺失计算实例"
                        : row.branchExists
                          ? "OK"
                          : "缺失分支"}
                    </td>
                  </tr>
                ))}
                {resourceRows.length === 0 && (
                  <tr>
                    <td colSpan={7}>暂无资源 slot。</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="profile-lifecycle-section">
          <h2>custom_node_usages[]</h2>
          <div className="profile-lifecycle-section-body">
            <table className="resource-editor-files-table">
              <thead>
                <tr>
                  <th>状态</th>
                  <th>资源</th>
                  <th>节点</th>
                  <th>插入位置</th>
                  <th>Order</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {customUsages.map((usage: CustomNodeUsage, index: number) => {
                  const missingAnchor = isMissingCoreAnchor(usage.insert_before);
                  return (
                    <tr
                      key={`${usage.resource_instance_id}:${usage.node_id}:${index}`}
                    >
                      <td>{usage.enabled ? "活跃" : "停用"}</td>
                      <td>
                        <code>{usage.resource_instance_id}</code>
                      </td>
                      <td>
                        <code>{usage.node_id}</code>
                      </td>
                      <td>{anchorLabel(usage.insert_before)}</td>
                      <td>{usage.order}</td>
                      <td>
                        {missingAnchor ? (
                          <button
                            type="button"
                            className="chain-editor-action-btn"
                            onClick={() =>
                              void ca.promptMoveCustomUsage(profile.id, index)
                            }
                          >
                            重选锚点
                          </button>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  );
                })}
                {customUsages.length === 0 && (
                  <tr>
                    <td colSpan={6}>暂无自定义节点用法。</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {runtimeReport && issueCount > 0 && (
          <section className="profile-lifecycle-section">
            <h2>Contract 检查</h2>
            <div className="profile-lifecycle-section-body">
              <table className="resource-editor-files-table">
                <tbody>
                  {[...runtimeReport.blocking, ...runtimeReport.warning].map(
                    (issue) => (
                      <tr key={issue.id}>
                        <td>{runtimeReport.blocking.includes(issue) ? "阻断" : "警告"}</td>
                        <td>{issue.title}</td>
                        <td>{issue.detail ?? "-"}</td>
                      </tr>
                    )
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
    </div>
  );
}
