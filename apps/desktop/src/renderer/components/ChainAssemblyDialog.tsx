import { useCallback, useEffect, useRef, useState } from "react";

export interface DialogState {
  title: string;
  message?: string;
  /** undefined = confirm/notify (no input). Defined (even "") = render input. */
  inputDefault?: string;
  inputPlaceholder?: string;
  okLabel?: string;
  /** Empty string hides the cancel button (notify-style dialogs). */
  cancelLabel?: string;
  destructive?: boolean;
  resolve: (value: string | null) => void;
}

export interface DialogApi {
  state: DialogState | null;
  prompt(opts: {
    title: string;
    defaultValue?: string;
    placeholder?: string;
    okLabel?: string;
  }): Promise<string | null>;
  confirm(opts: {
    title: string;
    message?: string;
    okLabel?: string;
    destructive?: boolean;
  }): Promise<boolean>;
  notify(opts: { title: string; message?: string }): Promise<void>;
}

export function useDialog(): DialogApi {
  const [state, setState] = useState<DialogState | null>(null);
  const prompt: DialogApi["prompt"] = useCallback(
    (opts) =>
      new Promise<string | null>((resolve) => {
        setState({
          title: opts.title,
          inputDefault: opts.defaultValue ?? "",
          inputPlaceholder: opts.placeholder,
          okLabel: opts.okLabel,
          resolve: (v) => {
            setState(null);
            resolve(v);
          }
        });
      }),
    []
  );
  const confirm: DialogApi["confirm"] = useCallback(
    (opts) =>
      new Promise<boolean>((resolve) => {
        setState({
          title: opts.title,
          message: opts.message,
          okLabel: opts.okLabel ?? (opts.destructive ? "删除" : "确定"),
          destructive: opts.destructive,
          resolve: (v) => {
            setState(null);
            resolve(v !== null);
          }
        });
      }),
    []
  );
  const notify: DialogApi["notify"] = useCallback(
    (opts) =>
      new Promise<void>((resolve) => {
        setState({
          title: opts.title,
          message: opts.message,
          okLabel: "确定",
          cancelLabel: "",
          resolve: () => {
            setState(null);
            resolve();
          }
        });
      }),
    []
  );
  return { state, prompt, confirm, notify };
}

export function DialogModal({ state }: { state: DialogState }) {
  const isPrompt = state.inputDefault !== undefined;
  const [value, setValue] = useState(state.inputDefault ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isPrompt) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isPrompt]);

  const ok = () => state.resolve(isPrompt ? value : "ok");
  const cancel = () => state.resolve(null);
  const showCancel = state.cancelLabel !== "";

  return (
    <div className="modal-backdrop" onMouseDown={cancel}>
      <div className="modal-card ca-dialog-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="ca-dialog-title">{state.title}</div>
        {state.message && <div className="ca-dialog-message">{state.message}</div>}
        {isPrompt && (
          <input
            ref={inputRef}
            className="ca-dialog-input"
            value={value}
            placeholder={state.inputPlaceholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                ok();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancel();
              }
            }}
          />
        )}
        <div className="ca-dialog-actions">
          {showCancel && (
            <button type="button" className="ca-dialog-btn" onClick={cancel}>
              {state.cancelLabel ?? "取消"}
            </button>
          )}
          <button
            type="button"
            className={`ca-dialog-btn ${state.destructive ? "is-destructive" : "is-primary"}`}
            onClick={ok}
          >
            {state.okLabel ?? "确定"}
          </button>
        </div>
      </div>
    </div>
  );
}
