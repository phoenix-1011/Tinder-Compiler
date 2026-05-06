import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "../state/ThemeContext";

interface ThemePickerProps {
  open: boolean;
  onClose(): void;
}

export function ThemePicker({ open, onClose }: ThemePickerProps) {
  const { current, themes, setTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  // Remember the theme that was active when the picker opened so we can
  // restore on Esc — VS Code's "live preview" behaviour.
  const originalRef = useRef<string>(current);

  useEffect(() => {
    if (open) {
      originalRef.current = current;
      setQuery("");
      setActiveIndex(themes.findIndex((t) => t.id === current));
      requestAnimationFrame(() => inputRef.current?.focus());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return themes;
    return themes.filter(
      (t) => t.label.toLowerCase().includes(q) || t.id.toLowerCase().includes(q)
    );
  }, [query, themes]);

  // Live preview: navigating with arrows applies the highlighted theme immediately.
  useEffect(() => {
    if (!open) return;
    const target = filtered[activeIndex];
    if (target) setTheme(target.id);
  }, [activeIndex, filtered, open, setTheme]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!open) return null;

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      // Revert to original on cancel.
      setTheme(originalRef.current);
      onClose();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(filtered.length - 1, i + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const picked = filtered[activeIndex];
      if (picked) setTheme(picked.id);
      onClose();
    }
  };

  const onCancel = () => {
    setTheme(originalRef.current);
    onClose();
  };

  return (
    <div className="command-palette-backdrop" onMouseDown={onCancel}>
      <div className="command-palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="command-palette-input"
          placeholder="选择颜色主题（↑↓ 预览，Enter 确认，Esc 取消）"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={onKeyDown}
          spellCheck={false}
        />
        {filtered.length === 0 ? (
          <div className="command-palette-empty">无匹配主题</div>
        ) : (
          <ul className="command-palette-list" ref={listRef}>
            {filtered.map((theme, idx) => (
              <li
                key={theme.id}
                data-idx={idx}
                className={`command-palette-row${idx === activeIndex ? " is-active" : ""}`}
                onMouseEnter={() => setActiveIndex(idx)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setTheme(theme.id);
                  onClose();
                }}
              >
                <div className="command-palette-row-main">
                  <span className={`codicon codicon-${theme.variant === "dark" ? "color-mode" : "lightbulb"} theme-picker-icon`} />
                  {theme.label}
                  {theme.id === current && (
                    <span className="command-palette-cat"> · 当前</span>
                  )}
                </div>
                <div className="command-palette-keys">{theme.variant}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
