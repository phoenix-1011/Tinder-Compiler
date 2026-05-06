import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

interface Props {
  children: ReactNode;
}

/**
 * Top-level error boundary. Without this, any throw during render unmounts the
 * entire tree and the renderer paints nothing — looks identical to "the
 * background colour". With this, the error is shown on a red panel and we
 * still print to the console so DevTools shows it.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error("[tinder] uncaught render error:", error, info);
    this.setState({ info });
  }

  reset = () => this.setState({ error: null, info: null });

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="error-boundary">
        <div className="error-boundary-card">
          <h1>渲染时发生错误</h1>
          <p className="error-boundary-msg">{this.state.error.message}</p>
          {this.state.error.stack && (
            <pre className="error-boundary-stack">{this.state.error.stack}</pre>
          )}
          {this.state.info?.componentStack && (
            <pre className="error-boundary-stack">{this.state.info.componentStack}</pre>
          )}
          <button className="primary-button" onClick={this.reset}>
            重试
          </button>
          <p className="error-boundary-hint">
            完整错误已写入 DevTools 控制台。按 <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>I</kbd> 查看。
          </p>
        </div>
      </div>
    );
  }
}
