/**
 * Error classes for {@link https://jsr.io/@milly/namedpipe | namedpipe module}.
 *
 * @module
 */

/** Represents Win32 error */
export class Win32Error extends Error {
  declare name: "Win32Error";
  static {
    this.prototype.name = "Win32Error";
  }

  #code: number;

  /** Error code. */
  get code(): number {
    return this.#code;
  }

  /**
   * Construct `Win32Error` object.
   *
   * @param code - Error code by {@linkcode https://learn.microsoft.com/windows/win32/api/errhandlingapi/nf-errhandlingapi-getlasterror | GetLastError}.
   * @param message - Error messages.
   */
  constructor(code: number, message?: string) {
    super(message ?? `${code}`);
    this.#code = code;
  }
}
