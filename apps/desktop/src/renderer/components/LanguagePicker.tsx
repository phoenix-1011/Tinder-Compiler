import { useEffect, useMemo, useRef, useState } from "react";

const LANGUAGES: Array<{ id: string; label: string }> = [
  { id: "plaintext", label: "Plain Text" },
  { id: "cpp", label: "C++" },
  { id: "c", label: "C" },
  { id: "python", label: "Python" },
  { id: "go", label: "Go" },
  { id: "rust", label: "Rust" },
  { id: "typescript", label: "TypeScript" },
  { id: "typescriptreact", label: "TypeScript React" },
  { id: "javascript", label: "JavaScript" },
  { id: "javascriptreact", label: "JavaScript React" },
  { id: "json", label: "JSON" },
  { id: "yaml", label: "YAML" },
  { id: "markdown", label: "Markdown" },
  { id: "html", label: "HTML" },
  { id: "css", label: "CSS" },
  { id: "shell", label: "Shell" },
  { id: "powershell", label: "PowerShell" },
  { id: "lua", label: "Lua" },
  { id: "ini", label: "INI/TOML" }
];

interface LanguagePickerProps {
  current: string;
  onPick(language: string): void;
  onClose(): void;
}

export function LanguagePicker({ current, onPick, onClose }: LanguagePickerProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return LANGUAGES;
    return LANGUAGES.filter(
      (l) => l.id.toLowerCase().includes(q) || l.label.toLowerCase().includes(q)
    );
  }, [query]);

  useEffect(() => {
    if (activeIndex >= filtered.length) setActiveIndex(Math.max(0, filtered.length - 1));
  }, [filtered.length, activeIndex]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
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
      if (picked) {
        onPick(picked.id);
        onClose();
      }
    }
  };

  return (
    <div className="command-palette-backdrop" onMouseDown={onClose}>
      <div className="command-palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="command-palette-input"
          placeholder={`选择语言（当前：${current}）`}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={onKeyDown}
          spellCheck={false}
        />
        {filtered.length === 0 ? (
          <div className="command-palette-empty">无匹配语言</div>
        ) : (
          <ul className="command-palette-list" ref={listRef}>
            {filtered.map((lang, idx) => (
              <li
                key={lang.id}
                data-idx={idx}
                className={`command-palette-row${idx === activeIndex ? " is-active" : ""}`}
                onMouseEnter={() => setActiveIndex(idx)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(lang.id);
                  onClose();
                }}
              >
                <div className="command-palette-row-main">
                  {lang.label}
                  {lang.id === current && (
                    <span className="command-palette-cat"> · 当前</span>
                  )}
                </div>
                <div className="command-palette-keys">{lang.id}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
