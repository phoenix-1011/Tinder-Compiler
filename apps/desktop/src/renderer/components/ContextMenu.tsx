import { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface ContextMenuItem {
  /** When null, render as a separator. */
  id?: string;
  label?: string;
  /** When provided, shown to the right (e.g. keyboard hint). */
  hint?: string;
  /** Disable the row but keep it visible. */
  disabled?: boolean;
  /** When true, render as separator (label / id ignored). */
  separator?: boolean;
  run?(): void | Promise<void>;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose(): void;
}

/**
 * Floating context menu anchored to the user's right-click location. Self-closes
 * on outside click, Escape, or after running an item. Edges are clamped to the
 * viewport so the menu never spawns off-screen.
 */
export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ x, y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let nx = x;
    let ny = y;
    if (x + rect.width + 8 > vw) nx = Math.max(8, vw - rect.width - 8);
    if (y + rect.height + 8 > vh) ny = Math.max(8, vh - rect.height - 8);
    setPos({ x: nx, y: ny });
  }, [x, y]);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="context-menu"
      role="menu"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, idx) => {
        if (item.separator || (!item.label && !item.run)) {
          return <div key={`sep-${idx}`} className="context-menu-sep" role="separator" />;
        }
        return (
          <button
            key={item.id ?? `${idx}-${item.label}`}
            className="context-menu-item"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              onClose();
              void item.run?.();
            }}
          >
            <span className="context-menu-label">{item.label}</span>
            {item.hint && <span className="context-menu-hint">{item.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

export interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

/** Helper hook to wire a right-click handler that opens a context menu. */
export function useContextMenu() {
  const [state, setState] = useState<ContextMenuState | null>(null);
  const open = (event: React.MouseEvent, items: ContextMenuItem[]) => {
    event.preventDefault();
    event.stopPropagation();
    setState({ x: event.clientX, y: event.clientY, items });
  };
  const close = () => setState(null);
  return { state, open, close };
}
