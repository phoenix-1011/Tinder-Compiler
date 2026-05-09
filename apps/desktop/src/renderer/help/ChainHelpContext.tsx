import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { CHAIN_CATALOG } from "./chain-catalog.generated";

/**
 * What the help viewer is currently showing.
 *
 * - `doc`: render a whole chain-contract markdown file (foundation, full chain, or extension doc).
 * - `node`: render a per-node section (with structured fields when available).
 */
export type HelpSelection =
  | { kind: "doc"; docSlug: string }
  | { kind: "node"; nodeId: string };

interface ChainHelpContextValue {
  selection: HelpSelection;
  selectDoc(docSlug: string): void;
  selectNode(nodeId: string): void;
  /** Tree expansion state, keyed by tree-node id. */
  expanded: Record<string, boolean>;
  toggle(id: string): void;
}

const ChainHelpContext = createContext<ChainHelpContextValue | null>(null);

const DEFAULT_EXPANDED: Record<string, boolean> = {
  // Open the foundation cluster and the first chain group by default.
  "section.foundation": true,
  "section.chains": true,
  "section.extensions": true,
  "group.10-platform-chain": true
};

export function ChainHelpProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<HelpSelection>({
    kind: "doc",
    docSlug: CHAIN_CATALOG.foundationDocSlugs[1] ?? CHAIN_CATALOG.foundationDocSlugs[0]!
  });
  const [expanded, setExpanded] = useState<Record<string, boolean>>(DEFAULT_EXPANDED);

  const selectDoc = useCallback((docSlug: string) => {
    setSelection({ kind: "doc", docSlug });
  }, []);
  const selectNode = useCallback((nodeId: string) => {
    setSelection({ kind: "node", nodeId });
  }, []);
  const toggle = useCallback((id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const value = useMemo<ChainHelpContextValue>(
    () => ({ selection, selectDoc, selectNode, expanded, toggle }),
    [selection, selectDoc, selectNode, expanded, toggle]
  );

  return <ChainHelpContext.Provider value={value}>{children}</ChainHelpContext.Provider>;
}

export function useChainHelp(): ChainHelpContextValue {
  const ctx = useContext(ChainHelpContext);
  if (!ctx) throw new Error("useChainHelp must be used within ChainHelpProvider");
  return ctx;
}
