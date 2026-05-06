import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { THEMES, DEFAULT_THEME_ID, applyTheme, type ThemeDefinition } from "../monaco/theme";

const STORAGE_KEY = "tinder.theme";

interface ThemeContextValue {
  current: string;
  themes: ThemeDefinition[];
  setTheme(id: string): void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function load(): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && THEMES.some((t) => t.id === raw)) return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_THEME_ID;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<string>(() => load());

  // Apply on mount and on every change.
  useEffect(() => {
    applyTheme(current);
    try {
      localStorage.setItem(STORAGE_KEY, current);
    } catch {
      /* ignore */
    }
  }, [current]);

  const setTheme = useCallback((id: string) => {
    if (!THEMES.some((t) => t.id === id)) return;
    setCurrent(id);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ current, themes: THEMES, setTheme }),
    [current, setTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
