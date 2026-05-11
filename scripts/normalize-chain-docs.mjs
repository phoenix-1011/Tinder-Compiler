#!/usr/bin/env node
// Normalize the chain-contract docs to match the repo's .editorconfig:
//
//   - Strip the leading UTF-8 BOM.
//   - Use CRLF line endings.
//   - Collapse 3+ consecutive blank lines to a single blank line.
//   - End with exactly one trailing newline.
//
// We do NOT trim trailing whitespace inside lines — Markdown uses two trailing
// spaces to mean a hard line break, and the project's .editorconfig opts .md
// files out of trimming for that reason.
//
// Run once after importing new chain-contract docs from the SSOT:
//
//   node scripts/normalize-chain-docs.mjs

import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = join(__dirname, "..", "docs", "flowchat", "chain-contract");

function normalize(raw) {
  let text = raw;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  // Work in LF, re-emit CRLF at the end.
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // 3+ blank lines → 1 blank line. (`\n\n\n` is two consecutive blank lines.)
  text = text.replace(/\n{3,}/g, "\n\n");
  // Ensure a single trailing newline.
  text = text.replace(/\n+$/, "") + "\n";
  // Back to CRLF.
  return text.replace(/\n/g, "\r\n");
}

async function main() {
  const entries = await fs.readdir(DOCS_DIR);
  const targets = entries.filter((name) => name.endsWith(".md"));
  let changed = 0;
  for (const name of targets) {
    const path = join(DOCS_DIR, name);
    const before = await fs.readFile(path, "utf8");
    const after = normalize(before);
    if (after !== before) {
      await fs.writeFile(path, after, "utf8");
      changed += 1;
      // eslint-disable-next-line no-console
      console.log(`normalized ${name}`);
    }
  }
  // eslint-disable-next-line no-console
  console.log(`normalize-chain-docs: ${changed}/${targets.length} files updated`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
