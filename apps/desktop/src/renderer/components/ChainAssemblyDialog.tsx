import { useCallback, useEffect, useRef, useState } from "react";

export interface DialogPickerOption {
  id: string;
  label: string;
  /** Optional secondary line — rendered muted under the label. */
  hint?: string;
  /** Optional category for the in-dialog category filter. */
  categoryId?: string;
}

export interface DialogPickerCategory {
  id: string;
  label: string;
}

export interface DialogState {
  title: string;
  message?: string;
  /** undefined = confirm/notify (no input). Defined (even "") = render input. */
  inputDefault?: string;
  inputPlaceholder?: string;
  /** When true, render a multi-line `<textarea>` instead of a single-line input. */
  multiline?: boolean;
  okLabel?: string;
  /** Empty string hides the cancel button (notify-style dialogs). */
  cancelLabel?: string;
  destructive?: boolean;
  /** When set, the dialog renders a searchable picker over these options. */
  options?: DialogPickerOption[];
  /** Initial id to highlight in the picker; first match wins. */
  initialOptionId?: string;
  /**
   * Optional secondary filter shown above the picker list. When set,
   * the picker renders a category selector; rows whose `categoryId`
   * doesn't match the current selection are hidden.
   */
  categories?: DialogPickerCategory[];
  categoryLabel?: string;
  resolve: (value: string | null) => void;
}

export interface DialogApi {
  state: DialogState | null;
  prompt(opts: {
    title: string;
    defaultValue?: string;
    placeholder?: string;
    okLabel?: string;
    /** When true, render a multi-line textarea for the input. */
    multiline?: boolean;
  }): Promise<string | null>;
  confirm(opts: {
    title: string;
    message?: string;
    okLabel?: string;
    destructive?: boolean;
  }): Promise<boolean>;
  notify(opts: { title: string; message?: string }): Promise<void>;
  /**
   * Searchable single-pick dialog. Resolves with the chosen option id, or
   * `null` when the user cancels.
   */
  pickOne(opts: {
    title: string;
    placeholder?: string;
    options: DialogPickerOption[];
    initialOptionId?: string;
    categories?: DialogPickerCategory[];
    categoryLabel?: string;
  }): Promise<string | null>;
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
          multiline: opts.multiline,
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
  const pickOne: DialogApi["pickOne"] = useCallback(
    (opts) =>
      new Promise<string | null>((resolve) => {
        setState({
          title: opts.title,
          inputPlaceholder: opts.placeholder,
          options: opts.options,
          initialOptionId: opts.initialOptionId,
          categories: opts.categories,
          categoryLabel: opts.categoryLabel,
          resolve: (v) => {
            setState(null);
            resolve(v);
          }
        });
      }),
    []
  );
  return { state, prompt, confirm, notify, pickOne };
}

export function DialogModal({ state }: { state: DialogState }) {
  if (state.options) {
    return <PickerModal state={state} />;
  }
  return <PromptOrConfirmModal state={state} />;
}

function PromptOrConfirmModal({ state }: { state: DialogState }) {
  const isPrompt = state.inputDefault !== undefined;
  const isMultiline = isPrompt && state.multiline === true;
  const [value, setValue] = useState(state.inputDefault ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isPrompt) return;
    if (isMultiline) {
      textareaRef.current?.focus();
      // Place caret at end so users can continue typing rather than
      // immediately overwriting prefilled text.
      const len = textareaRef.current?.value.length ?? 0;
      textareaRef.current?.setSelectionRange(len, len);
    } else {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isPrompt, isMultiline]);

  const ok = () => state.resolve(isPrompt ? value : "ok");
  const cancel = () => state.resolve(null);
  const showCancel = state.cancelLabel !== "";

  return (
    <div className="modal-backdrop" onMouseDown={cancel}>
      <div
        className={`modal-card ca-dialog-card${
          isMultiline ? " ca-dialog-card-wide" : ""
        }`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="ca-dialog-title">{state.title}</div>
        {state.message && <div className="ca-dialog-message">{state.message}</div>}
        {isPrompt && !isMultiline && (
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
        {isPrompt && isMultiline && (
          <textarea
            ref={textareaRef}
            className="ca-dialog-input ca-dialog-textarea"
            value={value}
            placeholder={state.inputPlaceholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
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

function PickerModal({ state }: { state: DialogState }) {
  const options = state.options!;
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [selectedIdx, setSelectedIdx] = useState(() => {
    if (state.initialOptionId) {
      const i = options.findIndex((o) => o.id === state.initialOptionId);
      if (i >= 0) return i;
    }
    return 0;
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = (() => {
    const q = query.trim().toLowerCase();
    let pool = options;
    if (state.categories && category !== "all") {
      pool = pool.filter((o) => o.categoryId === category);
    }
    if (!q) return pool;
    return pool.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q) ||
        (o.hint?.toLowerCase().includes(q) ?? false)
    );
  })();

  // Clamp selection inside the filtered window.
  const safeIdx = Math.min(selectedIdx, Math.max(0, filtered.length - 1));

  useEffect(() => {
    // Keep the highlighted row scrolled into view.
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-idx="${safeIdx}"]`
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [safeIdx, query]);

  const cancel = () => state.resolve(null);
  const confirm = (id: string) => state.resolve(id);

  return (
    <div className="modal-backdrop" onMouseDown={cancel}>
      <div className="modal-card ca-picker-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="ca-dialog-title">{state.title}</div>
        <div className="ca-picker-toolbar">
          {state.categories && state.categories.length > 0 && (
            <select
              className="ca-dialog-input ca-picker-toolbar-select"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setSelectedIdx(0);
              }}
              title={state.categoryLabel ?? "类型"}
            >
              <option value="all">全部</option>
              {state.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          )}
          <input
            ref={inputRef}
            className="ca-dialog-input ca-picker-toolbar-search"
            value={query}
            placeholder={state.inputPlaceholder ?? "搜索…"}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIdx(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelectedIdx((i) => Math.min(filtered.length - 1, i + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelectedIdx((i) => Math.max(0, i - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const pick = filtered[safeIdx];
                if (pick) confirm(pick.id);
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancel();
              }
            }}
          />
        </div>
        <div className="ca-picker-list" ref={listRef}>
          {filtered.length === 0 && (
            <div className="ca-picker-empty">无匹配项</div>
          )}
          {filtered.map((opt, i) => (
            <div
              key={opt.id}
              data-idx={i}
              className={`ca-picker-row${i === safeIdx ? " is-active" : ""}`}
              onMouseEnter={() => setSelectedIdx(i)}
              onClick={() => confirm(opt.id)}
            >
              <div className="ca-picker-label">{opt.label}</div>
              {opt.hint && <div className="ca-picker-hint">{opt.hint}</div>}
            </div>
          ))}
        </div>
        <div className="ca-dialog-actions">
          <button type="button" className="ca-dialog-btn" onClick={cancel}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
