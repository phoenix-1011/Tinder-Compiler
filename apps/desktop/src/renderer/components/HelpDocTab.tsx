import { CHAIN_CATALOG } from "../help/chain-catalog.generated";
import { Markdown } from "../help/Markdown";

/**
 * Renders one chain catalog node as a tab body. The user reaches this tab
 * through the chain editor's `查看文档` shortcut. The display follows the
 * same shape as the standalone chain-help view but stays inside the
 * regular tab system so the user keeps full tab management (pin, drag,
 * close, preview replacement).
 */
export function HelpDocTab({ nodeId }: { nodeId: string }) {
  const node = CHAIN_CATALOG.nodes[nodeId];
  if (!node) {
    return (
      <div className="help-doc-tab is-missing">
        <p>未找到节点：{nodeId}</p>
        <p className="chain-help-hint">
          重新生成 catalog：<code>node scripts/build-chain-catalog.mjs</code>
        </p>
      </div>
    );
  }
  const owningDoc = CHAIN_CATALOG.docs[node.docSlug];
  const body =
    node.markdown ??
    owningDoc?.markdown ??
    "_本节点尚未在链路文档中提供章节。_";
  return (
    <article className="help-doc-tab">
      <header className="help-doc-tab-header">
        <span className="help-doc-tab-order">{node.order ?? "·"}</span>
        <h1>{node.displayName}</h1>
        <code className="help-doc-tab-id">{node.nodeId}</code>
      </header>
      <div className="help-doc-tab-body">
        <Markdown source={body} />
      </div>
    </article>
  );
}
