/**
 * Static catalog generated from `docs/flowchat/chain-contract/*.md`.
 *
 * The Markdown files are the SSOT. A build-time script (scripts/build-chain-catalog.mjs)
 * parses them into the structures defined here. The generated artifact is consumed by
 * the in-app help viewer and — in a follow-up — by the compute resource creation form
 * for auto-population and validation of input/output contracts.
 *
 * Most fields are optional because the Markdown format is still tightening; the parser
 * fills what it can and the viewer falls back to raw markdown when a field is missing.
 */

/**
 * A single row of an "输入" or "输出" table inside a node section.
 *
 * The third column's semantics depend on the table the row was parsed from:
 * - Input tables: "是否必需" — values like "是" / "否".
 * - Output tables: "生命周期" — e.g. "按 contract 类型".
 *
 * Stored generically here because the parser doesn't track which table it
 * came from once the row is extracted; consumers that need to render a
 * header should pick a label based on whether the row lives in `inputs` or
 * `outputs` on the owning `ChainNodeEntry`.
 */
export interface ChainContractRow {
  /** First column — typically a `shared.*` / `runtime.*` / `transient.*` contract name or an open description. */
  contract: string;
  /** Second column — source / target / consumer, depending on the table. */
  endpoint: string;
  /** Third column — required flag for inputs, lifecycle for outputs. */
  qualifier?: string;
  /** Free-form note. */
  note?: string;
}

/** Single row of the canonical ordered execution table. */
export interface ChainOrderedEntry {
  order: number;
  /** Canonical node id, e.g. `platform.entity.update`. */
  nodeId: string;
  /** 中文展示名, e.g. "实体维护". */
  displayName: string;
  /** Logical group from the ordered execution table — narrower than docSlug. */
  group: string;
  upstream: string;
  downstream: string;
  /** Slug of the chain doc that describes this node, e.g. `10-platform-chain`. */
  docSlug: string;
}

/** A per-node slice extracted from a chain doc. */
export interface ChainNodeEntry {
  nodeId: string;
  displayName: string;
  /** 1-based position in the canonical ordered execution table; undefined for nodes outside it. */
  order?: number;
  /** docSlug owning this node. */
  docSlug: string;
  /** Best-effort extracted "目的" paragraph. */
  purpose?: string;
  inputs?: ChainContractRow[];
  outputs?: ChainContractRow[];
  /** Lines under "运行时契约" — typically `@pre` / `@post` / `@invariant` / `@failure`. */
  runtimeContract?: string[];
  fallback?: string;
  /** "状态与保留" paragraph. */
  state?: string;
  /** "实现映射" rows: layer → file/function. */
  implementation?: Array<{ layer: string; target: string }>;
  /** "验证" rows: check → expected. */
  validation?: Array<{ check: string; expected: string }>;
  /** Markdown body for just this node section, when extractable. */
  markdown?: string;
}

/** A chain document — corresponds to one .md file under docs/flowchat/chain-contract. */
export interface ChainDoc {
  slug: string;
  /** Filename, e.g. `10-platform-chain.md`. */
  fileName: string;
  /** H1 of the document. */
  title: string;
  /** Full markdown source. Used as fallback render when a node section can't be sliced. */
  markdown: string;
  /** Canonical node ids that this doc describes (in canonical order). */
  nodeIds: string[];
}

/** UI grouping — one entry per chain doc that exposes nodes. Ordered for display. */
export interface ChainGroup {
  id: string;
  title: string;
  docSlug: string;
  nodeIds: string[];
}

export interface ChainCatalog {
  /** Bumped when the schema changes. */
  version: number;
  /** ISO-8601 timestamp at generation time. */
  generatedAt: string;
  /** All docs keyed by slug — includes foundation (00..04), chain (10..70) and extension (80) docs. */
  docs: Record<string, ChainDoc>;
  /** Slugs of foundation docs, in reading order. */
  foundationDocSlugs: string[];
  /** Slugs of extension docs (80-runtime-extension-nodes etc.), in reading order. */
  extensionDocSlugs: string[];
  /** UI grouping for chain docs. */
  groups: ChainGroup[];
  /** Per-node entries keyed by canonical node id. */
  nodes: Record<string, ChainNodeEntry>;
  /** Canonical ordered execution list, in order. */
  orderedNodes: ChainOrderedEntry[];
}
