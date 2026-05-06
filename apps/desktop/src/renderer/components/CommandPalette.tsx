import { useEffect, useMemo, useRef, useState } from "react";
import { useCommandRegistry, type Command } from "../state/CommandRegistry";

interface RankedCommand {
  command: Command;
  score: number;
  highlights: number[];
}

/**
 * Lightweight subsequence fuzzy match — every char in `query` must appear in
 * order inside `target`. Returns null on miss, otherwise a score (lower is
 * better) and the indices that matched (for highlighting).
 */
function fuzzyMatch(query: string, target: string): { score: number; highlights: number[] } | null {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  const highlights: number[] = [];
  let qi = 0;
  let lastMatchIndex = -1;
  let gapPenalty = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      highlights.push(ti);
      if (lastMatchIndex >= 0) gapPenalty += ti - lastMatchIndex - 1;
      lastMatchIndex = ti;
      qi++;
    }
  }
  if (qi !== q.length) return null;
  // Score = gaps + late-start penalty. Lower is better.
  return { score: gapPenalty + (highlights[0] ?? 0), highlights };
}

export function CommandPalette() {
  const { list, execute, isPaletteOpen, closePalette } = useCommandRegistry();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  // Reset query each time we open.
  useEffect(() => {
    if (isPaletteOpen) {
      setQuery("");
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isPaletteOpen]);

  const ranked = useMemo<RankedCommand[]>(() => {
    const all = list();
    if (query.trim().length === 0) {
      return all
        .sort((a, b) => a.title.localeCompare(b.title))
        .map((command) => ({ command, score: 0, highlights: [] }));
    }
    const results: RankedCommand[] = [];
    for (const command of all) {
      const haystack = `${command.category ?? ""} ${command.title}`.trim();
      const m = fuzzyMatch(query, haystack);
      if (m) results.push({ command, score: m.score, highlights: m.highlights });
    }
    results.sort((a, b) => a.score - b.score);
    return results;
  }, [query, list, isPaletteOpen]); // include isPaletteOpen so registry changes between opens are picked up

  // Clamp active index whenever results shrink.
  useEffect(() => {
    if (activeIndex >= ranked.length) setActiveIndex(Math.max(0, ranked.length - 1));
  }, [ranked.length, activeIndex]);

  // Scroll active into view.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!isPaletteOpen) return null;

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closePalette();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(ranked.length - 1, i + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const picked = ranked[activeIndex];
      if (picked) {
        closePalette();
        void execute(picked.command.id);
      }
    }
  };

  return (
    <div className="command-palette-backdrop" onMouseDown={closePalette}>
      <div className="command-palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="command-palette-input"
          placeholder="输入命令名称…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={onKeyDown}
          spellCheck={false}
        />
        {ranked.length === 0 ? (
          <div className="command-palette-empty">无匹配命令</div>
        ) : (
          <ul className="command-palette-list" ref={listRef}>
            {ranked.slice(0, 100).map(({ command, highlights }, idx) => (
              <li
                key={command.id}
                data-idx={idx}
                className={`command-palette-row${idx === activeIndex ? " is-active" : ""}`}
                onMouseEnter={() => setActiveIndex(idx)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  closePalette();
                  void execute(command.id);
                }}
              >
                <div className="command-palette-row-main">
                  {command.category && <span className="command-palette-cat">{command.category}: </span>}
                  <Highlighted text={command.title} indices={highlights} categoryOffset={command.category ? command.category.length + 1 : 0} />
                </div>
                {command.keybinding && (
                  <div className="command-palette-keys">{command.keybinding}</div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Highlighted({ text, indices, categoryOffset }: { text: string; indices: number[]; categoryOffset: number }) {
  if (indices.length === 0) return <>{text}</>;
  // Indices were computed against `${category} ${title}` haystack; offset into title.
  const localIndices = indices.map((i) => i - categoryOffset).filter((i) => i >= 0 && i < text.length);
  if (localIndices.length === 0) return <>{text}</>;

  const set = new Set(localIndices);
  return (
    <>
      {Array.from(text, (ch, i) =>
        set.has(i) ? (
          <mark key={i} className="command-palette-hit">
            {ch}
          </mark>
        ) : (
          <span key={i}>{ch}</span>
        )
      )}
    </>
  );
}
