import { useEffect } from "react";

interface ParsedBinding {
  /** Sequence of chord parts. Single-chord bindings have length 1. */
  chords: KeyChord[];
  command: string;
  /** Optional negation: `-foo.bar` removes a default binding. Not yet honoured. */
  remove?: boolean;
}

interface KeyChord {
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
}

let userBindings: ParsedBinding[] = [];

/** Strips // and /* comments + trailing commas — same logic as scripts/normalize-jsonc.mjs. */
function stripJsonc(input: string): string {
  let out = "";
  const n = input.length;
  let i = 0;
  while (i < n) {
    const ch = input[i];
    const next = input[i + 1];
    if (ch === '"') {
      const start = i;
      i++;
      while (i < n) {
        const c = input[i];
        if (c === "\\" && i + 1 < n) {
          i += 2;
          continue;
        }
        if (c === '"') {
          i++;
          break;
        }
        i++;
      }
      out += input.slice(start, i);
      continue;
    }
    if (ch === "/" && next === "/") {
      while (i < n && input[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < n - 1 && !(input[i] === "*" && input[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    out += ch;
    i++;
  }
  return out.replace(/,(\s*[}\]])/g, "$1");
}

function parseChord(token: string): KeyChord | null {
  const parts = token.toLowerCase().split("+").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  let ctrl = false;
  let meta = false;
  let shift = false;
  let alt = false;
  let key = "";
  for (const p of parts) {
    if (p === "ctrl") ctrl = true;
    else if (p === "cmd" || p === "meta" || p === "win") meta = true;
    else if (p === "shift") shift = true;
    else if (p === "alt") alt = true;
    else key = p;
  }
  if (!key) return null;
  return { ctrl, meta, shift, alt, key };
}

function parseBindings(raw: string): ParsedBinding[] {
  let json: unknown;
  try {
    json = JSON.parse(stripJsonc(raw));
  } catch {
    return [];
  }
  if (!Array.isArray(json)) return [];
  const out: ParsedBinding[] = [];
  for (const entry of json) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as { key?: string; command?: string };
    if (typeof e.key !== "string" || typeof e.command !== "string") continue;
    const chordTokens = e.key.split(/\s+/).filter(Boolean);
    const chords = chordTokens.map(parseChord).filter((c): c is KeyChord => c !== null);
    if (chords.length !== chordTokens.length) continue;
    const remove = e.command.startsWith("-");
    out.push({
      chords,
      command: remove ? e.command.slice(1) : e.command,
      remove
    });
  }
  return out;
}

interface MatchInput {
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
}

/**
 * Checks whether the current event matches any user binding. Currently only
 * single-chord bindings are honoured; multi-chord (e.g. "ctrl+k ctrl+s")
 * support is reserved for a future round.
 */
export function matchUserKeybinding(input: MatchInput): string | null {
  const target = input.key.toLowerCase();
  for (const b of userBindings) {
    if (b.remove) continue;
    if (b.chords.length !== 1) continue;
    const c = b.chords[0]!;
    if (c.ctrl !== input.ctrl) continue;
    if (c.meta !== input.meta) continue;
    if (c.shift !== input.shift) continue;
    if (c.alt !== input.alt) continue;
    if (c.key !== target) continue;
    return b.command;
  }
  return null;
}

export function UserKeybindingsLoader() {
  useEffect(() => {
    let cancelled = false;
    // Defensive: guard against the preload script being stale (e.g. dev
    // server didn't rebuild preload after we added the API). Without this
    // the entire renderer would crash with "Cannot read properties of undefined".
    const api = window.tinder?.userKeybindings;
    if (!api || typeof api.read !== "function") {
      // eslint-disable-next-line no-console
      console.warn(
        "[tinder] userKeybindings preload API not available — restart `pnpm dev` to rebuild preload."
      );
      return;
    }
    void api
      .read()
      .then((raw) => {
        if (cancelled) return;
        userBindings = parseBindings(raw);
        // eslint-disable-next-line no-console
        console.info(`[tinder] loaded ${userBindings.length} user keybinding(s)`);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn("[tinder] failed to load user keybindings:", err);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
