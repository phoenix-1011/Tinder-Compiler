import { useEffect, useMemo, useRef, useState } from "react";
import { useWorkspace } from "../state/WorkspaceContext";
import { useUI } from "../state/UIContext";
import type { WalkEntry } from "../../preload";
import { fileIcon } from "./FileIcon";

interface Ranked {
  entry: WalkEntry;
  score: number;
  highlights: number[];
}

/** Same idea as CommandPalette's matcher — subsequence match, lower score is better. */
function fuzzyMatch(query: string, target: string): { score: number; highlights: number[] } | null {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  const highlights: number[] = [];
  let qi = 0;
  let last = -1;
  let gap = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      highlights.push(i);
      if (last >= 0) gap += i - last - 1;
      last = i;
      qi++;
    }
  }
  if (qi !== q.length) return null;
  // Bias: match in basename (after last "/") scores better.
  const lastSlash = t.lastIndexOf("/");
  const inBasename = highlights.length > 0 && highlights[0]! > lastSlash;
  return { score: gap + (inBasename ? 0 : 100), highlights };
}

export function QuickOpen() {
  const { folder, openFile } = useWorkspace();
  const { isQuickOpenOpen, closeQuickOpen } = useUI();
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<WalkEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  // Walk the workspace lazily — once per open, cached for the rest of the session.
  useEffect(() => {
    if (!isQuickOpenOpen || !folder) return;
    setQuery("");
    setActiveIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
    if (files.length > 0) return;
    setLoading(true);
    let cancelled = false;
    window.tinder
      .walkDir(folder.path, { limit: 10000 })
      .then((list) => {
        if (cancelled) return;
        setFiles(list);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isQuickOpenOpen, folder, files.length]);

  // Invalidate cache when folder changes.
  useEffect(() => {
    setFiles([]);
  }, [folder?.path]);

  const ranked = useMemo<Ranked[]>(() => {
    if (query.trim().length === 0) {
      return files.slice(0, 200).map((entry) => ({ entry, score: 0, highlights: [] }));
    }
    const out: Ranked[] = [];
    for (const entry of files) {
      const m = fuzzyMatch(query, entry.relativePath);
      if (m) out.push({ entry, score: m.score, highlights: m.highlights });
    }
    out.sort((a, b) => a.score - b.score);
    return out.slice(0, 200);
  }, [query, files]);

  useEffect(() => {
    if (activeIndex >= ranked.length) setActiveIndex(Math.max(0, ranked.length - 1));
  }, [ranked.length, activeIndex]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!isQuickOpenOpen) return null;

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeQuickOpen();
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
        closeQuickOpen();
        void openFile(picked.entry.path);
      }
    }
  };

  return (
    <div className="command-palette-backdrop" onMouseDown={closeQuickOpen}>
      <div className="command-palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="command-palette-input"
          placeholder={folder ? "按文件名搜索（支持模糊）…" : "请先打开文件夹"}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={onKeyDown}
          spellCheck={false}
          disabled={!folder}
        />
        {!folder ? (
          <div className="command-palette-empty">先打开一个文件夹</div>
        ) : loading && files.length === 0 ? (
          <div className="command-palette-empty">扫描工作区…</div>
        ) : ranked.length === 0 ? (
          <div className="command-palette-empty">无匹配文件</div>
        ) : (
          <ul className="command-palette-list" ref={listRef}>
            {ranked.map(({ entry, highlights }, idx) => {
              const icon = fileIcon(entry.name);
              const lastSlash = entry.relativePath.lastIndexOf("/");
              const dirPart = lastSlash > 0 ? entry.relativePath.slice(0, lastSlash) : "";
              const fileNamePart =
                lastSlash > 0 ? entry.relativePath.slice(lastSlash + 1) : entry.relativePath;
              return (
                <li
                  key={entry.path}
                  data-idx={idx}
                  className={`command-palette-row${idx === activeIndex ? " is-active" : ""}`}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    closeQuickOpen();
                    void openFile(entry.path);
                  }}
                >
                  <div className="quick-open-row-main">
                    <span
                      className={`codicon codicon-${icon.icon} quick-open-icon`}
                      style={icon.color ? { color: icon.color } : undefined}
                    />
                    <span className="quick-open-name">
                      <Highlighted
                        text={entry.relativePath}
                        offset={dirPart.length > 0 ? dirPart.length + 1 : 0}
                        slice={fileNamePart}
                        indices={highlights}
                      />
                    </span>
                    {dirPart && <span className="quick-open-dir">{dirPart}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function Highlighted({
  slice,
  offset,
  indices
}: {
  text: string;
  slice: string;
  offset: number;
  indices: number[];
}) {
  if (indices.length === 0) return <>{slice}</>;
  const local = new Set(
    indices.map((i) => i - offset).filter((i) => i >= 0 && i < slice.length)
  );
  if (local.size === 0) return <>{slice}</>;
  return (
    <>
      {Array.from(slice, (ch, i) =>
        local.has(i) ? (
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
