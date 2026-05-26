import { useMemo } from "react";
import { profileResourceBranchId } from "@tinder/nextstep";
import type { ProfileEntry } from "../state/chainAssemblyStorage";
import { useCa } from "../state/ChainAssemblyContext";
import { CHAIN_CATALOG } from "../help/chain-catalog.generated";
import {
  chainNodeUiNotice,
  chainNodeUiTags,
  isResourceBindableChainNode
} from "../help/chainCatalogUi";

/**
 * Phase 4 — batch candidate (`实现函数`) panel (C24c).
 *
 * Lists every chain node covered by the currently selected profile,
 * with one row per (chain node, covering standard resource). Each
 * row carries a candidate dropdown that writes through
 * `setProfileStandardEffectiveCandidate`. Branch selection is *not*
 * editable here — that's the pin metaphor (C25). The point of the
 * batch panel is to triage `实现函数` choices across the whole
 * profile in one place; per-row branch switching would conflate the
 * scopes that C24 deliberately separates.
 *
 * Rendered as a top-level modal overlay so it floats above the
 * canvas / inspector without disrupting layout.
 */
interface CanvasBatchCandidatePanelProps {
  profile: ProfileEntry;
  open: boolean;
  onClose: () => void;
}

interface BatchRow {
  chainNodeId: string;
  chainDisplayName: string;
  order: number;
  docTitle: string;
  resourceInstanceId: string;
  resourceDisplayName: string;
  branchId: string;
  candidates: Array<{
    candidateId: string;
    displayName: string;
  }>;
  branchDefaultCandidateId: string | null;
  /** Profile-level override (`undefined` = inherit, `null` = explicit clear). */
  profileOverride: string | null | undefined;
}

type BuiltinOnlyBatchRow = Pick<
  BatchRow,
  | "chainNodeId"
  | "chainDisplayName"
  | "order"
  | "docTitle"
  | "resourceInstanceId"
  | "resourceDisplayName"
  | "branchId"
> & { tag: string; notice?: string };

export function CanvasBatchCandidatePanel({
  profile,
  open,
  onClose
}: CanvasBatchCandidatePanelProps) {
  const ca = useCa();

  const rows = useMemo<BatchRow[]>(() => {
    if (!open || !ca.disk) return [];
    const orderedNodes = CHAIN_CATALOG.orderedNodes;
    const groupBySlug = new Map(
      CHAIN_CATALOG.groups.map((g) => [g.docSlug, g.title] as const)
    );
    const out: BatchRow[] = [];

    // Walk every active standard ref → for each effective chain node
    // it covers, emit one row with the resolved candidate list.
    const activeStandardRefs = (profile.project.resources ?? []).filter(
      (r) => r.kind === "standard" && r.enabled
    );

    for (const ref of activeStandardRefs) {
      if (ref.kind !== "standard") continue;
      const family = ca.disk.resourceIndex.familyByKey.get(
        `standard:${ref.resource_instance_id}`
      );
      if (!family) continue;
      const branchId = profileResourceBranchId(ref);
      const branchEntry = family.branches.find(
        (b) => b.branch.branch_id === branchId
      );
      if (!branchEntry || branchEntry.branch.resource_kind !== "standard") {
        continue;
      }
      const branch = branchEntry.branch;
      const profileOverrides = ref.overrides?.effective_candidates ?? {};

      for (const node of orderedNodes) {
        if (!isResourceBindableChainNode(node.nodeId)) continue;
        const candidates = branch.compute_nodes.filter(
          (c) => c.node_id === node.nodeId && c.status !== "disabled"
        );
        if (candidates.length === 0) continue;
        // S2 fix: surface this row regardless of whether the branch
        // already names an effective candidate for the chain node.
        // Previously we skipped rows where `branchDefaultCandidateId`
        // was empty — but those are exactly the rows the user came
        // here to set. `null` is rendered as "未选" in the "inherit"
        // option's label so users can see the gap.
        const branchDefaultCandidateId =
          branch.effective_candidates?.[node.nodeId] ?? null;

        out.push({
          chainNodeId: node.nodeId,
          chainDisplayName: node.displayName,
          order: node.order,
          docTitle: groupBySlug.get(node.docSlug) ?? node.docSlug,
          resourceInstanceId: ref.resource_instance_id,
          resourceDisplayName: family.family.display_name,
          branchId,
          candidates: candidates.map((c, idx) => ({
            candidateId: c.candidate_id ?? `${node.nodeId}#${idx}`,
            displayName: c.display_name || (c.candidate_id ?? "")
          })),
          branchDefaultCandidateId,
          profileOverride: profileOverrides[node.nodeId]
        });
      }
    }
    return out;
  }, [open, ca.disk, profile.project.resources]);

  const builtinOnlyRows = useMemo(
    () => activeBuiltinOnlyRows(profile, ca.disk),
    [ca.disk, profile]
  );

  if (!open) return null;

  const onChange = (row: BatchRow, raw: string) => {
    const next: string | null | undefined =
      raw === "__inherit__"
        ? undefined
        : raw === "__clear__"
          ? null
          : raw;
    void ca.setProfileStandardEffectiveCandidate(
      profile.id,
      row.resourceInstanceId,
      row.chainNodeId,
      next
    );
  };

  return (
    <div
      className="canvas-batch-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="canvas-batch-modal" role="dialog" aria-label="批量候选实现">
        <header className="canvas-batch-header">
          <span className="canvas-batch-title">批量候选实现（C24c）</span>
          <button
            type="button"
            className="canvas-batch-close"
            onClick={onClose}
            aria-label="关闭"
            title="关闭"
          >
            ×
          </button>
        </header>
        {rows.length === 0 && builtinOnlyRows.length === 0 ? (
          <div className="canvas-batch-empty">
            档案目前没有被任何标准分支覆盖的 chain node 可供批量切换候选。
          </div>
        ) : (
          <div className="canvas-batch-table" role="table">
            <div className="canvas-batch-row canvas-batch-row-head" role="row">
              <span>order</span>
              <span>chain node</span>
              <span>来源（resource · branch）</span>
              <span>分类</span>
              <span>实现函数（候选）</span>
            </div>
            {rows.map((row) => {
              const value =
                row.profileOverride === undefined
                  ? "__inherit__"
                  : row.profileOverride === null
                    ? "__clear__"
                    : row.profileOverride;
              return (
                <div
                  key={`${row.resourceInstanceId}::${row.chainNodeId}`}
                  className="canvas-batch-row"
                  role="row"
                >
                  <span className="canvas-batch-order">{row.order}</span>
                  <span className="canvas-batch-chain">
                    {row.chainDisplayName}
                    <code className="canvas-batch-chain-id">
                      {row.chainNodeId}
                    </code>
                  </span>
                  <span className="canvas-batch-source">
                    {row.resourceDisplayName}
                    <span className="canvas-batch-branch"> · {row.branchId}</span>
                  </span>
                  <span className="canvas-batch-doctitle">{row.docTitle}</span>
                  <select
                    className="canvas-batch-select"
                    value={value}
                    onChange={(e) => onChange(row, e.target.value)}
                  >
                    <option value="__inherit__">
                      继承分支默认（
                      {row.branchDefaultCandidateId ?? "未选"}）
                    </option>
                    {row.candidates.map((c) => (
                      <option key={c.candidateId} value={c.candidateId}>
                        {c.displayName}
                      </option>
                    ))}
                    <option value="__clear__">
                      明确清空（disable for this slot）
                    </option>
                  </select>
                </div>
              );
            })}
            {builtinOnlyRows.map((row) => (
              <div
                key={`builtin-only::${row.resourceInstanceId}::${row.chainNodeId}`}
                className="canvas-batch-row"
                role="row"
                title={row.notice}
              >
                <span className="canvas-batch-order">{row.order}</span>
                <span className="canvas-batch-chain">
                  {row.chainDisplayName}
                  <code className="canvas-batch-chain-id">
                    {row.chainNodeId}
                  </code>
                </span>
                <span className="canvas-batch-source">
                  {row.resourceDisplayName}
                  <span className="canvas-batch-branch"> · {row.branchId}</span>
                </span>
                <span className="canvas-batch-doctitle">{row.docTitle}</span>
                <span className="sidebar-hint">
                  {row.tag}，不可在此选择
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function activeBuiltinOnlyRows(
  profile: ProfileEntry,
  disk: ReturnType<typeof useCa>["disk"]
): BuiltinOnlyBatchRow[] {
  if (!disk) return [];
  const out: BuiltinOnlyBatchRow[] = [];
  const seen = new Set<string>();
  const groupBySlug = new Map(
    CHAIN_CATALOG.groups.map((g) => [g.docSlug, g.title] as const)
  );
  const activeStandardRefs = (profile.project.resources ?? []).filter(
    (r) => r.kind === "standard" && r.enabled
  );
  for (const ref of activeStandardRefs) {
    if (ref.kind !== "standard") continue;
    const family = disk.resourceIndex.familyByKey.get(
      `standard:${ref.resource_instance_id}`
    );
    if (!family) continue;
    const branchId = profileResourceBranchId(ref);
    const branchEntry = family.branches.find(
      (b) => b.branch.branch_id === branchId
    );
    if (!branchEntry || branchEntry.branch.resource_kind !== "standard") continue;
    for (const candidate of branchEntry.branch.compute_nodes) {
      if (isResourceBindableChainNode(candidate.node_id)) continue;
      const key = `${ref.resource_instance_id}:${branchId}:${candidate.node_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const node = CHAIN_CATALOG.nodes[candidate.node_id];
      out.push({
        chainNodeId: candidate.node_id,
        chainDisplayName: node?.displayName ?? candidate.node_id,
        order: node?.order ?? 0,
        docTitle: node ? groupBySlug.get(node.docSlug) ?? node.docSlug : "-",
        resourceInstanceId: ref.resource_instance_id,
        resourceDisplayName: family.family.display_name,
        branchId,
        tag: chainNodeUiTags(candidate.node_id)[0] ?? "内建结构节点",
        notice: chainNodeUiNotice(candidate.node_id)
      });
    }
  }
  return out;
}
