import * as monaco from "monaco-editor";
import darkPlus from "../themes/dark_plus.json";
import darkVs from "../themes/dark_vs.json";
import darkModern from "../themes/dark_modern.json";
import lightVs from "../themes/light_vs.json";
import lightPlus from "../themes/light_plus.json";
import lightModern from "../themes/light_modern.json";
import lightMatlab from "../themes/light_matlab.json";

interface RawTheme {
  name?: string;
  include?: string;
  tokenColors?: Array<{
    name?: string;
    scope?: string | string[];
    settings: { foreground?: string; background?: string; fontStyle?: string };
  }>;
  colors?: Record<string, string>;
}

export interface ThemeDefinition {
  /** Stable id used by Monaco's `setTheme`. */
  id: string;
  /** Display name shown in the picker. */
  label: string;
  /** Whether the theme is dark or light overall — drives sidebar/panel CSS. */
  variant: "dark" | "light";
  /** Monaco base theme to inherit from. */
  base: monaco.editor.BuiltinTheme;
  /** Source files (applied in order — earlier files act as the "include" base). */
  sources: RawTheme[];
}

export const THEMES: ThemeDefinition[] = [
  {
    id: "tinder-dark-plus",
    label: "Dark+ (默认)",
    variant: "dark",
    base: "vs-dark",
    sources: [darkVs as RawTheme, darkPlus as RawTheme]
  },
  {
    id: "tinder-dark-modern",
    label: "Dark Modern",
    variant: "dark",
    base: "vs-dark",
    sources: [darkModern as RawTheme]
  },
  {
    id: "tinder-light-modern",
    label: "Light Modern",
    variant: "light",
    base: "vs",
    sources: [lightVs as RawTheme, lightPlus as RawTheme, lightModern as RawTheme]
  },
  {
    id: "tinder-light-matlab",
    label: "Light MATLAB",
    variant: "light",
    base: "vs",
    sources: [lightVs as RawTheme, lightPlus as RawTheme, lightMatlab as RawTheme]
  }
];

export const DEFAULT_THEME_ID = "tinder-dark-plus";

function normaliseColor(hex: string | undefined): string | undefined {
  if (!hex) return undefined;
  // Monaco's editor colors don't accept 8-digit hex — strip the alpha. The
  // workbench CSS variable mapping keeps the alpha because CSS does support it.
  const m = hex.match(/^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/);
  if (m) return `#${m[1]}`;
  return hex;
}

function toMonacoRules(themes: RawTheme[]): monaco.editor.ITokenThemeRule[] {
  const rules: monaco.editor.ITokenThemeRule[] = [];
  for (const theme of themes) {
    for (const tc of theme.tokenColors ?? []) {
      const scopes = Array.isArray(tc.scope) ? tc.scope : tc.scope ? [tc.scope] : [];
      for (const scope of scopes) {
        const trimmed = scope.trim();
        if (!trimmed) continue;
        const rule: monaco.editor.ITokenThemeRule = { token: trimmed };
        const fg = normaliseColor(tc.settings.foreground);
        const bg = normaliseColor(tc.settings.background);
        if (fg) rule.foreground = fg.replace(/^#/, "");
        if (bg) rule.background = bg.replace(/^#/, "");
        if (tc.settings.fontStyle) rule.fontStyle = tc.settings.fontStyle;
        rules.push(rule);
      }
    }
  }
  return rules;
}

function toMonacoColors(themes: RawTheme[]): Record<string, string> {
  const colors: Record<string, string> = {};
  for (const theme of themes) {
    for (const [key, raw] of Object.entries(theme.colors ?? {})) {
      const value = normaliseColor(raw);
      if (value) colors[key] = value;
    }
  }
  return colors;
}

/**
 * Mapping from VS Code theme color keys to Tinder workbench CSS variables.
 * Each entry can map a single source key to multiple target vars (e.g. when
 * a theme only sets `editor.background` we want it to drive both the editor
 * area and the welcome view background).
 */
const COLOR_VAR_MAP: Record<string, string[]> = {
  // Editor / app shell
  foreground: ["--tc-fg-default"],
  "editor.background": ["--tc-bg-app", "--tc-bg-editor", "--tc-bg-tab-active"],
  "editor.foreground": ["--tc-fg-default"],
  "editorWidget.background": ["--tc-bg-popup"],
  "editorWidget.border": ["--tc-border-popup"],

  // Title bar
  "titleBar.activeBackground": ["--tc-bg-titlebar"],
  "titleBar.activeForeground": ["--tc-fg-default"],

  // Activity bar
  "activityBar.background": ["--tc-bg-activitybar"],
  "activityBar.foreground": ["--tc-fg-strong"],
  "activityBar.inactiveForeground": ["--tc-fg-muted"],

  // Sidebar
  "sideBar.background": ["--tc-bg-sidebar"],
  "sideBar.foreground": ["--tc-fg-default"],
  "sideBarSectionHeader.background": ["--tc-bg-sidebar-header"],

  // Tabs
  "editorGroupHeader.tabsBackground": ["--tc-bg-tabs"],
  "tab.activeBackground": ["--tc-bg-tab-active"],
  "tab.inactiveBackground": ["--tc-bg-tabs"],

  // Panel (bottom)
  "panel.background": ["--tc-bg-panel"],
  "panel.border": ["--tc-border"],
  "editorGroup.border": ["--tc-border-soft"],

  // Status bar (foreground uses a dedicated var — must NOT set
  // --tc-fg-strong, because light themes can have a dark status bar
  // with white text while needing dark --tc-fg-strong everywhere else)
  "statusBar.background": ["--tc-bg-statusbar"],
  "statusBar.foreground": ["--tc-statusbar-fg"],

  // Lists / selection
  "list.hoverBackground": ["--tc-bg-hover"],
  "list.activeSelectionBackground": ["--tc-bg-active-row"],

  // Inputs / quickInput / dropdowns
  "input.background": ["--tc-bg-input"],
  "quickInput.background": ["--tc-bg-popup"],
  "dropdown.background": ["--tc-bg-input"],
  "menu.background": ["--tc-bg-popup"],
  "menu.border": ["--tc-border-popup"],

  // Accent / focus
  focusBorder: ["--tc-accent"],
  "button.background": ["--tc-bg-button", "--tc-accent"],
  "button.hoverBackground": ["--tc-accent-hover"],
  "textLink.foreground": ["--tc-fg-link"],
  "descriptionForeground": ["--tc-fg-muted"],

  // Diagnostics
  "errorForeground": ["--tc-fg-error"],
  "editorWarning.foreground": ["--tc-fg-warn"]
};

/** Apply a theme's colors object to Tinder's workbench CSS variables. */
function applyWorkbenchColors(colors: Record<string, string>, variant: "dark" | "light"): void {
  const root = document.documentElement;
  // Reset first so a sparse light theme falls back to its base theme's defaults.
  for (const vars of Object.values(COLOR_VAR_MAP)) {
    for (const v of vars) root.style.removeProperty(v);
  }
  for (const [key, vars] of Object.entries(COLOR_VAR_MAP)) {
    const value = colors[key];
    if (!value) continue;
    for (const v of vars) root.style.setProperty(v, value);
  }
  // Variant flag drives a few CSS overrides (scrollbar tint, semi-transparent
  // hovers etc.) that aren't covered by the keyed mapping.
  root.dataset.themeVariant = variant;

  // Sync OS-drawn title bar overlay buttons (minimize/maximize/close) to the
  // active theme. These are painted by Windows/Electron outside the renderer —
  // the only way to restyle them is via BrowserWindow.setTitleBarOverlay().
  const titleBarBg = colors["titleBar.activeBackground"] ?? (variant === "dark" ? "#3c3c3c" : "#F8F8F8");
  const titleBarFg = colors["titleBar.activeForeground"] ?? (variant === "dark" ? "#cccccc" : "#1E1E1E");
  window.tinder?.setTitleBarOverlay?.({ color: titleBarBg, symbolColor: titleBarFg })?.catch(() => {});
}

export function registerAllThemes(): void {
  for (const theme of THEMES) {
    monaco.editor.defineTheme(theme.id, {
      base: theme.base,
      inherit: true,
      rules: toMonacoRules(theme.sources),
      colors: toMonacoColors(theme.sources)
    });
  }
}

/** Switch the active theme — updates Monaco AND the workbench CSS variables. */
export function applyTheme(themeId: string): boolean {
  const theme = THEMES.find((t) => t.id === themeId);
  if (!theme) return false;
  monaco.editor.setTheme(theme.id);
  const colors = toMonacoColors(theme.sources);
  applyWorkbenchColors(colors, theme.variant);
  return true;
}

/** Backwards-compatible export — initial Monaco theme name. */
export const TINDER_THEME_ID = DEFAULT_THEME_ID;
