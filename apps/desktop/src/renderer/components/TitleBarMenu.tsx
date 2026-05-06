import { useEffect, useRef, useState } from "react";
import { useCommandRegistry } from "../state/CommandRegistry";

export interface MenuItem {
  /** Command id from CommandRegistry. Use null for a separator. */
  command: string | null;
  /** Override label; falls back to the command's title. */
  label?: string;
  /** Override keybinding; falls back to the command's keybinding. */
  keybinding?: string;
  /** Inline custom action — bypasses CommandRegistry. */
  onClick?: () => void;
}

interface TitleBarMenuProps {
  label: string;
  /**
   * Items can be a static array or a thunk evaluated each time the menu
   * opens (useful for dynamic submenus like "最近").
   */
  items: MenuItem[] | (() => MenuItem[]);
}

export function TitleBarMenu({ label, items }: TitleBarMenuProps) {
  const { list, execute } = useCommandRegistry();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Close when clicking outside.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const allCommands = list();
  const lookup = new Map(allCommands.map((c) => [c.id, c]));
  const resolvedItems = open && typeof items === "function" ? items() : Array.isArray(items) ? items : [];

  return (
    <div className="titlebar-menu-wrap" ref={wrapRef}>
      <button
        className={`titlebar-menu${open ? " is-open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        {label}
      </button>
      {open && (
        <div className="titlebar-menu-popup" role="menu">
          {resolvedItems.map((item, idx) => {
            if (item.command === null && !item.onClick) {
              return <div key={`sep-${idx}`} className="titlebar-menu-sep" role="separator" />;
            }
            const cmd = item.command ? lookup.get(item.command) : undefined;
            const itemLabel = item.label ?? cmd?.title ?? item.command ?? "";
            const kb = item.keybinding ?? cmd?.keybinding;
            const enabled = item.onClick ? true : !!cmd && (!cmd.when || cmd.when());
            return (
              <button
                key={`${item.command ?? "inline"}-${idx}`}
                className="titlebar-menu-item"
                role="menuitem"
                disabled={!enabled}
                onClick={() => {
                  setOpen(false);
                  if (item.onClick) item.onClick();
                  else if (cmd) void execute(cmd.id);
                }}
              >
                <span className="titlebar-menu-item-label">{itemLabel}</span>
                {kb && <span className="titlebar-menu-item-key">{kb}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
