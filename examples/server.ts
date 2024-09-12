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
