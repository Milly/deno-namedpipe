import {
  assertEquals,
  assertInstanceOf,
  assertRejects,
  assertStrictEquals,
  assertThrows,
} from "@std/assert";
import { assertSpyCalls, spy } from "@std/testing/mock";
import { promiseState } from "@core/asyncutil";
import { write } from "@milly/streams/util/write";
import { DisposableStack } from "@nick/dispose/disposable-stack";
import { listen } from "./server.ts";
import { connect } from "./client.ts";
import { Win32Error } from "./error.ts";

function createTestPipePath() {
  return `\\\\.\\pipe\\deno-namedpipe-client-test-${performance.now()}`;
}

const _encoder = new TextEncoder();
const encode = _encoder.encode.bind(_encoder);

const _decoder = new TextDecoder();
const decode = _decoder.decode.bind(_decoder);

Deno.test("connect()", async (t) => {
  await t.step("connects to the named pipe", async (t) => {
    const testPath = createTestPipePath();
    using listener = listen({ path: testPath });
    const serverConnPromise = listener.accept();

    const connPromise = connect({ path: testPath });

    assertEquals(await promiseState(serverConnPromise), "fulfilled");
    using _serverConn = await serverConnPromise;
    assertEquals(await promiseState(connPromise), "fulfilled");

    await t.step("and returns NamedPipeClientConn", async () => {
      using conn = await connPromise;

      assertEquals(Deno.inspect(conn), "NamedPipeClientConn {}");
    });
  });
  await t.step("rejects if `path` is invalid", async () => {
    await assertRejects(
      () => connect({ path: "not-a-valid-namedpipe-path" }),
      TypeError,
      "Invalid named pipe path: not-a-valid-namedpipe-path",
    );
  });
  await t.step("rejects if no named pipe exists", async () => {
    const testPath = createTestPipePath();
    const connPromise = connect({ path: testPath });
    await assertRejects(
      () => connPromise,
      Win32Error,
      "(os error 2)", // ERROR_PATH_NOT_FOUND
    );
  });
});

Deno.test("NamedPipeClientConn", async (t) => {
  using stack = new DisposableStack();
  const testPath = createTestPipePath();
  const listener = stack.use(listen({ path: testPath, maxInstances: 2 }));

  async function createConn() {
    const serverConnPromise = listener.accept();
    const connPromise = connect({ path: testPath });
    assertEquals(await promiseState(serverConnPromise), "fulfilled");
    const serverConn = stack.use(await serverConnPromise);
    assertEquals(await promiseState(connPromise), "fulfilled");
    const conn = stack.use(await connPromise);
    return { serverConn, conn };
  }

  const { serverConn, conn } = await createConn();

  await t.step(".localAddr is NamedPipeAddr", () => {
    const actual = conn.localAddr;

    assertEquals(actual, {
      transport: "namedpipe",
      path: testPath,
    });
  });
  await t.step(".remoteAddr is NamedPipeAddr", () => {
    const actual = conn.remoteAddr;

    assertEquals(actual, {
      transport: "namedpipe",
      path: testPath,
    });
  });
  await t.step(".rid is not implemented", () => {
    assertThrows(
      () => void conn.rid,
      TypeError,
      "not implemented",
    );
  });
  await t.step(".closeWrite() is not implemented", async () => {
    await assertRejects(
      () => conn.closeWrite(),
      TypeError,
      "not implemented",
    );
  });
  await t.step(".read()", async (t) => {
    await t.step("resolves when server sends data", async () => {
      const p = new Uint8Array(100);
      const resPromise = conn.read(p);

      assertEquals(await promiseState(resPromise), "pending");

      await serverConn.write(encode("foo bar"));

      assertEquals(await promiseState(resPromise), "fulfilled");

      const n = await resPromise;

      assertEquals(n, 7);
      assertEquals(decode(p.slice(0, 7)), "foo bar");
    });
  });
  await t.step(".write()", async (t) => {
    await t.step("sends data to server", async () => {
      await conn.write(encode("Hello server!"));

      const p = new Uint8Array(100);
      const n = await serverConn.read(p);
      assertEquals(n, 13);
      assertEquals(decode(p.slice(0, 13)), "Hello server!");
    });
  });
  await t.step(".readable", async (t) => {
    await t.step("is ReadableStream<Uint8Array>", () => {
      const actual = conn.readable;

      assertInstanceOf(actual, ReadableStream);
    });
    await t.step("is always same object", () => {
      const actual1 = conn.readable;
      const actual2 = conn.readable;

      assertStrictEquals(actual1, actual2);
    });
    await t.step("is readable data from server", async () => {
      const reader = conn.readable.getReader();
      try {
        await serverConn.write(new Uint8Array([0, 1, 2, 3]));
        assertEquals(await reader.read(), {
          done: false,
          value: new Uint8Array([0, 1, 2, 3]),
        });

        await serverConn.write(encode("foo bar baz"));
        assertEquals(await reader.read(), {
          done: false,
          value: encode("foo bar baz"),
        });
      } finally {
        reader.releaseLock();
      }
    });
  });
  await t.step(".writable", async (t) => {
    await t.step("is WritableStream<Uint8Array>", () => {
      const actual = conn.writable;

      assertInstanceOf(actual, WritableStream);
    });
    await t.step("is always same object", () => {
      const actual1 = conn.writable;
      const actual2 = conn.writable;

      assertStrictEquals(actual1, actual2);
    });
    await t.step("is writable data to server", async () => {
      const writer = conn.writable.getWriter();
      const serverReader = serverConn.readable.getReader();
      try {
        await writer.write(new Uint8Array([0, 1, 2, 3]));
        assertEquals(await serverReader.read(), {
          done: false,
          value: new Uint8Array([0, 1, 2, 3]),
        });

        await writer.write(encode("foo bar baz"));
        assertEquals(await serverReader.read(), {
          done: false,
          value: encode("foo bar baz"),
        });
      } finally {
        serverReader.releaseLock();
        writer.releaseLock();
      }
    });
  });
  await t.step(".close()", async (t) => {
    await t.step("closes NamedPipeClientConn", async () => {
      const t = new TransformStream();
      const readablePromise = conn.readable.pipeTo(new WritableStream());
      const writablePromise = t.readable.pipeTo(conn.writable);

      assertEquals(await promiseState(readablePromise), "pending");
      assertEquals(await promiseState(writablePromise), "pending");

      conn.close();

      assertEquals(await promiseState(readablePromise), "rejected");
      await assertRejects(() => readablePromise, Error, "operation canceled");
      assertEquals(await promiseState(writablePromise), "pending");

      write(t.writable, new Uint8Array([0])).catch(() => {});

      assertEquals(await promiseState(writablePromise), "rejected");
      await assertRejects(() => writablePromise, Error, "resource closed");
    });
  });
  await t.step("[@@dispose]()", async (t) => {
    const { conn } = await createConn();
    using conn_close = spy(conn, "close");

    await t.step("calls .close()", () => {
      conn[Symbol.dispose]();

      assertSpyCalls(conn_close, 1);
    });
    await t.step("does not calls .close() if already closed", () => {
      conn[Symbol.dispose]();

      assertSpyCalls(conn_close, 1);
    });
  });
});
