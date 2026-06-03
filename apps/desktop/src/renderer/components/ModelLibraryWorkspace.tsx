import { useState, useCallback, useMemo } from "react";
import type {
  ModelFamily,
  ModelVersion,
  ModelObjectKind,
  ModelParameterField,
  ModelParameterValueType,
  PlatformEquipmentMount
} from "@tinder/nextstep";
import { childCategories, isValidModelId, isValidVersion, modelObjectKey } from "@tinder/nextstep";
import { useModelLibrary } from "../state/ModelLibraryContext";
import { useWorkspace } from "../state/WorkspaceContext";

// ─────────────────────────────────────────────────────────────────────────────
// New Family dialog
// ─────────────────────────────────────────────────────────────────────────────

function NewFamilyDialog({
  onSubmit,
  onCancel,
  objectKind,
  categoryCode,
  existingModelIds
}: {
  onSubmit: (displayName: string, modelId: string) => void;
  onCancel: () => void;
  objectKind: ModelObjectKind;
  categoryCode: string | null;
  existingModelIds: Set<string>;
}) {
  const [suffix, setSuffix] = useState("");
  const [displayName, setDisplayName] = useState("");
  const normalizedSuffix = suffix.trim();
  const modelId = `${categoryCode ?? ""}${normalizedSuffix}`;
  const isDuplicate = existingModelIds.has(modelId);
  const canSubmit =
    !!categoryCode &&
    !!normalizedSuffix &&
    !!displayName.trim() &&
    isValidModelId(modelId) &&
    !isDuplicate;
  const submit = () => {
    if (!canSubmit) return;
    onSubmit(displayName.trim(), modelId);
  };
  return (
    <div className="ml-dialog-overlay" onClick={onCancel}>
      <div className="ca-dialog-card" onClick={(e) => e.stopPropagation()}>
        <div className="ca-dialog-title">
          新建{objectKind === "platform_model" ? "平台" : "设备"}型号
        </div>
        {categoryCode && (
          <div className="ml-dialog-hint">
            型号编号: <code>{modelId || categoryCode}</code>
          </div>
        )}
        <label className="ml-form-label">
          <span>编号后缀</span>
          <input
            className="ca-dialog-input"
            placeholder="只输入分类码后的数字"
            value={suffix}
            onChange={(e) => setSuffix(e.target.value.replace(/\D/g, ""))}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") onCancel();
            }}
          />
        </label>
        {isDuplicate && (
          <div className="ml-form-error">型号编号已存在</div>
        )}
        <label className="ml-form-label">
          <span>型号名称</span>
          <input
            className="ca-dialog-input"
            placeholder="例如 空警-500"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") onCancel();
            }}
          />
        </label>
        <div className="ca-dialog-actions">
          <button className="ca-dialog-btn" onClick={onCancel}>
            取消
          </button>
          <button
            className="ca-dialog-btn is-primary"
            disabled={!canSubmit}
            onClick={submit}
          >
            创建
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// New Version dialog
// ─────────────────────────────────────────────────────────────────────────────

function NewVersionDialog({
  defaultModelId,
  existingObjectKeys,
  onSubmit,
  onCancel
}: {
  defaultModelId: string;
  existingObjectKeys: Set<string>;
  onSubmit: (modelId: string, version: string) => void;
  onCancel: () => void;
}) {
  const modelId = defaultModelId;
  const [version, setVersion] = useState("1.0.0");
  const idValid = isValidModelId(modelId);
  const versionValid = isValidVersion(version);
  const objectKey = modelObjectKey(modelId, version);
  const duplicate = existingObjectKeys.has(objectKey);

  return (
    <div className="ml-dialog-overlay" onClick={onCancel}>
      <div className="ca-dialog-card" onClick={(e) => e.stopPropagation()}>
        <div className="ca-dialog-title">新建版本</div>
        <label className="ml-form-label">
          <span>具体型号 ID</span>
          <input
            className="ca-dialog-input"
            placeholder="如 3011101001"
            value={modelId}
            readOnly
          />
          {modelId && !idValid && (
            <span className="ml-form-error">不得包含下划线</span>
          )}
        </label>
        <label className="ml-form-label">
          <span>版本</span>
          <input
            className="ca-dialog-input"
            placeholder="1.0.0"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && idValid && versionValid && !duplicate) onSubmit(modelId, version);
              if (e.key === "Escape") onCancel();
            }}
          />
          {version && !versionValid && (
            <span className="ml-form-error">格式必须为 x.x.x</span>
          )}
        </label>
        <div className="ml-form-preview">
          object_key: <code>{objectKey || "—"}</code>
        </div>
        {duplicate && <span className="ml-form-error">该版本已存在</span>}
        <div className="ca-dialog-actions">
          <button className="ca-dialog-btn" onClick={onCancel}>
            取消
          </button>
          <button
            className="ca-dialog-btn is-primary"
            disabled={!idValid || !versionValid || duplicate}
            onClick={() => onSubmit(modelId, version)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && idValid && versionValid && !duplicate) onSubmit(modelId, version);
            }}
          >
            创建
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Version detail panel
// ─────────────────────────────────────────────────────────────────────────────

const MODEL_PARAMETER_TYPES: ModelParameterValueType[] = [
  "string",
  "bool",
  "int",
  "double"
];

function nextParameterFieldKey(fields: ModelParameterField[]): string {
  const used = new Set(fields.map((field) => field.field_key));
  let index = fields.length + 1;
  while (used.has(`parameter_${index}`)) index += 1;
  return `parameter_${index}`;
}

function VersionDetail({ version }: { version: ModelVersion }) {
  const {
    addParameterField,
    updateParameterField,
    removeParameterField,
    versionMounts,
    versionReferenceCount
  } = useModelLibrary();
  const mounts = versionMounts(version.object_key);
  const refCount = versionReferenceCount(version.object_key);
  const addInlineField = useCallback(() => {
    const fieldKey = nextParameterFieldKey(version.parameter_fields);
    addParameterField(version.object_key, {
      field_key: fieldKey,
      display_name: "",
      value_type: "string",
      required: false,
      value_range: "",
      unit: "",
      default_value: "",
      description: ""
    });
  }, [addParameterField, version.object_key, version.parameter_fields]);

  return (
    <div className="ml-version-detail">
      <div className="ml-detail-header">
        <div className="ml-detail-title">
          {version.display_name || version.model_id}
        </div>
        <div className="ml-detail-meta">
          <span>model_id: <code>{version.model_id}</code></span>
          <span>version: <code>{version.version}</code></span>
          <span>object_key: <code>{version.object_key}</code></span>
          {refCount > 0 && <span>引用: {refCount}</span>}
        </div>
      </div>

      <div className="ml-detail-section">
        <div className="ml-detail-section-header">
          <span>参数字段</span>
          <button
            className="ca-action-btn"
            title="新建字段"
            onClick={addInlineField}
          >
            <span className="codicon codicon-add" aria-hidden="true" />
          </button>
        </div>
        {version.parameter_fields.length === 0 ? (
          <div className="ml-detail-empty">暂无参数字段</div>
        ) : (
          <table className="ml-table ml-parameter-table">
            <thead>
              <tr>
                <th>参数名称</th>
                <th>别名</th>
                <th>数据类型</th>
                <th>数据范围</th>
                <th>数据值/默认值</th>
                <th>数据单位</th>
                <th>描述</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {version.parameter_fields.map((f, index) => (
                <tr key={`${index}:${f.field_key}`}>
                  <td>
                    <input
                      className="ml-table-input"
                      value={f.field_key}
                      onChange={(event) =>
                        updateParameterField(version.object_key, f.field_key, {
                          field_key: event.target.value
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="ml-table-input"
                      value={f.display_name}
                      onChange={(event) =>
                        updateParameterField(version.object_key, f.field_key, {
                          display_name: event.target.value
                        })
                      }
                    />
                  </td>
                  <td>
                    <select
                      className="ml-table-input"
                      value={f.value_type}
                      onChange={(event) =>
                        updateParameterField(version.object_key, f.field_key, {
                          value_type: event.target.value as ModelParameterValueType
                        })
                      }
                    >
                      {MODEL_PARAMETER_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className="ml-table-input"
                      value={f.value_range ?? ""}
                      onChange={(event) =>
                        updateParameterField(version.object_key, f.field_key, {
                          value_range: event.target.value
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="ml-table-input"
                      value={f.default_value ?? ""}
                      onChange={(event) =>
                        updateParameterField(version.object_key, f.field_key, {
                          default_value: event.target.value
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="ml-table-input"
                      value={f.unit ?? ""}
                      onChange={(event) =>
                        updateParameterField(version.object_key, f.field_key, {
                          unit: event.target.value
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="ml-table-input"
                      value={f.description ?? ""}
                      onChange={(event) =>
                        updateParameterField(version.object_key, f.field_key, {
                          description: event.target.value
                        })
                      }
                    />
                  </td>
                  <td>
                    <button
                      className="ca-dialog-btn is-destructive ml-table-delete-btn"
                      title="删除"
                      onClick={() =>
                        removeParameterField(version.object_key, f.field_key)
                      }
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

      {version.configurations && version.configurations.length > 0 && (
        <div className="ml-detail-section">
          <div className="ml-detail-section-header">
            <span>配置模板</span>
          </div>
          <table className="ml-table">
            <thead>
              <tr>
                <th>配置名称</th>
                <th>描述</th>
              </tr>
            </thead>
            <tbody>
              {version.configurations.map((c) => (
                <tr key={c.config_id}>
                  <td>{c.display_name}</td>
                  <td>{c.description ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {mounts.length > 0 && (
        <div className="ml-detail-section">
          <div className="ml-detail-section-header">
            <span>搭载关系</span>
          </div>
          <table className="ml-table">
            <thead>
              <tr>
                <th>槽位</th>
                <th>名称</th>
                <th>基数</th>
                <th>必需</th>
                <th>允许设备</th>
              </tr>
            </thead>
            <tbody>
              {mounts.map((m) => (
                <tr key={m.mount_id}>
                  <td><code>{m.slot_id}</code></td>
                  <td>{m.display_name}</td>
                  <td>{m.cardinality === "single" ? "单" : "多"}</td>
                  <td>{m.required ? "是" : "否"}</td>
                  <td>{m.allowed_equipment_object_keys.join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Family detail panel
// ─────────────────────────────────────────────────────────────────────────────

function FamilyDetail({ family }: { family: ModelFamily }) {
  const {
    familyVersions,
    categoryForId,
    selectedVersionKey,
    setSelectedVersionKey,
    addVersion,
    deleteVersion,
    deleteFamily,
    versionForKey,
    versionReferenceCount
  } = useModelLibrary();
  const { openModelLibraryVersion, closeModelLibraryTab } = useWorkspace();
  const [showVersionDialog, setShowVersionDialog] = useState(false);
  const versions = familyVersions(family.family_id);
  const selectedVersion = selectedVersionKey ? versionForKey(selectedVersionKey) : null;
  const category = categoryForId(family.category_id);

  return (
    <div className="ml-family-detail">
      <div className="ml-detail-header">
        <div className="ml-detail-title">
          {family.display_name}
        </div>
        <div className="ml-detail-meta">
          <span>family_id: <code>{family.family_id}</code></span>
          {family.model_id && <span>model_id: <code>{family.model_id}</code></span>}
          <span>分类: {category?.display_name ?? family.category_id}</span>
          <span>类型: {family.object_kind === "platform_model" ? "平台" : "设备"}</span>
          {family.country && <span>国别: {family.country}</span>}
        </div>
        <div className="ml-detail-actions">
          {versions.length === 0 && (
            <button
              className="ca-dialog-btn is-destructive"
              onClick={() => {
                if (deleteFamily(family.family_id)) {
                  closeModelLibraryTab(`model-library://family/${family.family_id}`);
                }
              }}
            >
              删除型号
            </button>
          )}
        </div>
      </div>

      <div className="ml-detail-section">
        <div className="ml-detail-section-header">
          <span>版本 ({versions.length})</span>
          <button
            className="ca-action-btn"
            title="新建版本"
            onClick={() => setShowVersionDialog(true)}
          >
            <span className="codicon codicon-add" aria-hidden="true" />
          </button>
        </div>
        {versions.length === 0 ? (
          <div className="ml-detail-empty">暂无版本。点击 + 创建第一个版本。</div>
        ) : (
          <table className="ml-table ml-table-clickable">
            <thead>
              <tr>
                <th>model_id</th>
                <th>版本</th>
                <th>object_key</th>
                <th>参数</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr
                  key={v.object_key}
                  className={selectedVersionKey === v.object_key ? "is-active" : ""}
                  onClick={() => setSelectedVersionKey(v.object_key)}
                  onDoubleClick={() =>
                    openModelLibraryVersion({
                      objectKey: v.object_key,
                      displayName: v.display_name || v.object_key
                    })
                  }
                >
                  <td><code>{v.model_id}</code></td>
                  <td>{v.version}</td>
                  <td><code>{v.object_key}</code></td>
                  <td>{v.parameter_fields.length}</td>
                  <td>
                    {versionReferenceCount(v.object_key) === 0 && (
                      <button
                        className="ca-action-btn"
                        title="删除版本"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (deleteVersion(v.object_key)) {
                            closeModelLibraryTab(`model-library://version/${v.object_key}`);
                          }
                        }}
                      >
                        <span className="codicon codicon-trash" aria-hidden="true" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedVersion && <VersionDetail version={selectedVersion} />}

      {showVersionDialog && (
        <NewVersionDialog
          defaultModelId={family.model_id}
          existingObjectKeys={new Set(versions.map((v) => v.object_key))}
          onSubmit={(modelId, version) => {
            const v = addVersion(family.family_id, modelId, version);
            if (!v) return;
            setSelectedVersionKey(v.object_key);
            setShowVersionDialog(false);
            openModelLibraryVersion({
              objectKey: v.object_key,
              displayName: v.display_name || v.object_key
            });
          }}
          onCancel={() => setShowVersionDialog(false)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main workspace
// ─────────────────────────────────────────────────────────────────────────────

export function ModelLibraryWorkspace() {
  const {
    index,
    filterKind,
    selectedCategoryId,
    setSelectedCategoryId,
    selectedFamilyId,
    setSelectedFamilyId,
    setSelectedVersionKey,
    searchQuery,
    setSearchQuery,
    filteredFamilies,
    familyForId,
    categoryForId,
    addFamily,
    familyVersions
  } = useModelLibrary();
  const { openModelLibraryFamily, setActiveModelLibraryTab } = useWorkspace();
  const [showNewFamilyDialog, setShowNewFamilyDialog] = useState(false);

  const families = filteredFamilies();
  const existingModelIds = useMemo(
    () => new Set(index.families.map((family) => family.model_id)),
    [index.families]
  );
  const selectedFamily = selectedFamilyId ? familyForId(selectedFamilyId) : null;
  const selectedCategory = selectedCategoryId ? categoryForId(selectedCategoryId) : null;
  const selectedCategoryIsLeaf = selectedCategory
    ? childCategories(index.categories, selectedCategory.category_id).length === 0
    : false;
  const selectedLeafCategoryId =
    selectedCategoryId && selectedCategoryIsLeaf ? selectedCategoryId : null;
  const canCreateFamily = Boolean(selectedLeafCategoryId);

  const effectiveKind: ModelObjectKind | null = filterKind ?? null;
  const goHome = useCallback(() => {
    setActiveModelLibraryTab(null);
    setSelectedCategoryId(null);
    setSelectedFamilyId(null);
    setSelectedVersionKey(null);
    setSearchQuery("");
  }, [
    setActiveModelLibraryTab,
    setSelectedCategoryId,
    setSelectedFamilyId,
    setSelectedVersionKey,
    setSearchQuery
  ]);

  return (
    <div className="ml-workspace">
      <div className="ml-workspace-header">
        <div className="ml-workspace-header-left">
          <span className="ml-workspace-title">
            {selectedCategory
              ? `${selectedCategory.category_code} ${selectedCategory.display_name}`
              : "全部模型"}
          </span>
          <span className="ml-workspace-count">
            {families.length} 项
          </span>
        </div>
        <div className="ml-workspace-header-right">
          <button
            type="button"
            className="ca-dialog-btn ml-home-btn"
            onClick={goHome}
            title="返回模型库主页"
          >
            主页
          </button>
          <input
            className="sidebar-input ml-search-input"
            placeholder="搜索型号名称、ID 或别名..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {canCreateFamily && (
            <button
              className="ca-dialog-btn is-primary"
              onClick={() => setShowNewFamilyDialog(true)}
              title="新建型号"
            >
              <span className="codicon codicon-add" aria-hidden="true" />
              <span>新建型号</span>
            </button>
          )}
        </div>
      </div>

      <div className="ml-workspace-body">
        {selectedFamily ? (
          <div className="ml-split">
            <div className="ml-split-list">
              <table className="ml-table ml-table-clickable">
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>编号</th>
                    <th>类型</th>
                    <th>版本数</th>
                  </tr>
                </thead>
                <tbody>
                  {families.map((f) => (
                    <tr
                      key={f.family_id}
                      className={selectedFamilyId === f.family_id ? "is-active" : ""}
                      onClick={() => {
                        setSelectedFamilyId(f.family_id);
                        setSelectedVersionKey(null);
                      }}
                      onDoubleClick={() =>
                        openModelLibraryFamily({
                          familyId: f.family_id,
                          displayName: f.display_name
                        })
                      }
                    >
                      <td>{f.display_name}</td>
                      <td>{f.model_id ? <code>{f.model_id}</code> : "-"}</td>
                      <td>{f.object_kind === "platform_model" ? "平台" : "设备"}</td>
                      <td>{familyVersions(f.family_id).length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="ml-split-detail">
              <FamilyDetail family={selectedFamily} />
            </div>
          </div>
        ) : families.length === 0 ? (
          <div className="ml-empty">
            <span className="codicon codicon-database" aria-hidden="true" />
            <p>
              {selectedCategoryId
                ? "该分类下暂无型号。点击「新建型号」创建。"
                : "请在左侧选择一个分类以查看型号，或搜索全部模型。"}
            </p>
          </div>
        ) : (
          <table className="ml-table ml-table-full ml-table-clickable">
            <thead>
              <tr>
                <th>名称</th>
                <th>编号</th>
                <th>类型</th>
                <th>分类</th>
                <th>版本数</th>
              </tr>
            </thead>
            <tbody>
              {families.map((f) => {
                const cat = categoryForId(f.category_id);
                return (
                  <tr
                    key={f.family_id}
                    onClick={() => {
                      setSelectedCategoryId(f.category_id);
                      setSelectedFamilyId(f.family_id);
                      setSelectedVersionKey(null);
                    }}
                  >
                    <td>{f.display_name}</td>
                    <td>{f.model_id ? <code>{f.model_id}</code> : "-"}</td>
                    <td>{f.object_kind === "platform_model" ? "平台" : "设备"}</td>
                    <td>{cat ? `${cat.category_code} ${cat.display_name}` : f.category_id}</td>
                    <td>{familyVersions(f.family_id).length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showNewFamilyDialog && selectedLeafCategoryId && (
        <NewFamilyDialog
          objectKind={effectiveKind ?? "platform_model"}
          categoryCode={selectedCategory?.category_code ?? selectedLeafCategoryId}
          existingModelIds={existingModelIds}
          onSubmit={(name, modelId) => {
            const family = addFamily(
              effectiveKind ?? "platform_model",
              selectedLeafCategoryId,
              name,
              modelId
            );
            if (!family) return;
            setSelectedFamilyId(family.family_id);
            setShowNewFamilyDialog(false);
          }}
          onCancel={() => setShowNewFamilyDialog(false)}
        />
      )}
    </div>
  );
}
