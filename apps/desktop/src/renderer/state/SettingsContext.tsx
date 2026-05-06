import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";

const STORAGE_KEY = "tinder.settings";

export interface EditorSettings {
  fontSize: number;
  fontFamily: string;
  tabSize: number;
  insertSpaces: boolean;
  wordWrap: "on" | "off";
  minimap: boolean;
  lineNumbers: "on" | "off" | "relative";
  renderWhitespace: "none" | "boundary" | "selection" | "all";
  cursorBlinking: "blink" | "smooth" | "phase" | "expand" | "solid";
  formatOnSave: boolean;
  autoSave: "off" | "afterDelay";
  autoSaveDelayMs: number;
}

export const DEFAULT_SETTINGS: EditorSettings = {
  fontSize: 13,
  fontFamily: "Consolas, 'Cascadia Code', 'Courier New', monospace",
  tabSize: 2,
  insertSpaces: true,
  wordWrap: "off",
  minimap: true,
  lineNumbers: "on",
  renderWhitespace: "selection",
  cursorBlinking: "smooth",
  formatOnSave: false,
  autoSave: "off",
  autoSaveDelayMs: 1000
};

interface SettingsContextValue {
  settings: EditorSettings;
  update<K extends keyof EditorSettings>(key: K, value: EditorSettings[K]): void;
  reset(): void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function load(): EditorSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<EditorSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<EditorSettings>(() => load());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  }, [settings]);

  const update = useCallback(
    <K extends keyof EditorSettings>(key: K, value: EditorSettings[K]) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const reset = useCallback(() => setSettings(DEFAULT_SETTINGS), []);

  const value = useMemo<SettingsContextValue>(
    () => ({ settings, update, reset }),
    [settings, update, reset]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
