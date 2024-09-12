import { connect } from "@milly/namedpipe";

const conn = await connect({ path: "\\\\.\\pipe\\your-own-name" });

await ReadableStream
  .from(["Hello\n", "World\n"])
  .pipeThrough(new TextEncoderStream())
  .pipeTo(conn.writable);
