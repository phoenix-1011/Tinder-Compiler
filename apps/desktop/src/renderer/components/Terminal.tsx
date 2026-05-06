import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm, type IDisposable } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

interface CommandState {
  running: boolean;
  cwd: string;
  lastCommand: string;
  lastExitCode: number;
}

const INITIAL_STATE: CommandState = {
  running: false,
  cwd: "",
  lastCommand: "",
  lastExitCode: 0
};

interface TerminalPanelProps {
  /** Optional initial working directory for the PTY. */
  cwd?: string;
  /** Notified when shell integration reports a new state. */
  onStateChange?(state: CommandState): void;
}

/** Decode `\xNN` escape sequences emitted by the shell integration scripts. */
function decodeOscValue(raw: string): string {
  return raw.replace(/\\x([0-9a-fA-F]{2})/g, (_m, hex: string) =>
    String.fromCharCode(parseInt(hex, 16))
  );
}

export function TerminalPanel({ cwd, onStateChange }: TerminalPanelProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<CommandState>(INITIAL_STATE);
  const stateRef = useRef<CommandState>(INITIAL_STATE);

  useEffect(() => {
    stateRef.current = state;
    onStateChange?.(state);
  }, [state, onStateChange]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new XTerm({
      theme: {
        background: "#1e1e1e",
        foreground: "#cccccc",
        cursor: "#aeafad",
        selectionBackground: "#264f78",
        black: "#000000",
        red: "#cd3131",
        green: "#0dbc79",
        yellow: "#e5e510",
        blue: "#2472c8",
        magenta: "#bc3fbc",
        cyan: "#11a8cd",
        white: "#e5e5e5",
        brightBlack: "#666666",
        brightRed: "#f14c4c",
        brightGreen: "#23d18b",
        brightYellow: "#f5f543",
        brightBlue: "#3b8eea",
        brightMagenta: "#d670d6",
        brightCyan: "#29b8db",
        brightWhite: "#e5e5e5"
      },
      fontFamily: "Consolas, 'Cascadia Code', 'Courier New', monospace",
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: "bar",
      allowProposedApi: true,
      scrollback: 5000,
      convertEol: false,
      windowsMode: navigator.userAgent.includes("Windows")
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());

    term.open(host);

    // Fit once layout settles.
    requestAnimationFrame(() => {
      try {
        fitAddon.fit();
      } catch {
        /* ignore — host may not be visible yet */
      }
    });

    // Shell integration: OSC 633 handler.
    const oscDisposable: IDisposable = term.parser.registerOscHandler(633, (data) => {
      const semi = data.indexOf(";");
      const cmd = semi === -1 ? data : data.slice(0, semi);
      const payload = semi === -1 ? "" : data.slice(semi + 1);
      switch (cmd) {
        case "A": // prompt start
          break;
        case "B": // prompt end / command line start
          break;
        case "C": // command execution start
          setState((s) => ({ ...s, running: true }));
          break;
        case "D": {
          const code = Number.parseInt(payload, 10);
          setState((s) => ({ ...s, running: false, lastExitCode: Number.isFinite(code) ? code : 0 }));
          break;
        }
        case "E":
          setState((s) => ({ ...s, lastCommand: decodeOscValue(payload) }));
          break;
        case "P": {
          // P;Key=Value
          const eq = payload.indexOf("=");
          if (eq > 0) {
            const key = payload.slice(0, eq);
            const value = decodeOscValue(payload.slice(eq + 1));
            if (key === "Cwd") setState((s) => ({ ...s, cwd: value }));
          }
          break;
        }
        default:
          break;
      }
      return true;
    });

    let ptyId: number | null = null;
    let unsubData: (() => void) | null = null;
    let unsubExit: (() => void) | null = null;
    let inputDisposable: IDisposable | null = null;
    let resizeDisposable: IDisposable | null = null;
    let cancelled = false;

    (async () => {
      try {
        const result = await window.tinder.terminal.create({
          cwd,
          cols: term.cols,
          rows: term.rows
        });
        if (cancelled) {
          await window.tinder.terminal.dispose(result.id);
          return;
        }
        ptyId = result.id;

        unsubData = window.tinder.terminal.onData(ptyId, (chunk) => term.write(chunk));
        unsubExit = window.tinder.terminal.onExit(ptyId, ({ exitCode }) => {
          term.write(`\r\n\x1b[2m[进程已退出，退出码 ${exitCode}]\x1b[0m\r\n`);
        });

        inputDisposable = term.onData((data) => {
          if (ptyId != null) window.tinder.terminal.write(ptyId, data);
        });

        resizeDisposable = term.onResize(({ cols, rows }) => {
          if (ptyId != null) window.tinder.terminal.resize(ptyId, cols, rows);
        });
      } catch (err) {
        term.write(`\r\n\x1b[31m启动终端失败：${(err as Error).message ?? err}\x1b[0m\r\n`);
      }
    })();

    const ro = new ResizeObserver(() => {
      try {
        fitAddon.fit();
      } catch {
        /* ignore */
      }
    });
    ro.observe(host);

    return () => {
      cancelled = true;
      ro.disconnect();
      oscDisposable.dispose();
      inputDisposable?.dispose();
      resizeDisposable?.dispose();
      unsubData?.();
      unsubExit?.();
      if (ptyId != null) {
        window.tinder.terminal.dispose(ptyId).catch(() => undefined);
      }
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={hostRef} className="terminal-host" />;
}

export type { CommandState };
