import * as C from "./constants.ts";
import { Win32Error } from "./error.ts";
import { getKernel32 } from "./kernel32.ts";

export function createWin32Error(code: number, message?: string): Win32Error {
  const suffix = message ? `: ${message}` : "";
  return new Win32Error(
    code,
    `${formatMessage(code)} (os error ${code})${suffix}`,
  );
}

/**
 * Throws `Win32Error` if `code` is other than `ERROR_SUCCESS`.
 *
 * @param code - Error code by [`GetLastError`]{@link https://learn.microsoft.com/windows/win32/api/errhandlingapi/nf-errhandlingapi-getlasterror}.
 * @param message - Text suffixed to error messages.
 */
export function assertErrorCode(
  code: number,
  message?: string,
) {
  if (code !== C.ERROR_SUCCESS) {
    throw createWin32Error(code, message);
  }
}

/**
 * Throws `Win32Error` if `result` is `FALSE` and `GetLastError` returns other than `ERROR_SUCCESS`.
 *
 * If `result` is `FALSE`, internally calls
 * [`GetLastError`]{@link https://learn.microsoft.com/windows/win32/api/errhandlingapi/nf-errhandlingapi-getlasterror}
 * and checks the return code. Otherwise it does nothing.
 *
 * @param result - `0` or `false` is `FALSE`, otherwise `TRUE`.
 * @param message - Text suffixed to error messages.
 */
export function assertResult(
  result: number | boolean,
  message?: string,
) {
  if (!result) {
    const code = getKernel32().GetLastError();
    assertErrorCode(code, message);
  }
}

/** Ensure named pipe path name. */
export function ensureNamedPipePath(path: string): string {
  if (!/^\\\\[.]\\pipe\\[^\\]/.test(path)) {
    throw new TypeError(`Invalid named pipe path: ${path}`);
  }
  return path;
}

export function stringToWstr(s: string): ArrayBuffer {
  return new Uint16Array(`${s}\0`.split("").map((c) => c.charCodeAt(0))).buffer;
}

export function pwstrToString(pointer: Deno.PointerObject): string {
  let res = "";
  const view = new Deno.UnsafePointerView(pointer);
  for (let i = 0;; i += 2) {
    const code = view.getUint16(i);
    if (code === 0) {
      break;
    }
    res += String.fromCharCode(code);
  }
  return res;
}

export function formatMessage(code: number): string {
  const lpBufferPtr = new BigUint64Array(1);
  const result = getKernel32().FormatMessageW(
    C.FORMAT_MESSAGE_ALLOCATE_BUFFER +
      C.FORMAT_MESSAGE_FROM_SYSTEM +
      C.FORMAT_MESSAGE_IGNORE_INSERTS,
    null,
    code,
    0,
    lpBufferPtr,
    0,
    null,
  );
  if (!result) {
    return "";
  }
  const pointer = Deno.UnsafePointer.create(lpBufferPtr[0]);
  return pointer ? pwstrToString(pointer) : "";
}

export class Interrupt extends Error {
  declare name: "Interrupt";
  static {
    this.prototype.name = "Interrupt";
  }
}
