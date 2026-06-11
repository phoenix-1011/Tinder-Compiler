import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";

const STORAGE_KEY = "tinder.ui.layout";

interface PersistedLayout {
  sidebarWidth: number;
  panelHeight: number;
  sidebarVisible: boolean;
  panelVisible: boolean;
  /** Right-side AI panel — top-level, window-scoped (not in-editor). */
  aiPanelVisible: boolean;
  aiPanelWidth: number;
}

const DEFAULTS: PersistedLayout = {
  sidebarWidth: 280,
  panelHeight: 220,
  sidebarVisible: true,
  panelVisible: true,
  aiPanelVisible: false,
  aiPanelWidth: 340
};

const LIMITS = {
  sidebarMin: 170,
  sidebarMax: 600,
  panelMin: 80,
  panelMax: 600,
  aiPanelMin: 240,
  aiPanelMax: 720
} as const;

interface UIContextValue {
  sidebarWidth: number;
  setSidebarWidth(width: number): void;
  panelHeight: number;
  setPanelHeight(height: number): void;
  sidebarVisible: boolean;
  panelVisible: boolean;
  aiPanelVisible: boolean;
  aiPanelWidth: number;
  setAiPanelWidth(width: number): void;
  toggleSidebar(): void;
  togglePanel(): void;
  toggleAiPanel(): void;
  openAiPanel(): void;
  showSidebar(): void;
  showPanel(): void;
  hidePanel(): void;
  isQuickOpenOpen: boolean;
  openQuickOpen(): void;
  closeQuickOpen(): void;
  isAboutOpen: boolean;
  openAbout(): void;
  closeAbout(): void;
  isThemePickerOpen: boolean;
  openThemePicker(): void;
  closeThemePicker(): void;
  isSettingsOpen: boolean;
  openSettings(): void;
  closeSettings(): void;
  toggleSettings(): void;
  limits: typeof LIMITS;
}

const UIContext = createContext<UIContextValue | null>(null);

function loadLayout(): PersistedLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<PersistedLayout>;
    return {
      sidebarWidth: clamp(parsed.sidebarWidth ?? DEFAULTS.sidebarWidth, LIMITS.sidebarMin, LIMITS.sidebarMax),
      panelHeight: clamp(parsed.panelHeight ?? DEFAULTS.panelHeight, LIMITS.panelMin, LIMITS.panelMax),
      sidebarVisible: parsed.sidebarVisible ?? DEFAULTS.sidebarVisible,
      panelVisible: parsed.panelVisible ?? DEFAULTS.panelVisible,
      aiPanelVisible: parsed.aiPanelVisible ?? DEFAULTS.aiPanelVisible,
      aiPanelWidth: clamp(
        parsed.aiPanelWidth ?? DEFAULTS.aiPanelWidth,
        LIMITS.aiPanelMin,
        LIMITS.aiPanelMax
      )
    };
  } catch {
    return DEFAULTS;
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function UIProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedLayout>(() => loadLayout());
  const [isQuickOpenOpen, setQuickOpen] = useState(false);
  const [isAboutOpen, setAboutOpen] = useState(false);
  const [isThemePickerOpen, setThemePickerOpen] = useState(false);
  const [isSettingsOpen, setSettingsOpen] = useState(false);

  // Persist to localStorage on change.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore quota errors */
    }
  }, [state]);

  const setSidebarWidth = useCallback((width: number) => {
    setState((s) => ({ ...s, sidebarWidth: clamp(width, LIMITS.sidebarMin, LIMITS.sidebarMax) }));
  }, []);

  const setPanelHeight = useCallback((height: number) => {
    setState((s) => ({ ...s, panelHeight: clamp(height, LIMITS.panelMin, LIMITS.panelMax) }));
  }, []);

  const toggleSidebar = useCallback(() => {
    setState((s) => ({ ...s, sidebarVisible: !s.sidebarVisible }));
  }, []);

  const togglePanel = useCallback(() => {
    setState((s) => ({ ...s, panelVisible: !s.panelVisible }));
  }, []);

  const toggleAiPanel = useCallback(() => {
    setState((s) => ({ ...s, aiPanelVisible: !s.aiPanelVisible }));
  }, []);

  const openAiPanel = useCallback(() => {
    setState((s) => (s.aiPanelVisible ? s : { ...s, aiPanelVisible: true }));
  }, []);

  const setAiPanelWidth = useCallback((width: number) => {
    setState((s) => ({
      ...s,
      aiPanelWidth: clamp(width, LIMITS.aiPanelMin, LIMITS.aiPanelMax)
    }));
  }, []);

  const showSidebar = useCallback(() => {
    setState((s) => (s.sidebarVisible ? s : { ...s, sidebarVisible: true }));
  }, []);

  const showPanel = useCallback(() => {
    setState((s) => (s.panelVisible ? s : { ...s, panelVisible: true }));
  }, []);

  const hidePanel = useCallback(() => {
    setState((s) => (s.panelVisible ? { ...s, panelVisible: false } : s));
  }, []);

  const openQuickOpen = useCallback(() => setQuickOpen(true), []);
  const closeQuickOpen = useCallback(() => setQuickOpen(false), []);
  const openAbout = useCallback(() => setAboutOpen(true), []);
  const closeAbout = useCallback(() => setAboutOpen(false), []);
  const openThemePicker = useCallback(() => setThemePickerOpen(true), []);
  const closeThemePicker = useCallback(() => setThemePickerOpen(false), []);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const toggleSettings = useCallback(() => setSettingsOpen((v) => !v), []);

  const value = useMemo<UIContextValue>(
    () => ({
      sidebarWidth: state.sidebarWidth,
      setSidebarWidth,
      panelHeight: state.panelHeight,
      setPanelHeight,
      sidebarVisible: state.sidebarVisible,
      panelVisible: state.panelVisible,
      aiPanelVisible: state.aiPanelVisible,
      aiPanelWidth: state.aiPanelWidth,
      setAiPanelWidth,
      toggleSidebar,
      togglePanel,
      toggleAiPanel,
      openAiPanel,
      showSidebar,
      showPanel,
      hidePanel,
      isQuickOpenOpen,
      openQuickOpen,
      closeQuickOpen,
      isAboutOpen,
      openAbout,
      closeAbout,
      isThemePickerOpen,
      openThemePicker,
      closeThemePicker,
      isSettingsOpen,
      openSettings,
      closeSettings,
      toggleSettings,
      limits: LIMITS
    }),
    [
      state,
      setSidebarWidth,
      setPanelHeight,
      setAiPanelWidth,
      toggleSidebar,
      togglePanel,
      toggleAiPanel,
      openAiPanel,
      showSidebar,
      showPanel,
      hidePanel,
      isQuickOpenOpen,
      openQuickOpen,
      closeQuickOpen,
      isAboutOpen,
      openAbout,
      closeAbout,
      isThemePickerOpen,
      openThemePicker,
      closeThemePicker,
      isSettingsOpen,
      openSettings,
      closeSettings,
      toggleSettings
    ]
  );

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI(): UIContextValue {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error("useUI must be used within UIProvider");
  return ctx;
}
