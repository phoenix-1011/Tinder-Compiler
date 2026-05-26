import { useCallback, useMemo, useState } from "react";
import type {
  ComputeResourceStatus,
  CustomComputeNodeDef,
  CustomComputeResource,
  ImplementationFileRef,
  PlatformNodeType,
  ResourceModelVariant,
  StandardComputeCandidate,
  StandardComputeResource
} from "@tinder/nextstep";
import { nextFreeIndex } from "@tinder/nextstep";
import { CHAIN_CATALOG } from "../help/chain-catalog.generated";
import {
  chainNodeUiNotice,
  chainNodeUiTags,
  isResourceBindableChainNode
} from "../help/chainCatalogUi";
import { useCa } from "../state/ChainAssemblyContext";
import { collectAllCustomActionIndexes } from "../state/chainAssemblyStorage";
import { ContextMenu, useContextMenu } from "./ContextMenu";

// ─────────────────────────────────────────────────────────────────────────────
// Shared
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_OPTIONS: Array<{ value: ComputeResourceStatus; label: string }> = [
  { value: "draft", label: "草稿" },
  { value: "active", label: "可用" },
  { value: "disabled", label: "已废弃" }
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
  /** Resource source path — package dir for v2, json path for legacy. */
  sourcePath: string | null;
  /** Open a source file in Monaco at an optional (line, column). */
  onOpenFile: (
    absolutePath: string,
    position?: { line: number; column: number }
  ) => void;
  /** Open a chain catalog doc for `相关文档` quick links. */
  onOpenDocsForNode: (nodeId: string) => void;
  lockVariantManagement?: boolean;
}

export function StandardCapabilityTab({
  draft,
  selectedVariantId,
  onSelectVariant,
  patch,
  sourcePath,
  onOpenFile,
  onOpenDocsForNode,
  lockVariantManagement
}: StandardCapabilityTabProps) {
  const ca = useCa();
  const candidates = draft.compute_nodes;
  const variants = draft.model_variants;
  const variant =
    variants.find((v) => v.variant_id === selectedVariantId) ??
    variants[0] ??
    null;

  // Filter for the candidate table — "all" or a specific standard chain
  // node_id. Persisted only for the editor lifetime (no need to survive
  // tab close).
  const [nodeFilter, setNodeFilter] = useState<string>("all");
  // Map node_id → catalog display name. Falls back to the raw id when
  // the node isn't in CHAIN_CATALOG.
  const catalogNameOf = useCallback((nodeId: string): string => {
    const entry = CHAIN_CATALOG.nodes[nodeId];
    return entry?.displayName ?? nodeId;
  }, []);
  const policyLabelOf = useCallback((nodeId: string): string | null => {
    if (isResourceBindableChainNode(nodeId)) return null;
    return chainNodeUiTags(nodeId)[0] ?? "内建结构节点";
  }, []);
  // Column-header filter popup + variant-management "more" menu. Both
  // use the shared `useContextMenu` pattern from elsewhere in the app.
  const filterMenu = useContextMenu();
  const variantMoreMenu = useContextMenu();

  /**
   * Heuristic "jump to function" — scan the resource's source files for
   * a definition of `funcName`. Tries Python `def name(` first; falls
   * back to a generic `name(` match. Returns the absolute path + 1-based
   * line/column of the first hit, or `null` when nothing matches.
   */
  const findFunctionLocation = useCallback(
    async (
      funcName: string
    ): Promise<{
      absolutePath: string;
      position: { line: number; column: number };
    } | null> => {
      if (!funcName.trim()) return null;
      const esc = funcName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pyRe = new RegExp(
        `^[ \\t]*(?:async[ \\t]+)?def[ \\t]+${esc}[ \\t]*\\(`,
        "m"
      );
      const genRe = new RegExp(`(?:^|[\\s*&])${esc}\\s*\\(`, "m");
      const packageDir =
        sourcePath && !sourcePath.endsWith(".json") ? sourcePath : null;
      const refs: ImplementationFileRef[] =
        draft.implementation.source_files;
      for (const ref of refs) {
        let abs: string | null = null;
        if (ref.storage === "managed") {
          if (!packageDir) continue;
          abs = await window.tinder.joinPath(packageDir, ref.path);
        } else {
          abs = ref.path;
        }
        if (!abs) continue;
        let text: string;
        try {
          text = await window.tinder.readText(abs);
        } catch {
          continue;
        }
        const match = pyRe.exec(text) ?? genRe.exec(text);
        if (!match) continue;
        const lineStart = text.lastIndexOf("\n", match.index) + 1;
        const before = text.slice(0, lineStart);
        const line = before.length === 0 ? 1 : before.split(/\r?\n/).length;
        const column = match.index - lineStart + 1;
        return { absolutePath: abs, position: { line, column } };
      }
      return null;
    },
    [draft.implementation.source_files, sourcePath]
  );

  const handleRevealFunction = useCallback(
    async (funcName: string) => {
      const hit = await findFunctionLocation(funcName);
      if (!hit) {
        await ca.dialogNotify({
          title: "未找到函数实现",
          message: `在资源关联的代码文件中未找到 ${funcName} 的定义。可能是函数名拼写不一致，或定义在其他文件中。`
        });
        return;
      }
      onOpenFile(hit.absolutePath, hit.position);
    },
    [ca, findFunctionLocation, onOpenFile]
  );

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
      title: "新建分支",
      placeholder: "分支名，例如 默认 / 雷达-A"
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
        title: "重命名分支",
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
        title: "复制分支",
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
      // Standard resources must always carry at least one preset — refuse
      // to delete the last remaining one.
      if (variants.length <= 1) {
        await ca.dialogNotify({
          title: "无法删除",
          message: "至少需要保留一个分支。"
        });
        return;
      }
      const ok = await ca.dialogConfirm({
        title: "删除分支",
        message: `确认删除分支「${v.display_name}」？该分支内的有效候选选择将丢失。`,
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
    const bindableNodes = CHAIN_CATALOG.orderedNodes.filter((n) =>
      isResourceBindableChainNode(n.nodeId)
    );
    const options = bindableNodes.map((n) => ({
      id: n.nodeId,
      label: `${n.order}. ${n.displayName}`,
      hint: n.nodeId,
      categoryId: n.docSlug
    }));
    const categories = CHAIN_CATALOG.groups.map((g) => ({
      id: g.docSlug,
      label: g.title
    }));
    const picked = await ca.dialogPickOne({
      title: "选择标准链路",
      placeholder: "输入中文名或 canonical id 搜索…",
      options,
      categories,
      categoryLabel: "链路类型"
    });
    if (!picked) return;
    const nodeId = picked;
    const catalogEntry = CHAIN_CATALOG.orderedNodes.find(
      (n) => n.nodeId === nodeId
    );
    if (!catalogEntry) return;
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

  const handleEditCandidateNote = useCallback(
    async (cand: StandardComputeCandidate) => {
      const next = await ca.dialogPrompt({
        title: `备注 · ${cand.display_name || cand.candidate_id || cand.node_id}`,
        placeholder: "为该节点添加备注（支持多行，Ctrl+Enter 确认）",
        defaultValue: cand.notes ?? "",
        multiline: true
      });
      if (next === null) return;
      patch({
        ...draft,
        compute_nodes: candidates.map((c) =>
          c === cand ? { ...c, notes: next } : c
        )
      });
    },
    [ca, candidates, draft, patch]
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
        <h2>
          {lockVariantManagement ? "节点实现" : "分支"}
          {!lockVariantManagement && (
            <>
              <select
                className="resource-editor-input resource-editor-heading-select"
                value={variant?.variant_id ?? ""}
                onChange={(e) => onSelectVariant(e.target.value || null)}
                aria-label="当前分支"
              >
                {variants.map((v) => (
                  <option key={v.variant_id} value={v.variant_id}>
                    {v.display_name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="section-add-btn"
                onClick={() => void handleAddVariant()}
                title="新建分支"
                aria-label="新建分支"
              >
                <span className="codicon codicon-add" aria-hidden="true" />
              </button>
              {variant && (
                <button
                  type="button"
                  className="section-add-btn"
                  onClick={(e) =>
                    variantMoreMenu.open(e, [
                      {
                        id: "rename",
                        label: "重命名当前分支…",
                        run: () => void handleRenameVariant(variant)
                      },
                      {
                        id: "copy",
                        label: "复制当前分支…",
                        run: () => void handleCopyVariant(variant)
                      },
                      { separator: true },
                      {
                        id: "delete",
                        label: "删除当前分支",
                        disabled: variants.length <= 1,
                        run: () => void handleDeleteVariant(variant)
                      }
                    ])
                  }
                  title="更多操作"
                  aria-label="更多操作"
                >
                  <span
                    className="codicon codicon-ellipsis"
                    aria-hidden="true"
                  />
                </button>
              )}
            </>
          )}
        </h2>
        <div className="profile-lifecycle-section-body">
          {variant && candidatesByNode.size > 0 && (
            <table className="resource-editor-files-table">
              <thead>
                <tr>
                  <th>标准链路</th>
                  <th>计算节点</th>
                  <th>实现方法</th>
                </tr>
              </thead>
              <tbody>
                {[...candidatesByNode.entries()].map(([nodeId, group]) => {
                  const effective =
                    variant.effective_candidates?.[nodeId] ?? "";
                  const effectiveCand = group.find(
                    (c) => (c.candidate_id ?? "") === effective
                  );
                  const funcName = effectiveCand?.function_name?.trim() ?? "";
                  const policyLabel = policyLabelOf(nodeId);
                  const policyNotice = chainNodeUiNotice(nodeId);
                  return (
                    <tr key={nodeId}>
                      <td title={policyNotice}>
                        {catalogNameOf(nodeId)}
                        {policyLabel && (
                          <>
                            <br />
                            <span className="sidebar-hint">{policyLabel}</span>
                          </>
                        )}
                      </td>
                      <td>
                        <select
                          className="resource-editor-input"
                          style={{ maxWidth: 320 }}
                          value={effective}
                          onChange={(e) =>
                            handleSetEffective(
                              nodeId,
                              e.target.value || null
                            )
                          }
                        >
                          <option value="">无</option>
                          {group.map((c, i) => {
                            const candId =
                              c.candidate_id ?? `${nodeId}#${i}`;
                            const statusTail =
                              c.status && c.status !== "active"
                                ? ` · ${c.status}`
                                : "";
                            return (
                              <option key={candId} value={candId}>
                                {(c.display_name || candId) + statusTail}
                              </option>
                            );
                          })}
                        </select>
                      </td>
                      <td>
                        {!effectiveCand ? (
                          <span className="sidebar-hint">—</span>
                        ) : funcName ? (
                          <button
                            type="button"
                            className="assistant-panel-link"
                            onClick={() => void handleRevealFunction(funcName)}
                            title={`查看 / 编辑 ${funcName}`}
                          >
                            查看 / 编辑
                            <span className="sidebar-hint"> · {funcName}</span>
                          </button>
                        ) : (
                          <span className="sidebar-hint">未设置</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="profile-lifecycle-section">
        <h2>
          可选节点
          <button
            type="button"
            className="section-add-btn"
            onClick={() => void handleAddCandidate()}
            title="添加可选节点"
            aria-label="添加可选节点"
          >
            <span className="codicon codicon-add" aria-hidden="true" />
          </button>
        </h2>
        <div className="profile-lifecycle-section-body">
          {candidates.length === 0 ? (
            <p className="sidebar-hint">尚未添加任何节点。</p>
          ) : (
            <table className="resource-editor-files-table">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>
                    {/* Custom dropdown button — opens a ContextMenu list
                        of catalog nodes that appear in the candidate
                        pool. Avoids the native `<select>` chrome, which
                        looks foreign next to our editor styling. */}
                    <button
                      type="button"
                      className={`resource-editor-th-filter-btn${
                        nodeFilter !== "all" ? " is-filtered" : ""
                      }`}
                      onClick={(e) =>
                        filterMenu.open(e, [
                          {
                            id: "all",
                            label: "全部",
                            run: () => setNodeFilter("all")
                          },
                          { separator: true },
                          ...[...candidatesByNode.keys()].map((nodeId) => ({
                            id: nodeId,
                            label: catalogNameOf(nodeId),
                            run: () => setNodeFilter(nodeId)
                          }))
                        ])
                      }
                      title="筛选标准链路"
                    >
                      <span>
                        {nodeFilter === "all"
                          ? "标准链路"
                          : catalogNameOf(nodeFilter)}
                      </span>
                      <span
                        className="codicon codicon-chevron-down"
                        aria-hidden="true"
                      />
                    </button>
                  </th>
                  <th>实现函数</th>
                  <th>状态</th>
                  <th></th>
                </tr>
              </thead>
                <tbody>
                  {candidates.map((cand, idx) => {
                    if (
                      nodeFilter !== "all" &&
                      cand.node_id !== nodeFilter
                    ) {
                      return null;
                    }
                    // Row key is intentionally derived from node_id + index
                    // so editing the (now hidden) candidate_id field
                    // doesn't remount the row mid-keystroke.
                    return (
                      <tr key={`${cand.node_id}::${idx}`}>
                        <td>
                          <input
                            className="resource-editor-input"
                            style={{ maxWidth: 220 }}
                            value={cand.display_name}
                            onChange={(e) =>
                              handleEditCandidate(cand, {
                                display_name: e.target.value
                              })
                            }
                          />
                        </td>
                        <td title={chainNodeUiNotice(cand.node_id)}>
                          {catalogNameOf(cand.node_id)}
                          {policyLabelOf(cand.node_id) && (
                            <>
                              <br />
                              <span className="sidebar-hint">
                                {policyLabelOf(cand.node_id)}
                              </span>
                            </>
                          )}
                        </td>
                        <td>
                          <input
                            className="resource-editor-input"
                            style={{ maxWidth: 220 }}
                            value={cand.function_name ?? ""}
                            onChange={(e) =>
                              handleEditCandidate(cand, {
                                function_name: e.target.value
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
                                status: e.target
                                  .value as ComputeResourceStatus
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
                          <div className="resource-editor-files-actions">
                            <button
                              type="button"
                              className="chain-editor-action-btn"
                              onClick={() =>
                                void handleRevealFunction(
                                  cand.function_name?.trim() ?? ""
                                )
                              }
                              disabled={!cand.function_name?.trim()}
                              title={
                                cand.function_name?.trim()
                                  ? `查看 / 编辑 ${cand.function_name}`
                                  : "请先填写实现函数"
                              }
                            >
                              编辑
                            </button>
                            <button
                              type="button"
                              className="chain-editor-action-btn"
                              onClick={() => void handleEditCandidateNote(cand)}
                              title={
                                cand.notes
                                  ? `备注：${cand.notes}`
                                  : "添加备注"
                              }
                            >
                              {cand.notes ? "备注 ●" : "备注"}
                            </button>
                            <button
                              type="button"
                              className="chain-editor-action-btn is-danger"
                              onClick={() => void handleDeleteCandidate(cand)}
                            >
                              删除
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
          )}
        </div>
      </section>

      <CodeFilesSection
        sourceFiles={draft.implementation.source_files}
        sourcePath={sourcePath}
        onOpenFile={onOpenFile}
        patchSourceFiles={(next) =>
          patch({
            ...draft,
            implementation: { ...draft.implementation, source_files: next }
          })
        }
      />

      <RelatedDocsBlock
        linkedNodeIds={[...new Set(candidates.map((c) => c.node_id))]}
        emptyForCustom={false}
        catalogNameOf={catalogNameOf}
        onOpenDocsForNode={onOpenDocsForNode}
      />

      {filterMenu.state && (
        <ContextMenu
          x={filterMenu.state.x}
          y={filterMenu.state.y}
          items={filterMenu.state.items}
          onClose={filterMenu.close}
        />
      )}
      {variantMoreMenu.state && (
        <ContextMenu
          x={variantMoreMenu.state.x}
          y={variantMoreMenu.state.y}
          items={variantMoreMenu.state.items}
          onClose={variantMoreMenu.close}
        />
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
  sourcePath: string | null;
  onOpenFile: (
    absolutePath: string,
    position?: { line: number; column: number }
  ) => void;
}

export function CustomCapabilityTab({
  draft,
  patch,
  sourcePath,
  onOpenFile
}: CustomCapabilityTabProps) {
  const ca = useCa();
  const nodes = draft.custom_nodes;

  // Row-level action menu + parameter-edit modal both target a single
  // node at a time. We carry the index here rather than the object so
  // the modal stays in sync if surrounding rows mutate while open.
  const actionsMenu = useContextMenu();
  const [paramEditIdx, setParamEditIdx] = useState<number | null>(null);

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

  // Treat anything other than a `.json` legacy path as the package dir.
  const packageDir =
    sourcePath && !sourcePath.endsWith(".json") ? sourcePath : null;

  /** Same heuristic as StandardCapabilityTab — locate a function definition
   *  in any of the resource's source files so 编辑 can jump directly to
   *  `handler_function`. */
  const findFunctionLocation = useCallback(
    async (
      funcName: string
    ): Promise<{
      absolutePath: string;
      position: { line: number; column: number };
    } | null> => {
      if (!funcName.trim()) return null;
      const esc = funcName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pyRe = new RegExp(
        `^[ \\t]*(?:async[ \\t]+)?def[ \\t]+${esc}[ \\t]*\\(`,
        "m"
      );
      const genRe = new RegExp(`(?:^|[\\s*&])${esc}\\s*\\(`, "m");
      for (const ref of draft.implementation.source_files) {
        let abs: string | null = null;
        if (ref.storage === "managed") {
          if (!packageDir) continue;
          abs = await window.tinder.joinPath(packageDir, ref.path);
        } else {
          abs = ref.path;
        }
        if (!abs) continue;
        let text: string;
        try {
          text = await window.tinder.readText(abs);
        } catch {
          continue;
        }
        const match = pyRe.exec(text) ?? genRe.exec(text);
        if (!match) continue;
        const lineStart = text.lastIndexOf("\n", match.index) + 1;
        const before = text.slice(0, lineStart);
        const line = before.length === 0 ? 1 : before.split(/\r?\n/).length;
        const column = match.index - lineStart + 1;
        return { absolutePath: abs, position: { line, column } };
      }
      return null;
    },
    [draft.implementation.source_files, packageDir]
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

  const handleRevealHandler = useCallback(
    async (node: CustomComputeNodeDef) => {
      const fn = node.handler_function?.trim() ?? "";
      if (!fn) {
        await ca.dialogNotify({
          title: "未设置实现函数",
          message: "请先填写 handler_function 后再尝试跳转。"
        });
        return;
      }
      const hit = await findFunctionLocation(fn);
      if (!hit) {
        await ca.dialogNotify({
          title: "未找到函数实现",
          message: `在资源关联的代码文件中未找到 ${fn} 的定义。`
        });
        return;
      }
      onOpenFile(hit.absolutePath, hit.position);
    },
    [ca, findFunctionLocation, onOpenFile]
  );

  const handleEditNote = useCallback(
    async (node: CustomComputeNodeDef, idx: number) => {
      const next = await ca.dialogPrompt({
        title: `备注 · ${node.display_name || node.node_id}`,
        placeholder: "为该节点添加备注（支持多行，Ctrl+Enter 确认）",
        defaultValue: node.notes ?? "",
        multiline: true
      });
      if (next === null) return;
      handleEdit(idx, (n) => ({ ...n, notes: next }));
    },
    [ca, handleEdit]
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

  const paramEditNode =
    paramEditIdx !== null ? nodes[paramEditIdx] ?? null : null;

  return (
    <div className="profile-lifecycle">
      <section className="profile-lifecycle-section">
        <h2>
          自定义节点
          <button
            type="button"
            className="section-add-btn"
            onClick={() => void handleAdd()}
            title="新建自定义节点"
            aria-label="新建自定义节点"
          >
            <span className="codicon codicon-add" aria-hidden="true" />
          </button>
        </h2>
        <div className="profile-lifecycle-section-body">
        {nodes.length === 0 ? (
          <p className="sidebar-hint">尚未定义任何自定义节点。</p>
        ) : (
          <table className="resource-editor-files-table">
            <thead>
              <tr>
                <th>显示名</th>
                <th>描述</th>
                <th>action_index</th>
                <th>handler_function</th>
                <th>状态</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((node, idx) => {
                const canAllocate =
                  typeof node.action_index !== "number" &&
                  node.description.trim().length > 0;
                return (
                  <tr key={`${node.node_id}-${idx}`}>
                    <td>
                      <input
                        className="resource-editor-input"
                        style={{ maxWidth: 200 }}
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
                        style={{ minWidth: 220 }}
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
                        style={{ maxWidth: 180 }}
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
                      <button
                        type="button"
                        className="section-add-btn"
                        onClick={(e) =>
                          actionsMenu.open(e, [
                            {
                              id: "edit",
                              label: "编辑",
                              disabled: !(node.handler_function ?? "").trim(),
                              run: () => void handleRevealHandler(node)
                            },
                            {
                              id: "note",
                              label: node.notes ? "备注 ●" : "备注",
                              run: () => void handleEditNote(node, idx)
                            },
                            {
                              id: "params",
                              label: "参数设置",
                              run: () => setParamEditIdx(idx)
                            },
                            { separator: true },
                            {
                              id: "delete",
                              label: "删除",
                              run: () => void handleDelete(node, idx)
                            }
                          ])
                        }
                        title="更多操作"
                        aria-label="更多操作"
                      >
                        <span
                          className="codicon codicon-ellipsis"
                          aria-hidden="true"
                        />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        </div>
      </section>

      <CodeFilesSection
        sourceFiles={draft.implementation.source_files}
        sourcePath={sourcePath}
        onOpenFile={onOpenFile}
        patchSourceFiles={(next) =>
          patch({
            ...draft,
            implementation: { ...draft.implementation, source_files: next }
          })
        }
      />

      {/* 醒目色页脚说明 — 提醒用户档案才是链路插入的归属。 */}
      <p className="resource-editor-footnote">
        节点的链路插入位置和执行顺序仍由配置档案管理；此处只编辑可重用的节点定义。
        描述非空时，保存资源会自动分配 <code>action_index</code>，分配后值不变。
      </p>

      {paramEditNode && paramEditIdx !== null && (
        <NodeParameterModal
          node={paramEditNode}
          onChange={(next) => handleEdit(paramEditIdx, () => next)}
          onClose={() => setParamEditIdx(null)}
        />
      )}
      {actionsMenu.state && (
        <ContextMenu
          x={actionsMenu.state.x}
          y={actionsMenu.state.y}
          items={actionsMenu.state.items}
          onClose={actionsMenu.close}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared sub-sections (code files & related docs)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Renders the resource's auto-generated code files at the bottom of the
 * capability tab. Per the "no multi-file mental model" decision, the
 * section supports only `编辑` (open in Monaco) and `重命名` actions —
 * adding or deleting files is not exposed. Storage is always `managed`
 * for v2 resources created through the new dialog.
 */
function CodeFilesSection({
  sourceFiles,
  sourcePath,
  onOpenFile,
  patchSourceFiles
}: {
  sourceFiles: ImplementationFileRef[];
  sourcePath: string | null;
  onOpenFile: (
    absolutePath: string,
    position?: { line: number; column: number }
  ) => void;
  patchSourceFiles: (next: ImplementationFileRef[]) => void;
}) {
  const ca = useCa();
  // Treat anything other than a `.json` legacy path as the package dir.
  const packageDir =
    sourcePath && !sourcePath.endsWith(".json") ? sourcePath : null;

  const resolveAbsolute = useCallback(
    async (ref: ImplementationFileRef): Promise<string | null> => {
      if (ref.storage === "managed") {
        if (!packageDir) return null;
        return window.tinder.joinPath(packageDir, ref.path);
      }
      return ref.path;
    },
    [packageDir]
  );

  const handleOpen = useCallback(
    async (ref: ImplementationFileRef) => {
      const abs = await resolveAbsolute(ref);
      if (!abs) {
        await ca.dialogNotify({
          title: "无法打开",
          message: "请先保存资源以生成代码文件。"
        });
        return;
      }
      onOpenFile(abs);
    },
    [ca, onOpenFile, resolveAbsolute]
  );

  const handleRename = useCallback(
    async (ref: ImplementationFileRef) => {
      if (ref.storage !== "managed") {
        await ca.dialogNotify({
          title: "无法重命名",
          message: "仅支持重命名由资源包托管的代码文件。"
        });
        return;
      }
      if (!packageDir) {
        await ca.dialogNotify({
          title: "请先保存资源",
          message: "新建草稿尚未落盘，保存后再重命名。"
        });
        return;
      }
      const segs = ref.path.split(/[\\/]/);
      const currentBase = segs[segs.length - 1] ?? ref.path;
      const next = await ca.dialogPrompt({
        title: "重命名代码文件",
        defaultValue: currentBase,
        placeholder: "例如 my_module.py"
      });
      if (!next?.trim() || next.trim() === currentBase) return;
      try {
        const { newRelPath } = await ca.renameManagedSourceFile({
          packageDir,
          currentRelPath: ref.path,
          newBaseName: next.trim()
        });
        patchSourceFiles(
          sourceFiles.map((f) =>
            f.file_id === ref.file_id ? { ...f, path: newRelPath } : f
          )
        );
      } catch (err) {
        await ca.dialogNotify({
          title: "重命名失败",
          message: String((err as Error)?.message ?? err)
        });
      }
    },
    [ca, packageDir, patchSourceFiles, sourceFiles]
  );

  return (
    <section className="profile-lifecycle-section">
      <h2>代码文件</h2>
      <div className="profile-lifecycle-section-body">
        {sourceFiles.length === 0 ? (
          <p className="sidebar-hint">该资源未关联任何代码文件。</p>
        ) : (
          <table className="resource-editor-files-table">
            <thead>
              <tr>
                <th>路径</th>
                <th>角色</th>
                <th>语言</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sourceFiles.map((ref) => (
                <tr key={ref.file_id}>
                  <td>
                    <code>{ref.path}</code>
                  </td>
                  <td>
                    <span className="sidebar-hint">{ref.role}</span>
                  </td>
                  <td>
                    <span className="sidebar-hint">{ref.language}</span>
                  </td>
                  <td>
                    <div className="resource-editor-files-actions">
                      <button
                        type="button"
                        className="chain-editor-action-btn"
                        onClick={() => void handleOpen(ref)}
                        title="在编辑器中打开"
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        className="chain-editor-action-btn"
                        onClick={() => void handleRename(ref)}
                        title="重命名"
                        disabled={ref.storage !== "managed"}
                      >
                        重命名
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

/**
 * "相关文档" quick-link strip. Surfaces every standard chain doc that
 * the resource's candidates target, deduped. Hidden when there are no
 * linked nodes — custom resources don't tie back to the standard
 * catalog, so they always render empty.
 */
function RelatedDocsBlock({
  linkedNodeIds,
  emptyForCustom,
  catalogNameOf,
  onOpenDocsForNode
}: {
  linkedNodeIds: string[];
  emptyForCustom: boolean;
  catalogNameOf: (nodeId: string) => string;
  onOpenDocsForNode: (nodeId: string) => void;
}) {
  if (emptyForCustom) return null;
  const ids = linkedNodeIds.filter((id) => !!CHAIN_CATALOG.nodes[id]);
  if (ids.length === 0) return null;
  return (
    <section className="profile-lifecycle-section">
      <h2>相关文档</h2>
      <div className="profile-lifecycle-section-body">
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "6px 14px",
            fontSize: 13
          }}
        >
          {ids.map((nodeId) => (
            <button
              key={nodeId}
              type="button"
              className="assistant-panel-link"
              onClick={() => onOpenDocsForNode(nodeId)}
              title={`打开 ${catalogNameOf(nodeId)} 的文档`}
            >
              {catalogNameOf(nodeId)}
            </button>
          ))}
        </div>
      </div>
    </section>
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
      <div
        className="capability-param-header"
        style={{ justifyContent: "flex-end" }}
      >
        <button
          type="button"
          className="section-add-btn"
          onClick={add}
          title="添加参数"
          aria-label="添加参数"
        >
          <span className="codicon codicon-add" aria-hidden="true" />
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

/**
 * Modal wrapper around NodeParameterEditor — opened from the row-level
 * `…` action menu. Click-outside or Escape closes. The editor itself
 * patches `node.default_parameters` straight through via `onChange`.
 */
function NodeParameterModal({
  node,
  onChange,
  onClose
}: {
  node: CustomComputeNodeDef;
  onChange: (next: CustomComputeNodeDef) => void;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal-card"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
        style={{ minWidth: 480, maxWidth: 640 }}
      >
        <div className="ca-dialog-title">
          参数设置 · {node.display_name || node.node_id}
        </div>
        <NodeParameterEditor node={node} onChange={onChange} />
        <div className="ca-dialog-actions">
          <button
            type="button"
            className="ca-dialog-btn is-primary"
            onClick={onClose}
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
