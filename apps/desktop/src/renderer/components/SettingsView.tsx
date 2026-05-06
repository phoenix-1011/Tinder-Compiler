import { useState } from "react";
import { useSettings } from "../state/SettingsContext";
import { useTheme } from "../state/ThemeContext";
import { useUI } from "../state/UIContext";

interface NavItem {
  id: string;
  label: string;
  icon: string;
}

const NAV: NavItem[] = [
  { id: "appearance", label: "外观", icon: "color-mode" },
  { id: "editor", label: "编辑器", icon: "code" },
  { id: "files", label: "文件 & 保存", icon: "save" },
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
        </div>
      </div>
    </div>
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
