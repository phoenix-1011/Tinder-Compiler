import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "../state/WorkspaceContext";
import type { SearchMatch } from "../../preload";

interface FileGroup {
  path: string;
  relativePath: string;
  matches: SearchMatch[];
}

export function SearchView() {
  const { folder, openFile } = useWorkspace();
  const [query, setQuery] = useState("");
  const [includes, setIncludes] = useState("");
  const [excludes, setExcludes] = useState("");
  const [isRegex, setIsRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [matchWholeWord, setMatchWholeWord] = useState(false);
  const [groups, setGroups] = useState<FileGroup[]>([]);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string>("");
  const sessionRef = useRef<number | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup when component unmounts.
  useEffect(() => {
    return () => {
      if (sessionRef.current != null) {
        void window.tinder.search.cancel(sessionRef.current);
        sessionRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!folder) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length === 0) {
      setGroups([]);
      setInfo("");
      return;
    }
    debounceRef.current = setTimeout(() => {
      void runSearch();
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, includes, excludes, isRegex, caseSensitive, matchWholeWord, folder?.path]);

  async function runSearch() {
    if (!folder) return;
    if (sessionRef.current != null) {
      await window.tinder.search.cancel(sessionRef.current);
      sessionRef.current = null;
    }
    setBusy(true);
    setGroups([]);
    setInfo("");

    try {
      const { id } = await window.tinder.search.start({
        query,
        cwd: folder.path,
        isRegex,
        caseSensitive,
        matchWholeWord,
        includes: includes.split(",").map((s) => s.trim()).filter(Boolean),
        excludes: excludes.split(",").map((s) => s.trim()).filter(Boolean),
        maxResults: 200
      });
      sessionRef.current = id;

      // We have to capture per-id disposers so the *current* search owns them.
      const localGroups = new Map<string, FileGroup>();

      const offMatch = window.tinder.search.onMatch(id, (m) => {
        const existing = localGroups.get(m.path);
        if (existing) existing.matches.push(m);
        else localGroups.set(m.path, { path: m.path, relativePath: m.relativePath, matches: [m] });
        // Throttle setState by scheduling on a microtask boundary.
        queueMicrotask(() => setGroups(Array.from(localGroups.values())));
      });

      const offEnd = window.tinder.search.onEnd(id, (end) => {
        offMatch();
        offEnd();
        offErr();
        sessionRef.current = null;
        setBusy(false);
        if (end.cancelled) return;
        if (end.error) setInfo(`搜索出错：${end.error}`);
        else setInfo(`${end.totalMatches} 个匹配，共 ${localGroups.size} 个文件`);
      });

      const offErr = window.tinder.search.onStderr(id, (chunk) => {
        // ripgrep 偶尔报权限警告 —— 收着但不打断
        // eslint-disable-next-line no-console
        console.debug("[search stderr]", chunk);
      });
    } catch (err) {
      setBusy(false);
      setInfo(`搜索出错：${(err as Error).message}`);
    }
  }

  if (!folder) {
    return (
      <div className="sidebar-empty">
        <p className="sidebar-hint">先打开一个文件夹。</p>
      </div>
    );
  }

  return (
    <div className="search-view">
      <div className="search-controls">
        <input
          className="sidebar-input"
          placeholder="搜索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          spellCheck={false}
        />
        <div className="search-toggles">
          <button
            className={`search-toggle${caseSensitive ? " is-active" : ""}`}
            title="区分大小写"
            onClick={() => setCaseSensitive((v) => !v)}
            type="button"
          >
            <span className="codicon codicon-case-sensitive" />
          </button>
          <button
            className={`search-toggle${matchWholeWord ? " is-active" : ""}`}
            title="全字匹配"
            onClick={() => setMatchWholeWord((v) => !v)}
            type="button"
          >
            <span className="codicon codicon-whole-word" />
          </button>
          <button
            className={`search-toggle${isRegex ? " is-active" : ""}`}
            title="正则表达式"
            onClick={() => setIsRegex((v) => !v)}
            type="button"
          >
            <span className="codicon codicon-regex" />
          </button>
        </div>
        <input
          className="sidebar-input"
          placeholder="包含 glob，例如 *.ts,src/**"
          value={includes}
          onChange={(e) => setIncludes(e.target.value)}
          spellCheck={false}
        />
        <input
          className="sidebar-input"
          placeholder="排除 glob，例如 dist,node_modules"
          value={excludes}
          onChange={(e) => setExcludes(e.target.value)}
          spellCheck={false}
        />
      </div>

      <div className="search-status">
        {busy ? (
          <>
            <span className="codicon codicon-loading codicon-modifier-spin" />
            <span>搜索中…</span>
          </>
        ) : (
          <span>{info}</span>
        )}
      </div>

      <div className="search-results">
        {groups.map((g) => (
          <FileGroupRow
            key={g.path}
            group={g}
            onPick={(m) => openFile(m.path, { line: m.line, column: m.column })}
          />
        ))}
      </div>
    </div>
  );
}

function FileGroupRow({ group, onPick }: { group: FileGroup; onPick: (match: SearchMatch) => void }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="search-group">
      <div className="search-group-header" onClick={() => setCollapsed((v) => !v)}>
        <span className={`codicon codicon-${collapsed ? "chevron-right" : "chevron-down"}`} />
        <span className="search-group-name">{group.relativePath || group.path}</span>
        <span className="search-group-count">{group.matches.length}</span>
      </div>
      {!collapsed && (
        <div className="search-group-body">
          {group.matches.slice(0, 50).map((m, idx) => (
            <div
              key={`${m.line}-${m.column}-${idx}`}
              className="search-match"
              onClick={() => onPick(m)}
              title={`${m.relativePath}:${m.line}:${m.column} — 点击跳转`}
            >
              <span className="search-match-line">{m.line}:{m.column}</span>
              <span className="search-match-text">
                {renderHighlight(m.preview, m.matchStart, m.matchEnd)}
              </span>
            </div>
          ))}
          {group.matches.length > 50 && (
            <div className="search-match-more">还有 {group.matches.length - 50} 处…</div>
          )}
        </div>
      )}
    </div>
  );
}

function renderHighlight(text: string, start: number, end: number) {
  // Window the line so we don't dump 500 columns to the DOM.
  const ctx = 60;
  const from = Math.max(0, start - ctx);
  const to = Math.min(text.length, end + ctx);
  const safeStart = Math.max(0, start - from);
  const safeEnd = Math.max(safeStart, end - from);
  const slice = text.slice(from, to);
  return (
    <>
      {from > 0 ? "…" : ""}
      {slice.slice(0, safeStart)}
      <mark className="search-match-mark">{slice.slice(safeStart, safeEnd)}</mark>
      {slice.slice(safeEnd)}
      {to < text.length ? "…" : ""}
    </>
  );
}
