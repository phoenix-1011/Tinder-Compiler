import { Fragment, type ReactNode } from "react";

/**
 * Minimal markdown renderer focused on what the chain-contract docs use:
 * H1/H2/H3, paragraphs, GFM tables, bullet lists, fenced code blocks,
 * inline code, bold/italic, autolinks, and horizontal rules.
 *
 * It returns React elements rather than raw HTML, so there is no
 * dangerouslySetInnerHTML and no XSS surface from doc content.
 */
export function Markdown({ source }: { source: string }) {
  const blocks = parseBlocks(source);
  return <div className="md-body">{blocks.map((b, i) => renderBlock(b, i))}</div>;
}

/**
 * Inline-only counterpart for places where a block wrapper would be wrong —
 * table cells, list items, label/value rows. Renders inline code, bold,
 * italic, and autolinks; nothing else. No `<div>`, no `<p>`.
 */
export function MarkdownInline({ source }: { source: string }) {
  return <Fragment>{renderInline(source)}</Fragment>;
}

// ──────────────────────────────────────────────────────────────────────────
// Block parsing
// ──────────────────────────────────────────────────────────────────────────

type Block =
  | { kind: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "table"; headers: string[]; aligns: Array<"left" | "center" | "right" | null>; rows: string[][] }
  | { kind: "code"; lang: string; text: string }
  | { kind: "hr" };

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const out: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();

    if (trimmed === "") {
      i++;
      continue;
    }

    // Fenced code block — ``` or ```lang
    const fence = /^\s*```(.*)$/.exec(line);
    if (fence) {
      const lang = fence[1]!.trim();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i]!)) {
        buf.push(lines[i]!);
        i++;
      }
      i++; // skip closing fence
      out.push({ kind: "code", lang, text: buf.join("\n") });
      continue;
    }

    // Heading
    const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (heading) {
      out.push({
        kind: "heading",
        level: heading[1]!.length as 1 | 2 | 3 | 4 | 5 | 6,
        text: heading[2]!
      });
      i++;
      continue;
    }

    // Horizontal rule
    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      out.push({ kind: "hr" });
      i++;
      continue;
    }

    // Table — header row followed by an alignment row (separated by blanks).
    if (/^\s*\|/.test(line)) {
      const tbl = tryParseTable(lines, i);
      if (tbl) {
        out.push(tbl.block);
        i = tbl.next;
        continue;
      }
    }

    // List
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length) {
        const m = /^\s*[-*+]\s+(.*)$/.exec(lines[i]!);
        if (!m) {
          if (lines[i]!.trim() === "") {
            // Allow a single blank line between items (chain docs use double-spacing).
            if (i + 1 < lines.length && /^\s*[-*+]\s+/.test(lines[i + 1]!)) {
              i++;
              continue;
            }
          }
          break;
        }
        items.push(m[1]!);
        i++;
      }
      out.push({ kind: "list", ordered: false, items });
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length) {
        const m = /^\s*\d+\.\s+(.*)$/.exec(lines[i]!);
        if (!m) {
          if (lines[i]!.trim() === "" && i + 1 < lines.length && /^\s*\d+\.\s+/.test(lines[i + 1]!)) {
            i++;
            continue;
          }
          break;
        }
        items.push(m[1]!);
        i++;
      }
      out.push({ kind: "list", ordered: true, items });
      continue;
    }

    // Paragraph — accumulate non-blank, non-special lines until a blank or block start.
    const para: string[] = [line];
    i++;
    while (i < lines.length) {
      const next = lines[i]!;
      if (next.trim() === "") break;
      if (/^(#{1,6})\s+/.test(next)) break;
      if (/^\s*```/.test(next)) break;
      if (/^\s*\|/.test(next)) break;
      if (/^\s*[-*+]\s+/.test(next)) break;
      if (/^\s*\d+\.\s+/.test(next)) break;
      if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(next)) break;
      para.push(next);
      i++;
    }
    out.push({ kind: "paragraph", text: para.join(" ") });
  }

  return out;
}

function tryParseTable(
  lines: string[],
  start: number
): { block: Extract<Block, { kind: "table" }>; next: number } | null {
  const header = lines[start]!;
  if (!/^\s*\|/.test(header)) return null;

  // Find separator (allow blank lines in between).
  let j = start + 1;
  while (j < lines.length && lines[j]!.trim() === "") j++;
  const sep = lines[j];
  if (!sep || !/^\s*\|[\s\-:|]+\|\s*$/.test(sep)) return null;

  const headers = splitRow(header);
  const aligns = splitRow(sep).map(parseAlign);

  const rows: string[][] = [];
  let k = j + 1;
  while (k < lines.length) {
    const row = lines[k]!;
    if (row.trim() === "") {
      // Blank lines may separate rows; if next non-blank is still a row, continue.
      let ahead = k + 1;
      while (ahead < lines.length && lines[ahead]!.trim() === "") ahead++;
      if (ahead < lines.length && /^\s*\|/.test(lines[ahead]!)) {
        k = ahead;
        continue;
      }
      break;
    }
    if (!/^\s*\|/.test(row)) break;
    rows.push(splitRow(row));
    k++;
  }

  return { block: { kind: "table", headers, aligns, rows }, next: k };
}

function splitRow(line: string): string[] {
  const inner = line.replace(/^\s*\|/, "").replace(/\|\s*$/, "");
  return inner.split("|").map((c) => c.trim());
}

function parseAlign(cell: string): "left" | "center" | "right" | null {
  const c = cell.trim();
  const left = c.startsWith(":");
  const right = c.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return null;
}

// ──────────────────────────────────────────────────────────────────────────
// Block rendering
// ──────────────────────────────────────────────────────────────────────────

function renderBlock(block: Block, key: number): ReactNode {
  switch (block.kind) {
    case "heading": {
      const className = `md-h md-h${block.level}`;
      const inline = renderInline(block.text);
      switch (block.level) {
        case 1:
          return <h1 key={key} className={className}>{inline}</h1>;
        case 2:
          return <h2 key={key} className={className}>{inline}</h2>;
        case 3:
          return <h3 key={key} className={className}>{inline}</h3>;
        case 4:
          return <h4 key={key} className={className}>{inline}</h4>;
        case 5:
          return <h5 key={key} className={className}>{inline}</h5>;
        case 6:
          return <h6 key={key} className={className}>{inline}</h6>;
      }
      return null;
    }
    case "paragraph":
      return (
        <p key={key} className="md-p">
          {renderInline(block.text)}
        </p>
      );
    case "list":
      if (block.ordered) {
        return (
          <ol key={key} className="md-ol">
            {block.items.map((item, idx) => (
              <li key={idx}>{renderInline(item)}</li>
            ))}
          </ol>
        );
      }
      return (
        <ul key={key} className="md-ul">
          {block.items.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ul>
      );
    case "code":
      return (
        <pre key={key} className="md-pre" data-lang={block.lang || undefined}>
          <code>{block.text}</code>
        </pre>
      );
    case "hr":
      return <hr key={key} className="md-hr" />;
    case "table":
      return (
        <div key={key} className="md-table-wrap">
          <table className="md-table">
            <thead>
              <tr>
                {block.headers.map((h, idx) => (
                  <th
                    key={idx}
                    style={block.aligns[idx] ? { textAlign: block.aligns[idx]! } : undefined}
                  >
                    {renderInline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rIdx) => (
                <tr key={rIdx}>
                  {row.map((cell, cIdx) => (
                    <td
                      key={cIdx}
                      style={
                        block.aligns[cIdx] ? { textAlign: block.aligns[cIdx]! } : undefined
                      }
                    >
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Inline rendering — backtick code, bold, italic, autolinks
// ──────────────────────────────────────────────────────────────────────────

function renderInline(text: string): ReactNode[] {
  // Tokenise on inline code first, since its content is opaque.
  const tokens: Array<{ kind: "code" | "text"; text: string }> = [];
  let i = 0;
  while (i < text.length) {
    const tickIdx = text.indexOf("`", i);
    if (tickIdx === -1) {
      tokens.push({ kind: "text", text: text.slice(i) });
      break;
    }
    if (tickIdx > i) tokens.push({ kind: "text", text: text.slice(i, tickIdx) });
    const close = text.indexOf("`", tickIdx + 1);
    if (close === -1) {
      tokens.push({ kind: "text", text: text.slice(tickIdx) });
      break;
    }
    tokens.push({ kind: "code", text: text.slice(tickIdx + 1, close) });
    i = close + 1;
  }

  const out: ReactNode[] = [];
  for (const tok of tokens) {
    if (tok.kind === "code") {
      out.push(
        <code key={out.length} className="md-code-inline">
          {tok.text}
        </code>
      );
      continue;
    }
    out.push(...renderText(tok.text, out.length));
  }
  return out;
}

function renderText(text: string, baseKey: number): ReactNode[] {
  // Bold (**…**), italic (*…*), and autolinks. The italic alt uses lookbehind
  // and lookahead so a stray `*` in prose (e.g. a glob like `shared.*`
  // appearing outside backticks) doesn't accidentally swallow the rest of the
  // text. We don't try to implement the full GFM flanking rules — just enough
  // that a single `*` doesn't pair with the next one across unrelated tokens.
  const out: ReactNode[] = [];
  const re =
    /\*\*([^*\n]+?)\*\*|(?<![\w*])\*([^\s*][^*\n]*?[^\s*]|[^\s*])\*(?![\w*])|\bhttps?:\/\/[^\s)]+/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  let key = baseKey;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) out.push(text.slice(lastIdx, m.index));
    if (m[1] !== undefined) {
      out.push(
        <strong key={`b-${key++}`} className="md-strong">
          {m[1]}
        </strong>
      );
    } else if (m[2] !== undefined) {
      out.push(
        <em key={`i-${key++}`} className="md-em">
          {m[2]}
        </em>
      );
    } else {
      const url = m[0]!;
      out.push(
        <a
          key={`a-${key++}`}
          className="md-link"
          href={url}
          target="_blank"
          rel="noreferrer noopener"
        >
          {url}
        </a>
      );
    }
    lastIdx = m.index + m[0]!.length;
  }
  if (lastIdx < text.length) out.push(text.slice(lastIdx));
  return out;
}
