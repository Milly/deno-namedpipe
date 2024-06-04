# @milly/namedpipe

[![license:MIT](https://img.shields.io/github/license/Milly/deno-namedpipe)](LICENSE)
[![JSR](https://jsr.io/badges/@milly/namedpipe)](https://jsr.io/@milly/namedpipe)
[![Test](https://github.com/Milly/deno-namedpipe/actions/workflows/test.yml/badge.svg)](https://github.com/Milly/deno-namedpipe/actions/workflows/test.yml)
[![codecov](https://codecov.io/gh/Milly/deno-namedpipe/branch/master/graph/badge.svg)](https://codecov.io/gh/Milly/deno-namedpipe)

Windows Named Pipes server and client module for Deno.

Requires `allow-ffi`, `unstable-ffi`
[permission](https://docs.deno.com/runtime/manual/basics/permissions).

# Requirements

[Deno](https://deno.com) v1.42 or later.

# Example

## Server

Can be used in the same way as [`Deno.listen`](https://deno.land/api?s=Deno.listen).

```typescript
import { listen } from "@milly/namedpipe";
import { TextLineStream } from "@std/streams/text-line-stream";

const listener = listen({ path: "\\\\.\\pipe\\your-own-name" });

for await (const conn of listener) {
  console.log("--- new conn ---");
  conn.readable
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new TextLineStream())
    .pipeTo(
      new WritableStream({
        write: (line) => console.log(line),
      }),
    );
}
```

## Client

Can be used in the same way as [`Deno.connect`](https://deno.land/api?s=Deno.connect).

```typescript
import { connect } from "@milly/namedpipe";

const conn = await connect({ path: "\\\\.\\pipe\\your-own-name" });

await ReadableStream
  .from(["Hello\n", "World\n"])
  .pipeThrough(new TextEncoderStream())
  .pipeTo(conn.writable);
```

# License

This library is licensed under the MIT License. See the [LICENSE](./LICENSE)
file for details.
