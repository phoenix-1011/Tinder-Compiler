import { useMemo, useState } from "react";
import type {
  CustomComputeResourceBranch,
  GuiProjectFile,
  ProfileResourceRef
} from "@tinder/nextstep";
import { profileResourceBranchId } from "@tinder/nextstep";
import { useCa } from "../state/ChainAssemblyContext";
import { useWorkspace } from "../state/WorkspaceContext";
import type {
  ComputeResourceBranchEntry,
  ResourceFamilyEntry
} from "../state/chainAssemblyStorage";

/**
 * Canvas-mode left sidebar (Phase 2 read-only).
 *
 * Standard tree is 2 levels (family → branch) — per C8 standard
 * resources never expose draggable nodes; pin and candidate
 * adjustments live elsewhere.
 *
 * Custom tree is 3 levels (family → branch → node) per C26 — node
 * rows are the only draggable unit (Phase 4 wires drag; Phase 2
 * displays read-only `·N` usage counts only).
 *
 * Pin state per branch is computed from `profile.resources`:
 *   unpinned          → family slot not in profile, OR selected_branch_id !== this
 *   pinned + active   → ref exists, branch matches, enabled=true
 *   pinned + disabled → ref exists, branch matches, enabled=false
 *
 * Click handlers are intentionally absent in Phase 2 — pin/unpin
 * lands in Phase 3 (C25 interactivity) and node drag lands in
 * Phase 4 (C26 drag).
 */
export function CanvasLibrary() {
  const { canvasProfileId } = useWorkspace();
  const { disk } = useCa();

  const profile = useMemo(() => {
    if (!canvasProfileId || !disk) return null;
    return disk.profiles.find((p) => p.id === canvasProfileId) ?? null;
  }, [canvasProfileId, disk]);

  if (!disk) {
    return (
      <div className="canvas-library is-empty">
        <p className="sidebar-hint">尚未加载计算实例库。</p>
      </div>
    );
  }

  const standardFamilies = disk.resourceFamilies.standard;
  const customFamilies = disk.resourceFamilies.custom;

  return (
    <div className="canvas-library">
      <CanvasLibrarySection
        title="计算实例 / 标准"
        emptyText="尚无标准计算实例。"
      >
        {standardFamilies.map((family) => (
          <FamilyRow
            key={`std:${family.family.resource_instance_id}`}
            family={family}
            profile={profile?.project ?? null}
            kind="standard"
          />
        ))}
      </CanvasLibrarySection>

      <CanvasLibrarySection
        title="计算实例 / 自定义"
        emptyText="尚无自定义计算实例。"
      >
        {customFamilies.map((family) => (
          <FamilyRow
            key={`cus:${family.family.resource_instance_id}`}
            family={family}
            profile={profile?.project ?? null}
            kind="custom"
          />
        ))}
      </CanvasLibrarySection>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Section wrapper
// ──────────────────────────────────────────────────────────────────

function CanvasLibrarySection({
  title,
  emptyText,
  children
}: {
  title: string;
  emptyText: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const hasChildren = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <div className="canvas-library-section">
      <button
        type="button"
        className="canvas-library-section-header"
        onClick={() => setOpen((v) => !v)}
      >
        <span
          className={`codicon canvas-library-chevron codicon-${
            open ? "chevron-down" : "chevron-right"
          }`}
          aria-hidden="true"
        />
        <span className="canvas-library-section-title">{title}</span>
      </button>
      {open && (
        <div className="canvas-library-section-body">
          {hasChildren ? children : (
            <div className="canvas-library-empty">{emptyText}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Family / branch / node rows
// ──────────────────────────────────────────────────────────────────

type PinState = "unpinned" | "pinned-active" | "pinned-disabled";

interface FamilyRowProps {
  family: ResourceFamilyEntry;
  profile: GuiProjectFile | null;
  kind: "standard" | "custom";
}

function FamilyRow({ family, profile, kind }: FamilyRowProps) {
  const [open, setOpen] = useState(false);
  const familyId = family.family.resource_instance_id;
  // Pin scope is "any branch of this family is pinned" — the header
  // mirrors the most-active branch so the user can see at a glance
  // whether the family contributes to the current profile.
  const familyPin = useMemo<PinState>(() => {
    if (!profile) return "unpinned";
    const ref = findFamilyRef(profile, kind, familyId);
    if (!ref) return "unpinned";
    return ref.enabled ? "pinned-active" : "pinned-disabled";
  }, [profile, kind, familyId]);

  return (
    <div className="canvas-library-family">
      <button
        type="button"
        className="canvas-library-row canvas-library-family-row"
        onClick={() => setOpen((v) => !v)}
        title={familyId}
      >
        <span
          className={`codicon canvas-library-chevron codicon-${
            open ? "chevron-down" : "chevron-right"
          }`}
          aria-hidden="true"
        />
        <PinIndicator state={familyPin} />
        <span className="canvas-library-name">{family.family.display_name}</span>
      </button>
      {open && (
        <div className="canvas-library-children">
          {family.branches.length === 0 ? (
            <div className="canvas-library-empty">尚无分支。</div>
          ) : (
            family.branches.map((entry) => (
              <BranchRow
                key={entry.branch.branch_id}
                entry={entry}
                family={family}
                profile={profile}
                kind={kind}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

interface BranchRowProps {
  entry: ComputeResourceBranchEntry;
  family: ResourceFamilyEntry;
  profile: GuiProjectFile | null;
  kind: "standard" | "custom";
}

function BranchRow({ entry, family, profile, kind }: BranchRowProps) {
  // Custom branches expand to show their nodes; standard branches are
  // leaves in the canvas library (C8 — standard nodes are never
  // draggable, no need to expose them).
  const isCustomBranch = entry.branch.resource_kind === "custom";
  const [open, setOpen] = useState(false);

  const familyId = family.family.resource_instance_id;
  const branchId = entry.branch.branch_id;
  const isDefault = family.family.default_branch_id === branchId;

  const pin = useMemo<PinState>(() => {
    if (!profile) return "unpinned";
    const ref = findFamilyRef(profile, kind, familyId);
    if (!ref) return "unpinned";
    if (profileResourceBranchId(ref) !== branchId) return "unpinned";
    return ref.enabled ? "pinned-active" : "pinned-disabled";
  }, [profile, kind, familyId, branchId]);

  const rowClass = [
    "canvas-library-row",
    "canvas-library-branch-row",
    pin === "pinned-active" ? "is-pinned-active" : "",
    pin === "pinned-disabled" ? "is-pinned-disabled" : ""
  ]
    .filter(Boolean)
    .join(" ");

  const labelSuffix = isDefault ? " (default)" : "";

  return (
    <div className="canvas-library-branch">
      <button
        type="button"
        className={rowClass}
        onClick={() => isCustomBranch && setOpen((v) => !v)}
        title={`${branchId}${labelSuffix}`}
      >
        {isCustomBranch ? (
          <span
            className={`codicon canvas-library-chevron codicon-${
              open ? "chevron-down" : "chevron-right"
            }`}
            aria-hidden="true"
          />
        ) : (
          <span className="canvas-library-chevron-spacer" aria-hidden="true" />
        )}
        <PinIndicator state={pin} />
        <span className="canvas-library-name">
          {entry.branch.display_name}
          <span className="canvas-library-branch-suffix">{labelSuffix}</span>
        </span>
        {entry.branch.status === "disabled" && (
          <span className="canvas-library-status-chip" title="branch.status = disabled">
            已停用
          </span>
        )}
      </button>
      {isCustomBranch && open && (
        <div className="canvas-library-children">
          <CustomBranchNodes
            branch={entry.branch as CustomComputeResourceBranch}
            resourceInstanceId={familyId}
            profile={profile}
          />
        </div>
      )}
    </div>
  );
}

function CustomBranchNodes({
  branch,
  resourceInstanceId,
  profile
}: {
  branch: CustomComputeResourceBranch;
  resourceInstanceId: string;
  profile: GuiProjectFile | null;
}) {
  const usageCountByNodeId = useMemo(
    () => countCustomUsagesByNode(profile, resourceInstanceId),
    [profile, resourceInstanceId]
  );
  if (branch.custom_nodes.length === 0) {
    return <div className="canvas-library-empty">尚无自定义节点。</div>;
  }
  return (
    <>
      {branch.custom_nodes.map((node) => {
        const count = usageCountByNodeId.get(node.node_id) ?? 0;
        const rowClass = [
          "canvas-library-row",
          "canvas-library-node-row",
          count > 0 ? "is-placed" : "is-unplaced"
        ].join(" ");
        return (
          <div
            key={node.node_id}
            className={rowClass}
            title={`${node.node_id} · ${count} 次放置`}
          >
            {/* Phase 4 wires drag from this handle (C26). For Phase 2
                the handle is purely visual to validate the row
                layout footprint. */}
            <span
              className="canvas-library-drag-handle"
              aria-hidden="true"
              title="拖把手（Phase 4 启用）"
            >
              ⋮⋮
            </span>
            <span className="canvas-library-name">{node.display_name}</span>
            <span
              className={`canvas-library-usage-count${
                count === 0 ? " is-zero" : ""
              }`}
            >
              ·{count}
            </span>
          </div>
        );
      })}
    </>
  );
}

// ──────────────────────────────────────────────────────────────────
// Pin indicator
// ──────────────────────────────────────────────────────────────────

function PinIndicator({ state }: { state: PinState }) {
  if (state === "unpinned") {
    return (
      <span
        className="canvas-library-pin is-unpinned"
        aria-label="未 pin"
        title="未 pin"
      />
    );
  }
  return (
    <span
      className={`canvas-library-pin is-${state}`}
      aria-label={state === "pinned-active" ? "已 pin（激活）" : "已 pin（停用）"}
      title={
        state === "pinned-active"
          ? "Pinned + 激活（当前档案使用该分支）"
          : "Pinned + 停用（当前档案选中该分支但 enabled=false）"
      }
    >
      ●
    </span>
  );
}

// ──────────────────────────────────────────────────────────────────
// Helpers — kept inline so they participate in `useMemo` deps cleanly
// ──────────────────────────────────────────────────────────────────

function findFamilyRef(
  profile: GuiProjectFile,
  kind: "standard" | "custom",
  familyId: string
): ProfileResourceRef | null {
  return (
    (profile.resources ?? []).find(
      (r) => r.kind === kind && r.resource_instance_id === familyId
    ) ?? null
  );
}

function countCustomUsagesByNode(
  profile: GuiProjectFile | null,
  resourceInstanceId: string
): Map<string, number> {
  const out = new Map<string, number>();
  if (!profile) return out;
  for (const usage of profile.custom_node_usages ?? []) {
    if (usage.resource_instance_id !== resourceInstanceId) continue;
    out.set(usage.node_id, (out.get(usage.node_id) ?? 0) + 1);
  }
  return out;
}
