import * as C from "./constants.ts";
import { getKernel32 } from "./kernel32.ts";
import { createWin32Error } from "./utils.ts";

const sizeofOverlappedStruct = 32;

export class OverlappedStruct {
  readonly #view: DataView;

  constructor(buffer?: ArrayBuffer) {
    buffer ??= new ArrayBuffer(sizeofOverlappedStruct);
    if (buffer.byteLength !== sizeofOverlappedStruct) {
      throw new TypeError(`Invalid buffer length: ${buffer.byteLength}`);
    }
    this.#view = new DataView(buffer);
  }

  get buffer(): ArrayBuffer {
    return this.#view.buffer;
  }

  get Internal(): bigint {
    return this.#view.getBigUint64(0x00, true);
  }

  get InternalHigh(): bigint {
    return this.#view.getBigUint64(0x08, true);
  }

  get Offset(): number {
    return this.#view.getUint32(0x10, true);
  }

  get OffsetHigh(): number {
    return this.#view.getUint32(0x14, true);
  }

  get Pointer(): Deno.PointerValue {
    const ptr = this.#view.getBigUint64(0x10, true);
    return Deno.UnsafePointer.create(ptr);
  }

  get hEvent(): Deno.PointerValue {
    const ptr = this.#view.getBigUint64(0x18, true);
    return Deno.UnsafePointer.create(ptr);
  }
}

export type OverlappedOptions = {
  /** Cancel IO. */
  signal?: AbortSignal;
};

export class Overlapped {
  #hFile: Deno.PointerValue;
  #overlapped = new OverlappedStruct();
  #numberOfBytesTransferred = new Uint8Array(1);
  #settled = false;
  #signal: AbortSignal;
  #canceler = new AbortController();
  #result = Promise.withResolvers<number>();
  #waiter: Promise<number>;

  get hFile(): Deno.PointerValue {
    return this.#hFile;
  }

  get value(): OverlappedStruct {
    return this.#overlapped;
  }

  constructor(hFile: Deno.PointerValue, options?: OverlappedOptions) {
    this.#hFile = hFile;
    this.#signal = options?.signal
      ? AbortSignal.any([options.signal, this.#canceler.signal])
      : this.#canceler.signal;
    this.#waiter = this.#result.promise.finally(() => {
      this.#canceler.abort();
    });
    if (this.#signal.aborted) {
      this.#handleAbort();
    } else {
      this.#signal.addEventListener("abort", () => this.#handleAbort(), {
        once: true,
      });
      this.#getResult();
    }
  }

  wait(): Promise<number> {
    return this.#waiter;
  }

  #handleAbort(): void {
    if (this.#settled) {
      return;
    }
    this.#settled = true;
    const lpOverlapped = Deno.UnsafePointer.of(this.#overlapped.buffer);
    getKernel32().CancelIoEx(this.#hFile, lpOverlapped);
    this.#result.reject(
      this.#signal.reason ?? new DOMException("Aborted", "AbortError"),
    );
  }

  async #getResult(): Promise<void> {
    const lpOverlapped = Deno.UnsafePointer.of(this.#overlapped.buffer);
    const lpNumberOfBytesTransferred = Deno.UnsafePointer.of(
      this.#numberOfBytesTransferred,
    );
    const result = await getKernel32().AsyncGetOverlappedResult(
      this.#hFile,
      lpOverlapped,
      lpNumberOfBytesTransferred,
      1,
    );
    if (this.#settled) {
      return;
    }
    if (this.#overlapped.Internal === C.STATUS_PENDING) {
      return this.#getResult();
    }
    this.#settled = true;
    if (result) {
      this.#result.resolve(Number(this.#overlapped.InternalHigh));
    } else {
      const code = getKernel32().GetLastError();
      this.#result.reject(createWin32Error(code));
    }
  }
}
