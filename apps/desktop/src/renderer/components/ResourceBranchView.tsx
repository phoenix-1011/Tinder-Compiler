import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import type {
  ComputeResourceBranch,
  ComputeResourceStatus,
  ComputeResourceV2,
  CustomComputeResource,
  CustomComputeResourceBranch,
  StandardComputeResource,
  StandardComputeResourceBranch
} from "@tinder/nextstep";
import {
  branchToComputeResourceV2,
  profileResourceBranchId
} from "@tinder/nextstep";
import { useCa } from "../state/ChainAssemblyContext";
import { useWorkspace } from "../state/WorkspaceContext";
import {
  CustomCapabilityTab,
  StandardCapabilityTab
} from "./ResourceCapabilityTab";
import { ContextMenu, useContextMenu } from "./ContextMenu";
import { CHAIN_CATALOG } from "../help/chain-catalog.generated";
import {
  chainNodeUiNotice,
  chainNodeUiTags,
  isResourceBindableChainNode
} from "../help/chainCatalogUi";

interface ResourceBranchViewProps {
  tabUri: string;
  scope: "profile" | "global";
  profileId?: string;
  resourceKind: "standard" | "custom";
  resourceId: string;
  initialBranchId: string;
}

type EditorTab = "summary" | "capability" | "usage";
type NewBranchMode = "copy" | "blank";
type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "error"; message: string };

const STATUS_OPTIONS: Array<{ value: ComputeResourceStatus; label: string }> = [
  { value: "draft", label: "草稿" },
  { value: "active", label: "可用" },
  { value: "disabled", label: "已停用" }
];

interface ResourceBranchUiState {
  activeTab: EditorTab;
  profileEditMode: boolean;
}

const resourceBranchUiState = new Map<string, ResourceBranchUiState>();

function getResourceBranchUiState(tabUri: string): ResourceBranchUiState {
  return (
    resourceBranchUiState.get(tabUri) ?? {
      activeTab: "summary",
      profileEditMode: false
    }
  );
}

function updateResourceBranchUiState(
  tabUri: string,
  patch: Partial<ResourceBranchUiState>
) {
  resourceBranchUiState.set(tabUri, {
    ...getResourceBranchUiState(tabUri),
    ...patch
  });
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function resourceToBranch(
  resource: ComputeResourceV2,
  current: ComputeResourceBranch,
  selectedVariantId: string | null
): ComputeResourceBranch {
  const common = {
    ...current,
    display_name: resource.display_name,
    description: resource.description,
    status: resource.status,
    implementation: resource.implementation,
    notes: resource.notes
  };
  if (resource.resource_kind === "standard") {
    const variant =
      resource.model_variants.find((v) => v.variant_id === selectedVariantId) ??
      resource.model_variants[0];
    return {
      ...common,
      resource_kind: "standard",
      compute_nodes: resource.compute_nodes.map((node) => ({ ...node })),
      effective_candidates: { ...(variant?.effective_candidates ?? {}) }
    } satisfies StandardComputeResourceBranch;
  }
  return {
    ...common,
    resource_kind: "custom",
    custom_nodes: resource.custom_nodes.map((node) => ({ ...node }))
  } satisfies CustomComputeResourceBranch;
}

export function ResourceBranchView({
  tabUri,
  scope,
  profileId,
  resourceKind,
  resourceId,
  initialBranchId
}: ResourceBranchViewProps) {
  const ca = useCa();
  const {
    openResourceBranch,
    openFile,
    openHelpDoc,
    registerSyntheticSave,
    setSyntheticDirty
  } = useWorkspace();
  const disk = ca.disk;
  const [activeTab, setActiveTabState] = useState<EditorTab>(
    () => getResourceBranchUiState(tabUri).activeTab
  );
  const setActiveTab = useCallback(
    (next: EditorTab) => {
      updateResourceBranchUiState(tabUri, { activeTab: next });
      setActiveTabState(next);
    },
    [tabUri]
  );
  const [globalBranchId, setGlobalBranchId] = useState(initialBranchId);
  const [draft, setDraft] = useState<ComputeResourceBranch | null>(null);
  const [baseline, setBaseline] = useState<ComputeResourceBranch | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    null
  );
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [profileSave, setProfileSave] = useState<SaveState>({ kind: "idle" });
  const [profileEditMode, setProfileEditModeState] = useState(
    () => getResourceBranchUiState(tabUri).profileEditMode
  );
  const setProfileEditMode = useCallback(
    (next: boolean) => {
      updateResourceBranchUiState(tabUri, { profileEditMode: next });
      setProfileEditModeState(next);
    },
    [tabUri]
  );
  const [sharedEditDialogOpen, setSharedEditDialogOpen] = useState(false);
  const [newBranchDialogOpen, setNewBranchDialogOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [newBranchMode, setNewBranchMode] = useState<NewBranchMode>("copy");
  const lastInitialBranchIdRef = useRef(initialBranchId);
  const branchMenu = useContextMenu();

  const profile = useMemo(
    () => disk?.profiles.find((p) => p.id === profileId) ?? null,
    [disk, profileId]
  );
  const familyEntry = useMemo(
    () =>
      disk?.resourceIndex.familyByKey.get(`${resourceKind}:${resourceId}`) ??
      null,
    [disk, resourceKind, resourceId]
  );
  const slotRef = useMemo(
    () =>
      profile?.project.resources?.find(
        (ref) =>
          ref.kind === resourceKind &&
          ref.resource_instance_id === resourceId
      ) ?? null,
    [profile, resourceKind, resourceId]
  );
  const selectedBranchId =
    scope === "profile" && slotRef
      ? profileResourceBranchId(slotRef)
      : globalBranchId;
  const branchEntry =
    familyEntry?.branches.find(
      (entry) => entry.branch.branch_id === selectedBranchId
    ) ?? null;

  useEffect(() => {
    if (!branchEntry) {
      setDraft(null);
      setBaseline(null);
      return;
    }
    const next = clone(branchEntry.branch);
    setDraft(next);
    setBaseline(clone(next));
    setSave({ kind: "idle" });
    setSelectedVariantId(next.branch_id);
  }, [branchEntry]);

  const usage = useMemo(() => {
    if (!disk) return [];
    return disk.profiles.flatMap((p) =>
      (p.project.resources ?? [])
        .filter(
          (ref) =>
            ref.kind === resourceKind &&
            ref.resource_instance_id === resourceId &&
            profileResourceBranchId(ref) === selectedBranchId
        )
        .map((ref) => ({
          profileId: p.id,
          profileName: p.name,
          enabled: ref.enabled
        }))
    );
  }, [disk, resourceKind, resourceId, selectedBranchId]);

  const isExclusiveToThisProfile =
    scope === "profile" &&
    !!profileId &&
    usage.length === 1 &&
    usage[0]?.profileId === profileId;
  const isEditable =
    scope === "global" || (profileEditMode && isExclusiveToThisProfile);
  const isShared = scope === "profile" && !isExclusiveToThisProfile;

  useEffect(() => {
    if (scope === "profile" && profileEditMode && isShared && branchEntry) {
      setProfileEditMode(false);
      setActiveTab("summary");
    }
  }, [
    branchEntry,
    isShared,
    profileEditMode,
    scope,
    setActiveTab,
    setProfileEditMode
  ]);

  useEffect(() => {
    if (scope === "profile" && activeTab === "usage") {
      setActiveTab("summary");
    }
  }, [activeTab, scope]);

  const dirty = useMemo(() => {
    if (!draft) return false;
    if (!baseline) return true;
    return JSON.stringify(draft) !== JSON.stringify(baseline);
  }, [baseline, draft]);

  useEffect(() => {
    setSyntheticDirty(tabUri, dirty);
  }, [dirty, setSyntheticDirty, tabUri]);

  useEffect(() => {
    if (save.kind !== "saved") return;
    const timer = setTimeout(() => {
      setSave((cur) => (cur.kind === "saved" ? { kind: "idle" } : cur));
    }, 1500);
    return () => clearTimeout(timer);
  }, [save]);

  useEffect(() => {
    if (profileSave.kind !== "saved") return;
    const timer = setTimeout(() => {
      setProfileSave((cur) => (cur.kind === "saved" ? { kind: "idle" } : cur));
    }, 1500);
    return () => clearTimeout(timer);
  }, [profileSave]);

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!draft || !isEditable) return false;
    setSave({ kind: "saving" });
    try {
      await ca.saveResourceBranch(resourceKind, resourceId, draft);
      setBaseline(clone(draft));
      setSave({ kind: "saved", at: Date.now() });
      return true;
    } catch (err) {
      setSave({ kind: "error", message: String(err) });
      return false;
    }
  }, [ca, draft, isEditable, resourceId, resourceKind]);

  const saveProfileProjection = useCallback(async (): Promise<boolean> => {
    if (scope !== "profile" || !profile) return false;
    setProfileSave({ kind: "saving" });
    try {
      await window.tinder.writeText(
        profile.id,
        JSON.stringify(profile.project, null, 2)
      );
      setProfileSave({ kind: "saved", at: Date.now() });
      return true;
    } catch (err) {
      setProfileSave({ kind: "error", message: String(err) });
      return false;
    }
  }, [profile, scope]);

  const runProfileProjectionWrite = useCallback(
    async (write: () => Promise<boolean>): Promise<boolean> => {
      setProfileSave({ kind: "saving" });
      try {
        const ok = await write();
        setProfileSave(
          ok
            ? { kind: "saved", at: Date.now() }
            : { kind: "error", message: "保存配置档案失败" }
        );
        return ok;
      } catch (err) {
        setProfileSave({ kind: "error", message: String(err) });
        return false;
      }
    },
    []
  );

  const requestBranchSwitch = useCallback(
    async (branchId: string) => {
      if (branchId === selectedBranchId) return;
      if (dirty) {
        const choice = await ca.dialogPickOne({
          title: "切换分支",
          placeholder: "当前分支有未保存修改",
          options: [
            { id: "save", label: "保存后切换", hint: "先保存当前分支" },
            { id: "discard", label: "放弃修改", hint: "丢弃当前草稿" },
            { id: "cancel", label: "取消", hint: "留在当前分支" }
          ],
          initialOptionId: "save"
        });
        if (!choice || choice === "cancel") return;
        if (choice === "save") {
          const ok = await handleSave();
          if (!ok) return;
        }
      }
      if (scope === "profile") {
        await runProfileProjectionWrite(() =>
          ca.setProfileResourceBranch(
            profileId ?? "",
            resourceKind,
            resourceId,
            branchId
          )
        );
      } else {
        setGlobalBranchId(branchId);
      }
    },
    [
      ca,
      dirty,
      handleSave,
      profileId,
      resourceId,
      resourceKind,
      runProfileProjectionWrite,
      scope,
      selectedBranchId
    ]
  );

  useEffect(() => {
    if (scope !== "global") return;
    if (lastInitialBranchIdRef.current === initialBranchId) return;
    lastInitialBranchIdRef.current = initialBranchId;
    void requestBranchSwitch(initialBranchId);
  }, [initialBranchId, requestBranchSwitch, scope]);

  useEffect(() => {
    const saveCurrentView = () =>
      scope === "profile" && !profileEditMode
        ? saveProfileProjection()
        : handleSave();
    return registerSyntheticSave(tabUri, saveCurrentView);
  }, [
    handleSave,
    profileEditMode,
    registerSyntheticSave,
    saveProfileProjection,
    scope,
    tabUri
  ]);

  const openGlobal = () => {
    if (!familyEntry) return;
    openResourceBranch({
      scope: "global",
      resourceKind,
      resourceId,
      branchId: selectedBranchId,
      displayName: familyEntry.family.display_name
    });
  };

  const requestProfileEdit = () => {
    if (scope !== "profile") return;
    if (isShared) {
      setSharedEditDialogOpen(true);
      return;
    }
    setProfileEditMode(true);
    setActiveTab("summary");
  };

  const createProfileBranchAndEdit = async () => {
    const newBranchId = await ca.createProfileBranchFromCurrent(
      profileId ?? "",
      resourceKind,
      resourceId
    );
    if (newBranchId) {
      setSharedEditDialogOpen(false);
      setProfileEditMode(true);
      setActiveTab("summary");
    }
  };

  const openGlobalFromSharedEditDialog = () => {
    setSharedEditDialogOpen(false);
    openGlobal();
  };

  const exitProfileEdit = async () => {
    if (!dirty) {
      setProfileEditMode(false);
      setActiveTab("summary");
      return;
    }
    const choice = await ca.dialogPickOne({
      title: "退出编辑",
      placeholder: "当前分支有未保存修改。",
      options: [
        { id: "save", label: "保存并退出", hint: "保存当前分支修改" },
        { id: "discard", label: "放弃修改", hint: "恢复到上次保存状态" },
        { id: "cancel", label: "取消", hint: "继续编辑" }
      ],
      initialOptionId: "save"
    });
    if (choice === "save") {
      const ok = await handleSave();
      if (!ok) return;
    } else if (choice === "discard") {
      if (baseline) setDraft(clone(baseline));
    } else {
      return;
    }
    setProfileEditMode(false);
    setActiveTab("summary");
  };

  const copyCurrentBranch = async () => {
    const newBranchId = await ca.createResourceBranchFromSource(
      resourceKind,
      resourceId,
      selectedBranchId
    );
    if (newBranchId && scope === "global") {
      setGlobalBranchId(newBranchId);
    }
  };

  const deleteCurrentBranch = async () => {
    const remaining = familyEntry?.branches
      .map((entry) => entry.branch.branch_id)
      .filter((branchId) => branchId !== selectedBranchId);
    const ok = await ca.deleteResourceBranch(
      resourceKind,
      resourceId,
      selectedBranchId
    );
    if (ok && scope === "global" && remaining && remaining.length > 0) {
      setGlobalBranchId(remaining[0]!);
    }
  };

  const createBranchFromCurrent = async () => {
    const trimmed = newBranchName.trim();
    if (!trimmed) return;
    const newBranchId = await ca.createResourceBranchFromSource(
      resourceKind,
      resourceId,
      selectedBranchId,
      { mode: newBranchMode, displayName: trimmed }
    );
    if (!newBranchId) return;
    setNewBranchDialogOpen(false);
    if (scope === "profile") {
      const ok = await runProfileProjectionWrite(() =>
        ca.setProfileResourceBranch(
          profileId ?? "",
          resourceKind,
          resourceId,
          newBranchId
        )
      );
      if (!ok) return;
      setProfileEditMode(true);
      setActiveTab("summary");
    } else {
      setGlobalBranchId(newBranchId);
    }
  };

  const openNewBranchDialog = () => {
    setNewBranchMode("copy");
    setNewBranchName(`${draft?.display_name ?? "新分支"} 副本`);
    setNewBranchDialogOpen(true);
  };

  const setProfileEffectiveCandidate = useCallback(
    (
      nodeId: string,
      candidateId: string | null | undefined
    ) => {
      void runProfileProjectionWrite(() =>
        ca.setProfileStandardEffectiveCandidate(
          profileId ?? "",
          resourceId,
          nodeId,
          candidateId
        )
      );
    },
    [ca, profileId, resourceId, runProfileProjectionWrite]
  );

  const visibleSaveStatus: SaveState =
    scope === "profile" && !profileEditMode ? { kind: "idle" } : save;

  if (!disk || !familyEntry || !draft || !branchEntry) {
    return (
      <div className="chain-editor-empty">
        <p className="sidebar-hint">未找到计算实例分支数据。</p>
      </div>
    );
  }

  const editorResource = branchToComputeResourceV2(
    familyEntry.family,
    draft
  );
  const branchSourcePath = branchEntry.branchDir;

  const patchBranch = (next: ComputeResourceBranch) => {
    if (!isEditable) return;
    setDraft(next);
  };

  const patchEditorResource = (next: ComputeResourceV2) => {
    if (!isEditable) return;
    setDraft((cur) =>
      cur ? resourceToBranch(next, cur, selectedVariantId) : cur
    );
  };

  const patchImpl = (patch: Partial<ComputeResourceBranch["implementation"]>) => {
    if (!isEditable) return;
    setDraft((cur) =>
      cur
        ? {
            ...cur,
            implementation: { ...cur.implementation, ...patch }
          }
        : cur
    );
  };

  return (
    <div className="chain-editor">
      <nav className="resource-editor-tabs">
        <div className="resource-branch-nav-title">
          <button
            type="button"
            className="resource-branch-selector"
            onClick={(event) =>
              branchMenu.open(event, [
                {
                  id: "branch-menu-title",
                  label: "分支选择",
                  disabled: true
                },
                { separator: true },
                ...familyEntry.branches.map((entry) => ({
                  id: entry.branch.branch_id,
                  label: entry.branch.display_name,
                  hint: entry.branch.branch_id,
                  disabled: entry.branch.branch_id === selectedBranchId,
                  run: () => void requestBranchSwitch(entry.branch.branch_id)
                })),
                ...(scope === "global"
                  ? [
                      { separator: true as const },
                      {
                        id: "create",
                        label: "新增分支…",
                        hint: "选择创建方式",
                        disabled: dirty,
                        run: openNewBranchDialog
                      }
                    ]
                  : [])
              ])
            }
            title={dirty ? "请先保存或重置当前分支" : "切换或新增分支"}
          >
            <span>{draft.display_name}</span>
            <span className="codicon codicon-chevron-down" aria-hidden="true" />
          </button>
        </div>
        {scope === "profile" && !profileEditMode ? (
          <span className="resource-editor-tab is-active">资源摘要</span>
        ) : (
          <>
            <TabButton
              active={activeTab === "summary"}
              onClick={() => setActiveTab("summary")}
            >
              分支设置
            </TabButton>
            <TabButton
              active={activeTab === "capability"}
              onClick={() => setActiveTab("capability")}
              disabled={!isEditable}
            >
              计算节点设置
            </TabButton>
            {scope === "global" && (
              <TabButton
                active={activeTab === "usage"}
                onClick={() => setActiveTab("usage")}
              >
                使用位置
              </TabButton>
            )}
          </>
        )}
        <div className="resource-editor-tabs-spacer" />
        <SaveStatusBadge status={visibleSaveStatus} />
        {scope === "profile" && (
          <>
            {!profileEditMode && (
              <button
                type="button"
                className="chain-editor-action-btn"
                onClick={() => void saveProfileProjection()}
                disabled={profileSave.kind === "saving"}
                title={
                  profileSave.kind === "error"
                    ? profileSave.message
                    : "保存当前配置档案投影设置"
                }
              >
                {profileSave.kind === "saving"
                  ? "保存中"
                  : profileSave.kind === "saved"
                    ? "已保存"
                    : profileSave.kind === "error"
                      ? "保存失败"
                    : "保存档案"}
              </button>
            )}
            <button
              type="button"
              className="chain-editor-action-btn"
              onClick={() =>
                profileEditMode
                  ? void exitProfileEdit()
                  : requestProfileEdit()
              }
              title={
                profileEditMode
                  ? "退出分支内容编辑"
                  : "编辑分支内容、实现代码或计算节点定义"
              }
            >
              {profileEditMode ? "退出编辑" : "编辑分支"}
            </button>
            <button
              type="button"
              className="chain-editor-action-btn"
              onClick={openGlobal}
              title="跳转到计算实例全局分支视图"
            >
              跳转至计算实例
            </button>
          </>
        )}
        {(scope === "global" || profileEditMode) && (
          <>
          <button
            type="button"
            className="chain-editor-action-btn"
            onClick={() => baseline && setDraft(clone(baseline))}
            disabled={!dirty}
          >
            重置
          </button>
          <button
            type="button"
            className="chain-editor-action-btn is-primary"
            onClick={() => void handleSave()}
            disabled={!dirty || !isEditable || save.kind === "saving"}
            title={!isEditable ? "共享分支需先创建当前配置档案分支" : "保存分支"}
            aria-label="保存分支"
          >
            保存
          </button>
          </>
        )}
      </nav>

      <div className="resource-editor-body-split">
        <div className="resource-editor-body">
          {scope === "profile" && !profileEditMode && (
            <ProfileReadonlySummary
              profileName={profile?.name ?? null}
              resourceId={resourceId}
              resourceKind={resourceKind}
              draft={draft}
              branchSourcePath={branchSourcePath}
              effectiveCandidateOverrides={
                slotRef?.kind === "standard"
                  ? slotRef.overrides?.effective_candidates
                  : undefined
              }
              onSetEffectiveCandidate={setProfileEffectiveCandidate}
            />
          )}
          {(scope !== "profile" || profileEditMode) && activeTab === "summary" && (
            <SummaryTab
              scope={scope}
              profileName={profile?.name ?? null}
              resourceId={resourceId}
              resourceKind={resourceKind}
              selectedBranchId={selectedBranchId}
              draft={draft}
              branchSourcePath={branchSourcePath}
              usageCount={usage.length}
              isEditable={isEditable}
              dirty={dirty}
              scopeIsGlobal={scope === "global"}
              showUsageCount={scope === "global"}
              onPatch={patchBranch}
              onPatchImpl={patchImpl}
              onCopyGlobalBranch={() => void copyCurrentBranch()}
              onDeleteGlobalBranch={() => void deleteCurrentBranch()}
            />
          )}
          {activeTab === "capability" &&
            isEditable &&
            (editorResource.resource_kind === "standard" ? (
              <StandardCapabilityTab
                draft={editorResource as StandardComputeResource}
                selectedVariantId={selectedVariantId}
                onSelectVariant={setSelectedVariantId}
                patch={(next) => patchEditorResource(next)}
                sourcePath={branchSourcePath}
                onOpenFile={(absolutePath, position) =>
                  void openFile(
                    absolutePath,
                    position ? { position } : undefined
                  )
                }
                onOpenDocsForNode={(nodeId) => openHelpDoc(nodeId)}
                lockVariantManagement
              />
            ) : (
              <CustomCapabilityTab
                draft={editorResource as CustomComputeResource}
                patch={(next) => patchEditorResource(next)}
                sourcePath={branchSourcePath}
                onOpenFile={(absolutePath, position) =>
                  void openFile(
                    absolutePath,
                    position ? { position } : undefined
                  )
                }
              />
            ))}
          {scope === "global" && activeTab === "usage" && (
            <UsageTab usage={usage} />
          )}
        </div>
      </div>
      {branchMenu.state && (
        <ContextMenu
          x={branchMenu.state.x}
          y={branchMenu.state.y}
          items={branchMenu.state.items}
          onClose={branchMenu.close}
        />
      )}
      {sharedEditDialogOpen && (
        <SharedBranchEditDialog
          onCreate={() => void createProfileBranchAndEdit()}
          onOpenGlobal={openGlobalFromSharedEditDialog}
          onCancel={() => setSharedEditDialogOpen(false)}
        />
      )}
      {newBranchDialogOpen && (
        <NewBranchDialog
          name={newBranchName}
          mode={newBranchMode}
          onNameChange={setNewBranchName}
          onModeChange={setNewBranchMode}
          onCancel={() => setNewBranchDialogOpen(false)}
          onConfirm={() => void createBranchFromCurrent()}
        />
      )}
    </div>
  );
}

function ProfileReadonlySummary({
  profileName,
  resourceId,
  resourceKind,
  draft,
  branchSourcePath,
  effectiveCandidateOverrides,
  onSetEffectiveCandidate
}: {
  profileName: string | null;
  resourceId: string;
  resourceKind: "standard" | "custom";
  draft: ComputeResourceBranch;
  branchSourcePath: string;
  effectiveCandidateOverrides?: Record<string, string | null>;
  onSetEffectiveCandidate: (
    nodeId: string,
    candidateId: string | null | undefined
  ) => void;
}) {
  const statusLabel =
    STATUS_OPTIONS.find((option) => option.value === draft.status)?.label ??
    draft.status;
  const nodeNames =
    draft.resource_kind === "standard"
      ? [
          ...new Set(
            Object.keys(draft.effective_candidates).length > 0
              ? Object.keys(draft.effective_candidates)
              : draft.compute_nodes.map((node) => node.node_id)
          )
        ].map((nodeId) => CHAIN_CATALOG.nodes[nodeId]?.displayName ?? nodeId)
      : draft.custom_nodes.map((node) => node.display_name || node.node_id);
  return (
    <div className="profile-lifecycle">
      <section className="profile-lifecycle-section resource-summary-section">
        <div className="profile-lifecycle-section-body resource-summary-body">
          <div className="resource-editor-form">
            <Field label="上下文">
              配置档案 / {profileName ?? "-"}
            </Field>
            <Field label="计算实例 ID">
              <code>{resourceId}</code>
            </Field>
            <Field label="资源类型">
              {resourceKind === "standard" ? "标准" : "自定义"}
            </Field>
            <Field label="分支状态">{statusLabel}</Field>
            <Field label="分支说明">
              {draft.description?.trim() || "未填写"}
            </Field>
            <div className="resource-editor-field resource-summary-node-field">
              <span>计算节点</span>
              <div className="resource-summary-node-list">
                {nodeNames.length > 0 ? (
                  nodeNames.map((name, index) => (
                    <div
                      key={`${name}-${index}`}
                      className="resource-summary-node-row"
                    >
                      {name}
                    </div>
                  ))
                ) : (
                  <span className="sidebar-hint">未配置</span>
                )}
              </div>
            </div>
            {draft.resource_kind === "standard" && (
              <ProfileEffectiveCandidateTable
                branch={draft}
                overrides={effectiveCandidateOverrides}
                onChange={onSetEffectiveCandidate}
              />
            )}
            <Field label="实现类型">{draft.implementation.kind}</Field>
            <Field label="运行产物">
              {draft.implementation.runtime_artifact.path || "未设置"}
            </Field>
            <Field label="源码位置">
              <code>{branchSourcePath}</code>
            </Field>
          </div>
        </div>
      </section>
    </div>
  );
}

function candidateIdFor(
  nodeId: string,
  index: number,
  candidate: StandardComputeResourceBranch["compute_nodes"][number],
  groupSize: number
): string {
  return candidate.candidate_id ?? (groupSize === 1 ? nodeId : `${nodeId}#${index}`);
}

function ProfileEffectiveCandidateTable({
  branch,
  overrides,
  onChange
}: {
  branch: StandardComputeResourceBranch;
  overrides?: Record<string, string | null>;
  onChange: (nodeId: string, candidateId: string | null | undefined) => void;
}) {
  const candidatesByNode = new Map<
    string,
    StandardComputeResourceBranch["compute_nodes"]
  >();
  for (const candidate of branch.compute_nodes) {
    const list = candidatesByNode.get(candidate.node_id) ?? [];
    list.push(candidate);
    candidatesByNode.set(candidate.node_id, list);
  }
  if (candidatesByNode.size === 0) return null;
  return (
    <div className="resource-editor-field resource-summary-node-field">
      <span>生效方法</span>
      <table className="resource-editor-files-table">
        <thead>
          <tr>
            <th>标准链路</th>
            <th>方法</th>
          </tr>
        </thead>
        <tbody>
          {[...candidatesByNode.entries()].map(([nodeId, group]) => {
            const isBindable = isResourceBindableChainNode(nodeId);
            const hasOverride = Object.prototype.hasOwnProperty.call(
              overrides ?? {},
              nodeId
            );
            const branchDefault = branch.effective_candidates[nodeId] ?? "";
            const value = hasOverride
              ? overrides?.[nodeId] ?? ""
              : branchDefault;
            return (
              <tr key={nodeId}>
                <td title={chainNodeUiNotice(nodeId)}>
                  {CHAIN_CATALOG.nodes[nodeId]?.displayName ?? nodeId}
                  {!isBindable && (
                    <>
                      <br />
                      <span className="sidebar-hint">
                        {chainNodeUiTags(nodeId)[0] ?? "内建结构节点"}
                      </span>
                    </>
                  )}
                </td>
                <td>
                  {!isBindable ? (
                    <span className="sidebar-hint">不可在档案中选择</span>
                  ) : (
                  <select
                    className="resource-editor-input"
                    value={value}
                    onChange={(event) => {
                      const next = event.target.value;
                      if (next === branchDefault) {
                        onChange(nodeId, undefined);
                      } else if (!next) {
                        onChange(nodeId, null);
                      } else {
                        onChange(nodeId, next);
                      }
                    }}
                  >
                    <option value="">无</option>
                    {group.map((candidate, index) => {
                      const candidateId = candidateIdFor(
                        nodeId,
                        index,
                        candidate,
                        group.length
                      );
                      const statusTail =
                        candidate.status && candidate.status !== "active"
                          ? ` · ${candidate.status}`
                          : "";
                      return (
                        <option key={candidateId} value={candidateId}>
                          {(candidate.display_name || candidateId) + statusTail}
                        </option>
                      );
                    })}
                  </select>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SummaryTab({
  scope,
  profileName,
  resourceId,
  resourceKind,
  selectedBranchId,
  draft,
  branchSourcePath,
  usageCount,
  isEditable,
  dirty,
  scopeIsGlobal,
  showUsageCount,
  onPatch,
  onPatchImpl,
  onCopyGlobalBranch,
  onDeleteGlobalBranch
}: {
  scope: "profile" | "global";
  profileName: string | null;
  resourceId: string;
  resourceKind: "standard" | "custom";
  selectedBranchId: string;
  draft: ComputeResourceBranch;
  branchSourcePath: string;
  usageCount: number;
  isEditable: boolean;
  dirty: boolean;
  scopeIsGlobal: boolean;
  showUsageCount: boolean;
  onPatch: (next: ComputeResourceBranch) => void;
  onPatchImpl: (patch: Partial<ComputeResourceBranch["implementation"]>) => void;
  onCopyGlobalBranch: () => void;
  onDeleteGlobalBranch: () => void;
}) {
  return (
    <div className="profile-lifecycle">
      <section className="profile-lifecycle-section">
        <h2>分支设置</h2>
        <div className="profile-lifecycle-section-body">
          <div className="resource-editor-form">
            <Field label="上下文">
              {scope === "profile"
                ? `配置档案 / ${profileName ?? "-"}`
                : "计算实例"}
            </Field>
            <Field label="计算实例 ID">
              <code>{resourceId}</code>
            </Field>
            <Field label="资源类型">
              {resourceKind === "standard" ? "标准" : "自定义"}
            </Field>
            <Field label="分支 ID">
              <code>{selectedBranchId}</code>
            </Field>
            <Field label="分支名称">
              <input
                className="resource-editor-input"
                value={draft.display_name}
                disabled={!isEditable}
                onChange={(event) =>
                  onPatch({ ...draft, display_name: event.target.value })
                }
              />
            </Field>
            <Field label="分支状态">
              <select
                className="resource-editor-input"
                value={draft.status}
                disabled={!isEditable}
                onChange={(event) =>
                  onPatch({
                    ...draft,
                    status: event.target.value as ComputeResourceStatus
                  })
                }
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="描述">
              <textarea
                className="resource-editor-input"
                rows={3}
                value={draft.description ?? ""}
                disabled={!isEditable}
                onChange={(event) =>
                  onPatch({ ...draft, description: event.target.value })
                }
              />
            </Field>
            <Field label="运行产物">
              <input
                className="resource-editor-input"
                value={draft.implementation.runtime_artifact.path}
                disabled={!isEditable}
                placeholder="src/main.py 或 artifact/foo.dll"
                onChange={(event) =>
                  onPatchImpl({
                    runtime_artifact: {
                      ...draft.implementation.runtime_artifact,
                      path: event.target.value
                    }
                  })
                }
              />
            </Field>
            <Field label="磁盘位置">
              <code>{branchSourcePath}</code>
            </Field>
            {showUsageCount && <Field label="使用位置">{usageCount}</Field>}
          </div>
        </div>
      </section>

      {scopeIsGlobal && (
        <section className="profile-lifecycle-section">
          <h2>分支维护</h2>
          <div className="profile-lifecycle-section-body">
            <div className="resource-editor-summary-actions">
              <button
                type="button"
                className="chain-editor-action-btn"
                onClick={onCopyGlobalBranch}
                disabled={dirty}
                title={dirty ? "请先保存或重置当前分支" : "复制当前分支"}
              >
                复制当前分支
              </button>
              <button
                type="button"
                className="chain-editor-action-btn is-danger"
                onClick={onDeleteGlobalBranch}
                disabled={dirty}
                title={dirty ? "请先保存或重置当前分支" : "删除当前分支"}
              >
                删除当前分支
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function UsageTab({
  usage
}: {
  usage: Array<{ profileId: string; profileName: string; enabled: boolean }>;
}) {
  return (
    <div className="profile-lifecycle">
      <details
        className="profile-lifecycle-section resource-editor-meta-block"
        open
      >
        <summary>使用位置 · {usage.length}</summary>
        <div className="profile-lifecycle-section-body">
          {usage.length === 0 ? (
            <p className="sidebar-hint">当前分支尚未被任何配置档案引用。</p>
          ) : (
            <table className="resource-editor-files-table">
              <thead>
                <tr>
                  <th>配置档案</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {usage.map((item) => (
                  <tr key={item.profileId}>
                    <td>{item.profileName}</td>
                    <td>{item.enabled ? "活跃" : "停用"}</td>
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

function TabButton({
  active,
  onClick,
  disabled,
  children
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
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

function SharedBranchEditDialog({
  onCreate,
  onOpenGlobal,
  onCancel
}: {
  onCreate: () => void;
  onOpenGlobal: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div
        className="modal-card shared-branch-edit-dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="shared-branch-edit-title">编辑当前分支</div>
        <p className="shared-branch-edit-message">
          当前分支还被其他配置档案或 slot 使用。配置档案只是计算实例的投影层，直接编辑会影响所有引用者。
        </p>
        <div className="shared-branch-edit-options">
          <button
            type="button"
            className="shared-branch-edit-option is-recommended"
            onClick={onCreate}
          >
            <span className="shared-branch-edit-badge">推荐</span>
            <span className="shared-branch-edit-option-title">
              创建当前配置档案分支
            </span>
            <span className="shared-branch-edit-option-desc">
              复制当前分支，只切换当前配置档案 slot 到新分支后再编辑。
            </span>
          </button>
          <button
            type="button"
            className="shared-branch-edit-option"
            onClick={onOpenGlobal}
          >
            <span className="shared-branch-edit-option-title">
              跳转至计算实例
            </span>
            <span className="shared-branch-edit-option-desc">
              在计算实例全局视图中管理共享分支。
            </span>
          </button>
        </div>
        <div className="ca-dialog-actions">
          <button type="button" className="ca-dialog-btn" onClick={onCancel}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

function NewBranchDialog({
  name,
  mode,
  onNameChange,
  onModeChange,
  onCancel,
  onConfirm
}: {
  name: string;
  mode: NewBranchMode;
  onNameChange: (value: string) => void;
  onModeChange: (value: NewBranchMode) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div
        className="modal-card resource-branch-dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="ca-dialog-title">新增分支</div>
        <label className="resource-editor-field">
          <span>分支名称</span>
          <input
            className="resource-editor-input"
            value={name}
            autoFocus
            onChange={(event) => onNameChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && name.trim()) {
                event.preventDefault();
                onConfirm();
              }
            }}
          />
        </label>
        <div className="resource-branch-create-mode" role="radiogroup">
          <button
            type="button"
            className={`resource-branch-create-option${
              mode === "copy" ? " is-selected" : ""
            }`}
            onClick={() => onModeChange("copy")}
          >
            <span>复制当前分支</span>
            <small>保留当前节点、候选和源码文件，再作为新草稿编辑。</small>
          </button>
          <button
            type="button"
            className={`resource-branch-create-option${
              mode === "blank" ? " is-selected" : ""
            }`}
            onClick={() => onModeChange("blank")}
          >
            <span>空白分支</span>
            <small>只继承实现类型，清空节点、源码文件和运行产物。</small>
          </button>
        </div>
        <div className="ca-dialog-actions">
          <button type="button" className="ca-dialog-btn" onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className="ca-dialog-btn is-primary"
            onClick={onConfirm}
            disabled={!name.trim()}
          >
            创建
          </button>
        </div>
      </div>
    </div>
  );
}

function SaveStatusBadge({ status }: { status: SaveState }) {
  if (status.kind === "saving") {
    return <span className="resource-editor-save-status">保存中...</span>;
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="resource-editor-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
