import type {
  ComputeResourceV2,
  CustomComputeResource,
  GeneratedRegionStatus,
  ImplementationFileRef
} from "@tinder/nextstep";

/**
 * Interface generation: marker-bounded code emission with safe-write rules.
 *
 * Scope of this slice (3f):
 * - Python custom resources: emit an `ACTION_INDEX_REGISTRY` table inside a
 *   `tinder:begin actions-registry` ... `tinder:end actions-registry` marker
 *   region; append handler stubs once per missing `handler_function`.
 * - Standard resources, C++ resources: marker *detection* runs (so
 *   generated_region_status reflects reality), but no generation content is
 *   produced — the plan returns an empty file change list with a warning.
 *
 * Marker format works the same way regardless of language; the comment
 * prefix is inferred per file (`#` for python, `//` for C/C++).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Marker primitives
// ─────────────────────────────────────────────────────────────────────────────

// Accept `#` (Python/shell) or `//` (C/C++). Tighter than `[#/]+` which
// matches nonsense like `#/##/` and would leave us classifying garbage as
// a valid marker.
const TINDER_BEGIN_RE = /^\s*(?:#|\/\/)\s*tinder:begin\s+(\S+)\s*$/;
const TINDER_END_RE = /^\s*(?:#|\/\/)\s*tinder:end\s+(\S+)\s*$/;

export interface MarkerScanResult {
  regions: Map<string, { startLine: number; endLine: number }>;
  /** True if any begin marker has no matching end (or vice versa). */
  malformed: boolean;
}

export function scanMarkers(text: string): MarkerScanResult {
  const lines = text.split(/\r?\n/);
  const regions = new Map<string, { startLine: number; endLine: number }>();
  const openStack: Array<{ regionId: string; startLine: number }> = [];
  let malformed = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    const begin = TINDER_BEGIN_RE.exec(line);
    if (begin) {
      openStack.push({ regionId: begin[1]!, startLine: i });
      continue;
    }
    const end = TINDER_END_RE.exec(line);
    if (end) {
      const open = openStack.pop();
      if (!open || open.regionId !== end[1]) {
        malformed = true;
        continue;
      }
      if (regions.has(open.regionId)) {
        // Duplicate region — keep the first, mark malformed.
        malformed = true;
        continue;
      }
      regions.set(open.regionId, { startLine: open.startLine, endLine: i });
    }
  }
  if (openStack.length > 0) malformed = true;
  return { regions, malformed };
}

/**
 * Compute `generated_region_status` for one source file. Heuristic:
 * - empty text → unknown (file may not exist yet)
 * - markers malformed → malformed
 * - has the expected `actions-registry` region → ok
 * - otherwise → missing
 *
 * "conflict" is reserved for the case where the regenerated region would
 * differ from what's currently in the file — computed only inside the
 * planner because it requires the generated body.
 */
export function detectGeneratedRegionStatus(
  text: string,
  expectedRegionIds: string[]
): GeneratedRegionStatus {
  if (!text || text.trim().length === 0) return "unknown";
  const scan = scanMarkers(text);
  if (scan.malformed) return "malformed";
  if (expectedRegionIds.length === 0) return "unknown";
  const hasAny = expectedRegionIds.some((id) => scan.regions.has(id));
  return hasAny ? "ok" : "missing";
}

export interface Comment {
  begin: string;
  end?: string;
}

export function commentFor(language: string | undefined): Comment {
  if (language === "python") return { begin: "#" };
  if (language === "cpp" || language === "c") return { begin: "//" };
  return { begin: "#" };
}

/**
 * Replace the contents of a marker region. If the region doesn't exist
 * the body + markers are appended to the file with a blank-line guard.
 *
 * The returned text always has its trailing newline preserved/added.
 */
export function upsertMarkerRegion(
  text: string,
  regionId: string,
  body: string,
  comment: Comment
): string {
  const beginLine = `${comment.begin} tinder:begin ${regionId}`;
  const endLine = `${comment.begin} tinder:end ${regionId}`;
  const scan = scanMarkers(text);
  const bodyLines = body.split(/\r?\n/);

  // Special-case empty input so we don't emit a leading blank line.
  if (text.length === 0) {
    return [beginLine, ...bodyLines, endLine].join("\n") + "\n";
  }

  const lines = text.split(/\r?\n/);
  // Strip trailing empty line that comes from a trailing newline so we
  // don't pollute output with extra blanks.
  const hadTrailingNewline = text.endsWith("\n");
  if (hadTrailingNewline && lines[lines.length - 1] === "") {
    lines.pop();
  }

  const region = scan.regions.get(regionId);
  if (region) {
    const replacement = [beginLine, ...bodyLines, endLine];
    const next = [
      ...lines.slice(0, region.startLine),
      ...replacement,
      ...lines.slice(region.endLine + 1)
    ];
    return next.join("\n") + (hadTrailingNewline ? "\n" : "");
  }

  // Append region with one blank line of breathing room (only if the
  // file ends with non-empty content; whitespace-only inputs collapse
  // back to the empty-input case above is handled separately).
  const appended: string[] = [...lines];
  if (appended.length > 0 && appended[appended.length - 1]!.trim() !== "") {
    appended.push("");
  }
  appended.push(beginLine, ...bodyLines, endLine);
  return appended.join("\n") + "\n";
}

// ─────────────────────────────────────────────────────────────────────────────
// Python custom resource emission
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the body that goes inside the `actions-registry` marker. Returned
 * string has no trailing newline; `upsertMarkerRegion` joins it back.
 */
function pythonActionRegistryBody(resource: CustomComputeResource): string {
  const entries = resource.custom_nodes
    .filter((n) => typeof n.action_index === "number")
    .sort((a, b) => (a.action_index ?? 0) - (b.action_index ?? 0));
  const lines: string[] = [
    `# 自动生成 — 请勿手工编辑此区域之间的内容`,
    `# 资源 ${resource.resource_instance_id} (${resource.display_name})`,
    `ACTION_INDEX_REGISTRY = {`
  ];
  for (const node of entries) {
    const handler = node.handler_function?.trim() || "";
    const comment = handler ? `  # -> ${handler}` : "";
    lines.push(
      `    ${node.action_index}: ${JSON.stringify(node.node_id)},${comment}`
    );
  }
  lines.push(`}`);
  return lines.join("\n");
}

/**
 * Detect whether `def <name>(` (or `async def <name>(`) is already defined
 * anywhere in the file. Cheap heuristic — does not actually parse Python —
 * but good enough to avoid creating duplicate stubs on regeneration.
 */
function pythonDefExists(text: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `^\\s*(?:async\\s+)?def\\s+${escaped}\\s*\\(`,
    "m"
  );
  return re.test(text);
}

/**
 * Append handler stubs for any `handler_function` names that don't yet
 * exist as `def`s in the file. Returns:
 *  - new text (may equal input when nothing was added)
 *  - list of stub names actually appended
 */
function appendPythonHandlerStubs(
  text: string,
  resource: CustomComputeResource
): { next: string; added: string[] } {
  const stubsToAdd: Array<{ name: string; node: CustomComputeResource["custom_nodes"][number] }> =
    [];
  for (const node of resource.custom_nodes) {
    const name = node.handler_function?.trim();
    if (!name) continue;
    if (pythonDefExists(text, name)) continue;
    if (stubsToAdd.some((s) => s.name === name)) continue;
    stubsToAdd.push({ name, node });
  }
  if (stubsToAdd.length === 0) return { next: text, added: [] };

  // Keep trailing newline behaviour stable.
  const hadTrailingNewline = text.endsWith("\n") || text.length === 0;
  const lines = text === "" ? [] : text.split(/\r?\n/);
  if (hadTrailingNewline && lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  if (lines.length > 0 && lines[lines.length - 1]!.trim() !== "") {
    lines.push("");
  }
  for (const stub of stubsToAdd) {
    if (lines.length > 0 && lines[lines.length - 1]!.trim() !== "") {
      lines.push("");
    }
    lines.push(`# tinder:stub ${stub.name}`);
    lines.push(`def ${stub.name}(parameters):`);
    lines.push(`    """${stub.node.display_name || stub.name} — 自动生成 stub"""`);
    lines.push(`    raise NotImplementedError(${JSON.stringify(stub.name)})`);
  }
  return {
    next: lines.join("\n") + "\n",
    added: stubsToAdd.map((s) => s.name)
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan / execute
// ─────────────────────────────────────────────────────────────────────────────

export interface PlannedFileChange {
  fileId: string;
  refPath: string;
  absolutePath: string;
  storage: "managed" | "external";
  language: ImplementationFileRef["language"];
  currentText: string;
  nextText: string;
  changes: string[];
  /** Pre-existing markers detected on disk — used for status update. */
  preStatus: GeneratedRegionStatus;
}

export interface GenerationPlan {
  resourceInstanceId: string;
  /** When non-empty, planning skipped real work; UI should display these. */
  warnings: string[];
  /** Human-readable list of resource.json fields that would change. */
  resourceJsonChanges: string[];
  files: PlannedFileChange[];
}

export interface GenerationApproval {
  /** file_ids of external source files the user explicitly approved. */
  approvedExternalFileIds: Set<string>;
}

export interface GenerationResult {
  filesWritten: PlannedFileChange[];
  filesSkipped: Array<{ refPath: string; reason: string }>;
  /** Updated resource — caller should persist it via saveResourceConfig. */
  updatedResource: ComputeResourceV2;
}

const ACTIONS_REGISTRY_REGION = "actions-registry";

/**
 * Build a generation plan for the given resource. Reads the on-disk text
 * of each source file (without writing) and returns the proposed new text.
 *
 * `packageDir` is the absolute path to the resource package (`null` for an
 * unsaved draft); needed to resolve managed file paths.
 */
export async function planResourceGeneration(
  resource: ComputeResourceV2,
  packageDir: string | null
): Promise<GenerationPlan> {
  const warnings: string[] = [];
  const files: PlannedFileChange[] = [];
  const resourceJsonChanges: string[] = [];

  // Resolve absolute paths for every source file ref.
  const resolved: Array<{
    ref: ImplementationFileRef;
    abs: string | null;
  }> = [];
  for (const ref of resource.implementation.source_files) {
    if (ref.storage === "managed") {
      if (!packageDir) {
        resolved.push({ ref, abs: null });
        continue;
      }
      const abs = await window.tinder.joinPath(packageDir, ref.path);
      resolved.push({ ref, abs });
    } else {
      resolved.push({ ref, abs: ref.path });
    }
  }

  if (resource.resource_kind !== "custom") {
    warnings.push(
      "本切片只为自定义资源（Python）生成内容。标准资源仅做标记健康检测。"
    );
  }
  if (resource.implementation.kind !== "python_script") {
    warnings.push(
      "本切片只支持 Python 资源的内容生成。C++ 资源仅做标记健康检测。"
    );
  }

  // We only emit content for python custom resources. The primary source
  // file is the host.
  let primary: { ref: ImplementationFileRef; abs: string | null } | null = null;
  if (
    resource.resource_kind === "custom" &&
    resource.implementation.kind === "python_script"
  ) {
    primary =
      resolved.find(
        (r) => r.ref.role === "primary" && r.ref.language === "python"
      ) ??
      resolved.find((r) => r.ref.language === "python") ??
      null;
    if (!primary) {
      warnings.push(
        "未找到 Python primary 源文件。请在「实现文件」中先添加并标记角色为 primary。"
      );
    }
  }

  for (const { ref, abs } of resolved) {
    if (!abs) {
      warnings.push(`无法解析 ${ref.path} 的绝对路径，已跳过。`);
      continue;
    }
    let currentText = "";
    try {
      currentText = await window.tinder.readText(abs);
    } catch {
      // missing on disk — treated as empty
    }
    const expectedRegions = [ACTIONS_REGISTRY_REGION];
    const preStatus = detectGeneratedRegionStatus(currentText, expectedRegions);

    // Only the chosen primary gets content emission.
    let nextText = currentText;
    const changes: string[] = [];
    if (
      primary &&
      ref.file_id === primary.ref.file_id &&
      resource.resource_kind === "custom"
    ) {
      // Refuse to plan a write when the existing markers are malformed.
      // upsertMarkerRegion would happily append a fresh region next to the
      // broken ones, producing nested/duplicate markers; spec mandates we
      // surface the conflict instead and let the user fix it manually.
      if (preStatus === "malformed") {
        warnings.push(
          `${ref.path}: 生成区标记损坏，已跳过该文件的内容生成。请手工修复 tinder:begin/end 标记后再试。`
        );
      } else if (preStatus === "conflict") {
        warnings.push(
          `${ref.path}: 生成区与已有内容冲突，已跳过该文件的内容生成。`
        );
      } else {
        const customRes = resource as CustomComputeResource;
        const body = pythonActionRegistryBody(customRes);
        const updated = upsertMarkerRegion(
          nextText,
          ACTIONS_REGISTRY_REGION,
          body,
          commentFor(ref.language)
        );
        if (updated !== nextText) {
          const scan = scanMarkers(currentText);
          changes.push(
            scan.regions.has(ACTIONS_REGISTRY_REGION)
              ? `更新 ${ACTIONS_REGISTRY_REGION} 区域`
              : `插入 ${ACTIONS_REGISTRY_REGION} 区域`
          );
          nextText = updated;
        }
        const stubResult = appendPythonHandlerStubs(nextText, customRes);
        if (stubResult.added.length > 0) {
          changes.push(
            `追加处理函数 stub: ${stubResult.added.join(", ")}`
          );
          nextText = stubResult.next;
        }
      }
    }

    if (nextText !== currentText) {
      files.push({
        fileId: ref.file_id,
        refPath: ref.path,
        absolutePath: abs,
        storage: ref.storage,
        language: ref.language,
        currentText,
        nextText,
        changes,
        preStatus
      });
    } else if (preStatus !== ref.generated_region_status) {
      // No content change, but we still want to refresh status on disk.
      // Tracked as a "resource json only" change.
      resourceJsonChanges.push(
        `${ref.path}: 标记状态 ${ref.generated_region_status ?? "unknown"} → ${preStatus}`
      );
    }
  }

  // Always refresh implementation.status.interface_status to "ok" when the
  // plan produces no warnings, or "pending" when it does.
  resourceJsonChanges.push(
    `implementation.status.interface_status → ${
      warnings.length === 0 ? "ok" : "pending"
    }`
  );

  return {
    resourceInstanceId: resource.resource_instance_id,
    warnings,
    resourceJsonChanges,
    files
  };
}

export interface ExecuteContext {
  /** Original resource (post-plan, pre-write). Used to derive the updated copy. */
  resource: ComputeResourceV2;
  plan: GenerationPlan;
  approval: GenerationApproval;
}

/**
 * Write the planned file changes that pass the approval gate. Returns a
 * result containing the list of files written and an updated resource
 * object reflecting marker status changes. The caller is responsible for
 * persisting the returned `updatedResource` via `saveResourceConfig`.
 */
export async function executeGenerationPlan(
  ctx: ExecuteContext
): Promise<GenerationResult> {
  const written: PlannedFileChange[] = [];
  const skipped: GenerationResult["filesSkipped"] = [];

  for (const change of ctx.plan.files) {
    if (
      change.storage === "external" &&
      !ctx.approval.approvedExternalFileIds.has(change.fileId)
    ) {
      skipped.push({
        refPath: change.refPath,
        reason: "外部文件未在此次预览中勾选确认"
      });
      continue;
    }
    // Re-read disk before writing to ensure the file hasn't shifted since
    // the plan was built. If the on-disk text drifted from
    // `change.currentText`, skip and surface a warning.
    let onDiskNow = "";
    try {
      onDiskNow = await window.tinder.readText(change.absolutePath);
    } catch {
      onDiskNow = "";
    }
    if (onDiskNow !== change.currentText) {
      skipped.push({
        refPath: change.refPath,
        reason: "文件在预览后已被外部修改；请重新打开预览"
      });
      continue;
    }
    try {
      await window.tinder.writeText(change.absolutePath, change.nextText);
      written.push(change);
    } catch (err) {
      skipped.push({
        refPath: change.refPath,
        reason: `写入失败：${String(err)}`
      });
    }
  }

  // Build the updated resource copy.
  const updatedResource: ComputeResourceV2 = JSON.parse(
    JSON.stringify(ctx.resource)
  ) as ComputeResourceV2;
  for (const ref of updatedResource.implementation.source_files) {
    const change = written.find((c) => c.fileId === ref.file_id);
    if (change) {
      ref.generated_region_status = detectGeneratedRegionStatus(
        change.nextText,
        [ACTIONS_REGISTRY_REGION]
      );
    } else {
      // Also refresh status for files we didn't write — the plan probed
      // disk and computed a preStatus; surface that so the editor doesn't
      // keep stale "unknown" forever.
      const planEntry = ctx.plan.files.find((p) => p.fileId === ref.file_id);
      if (planEntry) ref.generated_region_status = planEntry.preStatus;
    }
  }
  updatedResource.implementation.status = {
    ...(updatedResource.implementation.status ?? {}),
    interface_status:
      ctx.plan.warnings.length === 0 && skipped.length === 0 ? "ok" : "pending"
  };

  return {
    filesWritten: written,
    filesSkipped: skipped,
    updatedResource
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cheap content hash for external-modification detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * FNV-1a string hash. Stable, deterministic, no external dependencies.
 * Used to detect on-disk drift between resource editor load and save.
 */
export function hashText(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Convert to unsigned 32-bit hex.
  return (h >>> 0).toString(16);
}
