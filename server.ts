/**
 * Windows Named Pipes server module for Deno.
 *
 * Requires `allow-ffi`, `unstable-ffi` {@link https://docs.deno.com/runtime/manual/basics/permissions| permission}.
 *
 * Can be used in the same way as {@linkcode https://deno.land/api?s=Deno.listen | Deno.listen}.
 *
 * ```typescript
 * import { listen } from "@milly/namedpipe";
 * import { TextLineStream } from "@std/streams/text-line-stream";
 *
 * const listener = listen({ path: "\\\\.\\pipe\\your-own-name" });
 *
 * for await (const conn of listener) {
 *   console.log("--- new conn ---");
 *   conn.readable
 *     .pipeThrough(new TextDecoderStream())
 *     .pipeThrough(new TextLineStream())
 *     .pipeTo(
 *       new WritableStream({
 *         write: (line) => console.log(line),
 *       }),
 *     );
 * }
 * ```
 *
 * @module
 */

import { findConnections, NamedPipeServerConn, onConnClose } from "./conn.ts";
import * as C from "./constants.ts";
import { getKernel32 } from "./kernel32.ts";
import { Overlapped } from "./overlapped.ts";
import type {
  NamedPipeAddr,
  NamedPipeConn,
  NamedPipeListener,
  NamedPipeListenerAcceptOptions,
} from "./types.ts";
import {
  assertErrorCode,
  assertResult,
  ensureNamedPipePath,
  Interrupt,
  stringToWstr,
} from "./utils.ts";

type INamedPipeListener = NamedPipeListener;

const listenPaths = new Set<string>();

const NamedPipeListenerCtor = class NamedPipeListener
  implements INamedPipeListener, AsyncIterableIterator<NamedPipeConn> {
  #params: Required<NamedPipeListenOptions>;
  #initialHandle?: Deno.PointerValue;
  #closer = new AbortController();
  #addr?: NamedPipeAddr;
  #ref?: number;

  get addr(): NamedPipeAddr {
    this.#addr ??= Object.freeze({
      __proto__: null,
      transport: "namedpipe",
      path: this.#params.path,
    });
    return this.#addr;
  }

  get rid(): number {
    throw new TypeError("not implemented");
  }

  get #connections(): NamedPipeConn[] {
    return findConnections(this.#params.path, NamedPipeServerConn);
  }

  constructor(
    pipeHandle: Deno.PointerValue,
    params: Required<NamedPipeListenOptions>,
  ) {
    this.#initialHandle = pipeHandle;
    this.#params = params;
    this.ref();
    listenPaths.add(params.path);
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

  async accept(
    options: NamedPipeListenerAcceptOptions = {},
  ): Promise<NamedPipeConn> {
    this.#abortIfClosed();
    const signal = options.signal
      ? AbortSignal.any([this.#closer.signal, options.signal])
      : this.#closer.signal;
    if (signal.aborted) {
      throw signal.reason;
    }
    if (this.#params.maxInstances <= this.#connections.length) {
      await new Promise<void>((resolve, reject) => {
        onConnClose(() => {
          if (this.#connections.length < this.#params.maxInstances) {
            resolve();
          }
        }, { signal });
        signal.addEventListener("abort", () => {
          reject(signal.reason);
        });
      });
    }
    const handle = this.#initialHandle ?? createNamedPipe(this.#params);
    this.#initialHandle = undefined;
    try {
      const overlapped = new Overlapped(handle, { signal });
      const result = getKernel32().ConnectNamedPipe(
        handle,
        Deno.UnsafePointer.of(overlapped.value.buffer),
      );
      if (!result) {
        const code = getKernel32().GetLastError();
        if (code !== C.ERROR_IO_PENDING) {
          assertErrorCode(code);
        }
      }
      await overlapped.wait();
      return new NamedPipeServerConn(this.#params.path, handle);
    } catch (err) {
      getKernel32().CloseHandle(handle);
      throw err;
    }
  }

  close(): void {
    this.#abortIfClosed();
    this.unref();
    this.#closer.abort(new Interrupt("operation canceled"));
    if (this.#initialHandle) {
      getKernel32().CloseHandle(this.#initialHandle);
      this.#initialHandle = undefined;
    }
    listenPaths.delete(this.#params.path);
  }

  [Symbol.dispose](): void {
    this.#tryClose();
  }

  async next(): Promise<IteratorResult<NamedPipeConn>> {
    let conn;
    try {
      conn = await this.accept();
    } catch (err) {
      if (err instanceof Interrupt) {
        return { value: undefined, done: true };
      }
      throw err;
    }
    return { value: conn, done: false };
  }

  return(value?: unknown): Promise<IteratorResult<NamedPipeConn>> {
    this.#tryClose();
    return Promise.resolve({ value, done: true });
  }

  throws(_exception?: unknown): Promise<IteratorResult<NamedPipeConn>> {
    this.#tryClose();
    return Promise.resolve({ value: undefined, done: true });
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<NamedPipeConn> {
    return this;
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
};

function createNamedPipe(params: Required<NamedPipeListenOptions>) {
  const path = ensureNamedPipePath(params.path);
  const handle = getKernel32().CreateNamedPipeW(
    stringToWstr(path),
    (params.read ? C.PIPE_ACCESS_INBOUND : 0) |
      (params.write ? C.PIPE_ACCESS_OUTBOUND : 0) |
      C.FILE_FLAG_OVERLAPPED,
    C.PIPE_TYPE_BYTE | C.PIPE_WAIT,
    params.maxInstances,
    512,
    512,
    0,
    null,
  );
  assertResult(
    !(C.INVALID_HANDLE_VALUE as readonly (number | bigint)[]).includes(
      Deno.UnsafePointer.value(handle),
    ),
    `CreateNamedPipe failed: ${path}`,
  );
  return handle;
}

/** Options for {@linkcode listen}. */
export type NamedPipeListenOptions = {
  /** A path to named pipe. */
  path: string;
  /**
   * Allow read (inbound).
   *
   * @default {true}
   */
  read?: boolean;
  /**
   * Allow write (outbound).
   *
   * @default {true}
   */
  write?: boolean;
  /**
   * The maximum number of instances that can be created for this pipe.
   *
   * Acceptable values are in the range 1 through `PIPE_UNLIMITED_INSTANCES` (255).
   * If this parameter is `PIPE_UNLIMITED_INSTANCES`, the number of pipe instances
   * that can be created is limited only by the availability of system resources.
   *
   * @default 1
   */
  maxInstances?: number;
};

/**
 * Creates an instance of {@link NamedPipeListener} and listens for connecting client processes.
 *
 * Requires `allow-ffi`, `unstable-ffi` {@link https://docs.deno.com/runtime/manual/basics/permissions| permission}.
 *
 * Can be used in the same way as {@linkcode https://deno.land/api?s=Deno.listen | Deno.listen}.
 *
 * ```ts
 * import { listen } from "@milly/namedpipe";
 *
 * const listener = listen({ path: "\\\\.\\pipe\\your-own-name" });
 * const conn = await listener.accept();
 * ```
 *
 * @param options - Parameters for named pipe.
 */
export function listen(options: NamedPipeListenOptions): NamedPipeListener {
  const params = { read: true, write: true, maxInstances: 1, ...options };
  if (
    listenPaths.has(params.path) ||
    findConnections(params.path, NamedPipeServerConn).length > 0
  ) {
    throw new TypeError("path already in use");
  }
  const handle = createNamedPipe(params);
  return new NamedPipeListenerCtor(handle, params);
}
