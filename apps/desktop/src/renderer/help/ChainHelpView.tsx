import { useMemo } from "react";
import type { ChainContractRow, ChainNodeEntry } from "@tinder/nextstep";
import { CHAIN_CATALOG } from "./chain-catalog.generated";
import { useChainHelp } from "./ChainHelpContext";
import { Markdown } from "./Markdown";

export function ChainHelpView() {
  const { selection, selectNode, selectDoc } = useChainHelp();

  const body = useMemo(() => {
    if (selection.kind === "doc") {
      const doc = CHAIN_CATALOG.docs[selection.docSlug];
      if (!doc) return <Missing what={selection.docSlug} />;
      const ownedNodes = doc.nodeIds
        .map((id) => CHAIN_CATALOG.nodes[id])
        .filter((n): n is ChainNodeEntry => Boolean(n));
      return (
        <>
          {ownedNodes.length > 0 && (
            <div className="chain-help-quicknav">
              <span className="chain-help-quicknav-label">本链路节点</span>
              {ownedNodes.map((n) => (
                <button
                  key={n.nodeId}
                  type="button"
                  className="chain-help-quicknav-chip"
                  onClick={() => selectNode(n.nodeId)}
                  title={n.nodeId}
                >
                  <span className="chain-help-quicknav-order">
                    {n.order ?? "·"}
                  </span>
                  <span>{n.displayName}</span>
                </button>
              ))}
            </div>
          )}
          <Markdown source={doc.markdown} />
        </>
      );
    }

    const node = CHAIN_CATALOG.nodes[selection.nodeId];
    if (!node) return <Missing what={selection.nodeId} />;
    const owningDoc = CHAIN_CATALOG.docs[node.docSlug];
    return <NodeDetail node={node} owningDocTitle={owningDoc?.title} onOpenDoc={selectDoc} />;
  }, [selection, selectNode, selectDoc]);

  return (
    <div className="chain-help-view">
      <div className="chain-help-content">{body}</div>
    </div>
  );
}

function Missing({ what }: { what: string }) {
  return (
    <div className="chain-help-missing">
      <p>未找到内容：{what}</p>
      <p className="chain-help-hint">
        重新生成 catalog：<code>node scripts/build-chain-catalog.mjs</code>
      </p>
    </div>
  );
}

function NodeDetail({
  node,
  owningDocTitle,
  onOpenDoc
}: {
  node: ChainNodeEntry;
  owningDocTitle?: string;
  onOpenDoc(slug: string): void;
}) {
  const hasStructured =
    !!node.purpose ||
    (node.inputs && node.inputs.length > 0) ||
    (node.outputs && node.outputs.length > 0) ||
    (node.runtimeContract && node.runtimeContract.length > 0) ||
    !!node.fallback ||
    !!node.state ||
    (node.implementation && node.implementation.length > 0) ||
    (node.validation && node.validation.length > 0);

  return (
    <article className="chain-help-node">
      <header className="chain-help-node-header">
        <div className="chain-help-node-title">
          <span className="chain-help-node-order">{node.order ?? "·"}</span>
          <h1>{node.displayName}</h1>
          <code className="chain-help-node-id">{node.nodeId}</code>
        </div>
        {owningDocTitle && (
          <button
            type="button"
            className="chain-help-link-button"
            onClick={() => onOpenDoc(node.docSlug)}
          >
            ← 返回链路文档：{owningDocTitle}
          </button>
        )}
      </header>

      {!hasStructured && (
        <p className="chain-help-hint">
          本节点未在链路文档中提取出结构化字段，请查看上方"返回链路文档"。
        </p>
      )}

      {node.purpose && <Field title="目的">{node.purpose}</Field>}

      {node.inputs && node.inputs.length > 0 && (
        <Field title="输入">
          <ContractTable rows={node.inputs} kind="input" />
        </Field>
      )}

      {node.outputs && node.outputs.length > 0 && (
        <Field title="输出">
          <ContractTable rows={node.outputs} kind="output" />
        </Field>
      )}

      {node.runtimeContract && node.runtimeContract.length > 0 && (
        <Field title="运行时契约">
          <ul className="chain-help-bullets">
            {node.runtimeContract.map((line, i) => (
              <li key={i}>
                <Markdown source={line} />
              </li>
            ))}
          </ul>
        </Field>
      )}

      {node.fallback && <Field title="回退策略">{node.fallback}</Field>}
      {node.state && <Field title="状态与保留">{node.state}</Field>}

      {node.implementation && node.implementation.length > 0 && (
        <Field title="实现映射">
          <table className="md-table">
            <thead>
              <tr>
                <th style={{ width: "30%" }}>层级</th>
                <th>文件 / 类型 / 函数</th>
              </tr>
            </thead>
            <tbody>
              {node.implementation.map((row, i) => (
                <tr key={i}>
                  <td>{row.layer}</td>
                  <td>
                    <Markdown source={row.target} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Field>
      )}

      {node.validation && node.validation.length > 0 && (
        <Field title="验证">
          <table className="md-table">
            <thead>
              <tr>
                <th style={{ width: "40%" }}>检查项</th>
                <th>期望结果</th>
              </tr>
            </thead>
            <tbody>
              {node.validation.map((row, i) => (
                <tr key={i}>
                  <td>
                    <Markdown source={row.check} />
                  </td>
                  <td>
                    <Markdown source={row.expected} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Field>
      )}

    </article>
  );
}

function Field({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="chain-help-field">
      <h2 className="chain-help-field-title">{title}</h2>
      <div className="chain-help-field-body">
        {typeof children === "string" ? <Markdown source={children} /> : children}
      </div>
    </section>
  );
}

function ContractTable({
  rows,
  kind
}: {
  rows: ChainContractRow[];
  kind: "input" | "output";
}) {
  const required = kind === "input";
  return (
    <table className="md-table">
      <thead>
        <tr>
          <th style={{ width: "20%" }}>Contract</th>
          <th style={{ width: "30%" }}>{required ? "来源" : "目标"}</th>
          <th style={{ width: "15%" }}>{required ? "是否必需" : "生命周期"}</th>
          <th>说明</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            <td>
              <Markdown source={row.contract} />
            </td>
            <td>
              <Markdown source={row.endpoint} />
            </td>
            <td>{row.required ?? ""}</td>
            <td>
              <Markdown source={row.note ?? ""} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
