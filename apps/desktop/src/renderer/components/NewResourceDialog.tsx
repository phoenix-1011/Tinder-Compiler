import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ComputeResourceTemplate,
  ImplementationKind
} from "@tinder/nextstep";

/**
 * Multi-field modal for creating a new compute resource. Built separately
 * from the generic prompt/confirm/pickOne dialog because resource creation
 * is the only flow that needs four coordinated fields (kind, impl kind,
 * template, display name) on a single screen.
 *
 * Implementation kind is chosen here and immutable thereafter — switching
 * languages on an existing resource would orphan its already-generated
 * code files, so the editor surfaces it read-only.
 */
export interface NewResourceDialogResult {
  kind: "standard" | "custom";
  implementationKind: ImplementationKind;
  displayName: string;
  template: ComputeResourceTemplate | null;
}

export interface NewResourceDialogState {
  /** Templates available — pre-filtered by the caller for `kind`. */
  templates: ComputeResourceTemplate[];
  initialKind: "standard" | "custom";
  resolve: (value: NewResourceDialogResult | null) => void;
}

export interface NewResourceDialogApi {
  state: NewResourceDialogState | null;
  open: (params: {
    templates: ComputeResourceTemplate[];
    initialKind: "standard" | "custom";
  }) => Promise<NewResourceDialogResult | null>;
}

export function useNewResourceDialog(): NewResourceDialogApi {
  const [state, setState] = useState<NewResourceDialogState | null>(null);
  const open: NewResourceDialogApi["open"] = useCallback(
    (params) =>
      new Promise<NewResourceDialogResult | null>((resolve) => {
        setState({
          templates: params.templates,
          initialKind: params.initialKind,
          resolve: (value) => {
            setState(null);
            resolve(value);
          }
        });
      }),
    []
  );
  return { state, open };
}

const BLANK_TEMPLATE_ID = "__blank__";

export function NewResourceDialog({ state }: { state: NewResourceDialogState }) {
  const [kind, setKind] = useState<"standard" | "custom">(state.initialKind);
  const [implKind, setImplKind] = useState<ImplementationKind>("python_script");
  const [displayName, setDisplayName] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    BLANK_TEMPLATE_ID
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Whenever the kind toggle flips, drop the template selection if the
  // current pick is for the other kind. Standard resources must start
  // from a real template (the blank option is hidden), so we seed the
  // first available; custom falls back to blank.
  const availableTemplates = useMemo(
    () => state.templates.filter((t) => t.resource_kind === kind),
    [state.templates, kind]
  );
  const allowBlank = kind === "custom";
  useEffect(() => {
    if (selectedTemplateId === BLANK_TEMPLATE_ID) {
      if (!allowBlank) {
        const firstId = availableTemplates[0]?.template_id;
        if (firstId) setSelectedTemplateId(firstId);
      }
      return;
    }
    if (!availableTemplates.some((t) => t.template_id === selectedTemplateId)) {
      const fallbackId = allowBlank
        ? BLANK_TEMPLATE_ID
        : availableTemplates[0]?.template_id ?? BLANK_TEMPLATE_ID;
      setSelectedTemplateId(fallbackId);
    }
  }, [allowBlank, availableTemplates, selectedTemplateId]);

  // Template's `default_implementation_kind` seeds the impl picker but
  // does not lock it — users can still override before creation.
  useEffect(() => {
    if (selectedTemplateId === BLANK_TEMPLATE_ID) return;
    const t = availableTemplates.find(
      (t) => t.template_id === selectedTemplateId
    );
    if (t?.default_implementation_kind) {
      setImplKind(t.default_implementation_kind);
    }
  }, [availableTemplates, selectedTemplateId]);

  const builtIns = availableTemplates.filter((t) => t.source === "built_in");
  const projectOnes = availableTemplates.filter((t) => t.source === "project");

  const submit = () => {
    const trimmed = displayName.trim();
    if (!trimmed) {
      inputRef.current?.focus();
      return;
    }
    const template =
      selectedTemplateId === BLANK_TEMPLATE_ID
        ? null
        : availableTemplates.find((t) => t.template_id === selectedTemplateId) ??
          null;
    state.resolve({
      kind,
      implementationKind: implKind,
      displayName: trimmed,
      template
    });
  };
  const cancel = () => state.resolve(null);

  return (
    <div className="modal-backdrop" onMouseDown={cancel}>
      <div
        className="modal-card new-resource-card"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
      >
        <div className="ca-dialog-title">新建计算实例</div>

        <div className="new-resource-row">
          <div className="new-resource-field">
            <label className="resource-editor-label">
              资源类型
              <span className="new-resource-required" aria-hidden="true">
                *
              </span>
            </label>
            <div className="new-resource-kind-toggle">
              <KindToggleButton
                active={kind === "standard"}
                onClick={() => setKind("standard")}
              >
                标准
              </KindToggleButton>
              <KindToggleButton
                active={kind === "custom"}
                onClick={() => setKind("custom")}
              >
                自定义
              </KindToggleButton>
            </div>
          </div>

          <div className="new-resource-field">
            <label className="resource-editor-label">
              实现类型
              <span className="new-resource-required" aria-hidden="true">
                *
              </span>
            </label>
            <div className="new-resource-kind-toggle">
              <KindToggleButton
                active={implKind === "python_script"}
                onClick={() => setImplKind("python_script")}
              >
                Python 脚本
              </KindToggleButton>
              <KindToggleButton
                active={implKind === "cpp_library"}
                onClick={() => setImplKind("cpp_library")}
              >
                C++ 动态库
              </KindToggleButton>
            </div>
          </div>
        </div>

        <div className="new-resource-field">
          <label className="resource-editor-label">
            显示名
            <span className="new-resource-required" aria-hidden="true">
              *
            </span>
          </label>
          <input
            ref={inputRef}
            className="ca-dialog-input"
            value={displayName}
            placeholder="例如 主雷达 / 信号处理器"
            onChange={(e) => setDisplayName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
          />
        </div>

        <div className="new-resource-field">
          <label className="resource-editor-label">模板</label>
          <div className="new-resource-template-list">
            {allowBlank && (
              <TemplateOption
                selected={selectedTemplateId === BLANK_TEMPLATE_ID}
                onSelect={() => setSelectedTemplateId(BLANK_TEMPLATE_ID)}
                displayName="不使用模板"
                source={null}
                hint="仅创建空白草稿，不预填任何字段。"
              />
            )}
            {builtIns.length > 0 && (
              <>
                <div className="new-resource-template-group">内置模板</div>
                {builtIns.map((t) => (
                  <TemplateOption
                    key={t.template_id}
                    selected={selectedTemplateId === t.template_id}
                    onSelect={() => setSelectedTemplateId(t.template_id)}
                    displayName={t.display_name}
                    source="built_in"
                    hint={t.default_description}
                  />
                ))}
              </>
            )}
            {projectOnes.length > 0 && (
              <>
                <div className="new-resource-template-group">项目模板</div>
                {projectOnes.map((t) => (
                  <TemplateOption
                    key={t.template_id}
                    selected={selectedTemplateId === t.template_id}
                    onSelect={() => setSelectedTemplateId(t.template_id)}
                    displayName={t.display_name}
                    source="project"
                    hint={t.default_description}
                  />
                ))}
              </>
            )}
          </div>
        </div>

        <div className="ca-dialog-actions">
          <button type="button" className="ca-dialog-btn" onClick={cancel}>
            取消
          </button>
          <button
            type="button"
            className="ca-dialog-btn is-primary"
            onClick={submit}
            disabled={!displayName.trim()}
          >
            创建草稿
          </button>
        </div>
      </div>
    </div>
  );
}

function KindToggleButton({
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
      className={`new-resource-kind-btn${active ? " is-active" : ""}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function TemplateOption({
  selected,
  onSelect,
  displayName,
  source,
  hint
}: {
  selected: boolean;
  onSelect: () => void;
  displayName: string;
  source: "built_in" | "project" | null;
  hint?: string;
}) {
  return (
    <label
      className={`new-resource-template-option${selected ? " is-selected" : ""}`}
    >
      <input
        type="radio"
        name="new-resource-template"
        checked={selected}
        onChange={onSelect}
      />
      <div className="new-resource-template-meta">
        <div className="new-resource-template-name">
          {displayName}
          {source === "built_in" && (
            <span className="new-resource-template-badge">内置</span>
          )}
          {source === "project" && (
            <span className="new-resource-template-badge is-project">项目</span>
          )}
        </div>
        {hint && <div className="sidebar-hint">{hint}</div>}
      </div>
    </label>
  );
}
