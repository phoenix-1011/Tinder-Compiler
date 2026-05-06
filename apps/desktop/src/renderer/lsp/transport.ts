import {
  AbstractMessageReader,
  AbstractMessageWriter,
  type DataCallback,
  type Disposable as JsonRpcDisposable,
  type Message,
  type MessageReader,
  type MessageWriter
} from "vscode-jsonrpc/browser";
import { base64ToBytes, bytesToBase64, findSequence } from "./util";

/**
 * MessageReader / MessageWriter that frames LSP traffic over our IPC bridge.
 * Stdio framing (`Content-Length: N\r\n\r\n<json>`) is reassembled here.
 */
export class IpcMessageReader extends AbstractMessageReader implements MessageReader {
  private buffer = new Uint8Array(0);
  private callback: DataCallback | null = null;
  private cleanup: () => void = () => undefined;

  constructor(private readonly ptyId: number) {
    super();
  }

  listen(callback: DataCallback): JsonRpcDisposable {
    this.callback = callback;
    this.cleanup = window.tinder.lsp.onData(this.ptyId, (b64) => {
      this.append(base64ToBytes(b64));
      this.tryDispatch();
    });
    return { dispose: () => this.cleanup() };
  }

  override dispose(): void {
    super.dispose();
    this.cleanup();
  }

  private append(chunk: Uint8Array): void {
    const merged = new Uint8Array(this.buffer.length + chunk.length);
    merged.set(this.buffer, 0);
    merged.set(chunk, this.buffer.length);
    this.buffer = merged;
  }

  private tryDispatch(): void {
    if (!this.callback) return;
    while (true) {
      const headerEnd = findSequence(this.buffer, [0x0d, 0x0a, 0x0d, 0x0a]); // \r\n\r\n
      if (headerEnd < 0) return;
      const header = new TextDecoder("ascii").decode(this.buffer.subarray(0, headerEnd));
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        this.fireError(new Error(`Bad LSP header: ${header}`));
        this.buffer = this.buffer.subarray(headerEnd + 4);
        continue;
      }
      const length = Number(match[1]);
      const start = headerEnd + 4;
      if (this.buffer.length < start + length) return; // wait for more
      const text = new TextDecoder("utf8").decode(this.buffer.subarray(start, start + length));
      this.buffer = this.buffer.subarray(start + length);
      try {
        this.callback(JSON.parse(text) as Message);
      } catch (err) {
        this.fireError(err as Error);
      }
    }
  }
}

export class IpcMessageWriter extends AbstractMessageWriter implements MessageWriter {
  constructor(private readonly ptyId: number) {
    super();
  }

  async write(msg: Message): Promise<void> {
    const body = new TextEncoder().encode(JSON.stringify(msg));
    const header = new TextEncoder().encode(`Content-Length: ${body.byteLength}\r\n\r\n`);
    const merged = new Uint8Array(header.length + body.length);
    merged.set(header, 0);
    merged.set(body, header.length);
    await window.tinder.lsp.write(this.ptyId, bytesToBase64(merged));
  }

  end(): void {
    /* no-op */
  }
}
