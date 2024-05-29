/**
 * Windows Named Pipes client module for Deno.
 *
 * Requires `allow-ffi`, `unstable-ffi` {@link https://docs.deno.com/runtime/manual/basics/permissions| permission}.
 *
 * Can be used in the same way as {@linkcode https://deno.land/api?s=Deno.connect | Deno.connect}.
 *
 * ```typescript
 * import { connect } from "jsr:@milly/namedpipe";
 *
 * const conn = await connect({ path: "\\\\.\\pipe\\your-own-name" });
 *
 * await ReadableStream
 *   .from(["Hello\n", "World\n"])
 *   .pipeThrough(new TextEncoderStream())
 *   .pipeTo(conn.writable);
 * ```
 *
 * @module
 */

import * as C from "./constants.ts";
import { NamedPipeClientConn } from "./conn.ts";
import { getKernel32 } from "./kernel32.ts";
import type { NamedPipeConn } from "./types.ts";
import { assertResult, ensureNamedPipePath, stringToWstr } from "./utils.ts";

/** Options for {@linkcode connect}. */
export type NamedPipeConnectOptions = {
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
   * Time to wait for connection.
   *
   * @default {0}
   */
  connectTimeout?: number;
};

/**
 * Connects to the named pipe and returns an instance of {@link NamedPipeConn}.
 *
 * Requires `allow-ffi`, `unstable-ffi` {@link https://docs.deno.com/runtime/manual/basics/permissions| permission}.
 *
 * Can be used in the same way as {@linkcode https://deno.land/api?s=Deno.connect | Deno.connect}.
 *
 * ```ts
 * import { connect } from "jsr:@milly/namedpipe";
 *
 * const conn = await connect({ path: "\\\\.\\pipe\\name" });
 * ```
 *
 * @param options - Parameters for named pipe.
 */
// deno-lint-ignore require-await
export async function connect(
  options: NamedPipeConnectOptions,
): Promise<NamedPipeConn> {
  const params = { read: true, write: true, ...options };
  const path = ensureNamedPipePath(params.path);
  const hFile = getKernel32().CreateFileW(
    stringToWstr(path),
    (params.read ? C.FILE_GENERIC_READ : 0) |
      (params.write ? C.FILE_GENERIC_WRITE : 0),
    0,
    null,
    C.OPEN_EXISTING,
    0x80 | C.FILE_FLAG_OVERLAPPED,
    null,
  );
  assertResult(
    Deno.UnsafePointer.value(hFile) !== C.INVALID_HANDLE_VALUE,
    `CreateFile failed: ${path}`,
  );
  return new NamedPipeClientConn(path, hFile);
}
