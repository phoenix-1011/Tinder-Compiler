interface AboutModalProps {
  open: boolean;
  onClose(): void;
}

export function AboutModal({ open, onClose }: AboutModalProps) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal-card about-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="about-header">
          <span className="codicon codicon-flame about-logo" aria-hidden="true" />
          <div>
            <h1>Tinder Compiler</h1>
            <p className="about-version">0.1.0 · Windows · 内部分发</p>
          </div>
        </div>
        <p className="about-line">
          面向项目的定制化编辑器 · 编译运行 · AI 辅助编程
        </p>
        <ul className="about-stack">
          <li><strong>编辑器内核</strong>：Monaco</li>
          <li><strong>语法高亮</strong>：vscode-textmate + onigasm</li>
          <li><strong>语言服务</strong>：vscode-jsonrpc + clangd / pyright / gopls / rust-analyzer（按 PATH 自动启用）</li>
          <li><strong>终端</strong>：xterm.js + node-pty + Shell Integration (OSC 633)</li>
          <li><strong>搜索</strong>：@vscode/ripgrep</li>
          <li><strong>桌面壳</strong>：Electron</li>
        </ul>
        <button className="primary-button about-close" onClick={onClose}>
          关闭
        </button>
      </div>
    </div>
  );
}
