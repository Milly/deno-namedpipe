/**
 * Types for {@link https://jsr.io/@milly/namedpipe | namedpipe module}.
 *
 * @module
 */

/** Named pipe address. */
export interface NamedPipeAddr {
  transport: "namedpipe";
  /** Named pipe path. e.g. `\\.\pipe\name` */
  path: string;
}

// deno-lint-ignore no-explicit-any
type AnyConn = Deno.Conn<any>;

/**
 * Named pipe connection, same interface as {@linkcode Deno.Conn}.
 *
 * Can be used in place of `Deno.Conn`. However, `Addr.transport` is of
 * a different type and cannot be used in code that depends on it.
 */
export interface NamedPipeConn extends AnyConn {
  readonly localAddr: NamedPipeAddr;
  readonly remoteAddr: NamedPipeAddr;
  /**
   * Not implemented in `NamedPipeConn`.
   * @ignore
   */
  readonly rid: number;
  /**
   * Not implemented in `NamedPipeConn`.
   * @ignore
   */
  closeWrite(): Promise<void>;
}

/** Options for {@linkcode NamedPipeListener.accept}. */
export interface NamedPipeListenerAcceptOptions {
  /** Cancels waiting for next connection when aborting. */
  signal?: AbortSignal;
}

// deno-lint-ignore no-explicit-any
type AnyListener = Deno.Listener<any, any>;

/**
 * Named pipe listener, same interface as {@linkcode Deno.Listener}.
 *
 * Can be used in place of `Deno.Listener`. However, `Addr.transport` is of
 * a different type and cannot be used in code that depends on it.
 */
export interface NamedPipeListener
  extends AnyListener, AsyncIterable<NamedPipeConn> {
  accept(options?: NamedPipeListenerAcceptOptions): Promise<NamedPipeConn>;
  readonly addr: NamedPipeAddr;
  /**
   * Not implemented in `NamedPipeListener`.
   * @ignore
   */
  readonly rid: number;
  [Symbol.asyncIterator](): AsyncIterableIterator<NamedPipeConn>;
}
