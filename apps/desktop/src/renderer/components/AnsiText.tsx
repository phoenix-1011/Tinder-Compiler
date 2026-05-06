import { useMemo, type CSSProperties } from "react";
import Anser, { type AnserJsonEntry } from "anser";

/**
 * Map anser's `ansi-*` color names to VS Code Dark+ hex values.
 * Anser returns either an empty string, an `ansi-...` class name, or an
 * `rgb(r,g,b)` literal depending on input. CSS understands the rgb form
 * directly; the names need translating.
 */
const ANSI_PALETTE: Record<string, string> = {
  "ansi-black": "#000000",
  "ansi-red": "#cd3131",
  "ansi-green": "#0dbc79",
  "ansi-yellow": "#e5e510",
  "ansi-blue": "#2472c8",
  "ansi-magenta": "#bc3fbc",
  "ansi-cyan": "#11a8cd",
  "ansi-white": "#e5e5e5",
  "ansi-bright-black": "#666666",
  "ansi-bright-red": "#f14c4c",
  "ansi-bright-green": "#23d18b",
  "ansi-bright-yellow": "#f5f543",
  "ansi-bright-blue": "#3b8eea",
  "ansi-bright-magenta": "#d670d6",
  "ansi-bright-cyan": "#29b8db",
  "ansi-bright-white": "#e5e5e5"
};

function resolveColor(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("rgb") || value.startsWith("#")) return value;
  return ANSI_PALETTE[value] ?? undefined;
}

function tokenStyle(token: AnserJsonEntry): CSSProperties {
  const decorations = (token as AnserJsonEntry & { decorations?: string[] }).decorations ?? [];
  const decoration = (token as AnserJsonEntry & { decoration?: string | null }).decoration;
  const all = decoration ? [...decorations, decoration] : decorations;

  return {
    color: resolveColor(token.fg),
    backgroundColor: resolveColor(token.bg),
    fontWeight: all.includes("bold") ? 600 : undefined,
    fontStyle: all.includes("italic") ? "italic" : undefined,
    textDecoration: [
      all.includes("underline") ? "underline" : "",
      all.includes("strikethrough") ? "line-through" : ""
    ]
      .filter(Boolean)
      .join(" ") || undefined,
    opacity: all.includes("dim") ? 0.6 : undefined
  };
}

/** Renders an ANSI-coloured text stream using anser's tokeniser. */
export function AnsiText({ text }: { text: string }) {
  const tokens = useMemo<AnserJsonEntry[]>(
    () =>
      Anser.ansiToJson(text, {
        // We carry style info via inline styles; do not emit class names.
        use_classes: false,
        // Preserve trailing whitespace so log lines align.
        remove_empty: false,
        json: true
      }),
    [text]
  );

  return (
    <>
      {tokens.map((token, idx) => {
        const style = tokenStyle(token);
        const hasStyle = Object.values(style).some((v) => v !== undefined);
        if (!hasStyle) return token.content;
        return (
          <span key={idx} style={style}>
            {token.content}
          </span>
        );
      })}
    </>
  );
}
