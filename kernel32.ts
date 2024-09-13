/** Get `KERNEL32.DLL` library functions. */
export function getKernel32(): LibKernel32Symbols {
  if (!libKernel32) {
    if (Deno.build.os === "windows") {
      libKernel32 = loadKernel32();
    } else {
      throw new TypeError("Kernel32 is not supported");
    }
  }
  return libKernel32.symbols;
}

type LibKernel32 = ReturnType<typeof loadKernel32>;
type LibKernel32Symbols = LibKernel32["symbols"];

let libKernel32: LibKernel32 | undefined;

function loadKernel32() {
  return Deno.dlopen("KERNEL32.dll", {
    CancelIoEx: {
      parameters: ["pointer", "pointer"] as [
        hFile: "pointer",
        lpOverlapped: "pointer",
      ],
      result: "i32",
    },
    CloseHandle: {
      parameters: ["pointer"] as [hObject: "pointer"],
      result: "i32",
    },
    ConnectNamedPipe: {
      parameters: ["pointer", "pointer"] as [
        hNamedPipe: "pointer",
        lpOverlapped: "pointer",
      ],
      result: "i32",
    },
    CreateFileW: {
      parameters: [
        "buffer",
        "u32",
        "u32",
        "pointer",
        "u32",
        "u32",
        "pointer",
      ] as [
        lpFileName: "buffer",
        dwDesiredAccess: "u32",
        dwShareMode: "u32",
        lpSecurityAttributes: "pointer",
        dwCreationDisposition: "u32",
        dwFlagsAndAttributes: "u32",
        hTemplateFile: "pointer",
      ],
      result: "pointer",
    },
    CreateNamedPipeW: {
      parameters: [
        "buffer",
        "u32",
        "u32",
        "u32",
        "u32",
        "u32",
        "u32",
        "pointer",
      ] as [
        lpName: "buffer",
        dwOpenMode: "u32",
        dwPipeMode: "u32",
        nMaxInstances: "u32",
        nOutBufferSize: "u32",
        nInBufferSize: "u32",
        nDefaultTimeOut: "u32",
        lpSecurityAttributes: "pointer",
      ],
      result: "pointer",
    },
    DisconnectNamedPipe: {
      parameters: ["pointer"] as [hNamedPipe: "pointer"],
      result: "i32",
    },
    FormatMessageW: {
      parameters: [
        "u32",
        "pointer",
        "u32",
        "u32",
        "buffer",
        "u32",
        "pointer",
      ] as [
        dwFlags: "u32",
        lpSource: "pointer",
        dwMessageId: "u32",
        dwLanguageId: "u32",
        lpBuffer: "buffer",
        nSize: "u32",
        Arguments: "pointer",
      ],
      result: "u32",
    },
    GetLastError: {
      parameters: [],
      result: "u32",
    },
    AsyncGetOverlappedResult: {
      name: "GetOverlappedResult",
      parameters: ["pointer", "pointer", "pointer", "i32"] as [
        hFile: "pointer",
        lpOverlapped: "pointer",
        lpNumberOfBytesTransferred: "pointer",
        bWait: "i32",
      ],
      result: "i32",
      nonblocking: true,
    },
    ReadFile: {
      parameters: ["pointer", "pointer", "u32", "pointer", "pointer"] as [
        hFile: "pointer",
        lpBuffer: "pointer",
        nNumberOfBytesToRead: "u32",
        lpNumberOfBytesRead: "pointer",
        lpOverlapped: "pointer",
      ],
      result: "i32",
    },
    WriteFile: {
      parameters: ["pointer", "pointer", "u32", "pointer", "pointer"] as [
        hFile: "pointer",
        lpBuffer: "pointer",
        nNumberOfBytesToWrite: "u32",
        lpNumberOfBytesWritten: "pointer",
        lpOverlapped: "pointer",
      ],
      result: "i32",
    },
  });
}
