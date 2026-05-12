import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ComputeResourceV2,
  CustomComputeResource,
  ImplementationFileLanguage,
  ImplementationFileRef,
  ImplementationFileRole,
  ImplementationKind,
  ResourceCategory,
  StandardComputeResource
} from "@tinder/nextstep";
import {
  allocateCustomActionIndexes,
  parseComputeResource
} from "@tinder/nextstep";
import { useCa } from "../state/ChainAssemblyContext";
import { useWorkspace } from "../state/WorkspaceContext";
import {
  RESOURCE_INCLUDE_DIR,
  RESOURCE_SRC_DIR,
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

type EditorTab = "summary" | "capability" | "files" | "interface";
type AssistantContext = "docs" | "interface" | "issues" | "ai";

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

const ROLE_OPTIONS: Array<{ value: ImplementationFileRole; label: string }> = [
  { value: "primary", label: "primary（主入口）" },
  { value: "header", label: "header（头文件）" },
  { value: "source", label: "source（源文件）" },
  { value: "support", label: "support（辅助）" }
];

function inferLang(path: string): ImplementationFileLanguage {
  const p = path.toLowerCase();
  if (p.endsWith(".py")) return "python";
  if (/\.(cpp|cc|cxx|hpp)$/.test(p)) return "cpp";
  if (/\.(c|h)$/.test(p)) return "c";
  return "unknown";
}

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
    openChainEditor
  } = useWorkspace();

  const [activeTab, setActiveTab] = useState<EditorTab>("summary");
  const [load, setLoad] = useState<LoadState>({ kind: "idle" });
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [draft, setDraft] = useState<ComputeResourceV2 | null>(null);
  const [baseline, setBaseline] = useState<ComputeResourceV2 | null>(null);
  const [currentSourcePath, setCurrentSourcePath] = useState<string | null>(
    sourcePath
  );
  /** Selected variant for the standard-resource capability tab. */
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    null
  );
  /** Right assistant panel context — kept independent of the main tab. */
  const [assistantCtx, setAssistantCtx] = useState<AssistantContext>("docs");
  /** file_id of the source file targeted by the toolbar's "打开源文件" button. */
  const [activeSourceFileId, setActiveSourceFileId] = useState<string | null>(
    null
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

        // Refresh marker health for each source file by actually probing
        // disk content. Mutates a clone so the in-memory representation
        // reflects current reality.
        await refreshSourceFileStatuses(resource, currentSourcePath);
        if (myToken !== loadTokenRef.current) return;

        setDraft(clone(resource));
        setBaseline(clone(resource));
        setDiskHash(hashText(rawText));
        if (resource.resource_kind === "standard") {
          const first =
            (resource as StandardComputeResource).model_variants[0]
              ?.variant_id ?? null;
          setSelectedVariantId(first);
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

  // Whenever the resource changes (re-loads or save-induced reset), keep the
  // toolbar's selected source file pointing at something that still exists.
  //
  // Reads `activeSourceFileId` through a ref so the effect doesn't re-fire
  // every time the user picks a different source file in the toolbar; we
  // only care about *draft* identity changes here.
  const activeSourceFileIdRef = useRef<string | null>(null);
  activeSourceFileIdRef.current = activeSourceFileId;
  useEffect(() => {
    if (!draft) {
      setActiveSourceFileId(null);
      return;
    }
    const refs = draft.implementation.source_files;
    if (refs.length === 0) {
      setActiveSourceFileId(null);
      return;
    }
    const current = activeSourceFileIdRef.current;
    if (current && refs.some((r) => r.file_id === current)) {
      return; // current selection is still valid
    }
    setActiveSourceFileId(refs[0]!.file_id);
  }, [draft]);

  const resolveSourceAbsolutePath = useCallback(
    async (ref: ImplementationFileRef): Promise<string | null> => {
      if (ref.storage === "external") return ref.path;
      const packageDir =
        currentSourcePath && !currentSourcePath.endsWith(".json")
          ? currentSourcePath
          : null;
      if (!packageDir) return null;
      return await window.tinder.joinPath(packageDir, ref.path);
    },
    [currentSourcePath]
  );

  const handleOpenActiveSource = useCallback(async () => {
    if (!draft || !activeSourceFileId) return;
    const ref = draft.implementation.source_files.find(
      (r) => r.file_id === activeSourceFileId
    );
    if (!ref) return;
    const abs = await resolveSourceAbsolutePath(ref);
    if (!abs) {
      await ca.dialogNotify({
        title: "无法打开",
        message: "请先保存资源配置以建立包目录，托管文件依赖该目录定位。"
      });
      return;
    }
    void openFile(abs);
  }, [activeSourceFileId, ca, draft, openFile, resolveSourceAbsolutePath]);

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
      title: "另存为项目模板",
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
      <header className="chain-editor-header">
        <div className="chain-editor-title">
          <h1 title={currentSourcePath ?? "(未保存)"}>
            {draft.display_name || "(未命名计算实例)"}
          </h1>
          <span className="resource-editor-subtitle">
            {resourceKind === "standard" ? "标准计算实例" : "自定义计算实例"} ·{" "}
            状态 {statusLabel(draft.status)}
            {dirty && <span className="resource-editor-dirty"> · 未保存</span>}
          </span>
        </div>
        <div className="chain-editor-toolbar-actions">
          <button
            type="button"
            className="chain-editor-action-btn"
            onClick={handleRevert}
            disabled={!dirty || save.kind === "saving"}
          >
            还原
          </button>
          <button
            type="button"
            className="chain-editor-action-btn"
            onClick={() => void handleCopy()}
          >
            复制计算实例…
          </button>
          <button
            type="button"
            className="chain-editor-action-btn is-primary"
            onClick={() => void handleSave()}
            disabled={!dirty || save.kind === "saving"}
          >
            {save.kind === "saving" ? "保存中…" : "保存资源配置"}
          </button>
        </div>
      </header>

      <nav className="resource-editor-tabs">
        <TabButton active={activeTab === "summary"} onClick={() => setActiveTab("summary")}>
          概要
        </TabButton>
        <TabButton
          active={activeTab === "capability"}
          onClick={() => setActiveTab("capability")}
        >
          能力节点
        </TabButton>
        <TabButton active={activeTab === "files"} onClick={() => setActiveTab("files")}>
          实现文件
        </TabButton>
        <TabButton
          active={activeTab === "interface"}
          onClick={() => setActiveTab("interface")}
        >
          文档与接口
        </TabButton>
        <div className="resource-editor-tabs-spacer" />
        {issues.length > 0 && (
          <span
            className="resource-editor-issue-badge"
            title={issues.map((i) => i.message).join("\n")}
          >
            {issues.length} 项问题
          </span>
        )}
        <SaveStatusBadge status={save} />
      </nav>

      <div className="resource-editor-toolbar">
        <SourceFileSwitcher
          draft={draft}
          activeId={activeSourceFileId}
          onChange={setActiveSourceFileId}
          onOpen={() => void handleOpenActiveSource()}
        />
        <div className="resource-editor-toolbar-spacer" />
        <button
          type="button"
          className="chain-editor-action-btn"
          onClick={() => void openGenerationPreview()}
        >
          生成/更新接口…
        </button>
      </div>

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
            />
          )}
          {activeTab === "capability" &&
            (draft.resource_kind === "standard" ? (
              <StandardCapabilityTab
                draft={draft as StandardComputeResource}
                selectedVariantId={selectedVariantId}
                onSelectVariant={setSelectedVariantId}
                patch={(next) => setDraft(next)}
              />
            ) : (
              <CustomCapabilityTab
                draft={draft as CustomComputeResource}
                patch={(next) => setDraft(next)}
              />
            ))}
          {activeTab === "files" && (
            <FilesTab
              draft={draft}
              sourcePath={currentSourcePath}
              patchImpl={patchImpl}
              onOpenFile={(absolutePath) => void openFile(absolutePath)}
            />
          )}
          {activeTab === "interface" && (
            <InterfaceTab
              draft={draft}
              onOpenDocsForNode={(nodeId) => openHelpDoc(nodeId)}
              onOpenGenerationPreview={() => void openGenerationPreview()}
            />
          )}
        </div>
        <aside className="resource-editor-assistant">
          <AssistantPanel
            context={assistantCtx}
            onChangeContext={setAssistantCtx}
            draft={draft}
            issues={issues}
            onOpenDocsForNode={(nodeId) => openHelpDoc(nodeId)}
          />
        </aside>
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
      return "活跃";
    case "disabled":
      return "停用";
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
  onOpenProfile
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
}) {
  const tagsText = (draft.tags ?? []).join(", ");
  return (
    <div className="profile-lifecycle">
      <section className="profile-lifecycle-section">
        <h2>身份</h2>
        <div className="resource-editor-form">
          <Field label="资源实例 ID">
            <code>{draft.resource_instance_id}</code>
          </Field>
          <Field label="资源类型">
            {draft.resource_kind === "standard" ? "标准" : "自定义"}
          </Field>
          <Field label="显示名">
            <input
              className="resource-editor-input"
              value={draft.display_name}
              onChange={(e) => patchDraft({ display_name: e.target.value })}
            />
          </Field>
          <Field label="状态">
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
              <option value="active">活跃</option>
              <option value="disabled">停用</option>
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
      </section>

      <section className="profile-lifecycle-section">
        <h2>实现摘要</h2>
        <div className="resource-editor-form">
          <Field label="实现类型">
            <select
              className="resource-editor-input"
              value={draft.implementation.kind}
              onChange={(e) => {
                const next = e.target.value as ImplementationKind;
                patchImpl({
                  kind: next,
                  runtime_artifact: {
                    ...draft.implementation.runtime_artifact,
                    kind: next === "cpp_library" ? "cpp_dylib" : "python_script"
                  }
                });
              }}
            >
              <option value="python_script">Python 脚本</option>
              <option value="cpp_library">C++ 动态库</option>
            </select>
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
      </section>

      <section className="profile-lifecycle-section">
        <h2>磁盘位置</h2>
        <dl className="profile-lifecycle-grid">
          <dt>来源</dt>
          <dd>
            {sourcePath ? (
              <code>{sourcePath}</code>
            ) : (
              <span className="sidebar-hint">未保存（保存后将创建包目录）</span>
            )}
          </dd>
        </dl>
      </section>

      <section className="profile-lifecycle-section">
        <h2>模板</h2>
        <dl className="profile-lifecycle-grid">
          <dt>创建模板</dt>
          <dd>
            {draft.template_origin ? (
              <code>
                {draft.template_origin.template_id} ·{" "}
                {draft.template_origin.template_version}
              </code>
            ) : (
              <span className="sidebar-hint">无（手动创建或复制而来）</span>
            )}
          </dd>
        </dl>
        <div className="profile-lifecycle-buttons">
          <button
            type="button"
            className="chain-editor-action-btn"
            onClick={onSaveAsTemplate}
          >
            另存为项目模板…
          </button>
        </div>
        <p className="sidebar-hint" style={{ fontSize: 12 }}>
          模板仅保留资源结构与建议字段（类别、描述、标签、建议节点）。
          源文件、运行时产物、生成状态与档案使用都不会写入模板。
        </p>
      </section>

      <section className="profile-lifecycle-section">
        <h2>被档案使用 ({usage.length})</h2>
        {usage.length === 0 ? (
          <p className="sidebar-hint">尚未被任何配置档案引用。</p>
        ) : (
          <ul className="resource-editor-usage-list">
            {usage.map((u) => (
              <li key={`${u.profileId}#${u.variantId ?? "-"}`}>
                <button
                  type="button"
                  className="assistant-panel-link"
                  onClick={() => onOpenProfile(u.profileId, u.profileName)}
                  title="在链路编辑器中打开该档案"
                >
                  <strong>{u.profileName}</strong>
                </button>
                <span className="sidebar-hint">
                  {" "}
                  · {u.enabled ? "活跃" : "停用"}
                  {u.variantId ? ` · 变体 ${u.variantId}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="sidebar-hint" style={{ fontSize: 12 }}>
          此处只读：点档案名跳转到链路编辑器；配置档案的激活、停用、变体选择仍由链路编辑器管理。
        </p>
      </section>
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

// ─── Files tab ─────────────────────────────────────────────────────────────

function FilesTab({
  draft,
  sourcePath,
  patchImpl,
  onOpenFile
}: {
  draft: ComputeResourceV2;
  sourcePath: string | null;
  patchImpl: (patch: Partial<ComputeResourceV2["implementation"]>) => void;
  onOpenFile: (absolutePath: string) => void;
}) {
  const ca = useCa();
  const refs = draft.implementation.source_files;
  const packageDir =
    sourcePath && !sourcePath.endsWith(".json") ? sourcePath : null;

  const resolveAbsolutePath = useCallback(
    async (ref: ImplementationFileRef): Promise<string | null> => {
      if (ref.storage === "external") return ref.path;
      if (!packageDir) return null;
      return await window.tinder.joinPath(packageDir, ref.path);
    },
    [packageDir]
  );

  const handleAddExternal = useCallback(async () => {
    const path = await ca.dialogPrompt({
      title: "关联外部源文件",
      placeholder: "绝对路径或工程相对路径"
    });
    if (!path?.trim()) return;
    const trimmed = path.trim();
    const newRef: ImplementationFileRef = {
      file_id: `${draft.resource_instance_id}:${refs.length + 1}`,
      path: trimmed,
      storage: "external",
      role: "source",
      language: inferLang(trimmed)
    };
    patchImpl({ source_files: [...refs, newRef] });
  }, [ca, draft.resource_instance_id, patchImpl, refs]);

  const handleCreateManaged = useCallback(async () => {
    if (!packageDir) {
      await ca.dialogNotify({
        title: "需要先保存资源",
        message: "请先保存资源配置以创建包目录后再添加托管文件。"
      });
      return;
    }
    const name = await ca.dialogPrompt({
      title: "新建托管源文件",
      placeholder: "文件名（含扩展名），例如 main.py 或 radar.cpp"
    });
    if (!name?.trim()) return;
    const trimmed = name.trim();
    const isHeader = /\.(h|hpp|hxx)$/i.test(trimmed);
    const subdir = isHeader ? RESOURCE_INCLUDE_DIR : RESOURCE_SRC_DIR;
    const subdirAbs = await window.tinder.joinPath(packageDir, subdir);
    try {
      await window.tinder.createDir(subdirAbs);
    } catch {
      /* exists */
    }
    const targetAbs = await window.tinder.joinPath(subdirAbs, trimmed);
    try {
      await window.tinder.readText(targetAbs);
      await ca.dialogNotify({
        title: "文件已存在",
        message: "请改用不同的文件名，或在「实现文件」中直接打开它。"
      });
      return;
    } catch {
      /* ok — target does not exist */
    }
    try {
      await window.tinder.writeText(targetAbs, "");
    } catch (err) {
      await ca.dialogNotify({ title: "创建失败", message: String(err) });
      return;
    }
    const relPath = `${subdir}/${trimmed}`;
    const newRef: ImplementationFileRef = {
      file_id: `${draft.resource_instance_id}:${refs.length + 1}`,
      path: relPath,
      storage: "managed",
      role: isHeader ? "header" : "source",
      language: inferLang(trimmed),
      generated_region_status: "unknown"
    };
    patchImpl({ source_files: [...refs, newRef] });
  }, [ca, draft.resource_instance_id, packageDir, patchImpl, refs]);

  const handleRemove = useCallback(
    async (ref: ImplementationFileRef) => {
      const ok = await ca.dialogConfirm({
        title: "解除关联",
        message:
          ref.storage === "managed"
            ? `仅从资源中移除「${ref.path}」的引用，磁盘文件保留。`
            : `移除对外部文件「${ref.path}」的引用，磁盘文件不受影响。`
      });
      if (!ok) return;
      patchImpl({ source_files: refs.filter((r) => r.file_id !== ref.file_id) });
    },
    [ca, patchImpl, refs]
  );

  const handleOpen = useCallback(
    async (ref: ImplementationFileRef) => {
      const abs = await resolveAbsolutePath(ref);
      if (!abs) {
        await ca.dialogNotify({
          title: "无法打开",
          message: "请先保存资源配置以建立包目录，托管文件依赖该目录定位。"
        });
        return;
      }
      onOpenFile(abs);
    },
    [ca, onOpenFile, resolveAbsolutePath]
  );

  const handleChangeRole = useCallback(
    (ref: ImplementationFileRef, role: ImplementationFileRole) => {
      patchImpl({
        source_files: refs.map((r) =>
          r.file_id === ref.file_id ? { ...r, role } : r
        )
      });
    },
    [patchImpl, refs]
  );

  return (
    <div className="profile-lifecycle">
      <section className="profile-lifecycle-section">
        <h2>实现文件</h2>
        <div className="resource-editor-files-toolbar">
          <button
            type="button"
            className="chain-editor-action-btn"
            onClick={() => void handleCreateManaged()}
          >
            新建托管文件…
          </button>
          <button
            type="button"
            className="chain-editor-action-btn"
            onClick={() => void handleAddExternal()}
          >
            关联外部文件…
          </button>
        </div>
        {refs.length === 0 ? (
          <p className="sidebar-hint">尚未关联任何源文件。</p>
        ) : (
          <table className="resource-editor-files-table">
            <thead>
              <tr>
                <th>路径</th>
                <th>存储</th>
                <th>角色</th>
                <th>语言</th>
                <th>标记</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {refs.map((ref) => (
                <tr key={ref.file_id}>
                  <td>
                    <code>{ref.path}</code>
                  </td>
                  <td>{ref.storage === "managed" ? "项目托管" : "外部关联"}</td>
                  <td>
                    <select
                      className="resource-editor-input"
                      value={ref.role}
                      onChange={(e) =>
                        handleChangeRole(
                          ref,
                          e.target.value as ImplementationFileRole
                        )
                      }
                    >
                      {ROLE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{ref.language}</td>
                  <td>{ref.generated_region_status ?? "unknown"}</td>
                  <td>
                    <div className="resource-editor-files-actions">
                      <button
                        type="button"
                        className="chain-editor-action-btn"
                        onClick={() => void handleOpen(ref)}
                      >
                        打开
                      </button>
                      <button
                        type="button"
                        className="chain-editor-action-btn is-danger"
                        onClick={() => void handleRemove(ref)}
                      >
                        移除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="sidebar-hint" style={{ fontSize: 12 }}>
          托管文件保存于资源包目录下的{" "}
          <code>src/</code> 或 <code>include/</code>。外部文件以引用形式关联，
          接口生成在写入前会再次确认。
        </p>
      </section>

      <section className="profile-lifecycle-section">
        <h2>占位说明</h2>
        <p className="sidebar-hint">
          能力节点、文档与接口将在后续切片中提供。当前切片专注于资源元数据、源文件关联和运行时产物记录。
        </p>
      </section>

      {/* CustomComputeResource hint — let user know custom_nodes editing comes in 3c. */}
      {draft.resource_kind === "custom" && (
        <CustomNodesPreview resource={draft as CustomComputeResource} />
      )}
    </div>
  );
}

function CustomNodesPreview({ resource }: { resource: CustomComputeResource }) {
  return (
    <section className="profile-lifecycle-section">
      <h2>自定义节点（预览，编辑功能 3c）</h2>
      {resource.custom_nodes.length === 0 ? (
        <p className="sidebar-hint">资源未包含任何自定义节点。</p>
      ) : (
        <ul className="resource-editor-usage-list">
          {resource.custom_nodes.map((n) => (
            <li key={n.node_id}>
              <strong>{n.display_name || n.node_id}</strong>
              <span className="sidebar-hint">
                {" "}
                · action_index {n.action_index}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── Source file switcher (toolbar) ────────────────────────────────────────

function SourceFileSwitcher({
  draft,
  activeId,
  onChange,
  onOpen
}: {
  draft: ComputeResourceV2;
  activeId: string | null;
  onChange: (id: string | null) => void;
  onOpen: () => void;
}) {
  const refs = draft.implementation.source_files;
  if (refs.length === 0) {
    return (
      <span className="resource-editor-toolbar-hint">
        未关联源文件 · 在「实现文件」中添加
      </span>
    );
  }
  return (
    <div className="resource-editor-toolbar-source">
      <label className="resource-editor-label">活动源文件</label>
      <select
        className="resource-editor-input"
        style={{ maxWidth: 320 }}
        value={activeId ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
      >
        {refs.map((r) => (
          <option key={r.file_id} value={r.file_id}>
            {r.path} · {r.role}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="chain-editor-action-btn"
        onClick={onOpen}
        disabled={!activeId}
      >
        在编辑器中打开
      </button>
    </div>
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
        message: "资源已置为「活跃」但运行时产物路径为空"
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

// ─── Assistant panel ───────────────────────────────────────────────────────

function AssistantPanel({
  context,
  onChangeContext,
  draft,
  issues,
  onOpenDocsForNode
}: {
  context: AssistantContext;
  onChangeContext: (ctx: AssistantContext) => void;
  draft: ComputeResourceV2;
  issues: EditorIssue[];
  onOpenDocsForNode: (nodeId: string) => void;
}) {
  return (
    <div className="assistant-panel">
      <div className="assistant-panel-tabs" role="tablist">
        <AssistantTabButton
          active={context === "docs"}
          onClick={() => onChangeContext("docs")}
        >
          文档
        </AssistantTabButton>
        <AssistantTabButton
          active={context === "interface"}
          onClick={() => onChangeContext("interface")}
        >
          接口
        </AssistantTabButton>
        <AssistantTabButton
          active={context === "issues"}
          onClick={() => onChangeContext("issues")}
        >
          问题{issues.length > 0 ? ` (${issues.length})` : ""}
        </AssistantTabButton>
        <AssistantTabButton
          active={context === "ai"}
          onClick={() => onChangeContext("ai")}
        >
          AI
        </AssistantTabButton>
      </div>
      <div className="assistant-panel-body">
        {context === "docs" && (
          <AssistantDocsContext
            draft={draft}
            onOpenDocsForNode={onOpenDocsForNode}
          />
        )}
        {context === "interface" && <AssistantInterfaceContext draft={draft} />}
        {context === "issues" && <AssistantIssuesContext issues={issues} />}
        {context === "ai" && <AssistantAiContext />}
      </div>
    </div>
  );
}

function AssistantTabButton({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`assistant-panel-tab${active ? " is-active" : ""}`}
      onClick={onClick}
      role="tab"
      aria-selected={active}
    >
      {children}
    </button>
  );
}

function AssistantDocsContext({
  draft,
  onOpenDocsForNode
}: {
  draft: ComputeResourceV2;
  onOpenDocsForNode: (nodeId: string) => void;
}) {
  const linkedNodeIds: string[] = [];
  if (draft.resource_kind === "standard") {
    for (const c of (draft as StandardComputeResource).compute_nodes) {
      if (!linkedNodeIds.includes(c.node_id)) linkedNodeIds.push(c.node_id);
    }
  }
  return (
    <div className="assistant-panel-section">
      <h3>关联标准节点文档</h3>
      {linkedNodeIds.length === 0 ? (
        <p className="sidebar-hint">
          {draft.resource_kind === "custom"
            ? "自定义资源不直接关联标准节点。链路插入位置由档案管理。"
            : "尚未关联任何标准节点。在「能力节点」中添加候选后即可在此打开文档。"}
        </p>
      ) : (
        <ul className="assistant-panel-list">
          {linkedNodeIds.map((nodeId) => (
            <li key={nodeId}>
              <button
                type="button"
                className="assistant-panel-link"
                onClick={() => onOpenDocsForNode(nodeId)}
              >
                <code>{nodeId}</code>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="sidebar-hint" style={{ fontSize: 11, marginTop: 8 }}>
        文档来自标准链 catalog（chain-contract docs）。
      </p>
    </div>
  );
}

function AssistantInterfaceContext({ draft }: { draft: ComputeResourceV2 }) {
  return (
    <div className="assistant-panel-section">
      <h3>生成区健康</h3>
      {draft.implementation.source_files.length === 0 ? (
        <p className="sidebar-hint">未关联源文件。</p>
      ) : (
        <ul className="assistant-panel-list">
          {draft.implementation.source_files.map((ref) => (
            <li key={ref.file_id}>
              <code>{ref.path}</code>
              <span className="sidebar-hint">
                {" "}
                · {ref.generated_region_status ?? "unknown"}
              </span>
            </li>
          ))}
        </ul>
      )}
      {draft.resource_kind === "custom" && (
        <>
          <h3 style={{ marginTop: 12 }}>action_index 分配</h3>
          <ul className="assistant-panel-list">
            {(draft as CustomComputeResource).custom_nodes.map((n) => (
              <li key={n.node_id}>
                <code>{n.node_id}</code>
                <span className="sidebar-hint">
                  {" "}
                  ·{" "}
                  {typeof n.action_index === "number"
                    ? `action_index ${n.action_index}`
                    : "待分配"}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="sidebar-hint" style={{ fontSize: 11, marginTop: 8 }}>
        预览，实际写入将在下个切片提供。
      </p>
    </div>
  );
}

function AssistantIssuesContext({ issues }: { issues: EditorIssue[] }) {
  if (issues.length === 0) {
    return (
      <div className="assistant-panel-section">
        <p className="sidebar-hint">没有发现问题。</p>
      </div>
    );
  }
  return (
    <div className="assistant-panel-section">
      <ul className="assistant-panel-issues">
        {issues.map((issue, i) => (
          <li
            key={i}
            className={`assistant-panel-issue is-${issue.severity}`}
          >
            <span className="assistant-panel-issue-badge">
              {issue.severity === "error" ? "错误" : "警告"}
            </span>
            <span>{issue.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AssistantAiContext() {
  return (
    <div className="assistant-panel-section">
      <p className="sidebar-hint">
        AI 助手尚未接入。后续版本将支持：
      </p>
      <ul className="assistant-panel-list">
        <li>解释当前文件</li>
        <li>生成实现建议</li>
        <li>检查接口问题</li>
        <li>回答链路装配问题</li>
      </ul>
      <p className="sidebar-hint" style={{ fontSize: 11, marginTop: 8 }}>
        任何未来的 AI 写入仍会走 preview / diff / 确认的安全写规则。
      </p>
    </div>
  );
}

// ─── 文档与接口 main tab ───────────────────────────────────────────────────

function InterfaceTab({
  draft,
  onOpenDocsForNode,
  onOpenGenerationPreview
}: {
  draft: ComputeResourceV2;
  onOpenDocsForNode: (nodeId: string) => void;
  onOpenGenerationPreview: () => void;
}) {
  const linkedNodeIds: string[] = [];
  if (draft.resource_kind === "standard") {
    for (const c of (draft as StandardComputeResource).compute_nodes) {
      if (!linkedNodeIds.includes(c.node_id)) linkedNodeIds.push(c.node_id);
    }
  }
  return (
    <div className="profile-lifecycle">
      <section className="profile-lifecycle-section">
        <h2>源链路文档</h2>
        {linkedNodeIds.length === 0 ? (
          <p className="sidebar-hint">
            {draft.resource_kind === "custom"
              ? "自定义资源没有直接关联的标准链节点。"
              : "在「能力节点」中添加候选后，对应的标准节点文档会出现在此处。"}
          </p>
        ) : (
          <ul className="resource-editor-usage-list">
            {linkedNodeIds.map((nodeId) => (
              <li key={nodeId}>
                <button
                  type="button"
                  className="assistant-panel-link"
                  onClick={() => onOpenDocsForNode(nodeId)}
                >
                  <code>{nodeId}</code>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="profile-lifecycle-section">
        <h2>生成区健康</h2>
        {draft.implementation.source_files.length === 0 ? (
          <p className="sidebar-hint">未关联源文件。</p>
        ) : (
          <table className="resource-editor-files-table">
            <thead>
              <tr>
                <th>路径</th>
                <th>角色</th>
                <th>生成区标记</th>
              </tr>
            </thead>
            <tbody>
              {draft.implementation.source_files.map((ref) => (
                <tr key={ref.file_id}>
                  <td>
                    <code>{ref.path}</code>
                  </td>
                  <td>{ref.role}</td>
                  <td>{ref.generated_region_status ?? "unknown"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="profile-lifecycle-section">
        <h2>接口生成</h2>
        <p className="sidebar-hint">
          预览此次「生成/更新接口」将影响的文件与字段。
          {" "}
          <strong>本切片仅展示预览</strong>，实际写入安全规则将在下个切片接入。
        </p>
        <div className="profile-lifecycle-buttons">
          <button
            type="button"
            className="chain-editor-action-btn is-primary"
            onClick={onOpenGenerationPreview}
          >
            打开生成预览
          </button>
        </div>
      </section>

      {draft.resource_kind === "custom" && (
        <section className="profile-lifecycle-section">
          <h2>动作注册 / 处理函数</h2>
          {(draft as CustomComputeResource).custom_nodes.length === 0 ? (
            <p className="sidebar-hint">未定义自定义节点。</p>
          ) : (
            <table className="resource-editor-files-table">
              <thead>
                <tr>
                  <th>node_id</th>
                  <th>action_index</th>
                  <th>handler_function</th>
                </tr>
              </thead>
              <tbody>
                {(draft as CustomComputeResource).custom_nodes.map((n) => (
                  <tr key={n.node_id}>
                    <td>
                      <code>{n.node_id}</code>
                    </td>
                    <td>
                      {typeof n.action_index === "number" ? (
                        n.action_index
                      ) : (
                        <span className="sidebar-hint">待分配</span>
                      )}
                    </td>
                    <td>
                      {n.handler_function ? (
                        <code>{n.handler_function}</code>
                      ) : (
                        <span className="sidebar-hint">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
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
