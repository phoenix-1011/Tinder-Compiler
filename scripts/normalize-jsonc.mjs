#!/usr/bin/env node
// Strips // line comments, /* */ block comments, and trailing commas from
// VS Code's JSONC files (themes / grammars / snippets) so they can be
// imported by Vite's strict JSON loader.
//
// Usage: node scripts/normalize-jsonc.mjs [glob...]
// Default: rewrites apps/desktop/resources/{themes,grammars,snippets}/*.json
//          and apps/desktop/src/renderer/themes/*.json in place.

import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

const TARGET_DIRS = [
  join(REPO, "apps/desktop/resources/grammars"),
  join(REPO, "apps/desktop/resources/snippets"),
  join(REPO, "apps/desktop/src/renderer/themes")
];

/**
 * State-machine JSONC stripper. Walks the input character by character so it
 * never touches `//` or `,` that live inside string literals.
 */
function stripJsonc(input) {
  let out = "";
  const n = input.length;
  let i = 0;
  while (i < n) {
    const ch = input[i];
    const next = input[i + 1];

    if (ch === '"') {
      // Copy the whole string literal verbatim, including escaped chars.
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
      // Line comment — skip until newline.
      while (i < n && input[i] !== "\n") i++;
      continue;
    }

    if (ch === "/" && next === "*") {
      // Block comment.
      i += 2;
      while (i < n - 1 && !(input[i] === "*" && input[i + 1] === "/")) i++;
      i += 2;
      continue;
    }

    out += ch;
    i++;
  }

  // Strip trailing commas: `,` followed only by whitespace and `}` or `]`.
  return out.replace(/,(\s*[}\]])/g, "$1");
}

async function processFile(path) {
  const raw = await readFile(path, "utf8");
  let normalised;
  try {
    normalised = stripJsonc(raw);
    JSON.parse(normalised); // sanity check
  } catch (err) {
    throw new Error(`${path} did not produce valid JSON: ${err.message}`);
  }
  if (normalised === raw) return false;
  await writeFile(path, normalised, "utf8");
  return true;
}

async function listJson(dir) {
  let entries;
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const out = [];
  for (const name of entries) {
    const full = join(dir, name);
    const s = await stat(full);
    if (s.isFile() && name.toLowerCase().endsWith(".json")) out.push(full);
  }
  return out;
}

async function main() {
  let changed = 0;
  let scanned = 0;
  for (const dir of TARGET_DIRS) {
    const files = await listJson(dir);
    for (const file of files) {
      scanned++;
      const didChange = await processFile(file);
      if (didChange) {
        changed++;
        console.log(`fixed ${file.replace(REPO + "\\", "").replace(/\\/g, "/")}`);
      }
    }
  }
  console.log(`\nDone. Scanned ${scanned} file(s), rewrote ${changed}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
