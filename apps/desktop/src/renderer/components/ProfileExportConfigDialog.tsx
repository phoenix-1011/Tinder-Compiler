import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ProfileComputeObjectBinding,
  ProfileExportConfig,
  ProfilePlatformModelTarget,
  ProfileResourceRef
} from "@tinder/nextstep";
import {
  branchKey,
  computeObjectKey,
  normalizeProfileExportConfig,
  platformObjectKey,
  profileResourceBranchId
} from "@tinder/nextstep";
import { useCa } from "../state/ChainAssemblyContext";
import {
  join,
  type ProfileEntry
} from "../state/chainAssemblyStorage";
import {
  bindingKeyForBinding,
  bindingKeyForRef,
  buildPlatformRuntimeConfig,
  isSafeObjectSegment,
  targetLabel,
  validatePlatformTarget
} from "../state/profilePlatformExport";

interface ProfileExportConfigDialogProps {
  open: boolean;
  profile: ProfileEntry;
  initialTargetId?: string;
  createRequestId?: number;
  onClose: () => void;
}

export function ProfileExportConfigDialog({
  open,
  profile,
  initialTargetId,
  createRequestId = 0,
  onClose
}: ProfileExportConfigDialogProps) {
  const ca = useCa();
  const refs = useMemo(
    () => profile.project.resources ?? [],
    [profile.project.resources]
  );
  const activeBindingRefs = useMemo(
    () => refs.filter((ref) => ref.enabled),
    [refs]
  );
  const [draft, setDraft] = useState<ProfileExportConfig>(() =>
    normalizeProfileExportConfig(profile.project.export_config)
  );
  const [selectedTargetId, setSelectedTargetId] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const handledCreateRequest = useRef(0);

  const selectedTarget =
    draft.platform_model_targets.find(
      (target) => target.target_id === selectedTargetId
    ) ?? null;

  const activeBindingKeys = useMemo(
    () => new Set(activeBindingRefs.map((ref) => bindingKeyForRef(ref))),
    [activeBindingRefs]
  );
  const activeRefsByBindingKey = useMemo(
    () =>
      new Map(
        activeBindingRefs.map((ref) => [bindingKeyForRef(ref), ref] as const)
      ),
    [activeBindingRefs]
  );

  const resourceLabelByKey = useMemo(() => {
    const labels = new Map<string, string>();
    for (const ref of activeBindingRefs) {
      const branchId = profileResourceBranchId(ref);
      const family = ca.disk?.resourceIndex.familyByKey.get(
        `${ref.kind}:${ref.resource_instance_id}`
      );
      const branch = ca.disk?.resourceIndex.branchByKey.get(
        branchKey(ref.kind, ref.resource_instance_id, branchId)
      );
      const familyName = family?.family.display_name ?? ref.resource_instance_id;
      const branchName = branch?.branch.display_name ?? branchId;
      labels.set(bindingKeyForRef(ref), `${familyName} / ${branchName}`);
    }
    return labels;
  }, [activeBindingRefs, ca.disk]);

  useEffect(() => {
    if (!open) return;
    let next = normalizeProfileExportConfig(profile.project.export_config);
    if (
      createRequestId > 0 &&
      createRequestId !== handledCreateRequest.current
    ) {
      handledCreateRequest.current = createRequestId;
      const id = uniqueTargetId(next.platform_model_targets);
      const target: ProfilePlatformModelTarget = {
        target_id: id,
        platform_model_id: "",
        platform_version: "",
        platform_object_key: "",
        enabled: true,
        compute_object_bindings: bindingsFromActiveRefs(
          activeBindingRefs,
          resourceLabelByKey
        )
      };
      next = {
        ...next,
        platform_model_targets: [...next.platform_model_targets, target]
      };
      setDraft(next);
      setSelectedTargetId(id);
      setSaveState("idle");
      return;
    }
    setDraft(next);
    setSelectedTargetId(
      initialTargetId &&
        next.platform_model_targets.some(
          (target) => target.target_id === initialTargetId
        )
        ? initialTargetId
        : next.platform_model_targets[0]?.target_id ?? ""
    );
    setSaveState("idle");
  }, [
    open,
    profile.id,
    profile.project.export_config,
    initialTargetId,
    createRequestId,
    activeBindingRefs,
    resourceLabelByKey
  ]);

  const targetIssues = useMemo(
    () =>
      selectedTarget
        ? validatePlatformTarget(selectedTarget, {
            activeBindingKeys,
            activeRefsByBindingKey,
            disk: ca.disk
          })
        : [],
    [selectedTarget, activeBindingKeys, activeRefsByBindingKey, ca.disk]
  );

  const allEnabledIssues = useMemo(() => {
    const issues: string[] = [];
    const seen = new Map<string, string>();
    for (const target of draft.platform_model_targets.filter((t) => t.enabled)) {
      const key = platformObjectKey(
        target.platform_model_id,
        target.platform_version
      );
      if (key) {
        const previous = seen.get(key);
        if (previous) {
          issues.push(`关联型号 ${key} 在 ${previous} 与 ${target.target_id} 中重复`);
        } else {
          seen.set(key, target.target_id);
        }
      }
      issues.push(
        ...validatePlatformTarget(target, {
          activeBindingKeys,
          activeRefsByBindingKey,
          disk: ca.disk
        }).map((issue) => `${targetLabel(target)}: ${issue}`)
      );
    }
    return issues;
  }, [draft.platform_model_targets, activeBindingKeys, activeRefsByBindingKey, ca.disk]);

  const saveDraft = async () => {
    setSaveState("saving");
    try {
      await window.tinder.writeText(
        profile.id,
        JSON.stringify(
          {
            ...profile.project,
            export_config: normalizeProfileExportConfig(draft)
          },
          null,
          2
        )
      );
      setSaveState("saved");
      await ca.reload();
      window.setTimeout(() => setSaveState("idle"), 1400);
    } catch (err) {
      setSaveState("error");
      await ca.dialogNotify({ title: "保存失败", message: String(err) });
    }
  };

  const patchTarget = (
    targetId: string,
    patch: Partial<ProfilePlatformModelTarget>
  ) => {
    setDraft((cur) => ({
      ...cur,
      platform_model_targets: cur.platform_model_targets.map((target) => {
        if (target.target_id !== targetId) return target;
        const next = { ...target, ...patch };
        return {
          ...next,
          platform_object_key: platformObjectKey(
            next.platform_model_id,
            next.platform_version
          )
        };
      })
    }));
  };

  const deleteTarget = async (targetId: string) => {
    const ok = await ca.dialogConfirm({
      title: "删除关联型号",
      message: "将从当前配置档案中移除该关联型号及其计算资源对象映射。"
    });
    if (!ok) return;
    setDraft((cur) => {
      const nextTargets = cur.platform_model_targets.filter(
        (target) => target.target_id !== targetId
      );
      if (selectedTargetId === targetId) {
        setSelectedTargetId(nextTargets[0]?.target_id ?? "");
      }
      return { ...cur, platform_model_targets: nextTargets };
    });
  };

  const syncTargetBindings = (targetId: string) => {
    setDraft((cur) => ({
      ...cur,
      platform_model_targets: cur.platform_model_targets.map((target) => {
        if (target.target_id !== targetId) return target;
        const existing = new Map(
          target.compute_object_bindings.map((binding) => [
            bindingKeyForBinding(binding),
            binding
          ])
        );
        return {
          ...target,
          compute_object_bindings: bindingsFromActiveRefs(
            activeBindingRefs,
            resourceLabelByKey,
            existing
          )
        };
      })
    }));
  };

  const patchBinding = (
    targetId: string,
    bindingId: string,
    patch: Partial<ProfileComputeObjectBinding>
  ) => {
    setDraft((cur) => ({
      ...cur,
      platform_model_targets: cur.platform_model_targets.map((target) => {
        if (target.target_id !== targetId) return target;
        return {
          ...target,
          compute_object_bindings: target.compute_object_bindings.map((binding) => {
            if (binding.binding_id !== bindingId) return binding;
            const next = { ...binding, ...patch };
            return {
              ...next,
              compute_object_key: computeObjectKey(
                next.compute_object_id,
                next.compute_object_version
              )
            };
          })
        };
      })
    }));
  };

  const exportTargets = async (targets: ProfilePlatformModelTarget[]) => {
    const enabledTargets = targets.filter((target) => target.enabled);
    if (enabledTargets.length === 0) {
      await ca.dialogNotify({ title: "没有可导出的关联型号" });
      return;
    }
    const issues =
      targets.length === 1 && selectedTarget
        ? targetIssues
        : allEnabledIssues;
    if (issues.length > 0) {
      await ca.dialogNotify({
        title: "导出配置不完整",
        message: issues.slice(0, 12).join("\n")
      });
      return;
    }
    const root = await ca.dialogPrompt({
      title: "输入引擎根路径",
      placeholder: "例如 D:\\Tinder\\Model\\Model-P-v2"
    });
    if (!root?.trim()) return;
    const written: string[] = [];
    for (const target of enabledTargets) {
      if (
        !isSafeObjectSegment(target.platform_model_id) ||
        !isSafeObjectSegment(target.platform_version)
      ) {
        await ca.dialogNotify({
          title: "导出路径不安全",
          message: `${targetLabel(target)} 的编号或版本不能作为规范路径片段，且不能包含下划线。`
        });
        return;
      }
      const modelDir = await join(
        root.trim(),
        "bin",
        "resources",
        "models",
        target.platform_model_id.trim()
      );
      const filePath = await join(
        modelDir,
        `${platformObjectKey(
          target.platform_model_id,
          target.platform_version
        )}.runtime.json`
      );
      const doc = buildPlatformRuntimeConfig(target, {
        profile,
        disk: ca.disk
      });
      await window.tinder.writeText(filePath, JSON.stringify(doc, null, 2));
      written.push(filePath);
    }
    await ca.dialogNotify({ title: "导出完成", message: written.join("\n") });
  };

  if (!open) return null;

  return (
    <div className="profile-export-modal-backdrop" role="presentation">
      <div
        className="profile-export-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-export-modal-title"
      >
        <div className="profile-export-modal-header">
          <h2 id="profile-export-modal-title">编辑关联型号</h2>
          <button
            type="button"
            className="chain-editor-action-btn"
            onClick={onClose}
          >
            关闭
          </button>
        </div>

        <div className="profile-export-modal-body">
          <section className="profile-export-dialog-section">
            <div className="profile-export-dialog-heading">
              <h3>关联型号</h3>
            </div>
            {!selectedTarget ? (
              <p className="profile-export-empty">
                尚未选择关联型号。请从配置档案概览中新增或选择一个关联型号。
              </p>
            ) : (
              <div className="resource-editor-form">
                <label className="resource-editor-field">
                  <span className="resource-editor-label">状态</span>
                  <span className="resource-editor-control">
                    <label className="profile-export-checkbox">
                      <input
                        type="checkbox"
                        checked={selectedTarget.enabled}
                        onChange={(event) =>
                          patchTarget(selectedTarget.target_id, {
                            enabled: event.target.checked
                          })
                        }
                      />
                      启用
                    </label>
                  </span>
                </label>
                <label className="resource-editor-field">
                  <span className="resource-editor-label">显示名称</span>
                  <span className="resource-editor-control">
                    <input
                      className="resource-editor-input"
                      value={selectedTarget.display_name ?? ""}
                      onChange={(event) =>
                        patchTarget(selectedTarget.target_id, {
                          display_name: event.target.value
                        })
                      }
                    />
                  </span>
                </label>
                <label className="resource-editor-field">
                  <span className="resource-editor-label">关联型号编号</span>
                  <span className="resource-editor-control">
                    <input
                      className="resource-editor-input"
                      value={selectedTarget.platform_model_id}
                      onChange={(event) =>
                        patchTarget(selectedTarget.target_id, {
                          platform_model_id: event.target.value
                        })
                      }
                      placeholder="3012101"
                    />
                  </span>
                </label>
                <label className="resource-editor-field">
                  <span className="resource-editor-label">版本</span>
                  <span className="resource-editor-control">
                    <input
                      className="resource-editor-input"
                      value={selectedTarget.platform_version}
                      onChange={(event) =>
                        patchTarget(selectedTarget.target_id, {
                          platform_version: event.target.value
                        })
                      }
                      placeholder="1.2.0"
                    />
                  </span>
                </label>
                <label className="resource-editor-field">
                  <span className="resource-editor-label">带版本编号</span>
                  <span className="resource-editor-control">
                    <code>
                      {platformObjectKey(
                        selectedTarget.platform_model_id,
                        selectedTarget.platform_version
                      ) || "未生成"}
                    </code>
                  </span>
                </label>
                <label className="resource-editor-field">
                  <span className="resource-editor-label">映射数量</span>
                  <span className="resource-editor-control">
                    {selectedTarget.compute_object_bindings.length}
                  </span>
                </label>
              </div>
            )}
          </section>

          {selectedTarget && (
            <section className="profile-export-dialog-section">
              <div className="profile-export-dialog-heading">
                <h3>计算资源对象映射</h3>
                <button
                  type="button"
                  className="chain-editor-action-btn"
                  onClick={() => syncTargetBindings(selectedTarget.target_id)}
                >
                  同步活跃资源
                </button>
              </div>
              <div className="profile-export-table-wrap">
                <table className="profile-export-table">
                  <thead>
                    <tr>
                      <th>活跃资源分支</th>
                      <th>对象编号</th>
                      <th>版本</th>
                      <th>对象键</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTarget.compute_object_bindings.map((binding) => {
                      const key = bindingKeyForBinding(binding);
                      return (
                        <tr
                          key={binding.binding_id}
                          className={
                            activeBindingKeys.has(key) ? undefined : "is-stale"
                          }
                        >
                          <td>
                            <div>{resourceLabelByKey.get(key) ?? key}</div>
                            <small>
                              {binding.resource_kind}:{binding.resource_instance_id}
                              /{binding.selected_branch_id}
                            </small>
                          </td>
                          <td>
                            <input
                              className="resource-editor-input profile-export-cell-input"
                              value={binding.compute_object_id}
                              onChange={(event) =>
                                patchBinding(selectedTarget.target_id, binding.binding_id, {
                                  compute_object_id: event.target.value
                                })
                              }
                              placeholder="2012101"
                            />
                          </td>
                          <td>
                            <input
                              className="resource-editor-input profile-export-cell-input"
                              value={binding.compute_object_version}
                              onChange={(event) =>
                                patchBinding(selectedTarget.target_id, binding.binding_id, {
                                  compute_object_version: event.target.value
                                })
                              }
                              placeholder="1.2.0"
                            />
                          </td>
                          <td>
                            <code>
                              {computeObjectKey(
                                binding.compute_object_id,
                                binding.compute_object_version
                              ) || "未生成"}
                            </code>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {targetIssues.length > 0 ? (
                <ul className="profile-export-issues">
                  {targetIssues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              ) : (
                <p className="profile-export-ok">当前关联型号映射完整。</p>
              )}
            </section>
          )}
        </div>

        <div className="profile-export-modal-footer">
          <button
            type="button"
            className="chain-editor-action-btn"
            disabled={!selectedTarget}
            onClick={() => selectedTarget && void exportTargets([selectedTarget])}
          >
            导出当前关联型号
          </button>
          <button
            type="button"
            className="chain-editor-action-btn"
            disabled={allEnabledIssues.length > 0}
            onClick={() => void exportTargets(draft.platform_model_targets)}
          >
            导出全部启用关联型号
          </button>
          <button
            type="button"
            className="chain-editor-action-btn is-danger"
            disabled={!selectedTarget}
            onClick={() =>
              selectedTarget && void deleteTarget(selectedTarget.target_id)
            }
          >
            删除关联型号
          </button>
          <button
            type="button"
            className="chain-editor-action-btn is-primary"
            onClick={() => void saveDraft()}
          >
            {saveState === "saving"
              ? "保存中..."
              : saveState === "saved"
                ? "已保存"
                : "保存映射"}
          </button>
        </div>
      </div>
    </div>
  );
}

function bindingsFromActiveRefs(
  refs: ProfileResourceRef[],
  labels: Map<string, string>,
  existing = new Map<string, ProfileComputeObjectBinding>()
): ProfileComputeObjectBinding[] {
  return refs.map((ref) => {
    const key = bindingKeyForRef(ref);
    const branchId = profileResourceBranchId(ref);
    const cur = existing.get(key);
    return {
      binding_id: key,
      resource_kind: ref.kind,
      resource_instance_id: ref.resource_instance_id,
      selected_branch_id: branchId,
      compute_object_id: cur?.compute_object_id ?? "",
      compute_object_version: cur?.compute_object_version ?? "",
      compute_object_key: computeObjectKey(
        cur?.compute_object_id ?? "",
        cur?.compute_object_version ?? ""
      ),
      display_name: cur?.display_name ?? labels.get(key)
    };
  });
}

function uniqueTargetId(targets: ProfilePlatformModelTarget[]): string {
  const taken = new Set(targets.map((target) => target.target_id));
  let n = targets.length + 1;
  let id = `platform-target-${n}`;
  while (taken.has(id)) {
    n += 1;
    id = `platform-target-${n}`;
  }
  return id;
}
