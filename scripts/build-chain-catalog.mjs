#!/usr/bin/env node
// Generate apps/desktop/src/renderer/help/chain-catalog.generated.ts
// from docs/flowchat/chain-contract/*.md.
//
// The Markdown files are the SSOT. This script extracts the canonical 49-node
// ordered list, the per-doc grouping, and best-effort per-node sections so the
// in-app help viewer can render structured navigation while still falling back
// to raw markdown for fields the parser can't reliably extract yet.

import { promises as fs } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const DOCS_DIR = join(REPO_ROOT, "docs", "flowchat", "chain-contract");
const OUT_FILE = join(
  REPO_ROOT,
  "apps",
  "desktop",
  "src",
  "renderer",
  "help",
  "chain-catalog.generated.ts"
);

const SCHEMA_VERSION = 1;

/** Slugs of the foundation docs (no per-node sections). */
const FOUNDATION_SLUGS = [
  "00-format-standard",
  "01-overview",
  "02-ordered-execution",
  "03-row-taxonomy",
  "04-display-names"
];

/** Slugs of the chain docs (have per-node sections). */
const CHAIN_DOC_SLUGS = [
  "10-platform-chain",
  "20-device-chain",
  "30-signal-environment-chain",
  "40-sense-chain",
  "45-control-chain",
  "50-navigation-chain",
  "60-target-action-chain",
  "65-strike-chain",
  "70-maintenance-chain",
  "75-communication-chain"
];

/** Slugs of the extension/runtime docs. */
const EXTENSION_SLUGS = ["80-runtime-extension-nodes"];

// ──────────────────────────────────────────────────────────────────────────
// Parsing helpers
// ──────────────────────────────────────────────────────────────────────────

/**
 * Strip backticks ONLY when the cell is a single backtick-wrapped token
 * (i.e. an exact `identifier` cell). For mixed-content cells like
 * "`a`、`b`" we preserve the original markdown so the renderer can format it.
 */
function unwrapCell(s) {
  const trimmed = s.trim();
  const m = /^`([^`]+)`$/.exec(trimmed);
  return m ? m[1] : trimmed;
}

/** Split a markdown table row "| a | b | c |" into trimmed cell strings. */
function splitRow(line) {
  // Drop leading/trailing pipes, then split.
  const inner = line.replace(/^\s*\|/, "").replace(/\|\s*$/, "");
  return inner.split("|").map((c) => c.trim());
}

/**
 * Find a markdown table whose header row matches the predicate. Tables in our
 * docs frequently have blank lines between every row (the source uses double
 * spacing); the parser tolerates that by skipping blank lines while collecting
 * pipe rows.
 */
function nextNonBlank(lines, i) {
  while (i < lines.length && lines[i].trim() === "") i++;
  return i;
}

function findTable(lines, headerMatches) {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim().startsWith("|")) continue;
    const cells = splitRow(line);
    if (!headerMatches(cells)) continue;
    const sepIdx = nextNonBlank(lines, i + 1);
    const sep = lines[sepIdx];
    if (!sep || !/^\s*\|[\s\-:|]+\|\s*$/.test(sep)) continue;
    const rows = [];
    let j = nextNonBlank(lines, sepIdx + 1);
    while (j < lines.length) {
      const row = lines[j];
      if (row.trim() === "") {
        j++;
        continue;
      }
      if (!row.trim().startsWith("|")) break;
      rows.push(splitRow(row));
      j++;
    }
    return rows;
  }
  return null;
}

/**
 * Split a markdown body into top-level sections keyed by H2 heading.
 * Returns { headingText: bodyLines[] }.
 */
function splitH2Sections(text) {
  const lines = text.split(/\r?\n/);
  const out = {};
  let currentKey = "__preamble__";
  let buf = [];
  for (const line of lines) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m) {
      out[currentKey] = buf;
      currentKey = m[1].trim();
      buf = [];
    } else {
      buf.push(line);
    }
  }
  out[currentKey] = buf;
  return out;
}

/** Same but for H3 sub-sections within a section body. */
function splitH3Sections(bodyLines) {
  const out = {};
  let currentKey = "__preamble__";
  let buf = [];
  for (const line of bodyLines) {
    const m = /^###\s+(.+?)\s*$/.exec(line);
    if (m) {
      out[currentKey] = buf;
      currentKey = m[1].trim();
      buf = [];
    } else {
      buf.push(line);
    }
  }
  out[currentKey] = buf;
  return out;
}

/** Extract the first non-empty paragraph from an array of lines. */
function firstParagraph(lines) {
  const trimmed = lines
    .map((l) => l.trim())
    .filter((l, idx, arr) => !(l === "" && (idx === 0 || arr[idx - 1] === "")));
  let para = "";
  for (const line of trimmed) {
    if (line === "") {
      if (para) break;
      continue;
    }
    if (line.startsWith("|") || line.startsWith("- ") || line.startsWith("#")) {
      if (para) break;
      continue;
    }
    para = para ? `${para} ${line}` : line;
  }
  return para || undefined;
}

/** Match an H2 heading whose label is a backtick-wrapped node id. */
function nodeIdFromHeading(label) {
  const m = /^`([^`]+)`$/.exec(label.trim());
  return m ? m[1] : null;
}

// ──────────────────────────────────────────────────────────────────────────
// Per-doc parsers
// ──────────────────────────────────────────────────────────────────────────

/** Parse 02-ordered-execution.md → ChainOrderedEntry-shaped rows (without docSlug — filled later). */
function parseOrderedExecution(text) {
  const lines = text.split(/\r?\n/);
  const rows = findTable(lines, (cells) => {
    // Header row variants observed: "| # | 展示名 | Node | Group | Upstream | Downstream |"
    if (cells.length < 6) return false;
    return (
      cells[0].includes("#") &&
      cells[1].includes("展示名") &&
      /node/i.test(cells[2]) &&
      /group/i.test(cells[3])
    );
  });
  if (!rows) {
    throw new Error("02-ordered-execution.md: canonical order table not found");
  }
  return rows
    .filter((r) => r.length >= 6 && /^\d+$/.test(r[0]))
    .map((r) => ({
      order: Number(r[0]),
      displayName: r[1],
      nodeId: unwrapCell(r[2]),
      group: r[3],
      upstream: unwrapCell(r[4]),
      downstream: unwrapCell(r[5])
    }));
}

/**
 * Parse 01-overview.md → Map<displayName, docSlug>. The overview keeps the
 * canonical doc-level grouping table, so when a chain doc lags behind and
 * doesn't yet have a per-node section for a newly added canonical node, we
 * can still recover the intended owner doc by looking up the display name.
 */
function parseOverviewGrouping(text) {
  const lines = text.split(/\r?\n/);
  const rows = findTable(lines, (cells) => {
    if (cells.length < 4) return false;
    return /分组/.test(cells[0]) && /文档/.test(cells[1]) && /范围/.test(cells[3]);
  });
  const out = new Map();
  if (!rows) return out;
  for (const r of rows) {
    if (r.length < 4) continue;
    if (/分组/.test(r[0]) || /^[-:\s|]+$/.test(r[0])) continue;
    const docFile = unwrapCell(r[1]);
    const docSlug = docFile.replace(/\.md$/, "");
    const names = r[3].split(/[、,，]/).map((s) => s.trim()).filter(Boolean);
    for (const name of names) out.set(name, docSlug);
  }
  return out;
}

/** Parse 04-display-names.md → Map<nodeId, displayName>. */
function parseDisplayNames(text) {
  const lines = text.split(/\r?\n/);
  const rows = findTable(lines, (cells) => {
    if (cells.length < 3) return false;
    return (
      cells[0].includes("#") &&
      cells[1].includes("展示名") &&
      /Canonical/i.test(cells[2])
    );
  });
  const out = new Map();
  if (!rows) return out;
  for (const r of rows) {
    if (r.length < 3 || !/^\d+$/.test(r[0])) continue;
    out.set(unwrapCell(r[2]), r[1]);
  }
  return out;
}

/**
 * Parse a chain doc and return:
 *   { title, summary, sections: { [nodeId|sectionKey]: parsedNode | rawSection }, ownedNodeIds }.
 *
 * Per-node sections are H2 headings whose label is a backtick-wrapped node id.
 */
function parseChainDoc(slug, text, allOrderedNodeIds) {
  const titleMatch = /^#\s+(.+?)\s*$/m.exec(text);
  const title = titleMatch ? titleMatch[1].trim() : slug;

  const sections = splitH2Sections(text);
  let summary;
  if (sections["结论"]) summary = firstParagraph(sections["结论"]);

  const nodes = {};
  const ownedNodeIds = new Set();

  // 1. Per-node H2 sections
  for (const [heading, body] of Object.entries(sections)) {
    if (heading === "__preamble__") continue;
    const nodeId = nodeIdFromHeading(heading);
    if (!nodeId) continue;
    nodes[nodeId] = parseNodeSection(nodeId, body);
    ownedNodeIds.add(nodeId);
  }

  // 2. Fallback: nodes mentioned in the doc but without a per-node section
  // (e.g. 45-control-chain lists 3 node ids only in tables).
  // We claim ownership when the node id appears in the file body and isn't
  // already owned by another doc.
  for (const candidate of allOrderedNodeIds) {
    if (ownedNodeIds.has(candidate)) continue;
    if (text.includes(`\`${candidate}\``)) {
      ownedNodeIds.add(candidate);
      // No per-node markdown — viewer falls back to whole-doc render.
    }
  }

  return { title, summary, nodes, ownedNodeIds };
}

/** Extract structured fields from a single node's H2 section body. */
function parseNodeSection(nodeId, bodyLines) {
  const sub = splitH3Sections(bodyLines);

  const purpose = sub["目的"] ? firstParagraph(sub["目的"]) : undefined;

  const inputs = sub["输入"] ? parseContractTable(sub["输入"]) : undefined;
  const outputs = sub["输出"] ? parseContractTable(sub["输出"]) : undefined;

  const runtimeContract = sub["运行时契约"]
    ? sub["运行时契约"]
        .map((l) => l.replace(/^\s*-\s+/, "").trim())
        .filter((l) => l.length > 0 && !l.startsWith("|"))
    : undefined;

  const fallback = sub["回退策略"] ? firstParagraph(sub["回退策略"]) : undefined;
  const state = sub["状态与保留"] ? firstParagraph(sub["状态与保留"]) : undefined;

  let implementation;
  if (sub["实现映射"]) {
    const rows = findTable(sub["实现映射"], (cells) => cells.length >= 2);
    if (rows) {
      implementation = rows
        .filter((r) => r.length >= 2 && r[0] !== "层级")
        .map((r) => ({ layer: r[0].trim(), target: r[1].trim() }));
    }
  }

  let validation;
  if (sub["验证"]) {
    const rows = findTable(sub["验证"], (cells) => cells.length >= 2);
    if (rows) {
      validation = rows
        .filter((r) => r.length >= 2 && r[0] !== "检查项")
        .map((r) => ({ check: r[0].trim(), expected: r[1].trim() }));
    }
  }

  const markdown = bodyLines.join("\n").trim();

  return {
    nodeId,
    purpose,
    inputs,
    outputs,
    runtimeContract,
    fallback,
    state,
    implementation,
    validation,
    markdown
  };
}

/**
 * Parse a "输入" or "输出" table. Header columns vary slightly across docs;
 * we keep the first 4 columns as { contract, endpoint, required, note }.
 */
function parseContractTable(bodyLines) {
  const rows = findTable(bodyLines, (cells) => cells.length >= 2);
  if (!rows) return undefined;
  const dataRows = rows.filter(
    (r) => r.length >= 2 && r[0] !== "Contract" && !/^[-:\s|]+$/.test(r[0])
  );
  return dataRows.map((r) => ({
    contract: (r[0] ?? "").trim(),
    endpoint: (r[1] ?? "").trim(),
    required: (r[2] ?? "").trim() || undefined,
    note: (r[3] ?? "").trim() || undefined
  }));
}

// ──────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────

async function readDoc(slug) {
  const fileName = `${slug}.md`;
  const text = await fs.readFile(join(DOCS_DIR, fileName), "utf8");
  return { slug, fileName, text };
}

function escapeBacktickString(s) {
  return s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

async function main() {
  const ordered = parseOrderedExecution(
    (await readDoc("02-ordered-execution")).text
  );
  if (ordered.length === 0) {
    throw new Error(
      "Parsed 0 canonical core chain entries from 02-ordered-execution.md — the table format may have drifted."
    );
  }

  const displayNames = parseDisplayNames(
    (await readDoc("04-display-names")).text
  );

  // Doc-level grouping fallback: useful when a node id has been added to the
  // canonical 02-ordered-execution list but the owning chain doc hasn't grown
  // a per-node `## ` section for it yet.
  const overviewOwnerByDisplayName = parseOverviewGrouping(
    (await readDoc("01-overview")).text
  );

  const allOrderedNodeIds = new Set(ordered.map((e) => e.nodeId));

  // Read all docs upfront.
  const all = {};
  for (const slug of [...FOUNDATION_SLUGS, ...CHAIN_DOC_SLUGS, ...EXTENSION_SLUGS]) {
    all[slug] = await readDoc(slug);
  }

  // Parse chain docs and resolve doc → node ownership.
  const chainParsed = {};
  const ownerByNodeId = new Map();
  for (const slug of CHAIN_DOC_SLUGS) {
    const { text } = all[slug];
    const parsed = parseChainDoc(slug, text, allOrderedNodeIds);
    chainParsed[slug] = parsed;
    for (const nodeId of parsed.ownedNodeIds) {
      if (ownerByNodeId.has(nodeId)) {
        // First doc with an explicit per-node section wins; an implicit
        // mention can't override an explicit owner.
        const existing = ownerByNodeId.get(nodeId);
        const existingHasExplicit = !!chainParsed[existing].nodes[nodeId];
        const candidateHasExplicit = !!parsed.nodes[nodeId];
        if (existingHasExplicit) continue;
        if (candidateHasExplicit) {
          ownerByNodeId.set(nodeId, slug);
          continue;
        }
        // Both implicit — keep the first to preserve doc reading order.
        continue;
      }
      ownerByNodeId.set(nodeId, slug);
    }
  }

  // Fall back to 01-overview.md's doc-level grouping when neither per-node
  // sections nor chain-doc body mentions claim ownership. The display name in
  // 01-overview's "范围" column is what we look up.
  for (const entry of ordered) {
    if (ownerByNodeId.has(entry.nodeId)) continue;
    const displayName = displayNames.get(entry.nodeId) ?? entry.displayName;
    const fromOverview = overviewOwnerByDisplayName.get(displayName);
    if (fromOverview && CHAIN_DOC_SLUGS.includes(fromOverview)) {
      ownerByNodeId.set(entry.nodeId, fromOverview);
      // eslint-disable-next-line no-console
      console.warn(
        `chain-catalog: ${entry.nodeId} (${displayName}) inferred owner ${fromOverview} from 01-overview.md (chain doc lacks per-node section)`
      );
    }
  }

  // Anything still orphaned is a real docs gap — warn but keep building so the
  // viewer can flag the node for the reader.
  const orphans = ordered.filter((e) => !ownerByNodeId.has(e.nodeId));
  if (orphans.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `chain-catalog: no chain doc owns these canonical nodes (will appear under "未归类"): ${orphans
        .map((e) => e.nodeId)
        .join(", ")}`
    );
  }

  // Build catalog structures.
  const UNASSIGNED_SLUG = "_unassigned";
  const orderedEntries = ordered.map((e) => ({
    ...e,
    docSlug: ownerByNodeId.get(e.nodeId) ?? UNASSIGNED_SLUG,
    // Prefer the cross-validated display name from 04-display-names.md.
    displayName: displayNames.get(e.nodeId) ?? e.displayName
  }));
  const hasUnassigned = orderedEntries.some((e) => e.docSlug === UNASSIGNED_SLUG);

  const nodes = {};
  for (const entry of orderedEntries) {
    const owner = chainParsed[entry.docSlug];
    const explicit = owner.nodes[entry.nodeId];
    nodes[entry.nodeId] = {
      nodeId: entry.nodeId,
      displayName: entry.displayName,
      order: entry.order,
      docSlug: entry.docSlug,
      ...(explicit ?? {})
    };
  }

  // Build groups (one per chain doc, in canonical doc order). Synthesize an
  // "未归类" group on top when there are orphans, so the reader can spot them
  // without digging through the ordered execution list.
  const groups = [];
  if (hasUnassigned) {
    groups.push({
      id: UNASSIGNED_SLUG,
      title: "未归类",
      docSlug: UNASSIGNED_SLUG,
      nodeIds: orderedEntries
        .filter((e) => e.docSlug === UNASSIGNED_SLUG)
        .sort((a, b) => a.order - b.order)
        .map((e) => e.nodeId)
    });
  }
  for (const slug of CHAIN_DOC_SLUGS) {
    const owned = orderedEntries
      .filter((e) => e.docSlug === slug)
      .sort((a, b) => a.order - b.order)
      .map((e) => e.nodeId);
    groups.push({
      id: slug.replace(/^\d+-/, ""),
      title: chainParsed[slug].title,
      docSlug: slug,
      nodeIds: owned
    });
  }

  // Build doc dictionary.
  const docs = {};
  if (hasUnassigned) {
    docs[UNASSIGNED_SLUG] = {
      slug: UNASSIGNED_SLUG,
      fileName: "",
      title: "未归类节点",
      summary:
        "以下节点已在 02-ordered-execution.md / 04-display-names.md 中列出，但当前没有任何链路文档为其提供 ## 章节，01-overview.md 也未归入任一文档。请在对应链路文档中补充节点章节。",
      markdown: "",
      nodeIds: orderedEntries
        .filter((e) => e.docSlug === UNASSIGNED_SLUG)
        .sort((a, b) => a.order - b.order)
        .map((e) => e.nodeId)
    };
  }
  for (const slug of [...FOUNDATION_SLUGS, ...CHAIN_DOC_SLUGS, ...EXTENSION_SLUGS]) {
    const { fileName, text } = all[slug];
    const titleMatch = /^#\s+(.+?)\s*$/m.exec(text);
    const title = titleMatch ? titleMatch[1].trim() : slug;
    let summary;
    const sections = splitH2Sections(text);
    if (sections["结论"]) summary = firstParagraph(sections["结论"]);
    const nodeIds =
      slug in chainParsed
        ? orderedEntries
            .filter((e) => e.docSlug === slug)
            .sort((a, b) => a.order - b.order)
            .map((e) => e.nodeId)
        : [];
    docs[slug] = {
      slug,
      fileName,
      title,
      summary,
      markdown: text,
      nodeIds
    };
  }

  const catalog = {
    version: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    docs,
    foundationDocSlugs: FOUNDATION_SLUGS,
    extensionDocSlugs: EXTENSION_SLUGS,
    groups,
    nodes,
    orderedNodes: orderedEntries
  };

  // Emit a TS module that exports the catalog as a const.
  // Markdown bodies live in template literals — we escape backticks/${}.
  const replacer = (_key, value) => value;
  const json = JSON.stringify(catalog, replacer, 2);

  // For very large markdown blobs the JSON string is fine; the TS module just
  // re-exports it. Keep it simple and embed as JSON — the renderer imports it
  // as a value, not as code.
  const banner =
    "// AUTO-GENERATED by scripts/build-chain-catalog.mjs — do not edit.\n" +
    "// Regenerate with: pnpm chain-catalog\n" +
    "import type { ChainCatalog } from \"@tinder/nextstep\";\n\n";
  const body = `export const CHAIN_CATALOG: ChainCatalog = ${json} as const;\n`;

  await fs.mkdir(dirname(OUT_FILE), { recursive: true });
  await fs.writeFile(OUT_FILE, banner + body, "utf8");

  // eslint-disable-next-line no-console
  console.log(
    `chain-catalog: wrote ${OUT_FILE} (${ordered.length} nodes, ${groups.length} groups)`
  );
  void escapeBacktickString;
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
