import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ComputeResourceV2,
  CustomComputeResource,
  ImplementationKind,
  ResourceCategory,
  StandardComputeResource
} from "@tinder/nextstep";
import {
  allocateCustomActionIndexes,
  allocateInactiveSuffixes,
  parseComputeResource
} from "@tinder/nextstep";
import { useCa } from "../state/ChainAssemblyContext";
import { useWorkspace } from "../state/WorkspaceContext";
import {
  collectAllCustomActionIndexes,
  readLegacyResourceFile,
  readResourcePackage
} from "../state/chainAssemblyStorage";
import { SaveExternallyModifiedError } from "../state/ChainAssemblyContext";
import {
  detectGeneratedRegionStatus,
  hashText,
  type GenerationApproval,
  type GenerationPlan,
  type GenerationResult
} from "../state/interfaceGeneration";
import {
  CustomCapabilityTab,
  StandardCapabilityTab
} from "./ResourceCapabilityTab";

interface ResourceEditorViewProps {
  resourceId: string;
  resourceKind: "standard" | "custom";
  /** Disk source — package dir for v2 packages, .json path for legacy. Null = unsaved draft. */
  sourcePath: string | null;
  /** Synthetic tab uri — used by the close button and dirty propagation. */
  tabUri: string;
}

type EditorTab = "summary" | "capability" | "issues";

/**
 * Session-only memory of which inner tab / variant the user was on for
 * each resource-editor synthetic tab. Keyed by the tab uri so a remount
 * (e.g. after switching away in the workspace tab strip and switching
 * back) restores the user's position instead of snapping to defaults.
 *
 * Module-level so the cache survives component unmount but resets on a
 * full page reload — the right granularity for "operation position".
 */
const editorSessionMemory = new Map<
  string,
  { activeTab?: EditorTab; selectedVariantId?: string | null }
>();

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "error"; message: string };

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "error"; message: string };

const CATEGORY_OPTIONS: Array<{ value: ResourceCategory; label: string }> = [
  { value: "blank", label: "空白" },
  { value: "detector", label: "探测设备" },
  { value: "strike", label: "打击设备" },
  { value: "platform", label: "平台服务" },
  { value: "environment", label: "环境服务" },
  { value: "signal", label: "信号服务" },
  { value: "service", label: "通用服务" }
];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const ACTIONS_REGISTRY_REGION_ID = "actions-registry";

/**
 * Re-scan each source file's marker health and write the result into
 * `implementation.source_files[i].generated_region_status`. Mutates in
 * place; callers should pass a clone if they want to preserve the
 * original shape.
 *
 * `sourcePath` is the editor's current source path: a package dir for v2
 * resources, a `.json` for legacy single-file resources, or `null` for
 * unsaved drafts. Files that can't be resolved keep their existing status.
 */
async function refreshSourceFileStatuses(
  resource: ComputeResourceV2,
  sourcePath: string | null
): Promise<void> {
  const packageDir =
    sourcePath && !sourcePath.endsWith(".json") ? sourcePath : null;
  for (const ref of resource.implementation.source_files) {
    let abs: string;
    if (ref.storage === "managed") {
      if (!packageDir) continue;
      abs = await window.tinder.joinPath(packageDir, ref.path);
    } else {
      abs = ref.path;
    }
    let text = "";
    try {
      text = await window.tinder.readText(abs);
    } catch {
      // file missing — keep existing status; status detection on empty
      // text returns "unknown" which is the right answer anyway.
    }
    ref.generated_region_status = detectGeneratedRegionStatus(text, [
      ACTIONS_REGISTRY_REGION_ID
    ]);
  }
}

export function ResourceEditorView({
  resourceId,
  resourceKind,
  sourcePath,
  tabUri
}: ResourceEditorViewProps) {
  const ca = useCa();
  const {
    closeFile,
    setSyntheticDirty,
    openFile,
    openHelpDoc,
    openChainEditor,
    registerSyntheticSave
  } = useWorkspace();

  const [activeTab, setActiveTabRaw] = useState<EditorTab>(
    () => editorSessionMemory.get(tabUri)?.activeTab ?? "summary"
  );
  const setActiveTab = useCallback(
    (next: EditorTab) => {
      setActiveTabRaw(next);
      const slot = editorSessionMemory.get(tabUri) ?? {};
      slot.activeTab = next;
      editorSessionMemory.set(tabUri, slot);
    },
    [tabUri]
  );
  const [load, setLoad] = useState<LoadState>({ kind: "idle" });
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [draft, setDraft] = useState<ComputeResourceV2 | null>(null);
  const [baseline, setBaseline] = useState<ComputeResourceV2 | null>(null);
  const [currentSourcePath, setCurrentSourcePath] = useState<string | null>(
    sourcePath
  );
  /** Selected variant for the standard-resource capability tab. */
  const [selectedVariantId, setSelectedVariantIdRaw] = useState<string | null>(
    () => editorSessionMemory.get(tabUri)?.selectedVariantId ?? null
  );
  const setSelectedVariantId = useCallback(
    (next: string | null) => {
      setSelectedVariantIdRaw(next);
      const slot = editorSessionMemory.get(tabUri) ?? {};
      slot.selectedVariantId = next;
      editorSessionMemory.set(tabUri, slot);
    },
    [tabUri]
  );
  /** Whether the generation preview modal is open. */
  const [generationPreviewOpen, setGenerationPreviewOpen] = useState(false);
  /**
   * Current generation plan. Built lazily by `openGenerationPreview` and
   * reset on close so it always reflects the latest draft + disk state.
   */
  const [generationPlan, setGenerationPlan] = useState<GenerationPlan | null>(
    null
  );
  const [generationPlanError, setGenerationPlanError] = useState<string | null>(
    null
  );
  const [generationRunning, setGenerationRunning] = useState(false);
  /**
   * Hash of the on-disk resource.json text at the time we loaded it.
   * Sent to `saveResourceConfig` so external modifications are detected.
   * `null` means we haven't established a baseline yet (unsaved draft, or
   * we just succeeded a save and are awaiting reload).
   */
  const [diskHash, setDiskHash] = useState<string | null>(null);

  /**
   * After a successful save we update draft / baseline / diskHash /
   * currentSourcePath in one batch. When `currentSourcePath` changes (e.g.
   * a legacy single-file migrating to a package directory) the load effect
   * would otherwise re-fire and overwrite any edits the user makes between
   * save completion and the async re-read. This ref is flipped to `true`
   * right before the source path change so the load effect skips its
   * fetch exactly once.
   */
  const skipNextLoadRef = useRef(false);

  // Reload from disk when the source path or resource identity changes.
  const loadTokenRef = useRef(0);
  useEffect(() => {
    if (skipNextLoadRef.current) {
      skipNextLoadRef.current = false;
      return;
    }
    if (!currentSourcePath) {
      setLoad({ kind: "ready" });
      setDiskHash(null);
      return;
    }
    const myToken = ++loadTokenRef.current;
    setLoad({ kind: "loading" });

    (async () => {
      try {
        // Read raw JSON text first so we can hash it independently of
        // parse-time normalization.
        const jsonPath = currentSourcePath.endsWith(".json")
          ? currentSourcePath
          : await window.tinder.joinPath(currentSourcePath, "resource.json");
        const rawText = await window.tinder.readText(jsonPath);
        if (myToken !== loadTokenRef.current) return;
        const resource = parseComputeResource(rawText, resourceKind);

        // Standard resources must always have at least one branch
        // (model_variant). Synthesize a "默认" branch when the on-disk
        // value is empty so the UI never renders an empty-state. The
        // injection happens *before* baseline so it doesn't flag the
        // editor as dirty on first open.
        if (resource.resource_kind === "standard") {
          const std = resource as StandardComputeResource;
          if (std.model_variants.length === 0) {
            std.model_variants = [
              {
                variant_id: "default",
                display_name: "默认",
                effective_candidates: {}
              }
            ];
          }
        }

        // Refresh marker health for each source file by actually probing
        // disk content. Mutates a clone so the in-memory representation
        // reflects current reality.
        await refreshSourceFileStatuses(resource, currentSourcePath);
        if (myToken !== loadTokenRef.current) return;

        setDraft(clone(resource));
        setBaseline(clone(resource));
        setDiskHash(hashText(rawText));
        if (resource.resource_kind === "standard") {
          // Restore the user's previously-picked variant from session
          // memory when it still exists on the resource; otherwise fall
          // back to the first variant.
          const variants = (resource as StandardComputeResource).model_variants;
          const memorized = editorSessionMemory.get(tabUri)?.selectedVariantId;
          const valid =
            memorized && variants.some((v) => v.variant_id === memorized);
          setSelectedVariantId(
            valid ? memorized ?? null : variants[0]?.variant_id ?? null
          );
        } else {
          setSelectedVariantId(null);
        }
        setLoad({ kind: "ready" });
      } catch (err) {
        if (myToken !== loadTokenRef.current) return;
        // Fall back to the storage-layer reader to surface a usable error
        // message even when raw-read fails.
        const fallback = currentSourcePath.endsWith(".json")
          ? readLegacyResourceFile(currentSourcePath, resourceKind)
          : readResourcePackage(currentSourcePath, resourceKind);
        fallback
          .then((resource) => {
            if (myToken !== loadTokenRef.current) return;
            setDraft(clone(resource));
            setBaseline(clone(resource));
            setDiskHash(null);
            setLoad({ kind: "ready" });
          })
          .catch(() => {
            if (myToken !== loadTokenRef.current) return;
            setLoad({ kind: "error", message: String(err) });
          });
      }
    })();
  }, [currentSourcePath, resourceKind]);

  // Auto-clear the "已保存" badge after a short delay so it doesn't linger
  // forever next to the save icon. The save icon's own dirty dot is the
  // persistent indicator; the text badge is meant as a transient ack.
  useEffect(() => {
    if (save.kind !== "saved") return;
    const t = setTimeout(() => {
      setSave((cur) => (cur.kind === "saved" ? { kind: "idle" } : cur));
    }, 1500);
    return () => clearTimeout(t);
  }, [save]);

  // Dirty: compare draft to baseline structurally.
  const dirty = useMemo(() => {
    if (!draft) return false;
    if (!baseline) return true;
    return JSON.stringify(draft) !== JSON.stringify(baseline);
  }, [draft, baseline]);

  useEffect(() => {
    setSyntheticDirty(tabUri, dirty);
  }, [dirty, tabUri, setSyntheticDirty]);

  // Profile usage summary — derived from disk state on every render. Cheap
  // for the profile counts we care about, so no memoization needed beyond
  // useMemo on the array.
  const usage = useMemo(() => {
    if (!ca.disk) return [];
    const matches: Array<{
      profileId: string;
      profileName: string;
      enabled: boolean;
      variantId?: string;
    }> = [];
    for (const profile of ca.disk.profiles) {
      const refs = profile.project.resources ?? [];
      for (const ref of refs) {
        if (ref.resource_instance_id !== resourceId) continue;
        matches.push({
          profileId: profile.id,
          profileName: profile.name,
          enabled: ref.enabled,
          variantId: ref.kind === "standard" ? ref.variant_id : undefined
        });
      }
    }
    return matches;
  }, [ca.disk, resourceId]);

  const handleSave = useCallback(
    async (options: { overwriteExternal?: boolean } = {}) => {
      if (!draft) return;
      setSave({ kind: "saving" });
      try {
        // Allocate fresh action_index values for any custom nodes that became
        // eligible since the last save (non-empty description, no index yet).
        let toWrite = draft;
        if (toWrite.resource_kind === "custom" && ca.disk) {
          const externallyUsed = collectAllCustomActionIndexes(
            ca.disk,
            toWrite.resource_instance_id
          );
          const allocated = allocateCustomActionIndexes(
            toWrite as CustomComputeResource,
            externallyUsed
          );
          if (allocated !== toWrite) {
            toWrite = allocated;
            // Reflect the new indexes in the local draft so the UI doesn't
            // re-show "立即分配" buttons after a successful save.
            setDraft(clone(allocated));
          }
        }
        if (toWrite.resource_kind === "standard") {
          // Auto-allocate `inactive_suffix` for any candidates that
          // don't have one yet so codegen-time names don't collide
          // across candidates sharing the same chain node.
          const normalized = allocateInactiveSuffixes(
            toWrite as StandardComputeResource
          );
          if (normalized !== toWrite) {
            toWrite = normalized;
            setDraft(clone(normalized));
          }
        }
        const { packagePath: newPackagePath, diskHash: newHash } =
          await ca.saveResourceConfig(toWrite, {
            previousSourcePath: currentSourcePath,
            expectedDiskHash: diskHash,
            overwriteExternal: options.overwriteExternal
          });
        setBaseline(clone(toWrite));
        setDiskHash(newHash);
        // Suppress the load effect that would otherwise fire from the
        // upcoming setCurrentSourcePath and clobber any edits the user
        // makes during the async re-read.
        if (newPackagePath !== currentSourcePath) {
          skipNextLoadRef.current = true;
        }
        setCurrentSourcePath(newPackagePath);
        setSave({ kind: "saved", at: Date.now() });
      } catch (err) {
        if (err instanceof SaveExternallyModifiedError) {
          const overwrite = await ca.dialogConfirm({
            title: "资源 JSON 已被外部修改",
            message:
              "磁盘上的 resource.json 自加载以来已被改动。选择「覆盖外部修改」会以编辑器当前草稿覆盖盘上版本；取消则保留外部修改并请重新加载资源。",
            okLabel: "覆盖外部修改",
            destructive: true
          });
          if (overwrite) {
            await handleSave({ overwriteExternal: true });
            return;
          }
          setSave({
            kind: "error",
            message: "资源 JSON 已被外部修改，保存已取消。"
          });
          return;
        }
        setSave({ kind: "error", message: String(err) });
      }
    },
    [ca, currentSourcePath, diskHash, draft]
  );

  const handleRevert = useCallback(() => {
    if (!baseline) return;
    setDraft(clone(baseline));
    setSave({ kind: "idle" });
  }, [baseline]);

  // Hook the global Ctrl+S into the resource editor's save flow so the
  // workspace-level save dispatcher doesn't try to write the synthetic
  // URI as a file path. The handler delegates to `handleSave`, whose
  // own state surfaces success / failure in the editor toolbar; the
  // workspace-level status bar is reserved for Monaco file saves.
  useEffect(() => {
    return registerSyntheticSave(tabUri, async () => {
      await handleSave();
      return true;
    });
  }, [registerSyntheticSave, tabUri, handleSave]);

  const openGenerationPreview = useCallback(async () => {
    if (!draft) return;
    setGenerationPlan(null);
    setGenerationPlanError(null);
    setGenerationPreviewOpen(true);
    try {
      const plan = await ca.planResourceInterface(draft, currentSourcePath);
      setGenerationPlan(plan);
    } catch (err) {
      setGenerationPlanError(String(err));
    }
  }, [ca, currentSourcePath, draft]);

  const closeGenerationPreview = useCallback(() => {
    setGenerationPreviewOpen(false);
    setGenerationPlan(null);
    setGenerationPlanError(null);
  }, []);

  /**
   * Run the approved generation plan. Persists source-file writes via the
   * generation executor, then saves the updated resource JSON so marker
   * status changes survive a reload. Closes the modal and refreshes
   * editor state from disk via the reloading saveResourceConfig.
   */
  const handleExecuteGeneration = useCallback(
    async (approval: GenerationApproval): Promise<GenerationResult | null> => {
      if (!draft || !generationPlan) return null;
      setGenerationRunning(true);
      try {
        const result = await ca.executeResourceInterface(
          draft,
          generationPlan,
          approval
        );
        // Persist marker-status changes into resource.json. We pass the
        // current diskHash so we still get external-mod protection on the
        // resource file itself.
        try {
          const { packagePath, diskHash: newHash } = await ca.saveResourceConfig(
            result.updatedResource,
            {
              previousSourcePath: currentSourcePath,
              expectedDiskHash: diskHash
            }
          );
          setDraft(clone(result.updatedResource));
          setBaseline(clone(result.updatedResource));
          setDiskHash(newHash);
          if (packagePath !== currentSourcePath) {
            skipNextLoadRef.current = true;
          }
          setCurrentSourcePath(packagePath);
        } catch (err) {
          // Source files were written successfully but resource.json save
          // failed — surface it but don't roll back the file writes.
          await ca.dialogNotify({
            title: "资源 JSON 保存失败",
            message:
              "源文件已成功写入，但 resource.json 未能保存。可能是外部修改冲突。请手动重新打开资源并执行「保存资源配置」。错误：" +
              String(err)
          });
        }
        return result;
      } catch (err) {
        await ca.dialogNotify({
          title: "生成失败",
          message: String(err)
        });
        return null;
      } finally {
        setGenerationRunning(false);
      }
    },
    [ca, currentSourcePath, diskHash, draft, generationPlan]
  );

  /**
   * Lightweight in-editor validation. Returns a list of human-readable
   * issues; an empty list means the resource is clean enough to switch to
   * `active`/export validation later (3f+).
   */
  const issues = useMemo<EditorIssue[]>(() => {
    if (!draft) return [];
    return computeEditorIssues(draft);
  }, [draft]);

  const handleSaveAsTemplate = useCallback(async () => {
    if (!draft) return;
    const templateId = await ca.dialogPrompt({
      title: "另存为模板",
      placeholder: "template_id（英文小写，唯一）",
      defaultValue: `project.${draft.resource_kind}.${draft.resource_instance_id}`
    });
    if (!templateId?.trim()) return;
    const templateVersion = await ca.dialogPrompt({
      title: "模板版本",
      defaultValue: "1.0.0"
    });
    if (templateVersion === null) return;
    try {
      const { templatePath } = await ca.saveResourceAsTemplate(draft, {
        templateId: templateId.trim(),
        templateVersion: templateVersion.trim() || "1.0.0",
        displayName: draft.display_name
      });
      await ca.dialogNotify({
        title: "已保存项目模板",
        message: templatePath
      });
    } catch (err) {
      await ca.dialogNotify({ title: "保存模板失败", message: String(err) });
    }
  }, [ca, draft]);

  const handleCopy = useCallback(async () => {
    if (!draft) return;
    // Build a minimal v2 leaf-equivalent shape and reuse the copy prompt
    // helper from the chain assembly context. We assemble a synthetic leaf
    // so promptCopyResource can run uniformly with the sidebar entry point.
    const fakeLeaf = {
      kind: "leaf" as const,
      id: currentSourcePath ?? draft.resource_instance_id,
      name: draft.display_name,
      data:
        draft.resource_kind === "standard"
          ? ({
              resource_instance_id: draft.resource_instance_id,
              display_name: draft.display_name,
              compute_nodes: (draft as StandardComputeResource).compute_nodes
            } as unknown as never)
          : ({
              custom_node_id: draft.resource_instance_id,
              resource_instance_id: draft.resource_instance_id,
              display_name: draft.display_name,
              description: draft.description ?? "",
              module_id: draft.resource_instance_id,
              impl_kind:
                draft.implementation.kind === "cpp_library"
                  ? "cpp_dylib"
                  : "python_script",
              location: draft.implementation.runtime_artifact.path ?? "",
              enabled: draft.status !== "disabled"
            } as unknown as never),
      resource: draft,
      packagePath:
        currentSourcePath && !currentSourcePath.endsWith(".json")
          ? currentSourcePath
          : null
    };
    await ca.promptCopyResource(fakeLeaf);
  }, [ca, currentSourcePath, draft]);

  if (load.kind === "loading" || load.kind === "idle") {
    return (
      <div className="chain-editor">
        <p className="sidebar-hint" style={{ padding: 24 }}>
          加载中…
        </p>
      </div>
    );
  }
  if (load.kind === "error") {
    return (
      <div className="chain-editor-empty">
        <p className="sidebar-hint">无法加载资源：{load.message}</p>
        <button
          type="button"
          className="primary-button"
          onClick={() => closeFile(tabUri)}
        >
          关闭
        </button>
      </div>
    );
  }
  if (!draft) {
    return (
      <div className="chain-editor-empty">
        <p className="sidebar-hint">资源数据缺失。</p>
      </div>
    );
  }

  const patchDraft = (patch: Partial<ComputeResourceV2>) =>
    setDraft((cur) => (cur ? ({ ...cur, ...patch } as ComputeResourceV2) : cur));

  const patchImpl = (patch: Partial<ComputeResourceV2["implementation"]>) =>
    setDraft((cur) =>
      cur
        ? ({
            ...cur,
            implementation: { ...cur.implementation, ...patch }
          } as ComputeResourceV2)
        : cur
    );

  return (
    <div className="chain-editor">
      <nav className="resource-editor-tabs">
        <TabButton active={activeTab === "summary"} onClick={() => setActiveTab("summary")}>
          实例设置
        </TabButton>
        <TabButton
          active={activeTab === "capability"}
          onClick={() => setActiveTab("capability")}
        >
          计算节点
        </TabButton>
        <TabButton active={activeTab === "issues"} onClick={() => setActiveTab("issues")}>
          错误项{issues.length > 0 ? ` (${issues.length})` : ""}
        </TabButton>
        <div className="resource-editor-tabs-spacer" />
        <SaveStatusBadge status={save} />
        <button
          type="button"
          className={`resource-editor-tabs-save-btn${dirty ? " is-dirty" : ""}`}
          onClick={() => void handleSave()}
          disabled={!dirty || save.kind === "saving"}
          title={
            save.kind === "saving"
              ? "保存中…"
              : dirty
                ? "保存资源配置 (Ctrl+S)"
                : "已无未保存更改"
          }
          aria-label="保存资源配置"
        >
          <span className="codicon codicon-save" aria-hidden="true" />
        </button>
      </nav>

      <div className="resource-editor-body-split">
        <div className="resource-editor-body">
          {activeTab === "summary" && (
            <SummaryTab
              draft={draft}
              sourcePath={currentSourcePath}
              usage={usage}
              patchDraft={patchDraft}
              patchImpl={patchImpl}
              onSaveAsTemplate={() => void handleSaveAsTemplate()}
              onOpenProfile={(profileId, profileName) =>
                openChainEditor(profileId, profileName)
              }
              onRevert={handleRevert}
              onCopy={() => void handleCopy()}
              dirty={dirty}
              saveKind={save.kind}
            />
          )}
          {activeTab === "capability" &&
            (draft.resource_kind === "standard" ? (
              <StandardCapabilityTab
                draft={draft as StandardComputeResource}
                selectedVariantId={selectedVariantId}
                onSelectVariant={setSelectedVariantId}
                patch={(next) => setDraft(next)}
                sourcePath={currentSourcePath}
                onOpenFile={(absolutePath, position) =>
                  void openFile(absolutePath, position ? { position } : undefined)
                }
                onOpenDocsForNode={(nodeId) => openHelpDoc(nodeId)}
              />
            ) : (
              <CustomCapabilityTab
                draft={draft as CustomComputeResource}
                patch={(next) => setDraft(next)}
                sourcePath={currentSourcePath}
                onOpenFile={(absolutePath, position) =>
                  void openFile(absolutePath, position ? { position } : undefined)
                }
              />
            ))}
          {activeTab === "issues" && <IssuesTab issues={issues} />}
        </div>
      </div>

      {generationPreviewOpen && (
        <GenerationPreviewModal
          draft={draft}
          plan={generationPlan}
          planError={generationPlanError}
          running={generationRunning}
          onClose={closeGenerationPreview}
          onExecute={async (approval) => {
            const result = await handleExecuteGeneration(approval);
            if (
              result &&
              result.filesSkipped.length === 0 &&
              generationPlan &&
              generationPlan.warnings.length === 0
            ) {
              closeGenerationPreview();
            }
            return result;
          }}
        />
      )}
    </div>
  );
}

function statusLabel(status: ComputeResourceV2["status"]): string {
  switch (status) {
    case "draft":
      return "草稿";
    case "active":
      return "可用";
    case "disabled":
      return "已废弃";
    default:
      return status;
  }
}

function TabButton({
  active,
  onClick,
  disabled,
  children
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`resource-editor-tab${active ? " is-active" : ""}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function SaveStatusBadge({ status }: { status: SaveState }) {
  if (status.kind === "saving") {
    return <span className="resource-editor-save-status">保存中…</span>;
  }
  if (status.kind === "saved") {
    return <span className="resource-editor-save-status is-ok">已保存</span>;
  }
  if (status.kind === "error") {
    return (
      <span className="resource-editor-save-status is-error" title={status.message}>
        保存失败
      </span>
    );
  }
  return null;
}

// ─── Summary tab ───────────────────────────────────────────────────────────

function SummaryTab({
  draft,
  sourcePath,
  usage,
  patchDraft,
  patchImpl,
  onSaveAsTemplate,
  onOpenProfile,
  onRevert,
  onCopy,
  dirty,
  saveKind
}: {
  draft: ComputeResourceV2;
  sourcePath: string | null;
  usage: Array<{
    profileId: string;
    profileName: string;
    enabled: boolean;
    variantId?: string;
  }>;
  patchDraft: (patch: Partial<ComputeResourceV2>) => void;
  patchImpl: (patch: Partial<ComputeResourceV2["implementation"]>) => void;
  onSaveAsTemplate: () => void;
  onOpenProfile: (profileId: string, profileName: string) => void;
  onRevert: () => void;
  onCopy: () => void;
  dirty: boolean;
  saveKind: SaveState["kind"];
}) {
  const tagsText = (draft.tags ?? []).join(", ");
  return (
    <div className="profile-lifecycle">
      <section className="profile-lifecycle-section">
        <div className="profile-lifecycle-section-body">
          <div className="resource-editor-summary-actions">
            <button
              type="button"
              className="chain-editor-action-btn"
              onClick={onRevert}
              disabled={!dirty || saveKind === "saving"}
              title="把草稿回滚到最近一次加载/保存的版本"
            >
              重置
            </button>
            <button
              type="button"
              className="chain-editor-action-btn"
              onClick={onCopy}
            >
              复制计算实例…
            </button>
            <button
              type="button"
              className="chain-editor-action-btn"
              onClick={onSaveAsTemplate}
              title="把当前资源结构导出为项目模板（剥离源文件 / 产物 / 用量）"
            >
              另存为模板…
            </button>
          </div>
        </div>
      </section>

      <section className="profile-lifecycle-section">
        <h2>基本</h2>
        <div className="profile-lifecycle-section-body">
          <div className="resource-editor-form">
          <Field label="显示名">
            <input
              className="resource-editor-input"
              value={draft.display_name}
              onChange={(e) => patchDraft({ display_name: e.target.value })}
            />
          </Field>
          <Field label="就绪状态">
            <select
              className="resource-editor-input"
              value={draft.status}
              onChange={(e) =>
                patchDraft({
                  status: e.target.value as ComputeResourceV2["status"]
                })
              }
            >
              <option value="draft">草稿</option>
              <option value="active">可用</option>
              <option value="disabled">已废弃</option>
            </select>
          </Field>
          <Field label="类别">
            <select
              className="resource-editor-input"
              value={draft.resource_category ?? "blank"}
              onChange={(e) =>
                patchDraft({
                  resource_category: e.target.value as ResourceCategory
                })
              }
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="标签（英文逗号分隔）">
            <input
              className="resource-editor-input"
              value={tagsText}
              onChange={(e) =>
                patchDraft({
                  tags: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean)
                })
              }
            />
          </Field>
          <Field label="描述">
            <textarea
              className="resource-editor-input"
              rows={3}
              value={draft.description ?? ""}
              onChange={(e) => patchDraft({ description: e.target.value })}
            />
          </Field>
          <Field label="备注">
            <textarea
              className="resource-editor-input"
              rows={2}
              value={draft.notes ?? ""}
              onChange={(e) => patchDraft({ notes: e.target.value })}
            />
          </Field>
          </div>
        </div>
      </section>

      <section className="profile-lifecycle-section">
        <h2>运行时</h2>
        <div className="profile-lifecycle-section-body">
          <div className="resource-editor-form">
          <Field label="实现类型">
            {/* Locked once chosen at creation — switching languages would
                orphan the code files the resource was created with. */}
            <span>
              {draft.implementation.kind === "cpp_library"
                ? "C++ 动态库"
                : "Python 脚本"}
            </span>
          </Field>
          <Field label="运行时产物路径">
            <input
              className="resource-editor-input"
              value={draft.implementation.runtime_artifact.path}
              placeholder="src/main.py 或 artifact/foo.dll"
              onChange={(e) =>
                patchImpl({
                  runtime_artifact: {
                    ...draft.implementation.runtime_artifact,
                    path: e.target.value
                  }
                })
              }
            />
          </Field>
          <Field label="导出时必需">
            <label className="resource-editor-checkbox">
              <input
                type="checkbox"
                checked={draft.implementation.runtime_artifact.required_for_export}
                onChange={(e) =>
                  patchImpl({
                    runtime_artifact: {
                      ...draft.implementation.runtime_artifact,
                      required_for_export: e.target.checked
                    }
                  })
                }
              />
              <span>缺失时阻塞 active/export 校验</span>
            </label>
          </Field>
          <Field label="源文件数量">
            {draft.implementation.source_files.length}
          </Field>
          </div>
        </div>
      </section>

      <details className="profile-lifecycle-section resource-editor-meta-block">
        <summary>元数据</summary>
        <div className="resource-editor-meta-list">
          <div className="resource-editor-meta-row">
            <span className="resource-editor-meta-key">资源实例 ID</span>
            <code>{draft.resource_instance_id}</code>
          </div>
          <div className="resource-editor-meta-row">
            <span className="resource-editor-meta-key">资源类型</span>
            <span>{draft.resource_kind === "standard" ? "标准" : "自定义"}</span>
          </div>
          <div className="resource-editor-meta-row">
            <span className="resource-editor-meta-key">磁盘位置</span>
            {sourcePath ? (
              <code>{sourcePath}</code>
            ) : (
              <span className="sidebar-hint">未保存</span>
            )}
          </div>
          <div className="resource-editor-meta-row">
            <span className="resource-editor-meta-key">来源模板</span>
            {draft.template_origin ? (
              <code>
                {draft.template_origin.template_id} ·{" "}
                {draft.template_origin.template_version}
              </code>
            ) : (
              <span className="sidebar-hint">无</span>
            )}
          </div>
        </div>
      </details>

      <details
        className="profile-lifecycle-section resource-editor-meta-block"
        open
      >
        <summary>使用统计 · {usage.length}</summary>
        <div className="profile-lifecycle-section-body">
          {usage.length === 0 ? (
            <p className="sidebar-hint">尚未被任何配置档案引用。</p>
          ) : (
            <table className="resource-editor-files-table">
              <thead>
                <tr>
                  <th>档案</th>
                  <th>状态</th>
                  <th>变体</th>
                </tr>
              </thead>
              <tbody>
                {usage.map((u) => (
                  <tr key={`${u.profileId}#${u.variantId ?? "-"}`}>
                    <td>
                      <button
                        type="button"
                        className="assistant-panel-link"
                        onClick={() =>
                          onOpenProfile(u.profileId, u.profileName)
                        }
                        title="在链路编辑器中打开该档案"
                      >
                        {u.profileName}
                      </button>
                    </td>
                    <td>{u.enabled ? "活跃" : "停用"}</td>
                    <td>
                      {u.variantId ? (
                        <code>{u.variantId}</code>
                      ) : (
                        <span className="sidebar-hint">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </details>

    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="resource-editor-field">
      <span className="resource-editor-label">{label}</span>
      <div className="resource-editor-control">{children}</div>
    </label>
  );
}

// ─── Issue model & detection ───────────────────────────────────────────────

export interface EditorIssue {
  severity: "warning" | "error";
  message: string;
}

function computeEditorIssues(draft: ComputeResourceV2): EditorIssue[] {
  const issues: EditorIssue[] = [];

  if (!draft.display_name?.trim()) {
    issues.push({ severity: "error", message: "显示名为空" });
  }
  const artifactPath = draft.implementation.runtime_artifact.path.trim();
  const required = draft.implementation.runtime_artifact.required_for_export;
  if (required && !artifactPath) {
    issues.push({
      severity: "error",
      message: "运行时产物路径为空（导出时必需）"
    });
  }
  if (draft.status === "active") {
    if (!artifactPath) {
      issues.push({
        severity: "error",
        message: "资源已置为「可用」但运行时产物路径为空"
      });
    }
  }

  // Marker health on source files — anything other than "ok"/"unknown" is a warning.
  for (const ref of draft.implementation.source_files) {
    if (
      ref.generated_region_status === "missing" ||
      ref.generated_region_status === "malformed"
    ) {
      issues.push({
        severity: "warning",
        message: `${ref.path}: 生成区标记 ${ref.generated_region_status}`
      });
    }
    if (ref.generated_region_status === "conflict") {
      issues.push({
        severity: "error",
        message: `${ref.path}: 生成区与代码冲突`
      });
    }
  }

  if (draft.resource_kind === "standard") {
    const std = draft as StandardComputeResource;
    // Multiple effective candidates for the same node_id within one variant
    // would be an editor bug — radio UI prevents it — but a stale on-disk
    // map could violate the invariant. Surface it as a hard error.
    for (const variant of std.model_variants) {
      const seen = new Set<string>();
      for (const [nodeId] of Object.entries(variant.effective_candidates ?? {})) {
        if (seen.has(nodeId)) {
          issues.push({
            severity: "error",
            message: `变体 ${variant.display_name}: ${nodeId} 出现多个有效候选`
          });
        }
        seen.add(nodeId);
      }
      // Effective candidate id must exist in compute_nodes.
      for (const [nodeId, candId] of Object.entries(
        variant.effective_candidates ?? {}
      )) {
        const exists = std.compute_nodes.some(
          (c) => c.candidate_id === candId && c.node_id === nodeId
        );
        if (!exists) {
          issues.push({
            severity: "warning",
            message: `变体 ${variant.display_name}: ${nodeId} 的有效候选「${candId}」不在候选池中`
          });
        }
      }
    }
  } else {
    const custom = draft as CustomComputeResource;
    for (const node of custom.custom_nodes) {
      if (!node.display_name?.trim()) {
        issues.push({
          severity: "error",
          message: `自定义节点 ${node.node_id}: 显示名为空`
        });
      }
      if (!node.description?.trim()) {
        issues.push({
          severity: "warning",
          message: `自定义节点 ${node.display_name || node.node_id}: 描述为空，action_index 未分配`
        });
      }
    }
    // Detect duplicate action_index across this resource's own nodes (global
    // uniqueness is enforced by the allocator at save time).
    const indexCounts = new Map<number, number>();
    for (const node of custom.custom_nodes) {
      if (typeof node.action_index === "number") {
        indexCounts.set(
          node.action_index,
          (indexCounts.get(node.action_index) ?? 0) + 1
        );
      }
    }
    for (const [idx, count] of indexCounts) {
      if (count > 1) {
        issues.push({
          severity: "error",
          message: `action_index ${idx} 重复使用 ${count} 次`
        });
      }
    }
  }

  return issues;
}

// ─── 错误项 tab ────────────────────────────────────────────────────────────

function IssuesTab({ issues }: { issues: EditorIssue[] }) {
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  // Plain (no card chrome) — issue rows have their own coloured
  // backgrounds, so wrapping them in a gray card adds noise.
  return (
    <div className="profile-lifecycle resource-editor-issues-tab">
      <div className="resource-editor-issues-block">
        <h2>错误项 · {errors.length}</h2>
        {errors.length === 0 ? (
          <p className="sidebar-hint">无错误项。</p>
        ) : (
          <ul className="resource-editor-issues">
            {errors.map((issue, i) => (
              <li
                key={`err-${i}`}
                className="resource-editor-issue is-error"
              >
                <span className="resource-editor-issue-badge">错误</span>
                <span>{issue.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="resource-editor-issues-block">
        <h2>警告 · {warnings.length}</h2>
        {warnings.length === 0 ? (
          <p className="sidebar-hint">无警告。</p>
        ) : (
          <ul className="resource-editor-issues">
            {warnings.map((issue, i) => (
              <li
                key={`warn-${i}`}
                className="resource-editor-issue is-warning"
              >
                <span className="resource-editor-issue-badge">警告</span>
                <span>{issue.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── 生成预览 modal ────────────────────────────────────────────────────────

function GenerationPreviewModal({
  draft,
  plan,
  planError,
  running,
  onClose,
  onExecute
}: {
  draft: ComputeResourceV2;
  plan: GenerationPlan | null;
  planError: string | null;
  running: boolean;
  onClose: () => void;
  onExecute: (approval: GenerationApproval) => Promise<GenerationResult | null>;
}) {
  const [approvedExternal, setApprovedExternal] = useState<Set<string>>(
    new Set()
  );
  const [lastResult, setLastResult] = useState<GenerationResult | null>(null);

  const toggleExternal = (fileId: string, on: boolean) => {
    setApprovedExternal((prev) => {
      const next = new Set(prev);
      if (on) next.add(fileId);
      else next.delete(fileId);
      return next;
    });
  };

  const externalsNeedingApproval = (plan?.files ?? []).filter(
    (f) => f.storage === "external"
  );
  const allExternalsApproved = externalsNeedingApproval.every((f) =>
    approvedExternal.has(f.fileId)
  );

  const canWrite =
    !!plan &&
    !running &&
    plan.files.length > 0 &&
    allExternalsApproved;

  const handleConfirm = async () => {
    if (!plan) return;
    const result = await onExecute({ approvedExternalFileIds: approvedExternal });
    setLastResult(result);
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal-card generation-preview-card"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="ca-dialog-title">生成/更新接口 · 预览</div>

        {planError && (
          <p
            className="ca-dialog-message"
            style={{ color: "var(--tc-fg-error)" }}
          >
            生成计划构建失败：{planError}
          </p>
        )}
        {!plan && !planError && (
          <p className="ca-dialog-message">正在分析…</p>
        )}

        {plan && plan.warnings.length > 0 && (
          <section style={{ marginTop: 12 }}>
            <h3 style={{ fontSize: 13, margin: "6px 0" }}>说明</h3>
            <ul className="resource-editor-usage-list">
              {plan.warnings.map((w, i) => (
                <li key={i} className="sidebar-hint">
                  {w}
                </li>
              ))}
            </ul>
          </section>
        )}

        {plan && (
          <>
            <section style={{ marginTop: 12 }}>
              <h3 style={{ fontSize: 13, margin: "6px 0" }}>资源 JSON</h3>
              {plan.resourceJsonChanges.length === 0 ? (
                <p className="sidebar-hint">无变更。</p>
              ) : (
                <ul className="resource-editor-usage-list">
                  {plan.resourceJsonChanges.map((c, i) => (
                    <li key={i} className="sidebar-hint">
                      <code>{c}</code>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section style={{ marginTop: 12 }}>
              <h3 style={{ fontSize: 13, margin: "6px 0" }}>
                源文件变更（{plan.files.length}）
              </h3>
              {plan.files.length === 0 ? (
                <p className="sidebar-hint">无源文件变更。</p>
              ) : (
                <table className="resource-editor-files-table">
                  <thead>
                    <tr>
                      <th>路径</th>
                      <th>存储</th>
                      <th>计划变更</th>
                      <th>授权</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.files.map((f) => (
                      <tr key={f.fileId}>
                        <td>
                          <code>{f.refPath}</code>
                        </td>
                        <td>
                          {f.storage === "managed" ? "项目托管" : "外部关联"}
                        </td>
                        <td>
                          <ul
                            style={{
                              margin: 0,
                              paddingLeft: 16,
                              fontSize: 12
                            }}
                          >
                            {f.changes.map((c, i) => (
                              <li key={i}>{c}</li>
                            ))}
                          </ul>
                        </td>
                        <td>
                          {f.storage === "external" ? (
                            <label className="resource-editor-checkbox">
                              <input
                                type="checkbox"
                                checked={approvedExternal.has(f.fileId)}
                                onChange={(e) =>
                                  toggleExternal(f.fileId, e.target.checked)
                                }
                              />
                              <span>确认写入</span>
                            </label>
                          ) : (
                            <span className="sidebar-hint">托管，自动</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {externalsNeedingApproval.length > 0 && (
                <p className="sidebar-hint" style={{ fontSize: 11 }}>
                  外部文件须在每次预览中显式确认；MVP 不记忆长期授权。
                </p>
              )}
            </section>
          </>
        )}

        {lastResult && (
          <section style={{ marginTop: 12 }}>
            <h3 style={{ fontSize: 13, margin: "6px 0" }}>本次写入结果</h3>
            <p className="sidebar-hint">
              已写入 {lastResult.filesWritten.length} 个文件
              {lastResult.filesSkipped.length > 0
                ? `，跳过 ${lastResult.filesSkipped.length} 个`
                : ""}
              。
            </p>
            {lastResult.filesSkipped.length > 0 && (
              <ul className="resource-editor-usage-list">
                {lastResult.filesSkipped.map((s, i) => (
                  <li key={i} className="sidebar-hint">
                    <code>{s.refPath}</code> · {s.reason}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <div className="ca-dialog-actions" style={{ marginTop: 16 }}>
          <button type="button" className="ca-dialog-btn" onClick={onClose}>
            {lastResult ? "关闭" : "取消"}
          </button>
          <button
            type="button"
            className="ca-dialog-btn is-primary"
            onClick={() => void handleConfirm()}
            disabled={!canWrite}
            title={
              !plan
                ? "等待计划构建"
                : plan.files.length === 0
                  ? "没有源文件变更可写入"
                  : !allExternalsApproved
                    ? "请勾选所有外部文件的写入授权"
                    : ""
            }
          >
            {running ? "正在写入…" : "确认写入"}
          </button>
        </div>
        {/* `draft` is currently only used to satisfy the prop signature; the
            modal reads everything it needs from `plan`. Keep the prop so a
            future iteration can show resource metadata in the header. */}
        {false && <span>{draft.resource_instance_id}</span>}
      </div>
    </div>
  );
}
