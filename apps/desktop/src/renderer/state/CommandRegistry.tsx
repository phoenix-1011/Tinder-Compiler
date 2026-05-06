import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";

export interface Command {
  id: string;
  /** Human-readable title shown in the palette. */
  title: string;
  /** Optional grouping prefix (e.g. "文件", "运行"). */
  category?: string;
  /** Optional keyboard shortcut hint shown on the right. */
  keybinding?: string;
  /** Optional predicate; command is hidden when this returns false. */
  when?: () => boolean;
  /** Action invoked when the command is executed. */
  run: () => void | Promise<void>;
}

interface CommandRegistryValue {
  register(command: Command): () => void;
  list(): Command[];
  execute(id: string): Promise<void>;
  /** True when the command palette modal should be visible. */
  isPaletteOpen: boolean;
  openPalette(): void;
  closePalette(): void;
}

const CommandRegistryContext = createContext<CommandRegistryValue | null>(null);

export function CommandRegistryProvider({ children }: { children: ReactNode }) {
  const commandsRef = useRef<Map<string, Command>>(new Map());
  const [, forceTick] = useState(0);
  const [isPaletteOpen, setPaletteOpen] = useState(false);

  const register = useCallback((command: Command) => {
    commandsRef.current.set(command.id, command);
    forceTick((n) => n + 1);
    return () => {
      commandsRef.current.delete(command.id);
      forceTick((n) => n + 1);
    };
  }, []);

  const list = useCallback((): Command[] => {
    return Array.from(commandsRef.current.values()).filter((c) => !c.when || c.when());
  }, []);

  const execute = useCallback(async (id: string): Promise<void> => {
    const cmd = commandsRef.current.get(id);
    if (!cmd) {
      // eslint-disable-next-line no-console
      console.warn(`Command not found: ${id}`);
      return;
    }
    await cmd.run();
  }, []);

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  const value = useMemo<CommandRegistryValue>(
    () => ({ register, list, execute, isPaletteOpen, openPalette, closePalette }),
    [register, list, execute, isPaletteOpen, openPalette, closePalette]
  );

  return <CommandRegistryContext.Provider value={value}>{children}</CommandRegistryContext.Provider>;
}

export function useCommandRegistry(): CommandRegistryValue {
  const ctx = useContext(CommandRegistryContext);
  if (!ctx) throw new Error("useCommandRegistry must be used within CommandRegistryProvider");
  return ctx;
}

/** Convenience hook to declaratively register a command for the lifetime of a component. */
export function useCommand(command: Command, deps: ReadonlyArray<unknown>): void {
  const { register } = useCommandRegistry();
  useEffect(() => {
    return register(command);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
