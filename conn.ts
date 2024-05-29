import * as C from "./constants.ts";
import { getKernel32 } from "./kernel32.ts";
import { Overlapped } from "./overlapped.ts";
import type { NamedPipeAddr, NamedPipeConn } from "./types.ts";
import { assertErrorCode, Interrupt } from "./utils.ts";

// deno-lint-ignore no-explicit-any
type NamedPipeConnCtor = new (...args: any[]) => NamedPipeConn;

const connections = new Set<NamedPipeConn>();

export function findConnections(
  path: string,
  proto: NamedPipeConnCtor,
): NamedPipeConn[] {
  return [...connections].filter((conn) =>
    conn.localAddr.path === path && conn instanceof proto
  );
}

export type ConnCloseListener = (conn: NamedPipeConn) => void;

const connCloseListeners = new Set<ConnCloseListener>();

export function onConnClose(
  fn: ConnCloseListener,
  options: { signal?: AbortSignal } = {},
): void {
  const { signal } = options;
  connCloseListeners.add(fn);
  signal?.addEventListener("abort", () => connCloseListeners.delete(fn));
}

function dispatchConnClose(conn: NamedPipeConn): void {
  queueMicrotask(() => {
    for (const fn of connCloseListeners) {
      fn(conn);
    }
  });
}

class AbstructNamedPipe implements NamedPipeConn {
  #path: string;
  #hFile: Deno.PointerValue;
  #closer = new AbortController();
  #addr?: NamedPipeAddr;
  #ref?: number;
  #readable?: ReadableStream<Uint8Array>;
  #writable?: WritableStream<Uint8Array>;

  get localAddr(): NamedPipeAddr {
    this.#addr ??= Object.freeze({
      __proto__: null,
      transport: "namedpipe",
      path: this.#path,
    });
    return this.#addr;
  }

  get remoteAddr(): NamedPipeAddr {
    return this.localAddr;
  }

  get rid(): number {
    throw new TypeError("not implemented");
  }

  constructor(path: string, hFile: Deno.PointerValue) {
    this.#path = path;
    this.#hFile = hFile;
    this.ref();
    connections.add(this);
  }

  ref(): void {
    this.#abortIfClosed();
    if (this.#ref == null) {
      this.#ref = setInterval(() => this, 10_000);
      Deno.refTimer(this.#ref);
    }
  }

  unref(): void {
    this.#abortIfClosed();
    if (this.#ref != null) {
      Deno.unrefTimer(this.#ref);
      clearInterval(this.#ref);
      this.#ref = undefined;
    }
  }

  closeWrite(): Promise<void> {
    return Promise.reject(new TypeError("not implemented"));
  }

  async read(into: Uint8Array): Promise<number | null> {
    this.#abortIfClosed();
    const overlapped = new Overlapped(this.#hFile, {
      signal: this.#closer.signal,
    });
    const result = getKernel32().ReadFile(
      this.#hFile,
      Deno.UnsafePointer.of(into),
      into.byteLength,
      null,
      Deno.UnsafePointer.of(overlapped.value.buffer),
    );
    if (!result) {
      const code = getKernel32().GetLastError();
      if (code === C.ERROR_BROKEN_PIPE) {
        return null;
      }
      if (code !== C.ERROR_IO_PENDING) {
        assertErrorCode(code);
      }
    }
    return await overlapped.wait();
  }

  async write(data: Uint8Array): Promise<number> {
    this.#abortIfClosed();
    const overlapped = new Overlapped(this.#hFile);
    const result = getKernel32().WriteFile(
      this.#hFile,
      Deno.UnsafePointer.of(data),
      data.byteLength,
      null,
      Deno.UnsafePointer.of(overlapped.value.buffer),
    );
    if (!result) {
      const code = getKernel32().GetLastError();
      if (code !== C.ERROR_IO_PENDING) {
        assertErrorCode(code);
      }
    }
    return await overlapped.wait();
  }

  get readable(): ReadableStream<Uint8Array> {
    this.#readable ??= new ReadableStream({
      type: "bytes",
      pull: async (controller) => {
        const byob = controller.byobRequest!;
        try {
          const n = await this.read(byob.view as Uint8Array);
          if (n === null) {
            this.#tryClose();
            controller.close();
            byob.respond(0);
          } else {
            byob.respond(n);
          }
        } catch (err) {
          controller.error(err);
          this.#tryClose();
        }
      },
      cancel: () => {
        this.#tryClose();
      },
      autoAllocateChunkSize: 16_640,
    });
    return this.#readable;
  }

  get writable(): WritableStream<Uint8Array> {
    this.#writable ??= new WritableStream({
      write: async (chunk, controller) => {
        try {
          let written = 0;
          while (written < chunk.length) {
            written += await this.write(chunk.subarray(written));
          }
        } catch (err) {
          controller.error(err);
          this.#tryClose();
        }
      },
      close: () => {
        this.#tryClose();
      },
      abort: () => {
        this.#tryClose();
      },
    });
    return this.#writable;
  }

  close(): void {
    this.#abortIfClosed();
    this.unref();
    this.#closer.abort(new Interrupt("operation canceled"));
    connections.delete(this);
    dispatchConnClose(this);
  }

  [Symbol.dispose](): void {
    this.#tryClose();
  }

  #abortIfClosed() {
    if (this.#closer.signal.aborted) {
      throw new TypeError("resource closed");
    }
  }

  #tryClose() {
    if (!this.#closer.signal.aborted) {
      this.close();
    }
  }
}

export class NamedPipeServerConn extends AbstructNamedPipe {
  #hFile: Deno.PointerValue;

  constructor(path: string, hFile: Deno.PointerValue) {
    super(path, hFile);
    this.#hFile = hFile;
  }

  override close() {
    super.close();
    getKernel32().DisconnectNamedPipe(this.#hFile);
    getKernel32().CloseHandle(this.#hFile);
  }
}

export class NamedPipeClientConn extends AbstructNamedPipe {
  #hFile: Deno.PointerValue;

  constructor(path: string, hFile: Deno.PointerValue) {
    super(path, hFile);
    this.#hFile = hFile;
  }

  override close() {
    super.close();
    getKernel32().CloseHandle(this.#hFile);
  }
}
