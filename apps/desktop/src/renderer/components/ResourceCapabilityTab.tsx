import { useCallback, useMemo } from "react";
import type {
  ComputeResourceStatus,
  ComputeResourceV2,
  CustomComputeNodeDef,
  CustomComputeResource,
  PlatformNodeType,
  ResourceModelVariant,
  StandardComputeCandidate,
  StandardComputeResource
} from "@tinder/nextstep";
import { nextFreeIndex } from "@tinder/nextstep";
import { CHAIN_CATALOG } from "../help/chain-catalog.generated";
import { useCa } from "../state/ChainAssemblyContext";
import { collectAllCustomActionIndexes } from "../state/chainAssemblyStorage";

// ─────────────────────────────────────────────────────────────────────────────
// Shared
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_OPTIONS: Array<{ value: ComputeResourceStatus; label: string }> = [
  { value: "draft", label: "草稿" },
  { value: "active", label: "活跃" },
  { value: "disabled", label: "停用" }
];

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9一-鿿]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "node"
  );
}

function uniqueSuffix(base: string, exists: (candidate: string) => boolean): string {
  if (!exists(base)) return base;
  let n = 2;
  while (exists(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Standard capability tab
// ─────────────────────────────────────────────────────────────────────────────

interface StandardCapabilityTabProps {
  draft: StandardComputeResource;
  selectedVariantId: string | null;
  onSelectVariant: (variantId: string | null) => void;
  patch: (next: StandardComputeResource) => void;
}

export function StandardCapabilityTab({
  draft,
  selectedVariantId,
  onSelectVariant,
  patch
}: StandardCapabilityTabProps) {
  const ca = useCa();
  const candidates = draft.compute_nodes;
  const variants = draft.model_variants;
  const variant =
    variants.find((v) => v.variant_id === selectedVariantId) ??
    variants[0] ??
    null;

  // Group candidates by node_id so the UI can present one row per standard
  // chain node with a radio group across covering candidates.
  const candidatesByNode = useMemo(() => {
    const map = new Map<string, StandardComputeCandidate[]>();
    for (const cand of candidates) {
      const list = map.get(cand.node_id);
      if (list) list.push(cand);
      else map.set(cand.node_id, [cand]);
    }
    return map;
  }, [candidates]);

  // ─── Variant operations ────────────────────────────────────────────────
  const handleAddVariant = useCallback(async () => {
    const displayName = await ca.dialogPrompt({
      title: "新建变体",
      placeholder: "变体显示名，例如 默认 / 雷达-A"
    });
    if (!displayName?.trim()) return;
    const trimmed = displayName.trim();
    const baseId = slugify(trimmed);
    const variantId = uniqueSuffix(baseId, (c) =>
      variants.some((v) => v.variant_id === c)
    );
    const newVariant: ResourceModelVariant = {
      variant_id: variantId,
      display_name: trimmed,
      effective_candidates: {}
    };
    patch({
      ...draft,
      model_variants: [...variants, newVariant]
    });
    onSelectVariant(variantId);
  }, [ca, draft, onSelectVariant, patch, variants]);

  const handleRenameVariant = useCallback(
    async (v: ResourceModelVariant) => {
      const next = await ca.dialogPrompt({
        title: "重命名变体",
        defaultValue: v.display_name
      });
      if (!next?.trim() || next.trim() === v.display_name) return;
      patch({
        ...draft,
        model_variants: variants.map((cur) =>
          cur.variant_id === v.variant_id
            ? { ...cur, display_name: next.trim() }
            : cur
        )
      });
    },
    [ca, draft, patch, variants]
  );

  const handleCopyVariant = useCallback(
    async (v: ResourceModelVariant) => {
      const next = await ca.dialogPrompt({
        title: "复制变体",
        defaultValue: `${v.display_name} 副本`
      });
      if (!next?.trim()) return;
      const trimmed = next.trim();
      const baseId = slugify(trimmed);
      const variantId = uniqueSuffix(baseId, (c) =>
        variants.some((vv) => vv.variant_id === c)
      );
      const cloned: ResourceModelVariant = {
        ...v,
        variant_id: variantId,
        display_name: trimmed,
        effective_candidates: { ...(v.effective_candidates ?? {}) }
      };
      patch({ ...draft, model_variants: [...variants, cloned] });
      onSelectVariant(variantId);
    },
    [ca, draft, onSelectVariant, patch, variants]
  );

  const handleDeleteVariant = useCallback(
    async (v: ResourceModelVariant) => {
      const ok = await ca.dialogConfirm({
        title: "删除变体",
        message: `确认删除变体「${v.display_name}」？该变体内的有效候选选择将丢失。`,
        destructive: true
      });
      if (!ok) return;
      const remaining = variants.filter((cur) => cur.variant_id !== v.variant_id);
      patch({ ...draft, model_variants: remaining });
      if (selectedVariantId === v.variant_id) {
        onSelectVariant(remaining[0]?.variant_id ?? null);
      }
    },
    [ca, draft, onSelectVariant, patch, selectedVariantId, variants]
  );

  // ─── Candidate operations ──────────────────────────────────────────────
  const handleAddCandidate = useCallback(async () => {
    const options = CHAIN_CATALOG.orderedNodes.map((n) => ({
      id: n.nodeId,
      label: `${n.order}. ${n.displayName}`,
      hint: n.nodeId
    }));
    const picked = await ca.dialogPrompt({
      title: "选择标准节点（canonical id）",
      placeholder: "粘贴或输入 canonical node_id，例如 platform.entity.update",
      defaultValue: options[0]?.hint ?? ""
    });
    if (!picked?.trim()) return;
    const nodeId = picked.trim();
    const catalogEntry = CHAIN_CATALOG.orderedNodes.find(
      (n) => n.nodeId === nodeId
    );
    if (!catalogEntry) {
      await ca.dialogNotify({
        title: "未找到该节点",
        message: `canonical id「${nodeId}」不在标准链中。请先确认是否拼写正确。`
      });
      return;
    }
    const candidateIdBase = slugify(`${nodeId}-c`);
    const candidateId = uniqueSuffix(candidateIdBase, (c) =>
      candidates.some((cand) => cand.candidate_id === c)
    );
    const newCandidate: StandardComputeCandidate = {
      node_id: nodeId,
      display_name: catalogEntry.displayName,
      // Standard chain doesn't expose a fine-grained PlatformNodeType per
      // catalog row — default to "pathway"; user can refine later in the
      // candidate row.
      node_type: "pathway" satisfies PlatformNodeType,
      candidate_id: candidateId,
      status: "draft"
    };
    patch({ ...draft, compute_nodes: [...candidates, newCandidate] });
  }, [ca, candidates, draft, patch]);

  const handleEditCandidate = useCallback(
    (oldCand: StandardComputeCandidate, patchCand: Partial<StandardComputeCandidate>) => {
      patch({
        ...draft,
        compute_nodes: candidates.map((c) =>
          c === oldCand ? { ...c, ...patchCand } : c
        )
      });
    },
    [candidates, draft, patch]
  );

  const handleDeleteCandidate = useCallback(
    async (cand: StandardComputeCandidate) => {
      const ok = await ca.dialogConfirm({
        title: "删除候选",
        message: `确认删除候选「${cand.display_name || cand.candidate_id || cand.node_id}」？被任何变体选中的有效候选引用将自动清除。`,
        destructive: true
      });
      if (!ok) return;
      const dropId = cand.candidate_id;
      const nextVariants = variants.map((v) => {
        if (!v.effective_candidates) return v;
        const cleaned: Record<string, string> = {};
        for (const [nodeId, candId] of Object.entries(v.effective_candidates)) {
          if (candId !== dropId) cleaned[nodeId] = candId;
        }
        return { ...v, effective_candidates: cleaned };
      });
      patch({
        ...draft,
        compute_nodes: candidates.filter((c) => c !== cand),
        model_variants: nextVariants
      });
    },
    [ca, candidates, draft, patch, variants]
  );

  const handleSetEffective = useCallback(
    (nodeId: string, candidateId: string | null) => {
      if (!variant) return;
      const next: Record<string, string> = {
        ...(variant.effective_candidates ?? {})
      };
      if (candidateId === null) delete next[nodeId];
      else next[nodeId] = candidateId;
      patch({
        ...draft,
        model_variants: variants.map((v) =>
          v.variant_id === variant.variant_id
            ? { ...v, effective_candidates: next }
            : v
        )
      });
    },
    [draft, patch, variant, variants]
  );

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <div className="profile-lifecycle">
      <section className="profile-lifecycle-section">
        <h2>变体</h2>
        {variants.length === 0 ? (
          <p className="sidebar-hint">
            该标准资源还没有任何 model variant。添加一个变体后才能在其内挑选每个标准节点的有效候选。
          </p>
        ) : (
          <div className="capability-variant-bar">
            <label className="resource-editor-label">当前变体</label>
            <select
              className="resource-editor-input"
              style={{ maxWidth: 280 }}
              value={variant?.variant_id ?? ""}
              onChange={(e) => onSelectVariant(e.target.value || null)}
            >
              {variants.map((v) => (
                <option key={v.variant_id} value={v.variant_id}>
                  {v.display_name} ({v.variant_id})
                </option>
              ))}
            </select>
            {variant && (
              <>
                <button
                  type="button"
                  className="chain-editor-action-btn"
                  onClick={() => void handleRenameVariant(variant)}
                >
                  重命名…
                </button>
                <button
                  type="button"
                  className="chain-editor-action-btn"
                  onClick={() => void handleCopyVariant(variant)}
                >
                  复制变体…
                </button>
                <button
                  type="button"
                  className="chain-editor-action-btn is-danger"
                  onClick={() => void handleDeleteVariant(variant)}
                >
                  删除
                </button>
              </>
            )}
          </div>
        )}
        <div className="resource-editor-files-toolbar">
          <button
            type="button"
            className="chain-editor-action-btn"
            onClick={() => void handleAddVariant()}
          >
            新建变体…
          </button>
        </div>
      </section>

      <section className="profile-lifecycle-section">
        <h2>候选（compute_nodes）</h2>
        <div className="resource-editor-files-toolbar">
          <button
            type="button"
            className="chain-editor-action-btn"
            onClick={() => void handleAddCandidate()}
          >
            添加候选…
          </button>
        </div>
        {candidates.length === 0 ? (
          <p className="sidebar-hint">尚未添加任何候选。</p>
        ) : (
          <table className="resource-editor-files-table">
            <thead>
              <tr>
                <th>candidate_id</th>
                <th>node_id</th>
                <th>显示名</th>
                <th>function_name</th>
                <th>inactive_suffix</th>
                <th>状态</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((cand, idx) => (
                <tr key={cand.candidate_id ?? `${cand.node_id}-${idx}`}>
                  <td>
                    <input
                      className="resource-editor-input"
                      style={{ maxWidth: 180 }}
                      value={cand.candidate_id ?? ""}
                      placeholder={cand.node_id}
                      onChange={(e) =>
                        handleEditCandidate(cand, {
                          candidate_id: e.target.value
                        })
                      }
                    />
                  </td>
                  <td>
                    <code>{cand.node_id}</code>
                  </td>
                  <td>
                    <input
                      className="resource-editor-input"
                      style={{ maxWidth: 200 }}
                      value={cand.display_name}
                      onChange={(e) =>
                        handleEditCandidate(cand, {
                          display_name: e.target.value
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="resource-editor-input"
                      style={{ maxWidth: 200 }}
                      value={cand.function_name ?? ""}
                      onChange={(e) =>
                        handleEditCandidate(cand, {
                          function_name: e.target.value
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="resource-editor-input"
                      style={{ maxWidth: 140 }}
                      value={cand.inactive_suffix ?? ""}
                      placeholder="_inactive"
                      onChange={(e) =>
                        handleEditCandidate(cand, {
                          inactive_suffix: e.target.value
                        })
                      }
                    />
                  </td>
                  <td>
                    <select
                      className="resource-editor-input"
                      style={{ maxWidth: 110 }}
                      value={cand.status ?? "draft"}
                      onChange={(e) =>
                        handleEditCandidate(cand, {
                          status: e.target.value as ComputeResourceStatus
                        })
                      }
                    >
                      {STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="chain-editor-action-btn is-danger"
                      onClick={() => void handleDeleteCandidate(cand)}
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {variant && candidatesByNode.size > 0 && (
        <section className="profile-lifecycle-section">
          <h2>变体「{variant.display_name}」的有效候选</h2>
          <p className="sidebar-hint" style={{ fontSize: 12 }}>
            同一变体下，每个标准 node_id 最多只能有一个有效候选。
          </p>
          <table className="resource-editor-files-table">
            <thead>
              <tr>
                <th>node_id</th>
                <th>可选候选</th>
                <th>当前有效</th>
              </tr>
            </thead>
            <tbody>
              {[...candidatesByNode.entries()].map(([nodeId, group]) => {
                const effective =
                  variant.effective_candidates?.[nodeId] ?? "";
                return (
                  <tr key={nodeId}>
                    <td>
                      <code>{nodeId}</code>
                    </td>
                    <td>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 4
                        }}
                      >
                        {group.map((c, i) => {
                          const candId = c.candidate_id ?? `${nodeId}#${i}`;
                          return (
                            <label
                              key={candId}
                              style={{ display: "flex", gap: 8 }}
                            >
                              <input
                                type="radio"
                                name={`effective-${nodeId}`}
                                checked={effective === candId}
                                onChange={() =>
                                  handleSetEffective(nodeId, candId)
                                }
                              />
                              <span>
                                {candId}{" "}
                                <span className="sidebar-hint">
                                  · {c.display_name}
                                  {c.status ? ` · ${c.status}` : ""}
                                </span>
                              </span>
                            </label>
                          );
                        })}
                        <label style={{ display: "flex", gap: 8 }}>
                          <input
                            type="radio"
                            name={`effective-${nodeId}`}
                            checked={!effective}
                            onChange={() => handleSetEffective(nodeId, null)}
                          />
                          <span className="sidebar-hint">（无）</span>
                        </label>
                      </div>
                    </td>
                    <td>{effective || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom capability tab
// ─────────────────────────────────────────────────────────────────────────────

interface CustomCapabilityTabProps {
  draft: CustomComputeResource;
  patch: (next: CustomComputeResource) => void;
}

export function CustomCapabilityTab({ draft, patch }: CustomCapabilityTabProps) {
  const ca = useCa();
  const nodes = draft.custom_nodes;

  // Usage count per node — pulled from the live profile state so the
  // editor can show impact without owning placement.
  const usageByNode = useMemo(() => {
    const counts = new Map<string, { active: number; disabled: number }>();
    if (!ca.disk) return counts;
    for (const profile of ca.disk.profiles) {
      for (const u of profile.project.custom_node_usages ?? []) {
        if (u.resource_instance_id !== draft.resource_instance_id) continue;
        const slot = counts.get(u.node_id) ?? { active: 0, disabled: 0 };
        if (u.enabled) slot.active += 1;
        else slot.disabled += 1;
        counts.set(u.node_id, slot);
      }
    }
    return counts;
  }, [ca.disk, draft.resource_instance_id]);

  // Global action_index pool — exclude this resource so we can replace
  // values inside it without colliding with our own previously-allocated
  // indexes.
  const externallyUsed = useMemo(
    () =>
      ca.disk
        ? collectAllCustomActionIndexes(ca.disk, draft.resource_instance_id)
        : new Set<number>(),
    [ca.disk, draft.resource_instance_id]
  );

  const allocateActionIndex = useCallback(
    (existingNodes: CustomComputeNodeDef[]): number => {
      const used = new Set<number>(externallyUsed);
      for (const node of existingNodes) {
        if (typeof node.action_index === "number") used.add(node.action_index);
      }
      return nextFreeIndex(used);
    },
    [externallyUsed]
  );

  const handleAdd = useCallback(async () => {
    const displayName = await ca.dialogPrompt({
      title: "新建自定义节点",
      placeholder: "节点显示名"
    });
    if (!displayName?.trim()) return;
    const trimmedName = displayName.trim();
    const baseId = slugify(trimmedName);
    const nodeId = uniqueSuffix(baseId, (c) =>
      nodes.some((n) => n.node_id === c)
    );
    const newNode: CustomComputeNodeDef = {
      node_id: nodeId,
      display_name: trimmedName,
      description: "",
      // action_index left undefined — auto-allocated when description is
      // filled and the resource is saved.
      status: "draft"
    };
    patch({ ...draft, custom_nodes: [...nodes, newNode] });
  }, [ca, draft, nodes, patch]);

  const handleEdit = useCallback(
    (
      idx: number,
      mutator: (cur: CustomComputeNodeDef) => CustomComputeNodeDef
    ) => {
      patch({
        ...draft,
        custom_nodes: nodes.map((n, i) => (i === idx ? mutator(n) : n))
      });
    },
    [draft, nodes, patch]
  );

  const handleAllocateIndex = useCallback(
    (idx: number) => {
      handleEdit(idx, (n) => {
        if (typeof n.action_index === "number") return n;
        const allocated = allocateActionIndex(nodes);
        return { ...n, action_index: allocated };
      });
    },
    [allocateActionIndex, handleEdit, nodes]
  );

  const handleDelete = useCallback(
    async (node: CustomComputeNodeDef, idx: number) => {
      const ok = await ca.dialogConfirm({
        title: "删除自定义节点",
        message: `确认删除「${node.display_name || node.node_id}」？已有的链路放置仍在档案中，但将引用一个失效的 node_id。`,
        destructive: true
      });
      if (!ok) return;
      patch({
        ...draft,
        custom_nodes: nodes.filter((_, i) => i !== idx)
      });
    },
    [ca, draft, nodes, patch]
  );

  return (
    <div className="profile-lifecycle">
      <section className="profile-lifecycle-section">
        <h2>自定义节点（custom_nodes）</h2>
        <p className="sidebar-hint" style={{ fontSize: 12 }}>
          节点的链路插入位置和执行顺序仍由配置档案管理；此处只编辑可重用的节点定义。
          <br />
          描述非空时，保存资源会自动分配 <code>action_index</code>，分配后值不变。
        </p>
        <div className="resource-editor-files-toolbar">
          <button
            type="button"
            className="chain-editor-action-btn"
            onClick={() => void handleAdd()}
          >
            新建自定义节点…
          </button>
        </div>
        {nodes.length === 0 ? (
          <p className="sidebar-hint">尚未定义任何自定义节点。</p>
        ) : (
          <table className="resource-editor-files-table">
            <thead>
              <tr>
                <th>node_id</th>
                <th>显示名</th>
                <th>描述</th>
                <th>action_index</th>
                <th>handler_function</th>
                <th>状态</th>
                <th>使用</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((node, idx) => {
                const usage = usageByNode.get(node.node_id);
                const canAllocate =
                  typeof node.action_index !== "number" &&
                  node.description.trim().length > 0;
                return (
                  <tr key={`${node.node_id}-${idx}`}>
                    <td>
                      <input
                        className="resource-editor-input"
                        style={{ maxWidth: 160 }}
                        value={node.node_id}
                        onChange={(e) =>
                          handleEdit(idx, (n) => ({
                            ...n,
                            node_id: e.target.value
                          }))
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="resource-editor-input"
                        style={{ maxWidth: 180 }}
                        value={node.display_name}
                        onChange={(e) =>
                          handleEdit(idx, (n) => ({
                            ...n,
                            display_name: e.target.value
                          }))
                        }
                      />
                    </td>
                    <td>
                      <textarea
                        className="resource-editor-input"
                        rows={2}
                        style={{ minWidth: 200 }}
                        value={node.description}
                        onChange={(e) =>
                          handleEdit(idx, (n) => ({
                            ...n,
                            description: e.target.value
                          }))
                        }
                      />
                    </td>
                    <td>
                      {typeof node.action_index === "number" ? (
                        <code>{node.action_index}</code>
                      ) : canAllocate ? (
                        <button
                          type="button"
                          className="chain-editor-action-btn"
                          onClick={() => handleAllocateIndex(idx)}
                        >
                          立即分配
                        </button>
                      ) : (
                        <span className="sidebar-hint">待描述</span>
                      )}
                    </td>
                    <td>
                      <input
                        className="resource-editor-input"
                        style={{ maxWidth: 160 }}
                        value={node.handler_function ?? ""}
                        placeholder="handle_xxx"
                        onChange={(e) =>
                          handleEdit(idx, (n) => ({
                            ...n,
                            handler_function: e.target.value
                          }))
                        }
                      />
                    </td>
                    <td>
                      <select
                        className="resource-editor-input"
                        style={{ maxWidth: 110 }}
                        value={node.status ?? "draft"}
                        onChange={(e) =>
                          handleEdit(idx, (n) => ({
                            ...n,
                            status: e.target.value as ComputeResourceStatus
                          }))
                        }
                      >
                        {STATUS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {usage ? (
                        <span className="sidebar-hint">
                          {usage.active}/{usage.active + usage.disabled}
                        </span>
                      ) : (
                        <span className="sidebar-hint">—</span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="chain-editor-action-btn is-danger"
                        onClick={() => void handleDelete(node, idx)}
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* Per-node parameter editor — only render the section header here; each
          row gets an inline parameter editor below the main table to keep the
          top table compact. */}
      {nodes.length > 0 && (
        <section className="profile-lifecycle-section">
          <h2>节点参数 default_parameters</h2>
          {nodes.map((node, idx) => (
            <NodeParameterEditor
              key={`${node.node_id}-${idx}-params`}
              node={node}
              onChange={(next) => handleEdit(idx, () => next)}
            />
          ))}
        </section>
      )}
    </div>
  );
}

function NodeParameterEditor({
  node,
  onChange
}: {
  node: CustomComputeNodeDef;
  onChange: (next: CustomComputeNodeDef) => void;
}) {
  const params = node.default_parameters ?? {};
  const entries = Object.entries(params);

  const update = (key: string, value: string) => {
    const next = { ...params, [key]: value };
    onChange({ ...node, default_parameters: next });
  };
  const remove = (key: string) => {
    const next = { ...params };
    delete next[key];
    onChange({ ...node, default_parameters: next });
  };
  const renameKey = (oldKey: string, newKey: string) => {
    if (oldKey === newKey) return;
    const next: Record<string, string> = {};
    for (const [k, v] of entries) {
      next[k === oldKey ? newKey : k] = v;
    }
    onChange({ ...node, default_parameters: next });
  };
  const add = () => {
    let base = "param";
    let n = 1;
    let key = base;
    while (key in params) {
      n += 1;
      key = `${base}${n}`;
    }
    update(key, "");
  };

  return (
    <div className="capability-param-block">
      <div className="capability-param-header">
        <strong>{node.display_name || node.node_id}</strong>
        <button
          type="button"
          className="chain-editor-action-btn"
          onClick={add}
        >
          添加参数
        </button>
      </div>
      {entries.length === 0 ? (
        <p className="sidebar-hint">无默认参数。</p>
      ) : (
        <table className="resource-editor-files-table">
          <thead>
            <tr>
              <th>键</th>
              <th>默认值</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([k, v]) => (
              <tr key={k}>
                <td>
                  <input
                    className="resource-editor-input"
                    style={{ maxWidth: 180 }}
                    defaultValue={k}
                    onBlur={(e) => renameKey(k, e.target.value)}
                  />
                </td>
                <td>
                  <input
                    className="resource-editor-input"
                    value={v}
                    onChange={(e) => update(k, e.target.value)}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="chain-editor-action-btn is-danger"
                    onClick={() => remove(k)}
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
