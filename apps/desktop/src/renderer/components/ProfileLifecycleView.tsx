import { useMemo } from "react";
import { useCa } from "../state/ChainAssemblyContext";
import { basenameNoExt } from "../state/chainAssemblyStorage";

/**
 * Main-pane companion to `链路`. Surfaces profile lifecycle actions
 * (rename, duplicate, reveal, delete) and the canonical metadata
 * (file path, schema version, resource counts) that previously lived
 * as inline rows under the sidebar's `使用与版本` section.
 */
export function ProfileLifecycleView() {
  const ca = useCa();
  const profileId =
    ca.mainPaneTarget?.kind === "profile-lifecycle"
      ? ca.mainPaneTarget.profileId
      : null;
  const profile = useMemo(() => {
    if (!ca.disk || !profileId) return null;
    return ca.disk.profiles.find((p) => p.id === profileId) ?? null;
  }, [ca.disk, profileId]);

  if (!profile) {
    return (
      <div className="chain-editor-empty">
        <p className="sidebar-hint">未选中配置档案。</p>
        <button
          type="button"
          className="primary-button"
          onClick={ca.closeMainPane}
        >
          关闭
        </button>
      </div>
    );
  }

  const refs = profile.project.resources ?? [];
  const activeRefs = refs.filter((r) => r.enabled);
  const disabledRefs = refs.filter((r) => !r.enabled);
  const customUsages = profile.project.custom_node_usages ?? [];

  return (
    <div className="chain-editor">
      <header className="chain-editor-header">
        <div className="chain-editor-title">
          <span className="chain-editor-eyebrow">使用与版本</span>
          <h1>{profile.name}</h1>
          <code className="chain-editor-path" title={profile.id}>
            {profile.id}
          </code>
        </div>
        <div className="chain-editor-actions">
          <button
            type="button"
            className="chain-editor-close"
            onClick={ca.closeMainPane}
            title="关闭"
            aria-label="关闭"
          >
            <span className="codicon codicon-close" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="profile-lifecycle">
        <section className="profile-lifecycle-section">
          <h2>基本信息</h2>
          <dl className="profile-lifecycle-grid">
            <dt>档案名</dt>
            <dd>{profile.name}</dd>
            <dt>文件名</dt>
            <dd>{basenameNoExt(profile.id) || "(无)"}</dd>
            <dt>路径</dt>
            <dd>
              <code>{profile.id}</code>
            </dd>
            <dt>Schema</dt>
            <dd>v{profile.project.version ?? 1}</dd>
          </dl>
        </section>

        <section className="profile-lifecycle-section">
          <h2>组成统计</h2>
          <dl className="profile-lifecycle-grid">
            <dt>活跃资源</dt>
            <dd>{activeRefs.length}</dd>
            <dt>停用资源</dt>
            <dd>{disabledRefs.length}</dd>
            <dt>自定义节点用法</dt>
            <dd>{customUsages.length}</dd>
          </dl>
        </section>

        <section className="profile-lifecycle-section">
          <h2>操作</h2>
          <div className="profile-lifecycle-buttons">
            <button
              type="button"
              className="chain-editor-action-btn"
              onClick={() => void ca.duplicateProfile(profile)}
            >
              创建副本…
            </button>
            <button
              type="button"
              className="chain-editor-action-btn"
              onClick={() => void ca.renameProfileById(profile)}
            >
              重命名…
            </button>
            <button
              type="button"
              className="chain-editor-action-btn"
              onClick={() => void ca.revealProfileInOs(profile)}
            >
              在文件管理器中显示
            </button>
            <button
              type="button"
              className="chain-editor-action-btn is-danger"
              onClick={() => void ca.deleteProfileById(profile)}
            >
              删除档案
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
