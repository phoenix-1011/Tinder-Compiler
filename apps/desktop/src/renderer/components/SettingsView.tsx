import { useEffect, useState } from "react";
import type {
  AiApiProviderConfig,
  AiMode,
  AiModelPreset,
  CodexCliConfig,
  CodexStatus,
  UserAiSettings
} from "@tinder/ai";
import { useSettings } from "../state/SettingsContext";
import { useTheme } from "../state/ThemeContext";
import { useUI } from "../state/UIContext";
import { useRun } from "../state/RunContext";
import { useProject } from "../state/ProjectContext";
import { slugify } from "../state/chainAssemblyStorage";
import { AI_SETTINGS_CHANGED_EVENT } from "../state/aiContext";

interface NavItem {
  id: string;
  label: string;
  icon: string;
}

const NAV: NavItem[] = [
  { id: "appearance", label: "外观", icon: "color-mode" },
  { id: "editor", label: "编辑器", icon: "code" },
  { id: "files", label: "文件 & 保存", icon: "save" },
  { id: "ai", label: "AI", icon: "sparkle" },
  { id: "keybindings", label: "快捷键", icon: "keyboard" }
];

export function SettingsView() {
  const { settings, update, reset } = useSettings();
  const { current: themeId, themes, setTheme } = useTheme();
  const { closeSettings } = useUI();
  const [section, setSection] = useState<string>("appearance");

  return (
    <div className="settings-page">
      <div className="settings-page-header">
        <h1>设置</h1>
        <button
          className="settings-close"
          title="关闭设置"
          onClick={closeSettings}
          aria-label="关闭设置"
        >
          <span className="codicon codicon-close" />
        </button>
      </div>

      <div className="settings-page-body">
        <nav className="settings-nav">
          {NAV.map((item) => (
            <button
              key={item.id}
              className={`settings-nav-item${section === item.id ? " is-active" : ""}`}
              onClick={() => setSection(item.id)}
            >
              <span className={`codicon codicon-${item.icon}`} />
              <span>{item.label}</span>
            </button>
          ))}
          <div className="settings-nav-spacer" />
          <button className="settings-nav-item settings-reset" onClick={reset}>
            <span className="codicon codicon-discard" />
            <span>恢复默认</span>
          </button>
        </nav>

        <div className="settings-content">
          {section === "appearance" && (
            <Section title="外观" hint="主题与视觉细节">
              <Field label="颜色主题">
                <select
                  className="settings-select"
                  value={themeId}
                  onChange={(e) => setTheme(e.target.value)}
                >
                  {themes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </Field>
            </Section>
          )}

          {section === "editor" && (
            <Section title="编辑器" hint="字体、缩进、视觉提示">
              <Field label="字体族">
                <input
                  type="text"
                  className="settings-input"
                  value={settings.fontFamily}
                  onChange={(e) => update("fontFamily", e.target.value)}
                />
              </Field>
              <Field label="字号" hint="单位：px">
                <input
                  type="number"
                  className="settings-input settings-input-narrow"
                  min={8}
                  max={72}
                  value={settings.fontSize}
                  onChange={(e) => update("fontSize", parseInt(e.target.value, 10) || 13)}
                />
              </Field>
              <Field label="Tab 宽度">
                <input
                  type="number"
                  className="settings-input settings-input-narrow"
                  min={1}
                  max={16}
                  value={settings.tabSize}
                  onChange={(e) => update("tabSize", parseInt(e.target.value, 10) || 2)}
                />
              </Field>
              <Field label="Tab 插入空格">
                <Toggle
                  value={settings.insertSpaces}
                  onChange={(v) => update("insertSpaces", v)}
                />
              </Field>
              <Field label="自动换行">
                <select
                  className="settings-select"
                  value={settings.wordWrap}
                  onChange={(e) => update("wordWrap", e.target.value as "on" | "off")}
                >
                  <option value="off">关闭</option>
                  <option value="on">开启</option>
                </select>
              </Field>
              <Field label="行号">
                <select
                  className="settings-select"
                  value={settings.lineNumbers}
                  onChange={(e) =>
                    update("lineNumbers", e.target.value as "on" | "off" | "relative")
                  }
                >
                  <option value="on">显示</option>
                  <option value="off">隐藏</option>
                  <option value="relative">相对</option>
                </select>
              </Field>
              <Field label="缩略图（minimap）">
                <Toggle value={settings.minimap} onChange={(v) => update("minimap", v)} />
              </Field>
              <Field label="显示空白字符">
                <select
                  className="settings-select"
                  value={settings.renderWhitespace}
                  onChange={(e) =>
                    update(
                      "renderWhitespace",
                      e.target.value as "none" | "boundary" | "selection" | "all"
                    )
                  }
                >
                  <option value="none">不显示</option>
                  <option value="boundary">行尾/缩进</option>
                  <option value="selection">仅选中区</option>
                  <option value="all">全部</option>
                </select>
              </Field>
              <Field label="光标动画">
                <select
                  className="settings-select"
                  value={settings.cursorBlinking}
                  onChange={(e) =>
                    update(
                      "cursorBlinking",
                      e.target.value as "blink" | "smooth" | "phase" | "expand" | "solid"
                    )
                  }
                >
                  <option value="blink">闪烁</option>
                  <option value="smooth">平滑</option>
                  <option value="phase">渐隐</option>
                  <option value="expand">展开</option>
                  <option value="solid">不闪烁</option>
                </select>
              </Field>
            </Section>
          )}

          {section === "files" && (
            <Section title="文件 & 保存" hint="保存行为与项目配置">
              <Field label="保存时格式化">
                <Toggle
                  value={settings.formatOnSave}
                  onChange={(v) => update("formatOnSave", v)}
                />
              </Field>
              <Field label="自动保存">
                <select
                  className="settings-select"
                  value={settings.autoSave}
                  onChange={(e) => update("autoSave", e.target.value as "off" | "afterDelay")}
                >
                  <option value="off">关闭</option>
                  <option value="afterDelay">延时后</option>
                </select>
              </Field>
              {settings.autoSave === "afterDelay" && (
                <Field label="自动保存延时" hint="毫秒">
                  <input
                    type="number"
                    className="settings-input settings-input-narrow"
                    min={200}
                    max={10000}
                    step={100}
                    value={settings.autoSaveDelayMs}
                    onChange={(e) =>
                      update("autoSaveDelayMs", parseInt(e.target.value, 10) || 1000)
                    }
                  />
                </Field>
              )}
            </Section>
          )}

          {section === "keybindings" && <KeybindingsSection />}
          {section === "ai" && <AiSettingsSection />}
        </div>
      </div>
    </div>
  );
}

interface AddModelForm {
  backend: "api" | "codex";
  name: string;
  providerName: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  reasoningLabel: string;
  reasoningEffort: string;
  defaultMode: AiMode;
  codexCommand: string;
  codexProfile: string;
  codexSandbox: CodexCliConfig["sandbox"];
  codexApprovalPolicy: NonNullable<CodexCliConfig["approvalPolicy"]>;
}

const EMPTY_AI_FORM: AddModelForm = {
  backend: "api",
  name: "",
  providerName: "",
  baseUrl: "",
  apiKey: "",
  model: "",
  reasoningLabel: "high",
  reasoningEffort: "high",
  defaultMode: "chat",
  codexCommand: "codex",
  codexProfile: "",
  codexSandbox: "read-only",
  codexApprovalPolicy: "on-request"
};

const API_SUPPORTED_MODES: AiMode[] = ["chat", "plan", "auto"];
const CODEX_SUPPORTED_MODES: AiMode[] = ["chat", "auto", "plan", "debug"];
const CODEX_SANDBOX_OPTIONS: CodexCliConfig["sandbox"][] = [
  "read-only",
  "workspace-write",
  "danger-full-access"
];
const CODEX_APPROVAL_OPTIONS: NonNullable<CodexCliConfig["approvalPolicy"]>[] = [
  "on-request",
  "never"
];

function supportedModesForBackend(backend: AddModelForm["backend"]): AiMode[] {
  return backend === "api" ? API_SUPPORTED_MODES : CODEX_SUPPORTED_MODES;
}

function clampMode(mode: AiMode, supportedModes: AiMode[]): AiMode {
  return supportedModes.includes(mode) ? mode : supportedModes[0] ?? "chat";
}

function uniqueId(label: string, existingIds: Iterable<string>): string {
  const existing = new Set(existingIds);
  const base = slugify(label);
  if (!existing.has(base)) return base;
  for (let index = 2; ; index += 1) {
    const candidate = `${base}-${index}`;
    if (!existing.has(candidate)) return candidate;
  }
}

function emitAiSettingsChanged(): void {
  window.dispatchEvent(new Event(AI_SETTINGS_CHANGED_EVENT));
}

function AiSettingsSection() {
  const { showPanel } = useUI();
  const { start } = useRun();
  const project = useProject();
  const [settings, setSettings] = useState<UserAiSettings | null>(null);
  const [codex, setCodex] = useState<CodexStatus | null>(null);
  const [codexCommand, setCodexCommand] = useState("codex");
  const [form, setForm] = useState<AddModelForm>(EMPTY_AI_FORM);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = async (options?: { probeCodex?: boolean }) => {
    setError(null);
    try {
      const nextSettings = await window.tinder.ai.readSettings();
      const defaultCodexConfig =
        nextSettings.codexConfigs.find((config) => config.id === "codex-default") ??
        nextSettings.codexConfigs[0];
      const command = defaultCodexConfig?.command?.trim() || "codex";
      setSettings(nextSettings);
      setCodexCommand(command);
      if (options?.probeCodex) {
        // Probing spawns codex child processes (up to ~10s on timeout), so it
        // must not gate the settings display and only runs when asked for.
        void window.tinder.ai
          .codexStatus(command)
          .then(setCodex)
          .catch((err) => setError((err as Error).message ?? String(err)));
      }
    } catch (err) {
      setError((err as Error).message ?? String(err));
    }
  };

  useEffect(() => {
    void reload({ probeCodex: true });
  }, []);

  const updateForm = <K extends keyof AddModelForm>(key: K, value: AddModelForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateBackend = (backend: AddModelForm["backend"]) => {
    if (editingPresetId) return;
    setForm((prev) => ({
      ...prev,
      backend,
      defaultMode: clampMode(prev.defaultMode, supportedModesForBackend(backend)),
      codexCommand: backend === "codex" ? codexCommand : prev.codexCommand
    }));
  };

  const cancelEdit = () => {
    setEditingPresetId(null);
    setForm(EMPTY_AI_FORM);
    setMessage(null);
    setError(null);
  };

  const editPreset = (preset: AiModelPreset) => {
    if (!settings) return;
    if (preset.backend === "api") {
      const provider = settings.providers.find((item) => item.id === preset.providerId);
      setForm({
        backend: "api",
        name: preset.label,
        providerName: provider?.label ?? "",
        baseUrl: provider?.baseUrl ?? "",
        apiKey: "",
        model: preset.model ?? preset.reasoning?.api?.model ?? "",
        reasoningLabel: preset.reasoning?.label ?? "high",
        reasoningEffort: preset.reasoning?.api?.reasoningEffort ?? preset.reasoning?.label ?? "high",
        defaultMode: clampMode(preset.defaultMode ?? "chat", API_SUPPORTED_MODES),
        codexCommand: "codex",
        codexProfile: "",
        codexSandbox: "read-only",
        codexApprovalPolicy: "on-request"
      });
    } else {
      const config = settings.codexConfigs.find((item) => item.id === preset.codexConfigId);
      setForm({
        backend: "codex",
        name: preset.label,
        providerName: "",
        baseUrl: "",
        apiKey: "",
        model: preset.model ?? config?.model ?? "",
        reasoningLabel: preset.reasoning?.label ?? "high",
        reasoningEffort:
          preset.reasoning?.codex?.modelReasoningEffort ??
          config?.modelReasoningEffort ??
          preset.reasoning?.label ??
          "high",
        defaultMode: clampMode(preset.defaultMode ?? "plan", CODEX_SUPPORTED_MODES),
        codexCommand: config?.command ?? "codex",
        codexProfile: preset.reasoning?.codex?.profile ?? config?.profile ?? "",
        codexSandbox: config?.sandbox ?? "read-only",
        codexApprovalPolicy: config?.approvalPolicy ?? "on-request"
      });
    }
    setEditingPresetId(preset.id);
    setMessage(`Editing ${preset.label}. Leave API Key blank to keep the existing key.`);
    setError(null);
  };

  const saveModel = async () => {
    if (!settings) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const currentSettings = await window.tinder.ai.readSettings();
      const label = form.name.trim() || form.model.trim() || "Untitled Model";
      const model = form.model.trim();
      const reasoningLabel = form.reasoningLabel.trim() || "high";
      const reasoningEffort = form.reasoningEffort.trim() || reasoningLabel;
      const supportedModes = supportedModesForBackend(form.backend);
      const defaultMode = clampMode(form.defaultMode, supportedModes);
      const next: UserAiSettings = {
        ...currentSettings,
        providers: [...currentSettings.providers],
        codexConfigs: [...currentSettings.codexConfigs],
        modelPresets: [...currentSettings.modelPresets]
      };
      const editingPreset = editingPresetId
        ? next.modelPresets.find((preset) => preset.id === editingPresetId)
        : null;

      if (form.backend === "api") {
        if (!form.baseUrl.trim()) throw new Error("Base URL is required");
        if (!model) throw new Error("Model ID is required");
        const providerLabel = form.providerName.trim() || `${label} Provider`;
        const existingProvider =
          editingPreset?.backend === "api"
            ? next.providers.find((provider) => provider.id === editingPreset.providerId)
            : undefined;
        const providerId =
          existingProvider?.id ??
          uniqueId(
            providerLabel,
            next.providers.map((provider) => provider.id)
          );
        let apiKeySource = existingProvider?.apiKeySource;
        const existingStoredSecretId =
          existingProvider?.apiKeySource?.kind === "stored"
            ? existingProvider.apiKeySource.secretId
            : undefined;
        if (form.apiKey.trim()) {
          const saved = await window.tinder.ai.saveSecret({
            secretId: existingStoredSecretId,
            label: providerLabel,
            value: form.apiKey.trim()
          });
          apiKeySource = { kind: "stored", secretId: saved.secretId };
        }
        const provider: AiApiProviderConfig = {
          id: providerId,
          label: providerLabel,
          kind: "openai-compatible",
          baseUrl: form.baseUrl.trim(),
          apiKeySource
        };
        const providerIdx = next.providers.findIndex((item) => item.id === providerId);
        if (providerIdx >= 0) next.providers[providerIdx] = provider;
        else next.providers.push(provider);
        const preset: AiModelPreset = {
          id:
            editingPreset?.id ??
            uniqueId(
              label,
              next.modelPresets.map((preset) => preset.id)
            ),
          label,
          backend: "api",
          providerId,
          model,
          reasoning: {
            label: reasoningLabel,
            displayName: reasoningLabel,
            api: { model, reasoningEffort }
          },
          supportedModes,
          defaultMode,
          advanced: {}
        };
        const presetIdx = next.modelPresets.findIndex((item) => item.id === preset.id);
        if (presetIdx >= 0) next.modelPresets[presetIdx] = preset;
        else next.modelPresets.push(preset);
        next.defaultModelPresetId = next.defaultModelPresetId ?? preset.id;
      } else {
        const command = form.codexCommand.trim() || "codex";
        const profile = form.codexProfile.trim() || undefined;
        if (form.codexSandbox !== "read-only") {
          throw new Error("Only read-only Codex sandbox is enabled in this phase.");
        }
        const existingConfig =
          editingPreset?.backend === "codex"
            ? next.codexConfigs.find((config) => config.id === editingPreset.codexConfigId)
            : undefined;
        const codexConfigId =
          existingConfig?.id ??
          uniqueId(
            `codex-${label}`,
            next.codexConfigs.map((config) => config.id)
          );
        const codexConfig = {
          id: codexConfigId,
          label,
          command,
          profile,
          model: model || undefined,
          modelReasoningEffort: reasoningEffort,
          sandbox: form.codexSandbox,
          approvalPolicy: form.codexApprovalPolicy
        };
        const configIdx = next.codexConfigs.findIndex((item) => item.id === codexConfigId);
        if (configIdx >= 0) next.codexConfigs[configIdx] = codexConfig;
        else next.codexConfigs.push(codexConfig);
        const preset: AiModelPreset = {
          id:
            editingPreset?.id ??
            uniqueId(
              label,
              next.modelPresets.map((preset) => preset.id)
            ),
          label,
          backend: "codex",
          codexConfigId,
          model: model || undefined,
          reasoning: {
            label: reasoningLabel,
            displayName: reasoningLabel,
            codex: {
              model: model || undefined,
              profile,
              modelReasoningEffort: reasoningEffort
            }
          },
          supportedModes,
          defaultMode
        };
        const presetIdx = next.modelPresets.findIndex((item) => item.id === preset.id);
        if (presetIdx >= 0) next.modelPresets[presetIdx] = preset;
        else next.modelPresets.push(preset);
        next.defaultModelPresetId = next.defaultModelPresetId ?? preset.id;
      }

      await window.tinder.ai.writeSettings(next);
      await reload();
      emitAiSettingsChanged();
      setForm(EMPTY_AI_FORM);
      setEditingPresetId(null);
      setMessage(editingPresetId ? "Model preset updated." : "Model preset added.");
    } catch (err) {
      setError((err as Error).message ?? String(err));
    } finally {
      setBusy(false);
    }
  };

  const deletePreset = async (presetId: string) => {
    if (!settings) return;
    const preset = settings.modelPresets.find((item) => item.id === presetId);
    if (!preset) return;
    if (preset.id === "codex-readonly-high") {
      setError("The built-in Codex preset cannot be deleted.");
      return;
    }
    if (!window.confirm(`Delete model preset "${preset.label}"?`)) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const currentSettings = await window.tinder.ai.readSettings();
      const currentPreset = currentSettings.modelPresets.find((item) => item.id === presetId);
      const nextPresets = currentSettings.modelPresets.filter((item) => item.id !== presetId);
      const nextCodexConfigs =
        currentPreset?.backend === "codex" && currentPreset.codexConfigId
          ? currentSettings.codexConfigs.filter(
              (config) =>
                config.id !== currentPreset.codexConfigId ||
                nextPresets.some((item) => item.codexConfigId === config.id)
            )
          : currentSettings.codexConfigs;
      const shouldClearProjectDefault = project.config.aiModelPresetId === presetId;
      const next: UserAiSettings = {
        ...currentSettings,
        modelPresets: nextPresets,
        codexConfigs: nextCodexConfigs,
        defaultModelPresetId:
          currentSettings.defaultModelPresetId === presetId
            ? nextPresets[0]?.id
            : currentSettings.defaultModelPresetId
      };
      if (shouldClearProjectDefault) {
        const ok = await project.save({
          ...project.config,
          aiModelPresetId: undefined,
          aiMode: project.config.aiMode
        });
        if (!ok) throw new Error("Failed to clear the deleted preset from project defaults");
      }
      await window.tinder.ai.writeSettings(next);
      await reload();
      emitAiSettingsChanged();
      if (editingPresetId === presetId) cancelEdit();
      setMessage(
        shouldClearProjectDefault
          ? "Model preset deleted and project default cleared."
          : "Model preset deleted."
      );
    } catch (err) {
      setError((err as Error).message ?? String(err));
    } finally {
      setBusy(false);
    }
  };

  const deleteProvider = async (providerId: string) => {
    if (!settings) return;
    const provider = settings.providers.find((item) => item.id === providerId);
    if (!provider) return;
    if (settings.modelPresets.some((preset) => preset.providerId === providerId)) {
      setError("Delete or edit presets that use this provider before deleting the provider.");
      return;
    }
    if (!window.confirm(`Delete provider "${provider.label}"?`)) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const currentSettings = await window.tinder.ai.readSettings();
      const currentProvider = currentSettings.providers.find((item) => item.id === providerId);
      await window.tinder.ai.writeSettings({
        ...currentSettings,
        providers: currentSettings.providers.filter((item) => item.id !== providerId)
      });
      if (currentProvider?.apiKeySource?.kind === "stored") {
        await window.tinder.ai.deleteSecret(currentProvider.apiKeySource.secretId);
      }
      await reload();
      emitAiSettingsChanged();
      setMessage("Provider deleted.");
    } catch (err) {
      setError((err as Error).message ?? String(err));
    } finally {
      setBusy(false);
    }
  };

  const clearProviderKey = async (providerId: string) => {
    if (!settings) return;
    const provider = settings.providers.find((item) => item.id === providerId);
    if (!provider?.apiKeySource) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const currentSettings = await window.tinder.ai.readSettings();
      const currentProvider = currentSettings.providers.find((item) => item.id === providerId);
      await window.tinder.ai.writeSettings({
        ...currentSettings,
        providers: currentSettings.providers.map((item) =>
          item.id === providerId ? { ...item, apiKeySource: undefined } : item
        )
      });
      if (currentProvider?.apiKeySource?.kind === "stored") {
        await window.tinder.ai.deleteSecret(currentProvider.apiKeySource.secretId);
      }
      await reload();
      emitAiSettingsChanged();
      setMessage("Provider key reference cleared.");
    } catch (err) {
      setError((err as Error).message ?? String(err));
    } finally {
      setBusy(false);
    }
  };

  const testProvider = async (providerId: string) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await window.tinder.ai.testProvider(providerId);
      setMessage(`${result.ok ? "OK" : "Failed"}: ${result.message}`);
    } catch (err) {
      setError((err as Error).message ?? String(err));
    } finally {
      setBusy(false);
    }
  };

  const saveCodexCommand = async () => {
    if (!settings) return;
    const command = codexCommand.trim();
    if (!command) {
      setError("Codex command is required.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const currentSettings = await window.tinder.ai.readSettings();
      const existingDefault =
        currentSettings.codexConfigs.find((config) => config.id === "codex-default") ??
        currentSettings.codexConfigs[0];
      const nextConfigs = existingDefault
        ? currentSettings.codexConfigs.map((config) =>
            config.id === existingDefault.id ? { ...config, command } : config
          )
        : [
            {
              id: "codex-default",
              label: "Codex",
              command,
              sandbox: "read-only" as const,
              approvalPolicy: "on-request" as const
            }
          ];
      await window.tinder.ai.writeSettings({
        ...currentSettings,
        codexConfigs: nextConfigs
      });
      await reload({ probeCodex: true });
      emitAiSettingsChanged();
      setMessage("Codex command saved.");
    } catch (err) {
      setError((err as Error).message ?? String(err));
    } finally {
      setBusy(false);
    }
  };

  const startCodexLogin = async (deviceAuth = false) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const command = codexCommand.trim() || "codex";
      showPanel();
      await start({
        command,
        args: deviceAuth ? ["login", "--device-auth"] : ["login"],
        label: deviceAuth ? "codex login --device-auth" : "codex login"
      });
      setMessage(
        deviceAuth
          ? "Started Codex device-code login in the run panel."
          : "Started Codex login in the run panel."
      );
    } catch (err) {
      setError((err as Error).message ?? String(err));
    } finally {
      setBusy(false);
    }
  };

  const saveProjectAiDefaults = async (patch: { presetId?: string; mode?: AiMode }) => {
    if (!settings) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const presetId = patch.presetId ?? project.config.aiModelPresetId;
      const preset = settings.modelPresets.find((item) => item.id === presetId);
      const supportedModes = preset?.supportedModes?.length
        ? preset.supportedModes
        : CODEX_SUPPORTED_MODES;
      const mode = clampMode(patch.mode ?? project.config.aiMode ?? "chat", supportedModes);
      const ok = await project.save({
        ...project.config,
        aiModelPresetId: presetId || undefined,
        aiMode: mode
      });
      setMessage(ok ? "Project AI defaults saved." : "No project folder is open.");
    } catch (err) {
      setError((err as Error).message ?? String(err));
    } finally {
      setBusy(false);
    }
  };

  const defaultModeOptions = supportedModesForBackend(form.backend);
  const projectPreset = settings?.modelPresets.find(
    (preset) => preset.id === project.config.aiModelPresetId
  );
  const projectModeOptions = projectPreset?.supportedModes?.length
    ? projectPreset.supportedModes
    : CODEX_SUPPORTED_MODES;

  return (
    <Section title="AI" hint="Providers, model presets, API keys, and Codex status">
      <div className="settings-help">
        {error && <p className="settings-help-error">{error}</p>}
        {message && <p className="settings-hint">{message}</p>}
      </div>

      <div className="settings-section-title">
        {editingPresetId ? "Edit Model" : "Add Model"}
      </div>
      <Field label="Backend">
        <select
          className="settings-select"
          value={form.backend}
          disabled={Boolean(editingPresetId)}
          onChange={(e) => updateBackend(e.target.value as "api" | "codex")}
        >
          <option value="api">Custom API</option>
          <option value="codex">Codex</option>
        </select>
      </Field>
      <Field label="Name">
        <input
          className="settings-input"
          value={form.name}
          onChange={(e) => updateForm("name", e.target.value)}
          placeholder="GPT-5.5 High"
        />
      </Field>
      {form.backend === "api" && (
        <>
          <Field label="Provider">
            <input
              className="settings-input"
              value={form.providerName}
              onChange={(e) => updateForm("providerName", e.target.value)}
              placeholder="Office Gateway"
            />
          </Field>
          <Field label="Base URL">
            <input
              className="settings-input"
              value={form.baseUrl}
              onChange={(e) => updateForm("baseUrl", e.target.value)}
              placeholder="http://localhost:8000/v1"
            />
          </Field>
          <Field label="API Key">
            <input
              className="settings-input"
              type="password"
              value={form.apiKey}
              onChange={(e) => updateForm("apiKey", e.target.value)}
              placeholder="Stored with Electron safeStorage"
            />
          </Field>
        </>
      )}
      {form.backend === "codex" && (
        <>
          <Field label="Command">
            <input
              className="settings-input"
              value={form.codexCommand}
              onChange={(e) => updateForm("codexCommand", e.target.value)}
              placeholder="codex or an absolute path to codex.cmd"
            />
          </Field>
          <Field label="Profile">
            <input
              className="settings-input settings-input-narrow"
              value={form.codexProfile}
              onChange={(e) => updateForm("codexProfile", e.target.value)}
              placeholder="optional"
            />
          </Field>
          <Field label="Sandbox">
            <select
              className="settings-select"
              value={form.codexSandbox}
              onChange={(e) =>
                updateForm("codexSandbox", e.target.value as CodexCliConfig["sandbox"])
              }
            >
              {CODEX_SANDBOX_OPTIONS.map((item) => (
                <option key={item} value={item} disabled={item !== "read-only"}>
                  {item}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Approval">
            <select
              className="settings-select"
              value={form.codexApprovalPolicy}
              onChange={(e) =>
                updateForm(
                  "codexApprovalPolicy",
                  e.target.value as NonNullable<CodexCliConfig["approvalPolicy"]>
                )
              }
            >
              {CODEX_APPROVAL_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </Field>
        </>
      )}
      <Field label="Model ID">
        <input
          className="settings-input"
          value={form.model}
          onChange={(e) => updateForm("model", e.target.value)}
          placeholder={form.backend === "codex" ? "optional" : "model-id"}
        />
      </Field>
      <Field label="Reasoning Label">
        <input
          className="settings-input settings-input-narrow"
          value={form.reasoningLabel}
          onChange={(e) => updateForm("reasoningLabel", e.target.value)}
        />
      </Field>
      <Field label="Reasoning Mapping">
        <input
          className="settings-input settings-input-narrow"
          value={form.reasoningEffort}
          onChange={(e) => updateForm("reasoningEffort", e.target.value)}
        />
      </Field>
      <Field label="Default Mode">
        <select
          className="settings-select"
          value={clampMode(form.defaultMode, defaultModeOptions)}
          onChange={(e) => updateForm("defaultMode", e.target.value as AiMode)}
        >
          {defaultModeOptions.map((mode) => (
            <option key={mode} value={mode}>
              {mode}
            </option>
          ))}
        </select>
      </Field>
      <div className="settings-inline-actions">
        <button className="primary-button" disabled={busy} onClick={saveModel}>
          {editingPresetId ? "Save Model" : "Add Model"}
        </button>
        {editingPresetId && (
          <button className="secondary-button" disabled={busy} onClick={cancelEdit}>
            Cancel Edit
          </button>
        )}
      </div>

      <div className="settings-section-title">Model Presets</div>
      <div className="settings-help">
        {(settings?.modelPresets ?? []).map((preset) => (
          <div className="settings-ai-row" key={preset.id}>
            <span>
              <code>{preset.label}</code> {preset.backend} {preset.defaultMode ?? ""}
            </span>
            <span className="settings-inline-actions">
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => editPreset(preset)}
              >
                Edit
              </button>
              <button
                className="secondary-button"
                disabled={busy || preset.id === "codex-readonly-high"}
                onClick={() => void deletePreset(preset.id)}
              >
                Delete
              </button>
            </span>
          </div>
        ))}
      </div>

      <div className="settings-section-title">Providers</div>
      <div className="settings-help">
        {(settings?.providers ?? []).length === 0 && <p>No custom API providers.</p>}
        {(settings?.providers ?? []).map((provider) => (
          <div className="settings-ai-row" key={provider.id}>
            <span>
              <code>{provider.label}</code> {provider.baseUrl}
            </span>
            <span className="settings-inline-actions">
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => void testProvider(provider.id)}
              >
                Test
              </button>
              <button
                className="secondary-button"
                disabled={busy || !provider.apiKeySource}
                onClick={() => void clearProviderKey(provider.id)}
              >
                Clear Key
              </button>
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => void deleteProvider(provider.id)}
              >
                Delete
              </button>
            </span>
          </div>
        ))}
      </div>

      <div className="settings-section-title">Project Defaults</div>
      <Field label="Model Preset">
        <select
          className="settings-select"
          value={project.config.aiModelPresetId ?? ""}
          onChange={(event) => void saveProjectAiDefaults({ presetId: event.target.value })}
        >
          <option value="">Use user default</option>
          {(settings?.modelPresets ?? []).map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Mode">
        <select
          className="settings-select"
          value={clampMode(project.config.aiMode ?? "chat", projectModeOptions)}
          onChange={(event) => void saveProjectAiDefaults({ mode: event.target.value as AiMode })}
        >
          {projectModeOptions.map((mode) => (
            <option key={mode} value={mode}>
              {mode}
            </option>
          ))}
        </select>
      </Field>

      <div className="settings-section-title">Codex</div>
      <div className="settings-help">
        <Field label="Command">
          <input
            className="settings-input"
            value={codexCommand}
            onChange={(event) => setCodexCommand(event.target.value)}
            placeholder="codex or an absolute path to codex.exe"
          />
        </Field>
        <p>Status: {codex?.status ?? "unknown"}</p>
        {codex?.version && <p>Version: {codex.version}</p>}
        {codex?.message && <p>{codex.message}</p>}
        <div className="settings-inline-actions">
          <button className="secondary-button" disabled={busy} onClick={() => void saveCodexCommand()}>
            Save Command
          </button>
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => void reload({ probeCodex: true })}
          >
            Refresh Codex
          </button>
          <button className="primary-button" disabled={busy} onClick={() => void startCodexLogin()}>
            Login
          </button>
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => void startCodexLogin(true)}
          >
            Device Code
          </button>
        </div>
      </div>
    </Section>
  );
}

function KeybindingsSection() {
  const [path, setPath] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openInEditor = async () => {
    setBusy(true);
    setError(null);
    try {
      const target = await window.tinder.userKeybindings.openForEditing();
      setPath(target);
    } catch (err) {
      setError((err as Error).message ?? String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="快捷键" hint="可在用户键绑定文件中覆盖默认绑定">
      <div className="settings-help">
        <p>
          Tinder 内置一组与 VS Code 习惯一致的快捷键。如需自定义，可编辑用户级
          <code>keybindings.json</code>，其格式与 VS Code 相同：
        </p>
        <pre className="settings-snippet">{`[
  { "key": "ctrl+k ctrl+s", "command": "file.saveAll" },
  { "key": "ctrl+;", "command": "view.togglePanel" }
]`}</pre>
        <button className="primary-button" disabled={busy} onClick={openInEditor}>
          打开 keybindings.json
        </button>
        {path && (
          <p className="settings-hint settings-help-path">已加载：{path}</p>
        )}
        {error && <p className="settings-help-error">{error}</p>}
      </div>
    </Section>
  );
}

function Section({
  title,
  hint,
  children
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <h2>{title}</h2>
        {hint && <p>{hint}</p>}
      </div>
      <div className="settings-section-body">{children}</div>
    </div>
  );
}

function Field({
  label,
  hint,
  children
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="settings-field">
      <div className="settings-label">
        <span>{label}</span>
        {hint && <span className="settings-hint">{hint}</span>}
      </div>
      <div className="settings-control">{children}</div>
    </label>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange(v: boolean): void }) {
  return (
    <button
      type="button"
      className={`settings-toggle${value ? " is-on" : ""}`}
      onClick={() => onChange(!value)}
      aria-pressed={value}
    >
      <span className="settings-toggle-knob" />
    </button>
  );
}
