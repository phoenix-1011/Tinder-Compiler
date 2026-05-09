import { type ReactNode } from "react";
import { CHAIN_CATALOG } from "./chain-catalog.generated";
import { useChainHelp, type HelpSelection } from "./ChainHelpContext";

/** Foundation docs displayed in the "概览与规范" section. Order is fixed. */
const FOUNDATION_LABELS: Record<string, string> = {
  "01-overview": "总览",
  "02-ordered-execution": "执行顺序",
  "03-row-taxonomy": "Row 契约",
  "04-display-names": "展示名索引",
  "00-format-standard": "文档格式规范"
};

/** Foundation reading order: overview first, then drill-downs. */
const FOUNDATION_ORDER = [
  "01-overview",
  "02-ordered-execution",
  "03-row-taxonomy",
  "04-display-names",
  "00-format-standard"
];

export function ChainHelpSidebar() {
  const { selection, selectDoc, selectNode, expanded, toggle } = useChainHelp();

  return (
    <div className="chain-help-sidebar">
      <Section
        id="section.foundation"
        title="概览与规范"
        expanded={expanded["section.foundation"] ?? true}
        onToggle={() => toggle("section.foundation")}
      >
        {FOUNDATION_ORDER.map((slug) => {
          const doc = CHAIN_CATALOG.docs[slug];
          if (!doc) return null;
          return (
            <Row
              key={slug}
              depth={1}
              label={FOUNDATION_LABELS[slug] ?? doc.title}
              active={isDocActive(selection, slug)}
              onClick={() => selectDoc(slug)}
            />
          );
        })}
      </Section>

      <Section
        id="section.chains"
        title="链路"
        expanded={expanded["section.chains"] ?? true}
        onToggle={() => toggle("section.chains")}
      >
        {CHAIN_CATALOG.groups.map((group) => {
          const groupKey = `group.${group.docSlug}`;
          const groupOpen = expanded[groupKey] ?? false;
          return (
            <div key={group.docSlug}>
              <Row
                depth={1}
                label={group.title}
                expandable
                expanded={groupOpen}
                active={isDocActive(selection, group.docSlug)}
                onClick={() => {
                  toggle(groupKey);
                  selectDoc(group.docSlug);
                }}
                badge={`${group.nodeIds.length}`}
              />
              {groupOpen &&
                group.nodeIds.map((nodeId) => {
                  const node = CHAIN_CATALOG.nodes[nodeId];
                  if (!node) return null;
                  const order = node.order ?? "·";
                  return (
                    <Row
                      key={nodeId}
                      depth={2}
                      label={`${order}. ${node.displayName}`}
                      hint={nodeId}
                      active={isNodeActive(selection, nodeId)}
                      onClick={() => selectNode(nodeId)}
                    />
                  );
                })}
            </div>
          );
        })}
      </Section>

      <Section
        id="section.extensions"
        title="扩展节点"
        expanded={expanded["section.extensions"] ?? true}
        onToggle={() => toggle("section.extensions")}
      >
        {CHAIN_CATALOG.extensionDocSlugs.map((slug) => {
          const doc = CHAIN_CATALOG.docs[slug];
          if (!doc) return null;
          return (
            <Row
              key={slug}
              depth={1}
              label={doc.title}
              active={isDocActive(selection, slug)}
              onClick={() => selectDoc(slug)}
            />
          );
        })}
      </Section>
    </div>
  );
}

function isDocActive(sel: HelpSelection, slug: string): boolean {
  return sel.kind === "doc" && sel.docSlug === slug;
}
function isNodeActive(sel: HelpSelection, nodeId: string): boolean {
  return sel.kind === "node" && sel.nodeId === nodeId;
}

// ──────────────────────────────────────────────────────────────────────────
// Reusable section + row (visual parity with the Chain Assembly sidebar).
// ──────────────────────────────────────────────────────────────────────────

interface SectionProps {
  id: string;
  title: string;
  expanded: boolean;
  onToggle(): void;
  children: ReactNode;
}

function Section({ title, expanded, onToggle, children }: SectionProps) {
  return (
    <div className="ca-section">
      <div className="ca-section-header" onClick={onToggle}>
        <span
          className={`codicon ca-section-chevron codicon-${
            expanded ? "chevron-down" : "chevron-right"
          }`}
          aria-hidden="true"
        />
        <span className="ca-section-title">{title}</span>
      </div>
      {expanded && <div className="ca-section-body">{children}</div>}
    </div>
  );
}

interface RowProps {
  depth: number;
  label: string;
  active?: boolean;
  expandable?: boolean;
  expanded?: boolean;
  hint?: string;
  badge?: string;
  onClick(): void;
}

function rowPadding(depth: number): number {
  if (depth <= 0) return 12;
  if (depth === 1) return 20;
  return 28 + (depth - 2) * 8;
}

function Row({ depth, label, active, expandable, expanded, hint, badge, onClick }: RowProps) {
  const pad = rowPadding(depth);
  const indent = { paddingLeft: `${pad}px` } as React.CSSProperties;
  const className = ["explorer-row", active ? "is-active" : ""].filter(Boolean).join(" ");
  const chevronIcon = expandable ? (expanded ? "chevron-down" : "chevron-right") : "";
  return (
    <div
      className={className}
      style={indent}
      data-depth={depth}
      onClick={onClick}
      title={hint}
    >
      <span
        className={`codicon explorer-chevron${chevronIcon ? ` codicon-${chevronIcon}` : ""}`}
        aria-hidden="true"
      />
      <span className="explorer-name">{label}</span>
      {badge && <span className="chain-help-badge">{badge}</span>}
    </div>
  );
}
