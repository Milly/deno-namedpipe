import {
  assertEquals,
  assertObjectMatch,
  assertRejects,
  assertStrictEquals,
  assertThrows,
} from "@std/assert";
import { delay } from "@std/async/delay";
import { assertSpyCalls, spy } from "@std/testing/mock";
import { flushPromises, peekPromiseState } from "@core/asyncutil";
import { DisposableStack } from "@nick/dispose/disposable-stack";
import type { NamedPipeConn } from "./types.ts";
import { listen } from "./server.ts";

function createTestPipePath() {
  return `\\\\.\\pipe\\deno-namedpipe-server-test-${performance.now()}`;
}

function resolveMicrotasks(): Promise<void> {
  return delay(0);
}

Deno.test("listen()", async (t) => {
  await t.step("creates named pipe instance", async (t) => {
    const testPath = createTestPipePath();
    using listener = listen({ path: testPath });

    await assertRejects(
      () => Deno.stat(testPath),
      Error,
      "(os error 231)", // ERROR_PIPE_BUSY
    );

    await t.step("and returns NamedPipeListener", () => {
      assertEquals(Deno.inspect(listener), "NamedPipeListener {}");
    });
  });
  await t.step("throws if `path` is invalid", () => {
    assertThrows(
      () => listen({ path: "not-a-valid-namedpipe-path" }),
      TypeError,
      "Invalid named pipe path: not-a-valid-namedpipe-path",
    );
  });
  await t.step("throws if `path` already listens", () => {
    const testPath = createTestPipePath();
    using _availableListener = listen({ path: testPath, maxInstances: 2 });

    assertThrows(
      () => listen({ path: testPath }),
      TypeError,
      "path already in use",
    );
  });
  await t.step("throws if `path` already connects", async () => {
    using stack = new DisposableStack();
    const testPath = createTestPipePath();
    const availableListener = stack.use(
      listen({ path: testPath, maxInstances: 2 }),
    );
    const availableConnPromise = availableListener.accept();
    stack.adopt(
      await Deno.open(testPath, { append: true }),
      (f) => f.close(),
    );
    await flushPromises();
    assertEquals(await peekPromiseState(availableConnPromise), "fulfilled");
    stack.use(await availableConnPromise);
    availableListener.close();

    assertThrows(
      () => listen({ path: testPath }),
      TypeError,
      "path already in use",
    );
  });
});

Deno.test("NamedPipeListener", async (t) => {
  const testPath = createTestPipePath();
  using listener = listen({ path: testPath });

  await t.step(".addr is NamedPipeAddr", () => {
    const actual = listener.addr;

    assertEquals(actual, {
      transport: "namedpipe",
      path: testPath,
    });
  });
  await t.step(".rid is not implemented", () => {
    assertThrows(
      () => void listener.rid,
      TypeError,
      "not implemented",
    );
  });
  await t.step(".accept()", async (t) => {
    using stack = new DisposableStack();
    const testPath = createTestPipePath();
    const listener = stack.use(listen({ path: testPath, maxInstances: 2 }));
    const conns: NamedPipeConn[] = [];

    await t.step("resolves when client connects", async (t) => {
      const connPromise = listener.accept();

      await flushPromises();
      assertEquals(await peekPromiseState(connPromise), "pending");

      stack.adopt(
        await Deno.open(testPath, { append: true }),
        (f) => f.close(),
      );

      await flushPromises();
      assertEquals(await peekPromiseState(connPromise), "fulfilled");

      await t.step("as NamedPipeServerConn", async () => {
        const actual = stack.use(await connPromise);

        assertEquals(Deno.inspect(actual), "NamedPipeServerConn {}");
        conns.push(actual);
      });
    });
    await t.step(
      "resolves when calls no more than `maxInstances` times",
      async () => {
        const connPromise = listener.accept();

        await flushPromises();
        assertEquals(await peekPromiseState(connPromise), "pending");

        stack.adopt(
          await Deno.open(testPath, { append: true }),
          (f) => f.close(),
        );

        await flushPromises();
        assertEquals(await peekPromiseState(connPromise), "fulfilled");
        conns.push(stack.use(await connPromise));
      },
    );
    await t.step(
      "pendings when calls more than `maxInstances` times",
      async (t) => {
        const connPromise = listener.accept();

        await flushPromises();
        assertEquals(await peekPromiseState(connPromise), "pending");

        await assertRejects(
          () => Deno.open(testPath, { append: true }),
          Error,
          "(os error 231)", // ERROR_PIPE_BUSY
        );

        await flushPromises();
        assertEquals(await peekPromiseState(connPromise), "pending");

        await t.step("and resolves when previous conn closes", async () => {
          conns[0].close();

          await resolveMicrotasks();

          stack.adopt(
            await Deno.open(testPath, { append: true }),
            (f) => f.close(),
          );

          await flushPromises();
          assertEquals(await peekPromiseState(connPromise), "fulfilled");
          conns.push(stack.use(await connPromise));
        });
      },
    );
    await t.step("rejects when `options.signal` aborts", async () => {
      const aborter = new AbortController();

      const connPromise = listener.accept({ signal: aborter.signal });

      await flushPromises();
      assertEquals(await peekPromiseState(connPromise), "pending");

      aborter.abort("abort-by-signal");

      await flushPromises();
      assertEquals(await peekPromiseState(connPromise), "rejected");

      const reason = await assertRejects(() => connPromise);
      assertEquals(reason, "abort-by-signal");
    });
    await t.step("rejects if `options.signal` already aborted", async () => {
      const aborter = new AbortController();
      aborter.abort("abort-by-signal");

      const connPromise = listener.accept({ signal: aborter.signal });
      connPromise.catch(() => {});

      await flushPromises();
      assertEquals(await peekPromiseState(connPromise), "rejected");

      const reason = await assertRejects(() => connPromise);
      assertEquals(reason, "abort-by-signal");
    });
    await t.step("rejects when listener closes", async () => {
      const connPromise = listener.accept();

      await flushPromises();
      assertEquals(await peekPromiseState(connPromise), "pending");

      listener.close();

      await flushPromises();
      assertEquals(await peekPromiseState(connPromise), "rejected");

      await assertRejects(() => connPromise, Error, "operation canceled");
    });
    await t.step("rejects if listener already closes", async () => {
      const connPromise = listener.accept();
      connPromise.catch(() => {});

      await flushPromises();
      assertEquals(await peekPromiseState(connPromise), "rejected");

      await assertRejects(() => connPromise, Error, "resource closed");
    });
  });
  await t.step(".close()", async (t) => {
    await t.step("deletes pending named pipe instance", async (t) => {
      await t.step("without .accept() calls", async () => {
        const testPath = createTestPipePath();
        using listener = listen({ path: testPath });

        listener.close();

        await assertRejects(
          () => Deno.stat(testPath),
          Error,
          "(os error 2)", // ERROR_PATH_NOT_FOUND
        );
      });
      await t.step("after .accept() calls", async () => {
        const testPath = createTestPipePath();
        using listener = listen({ path: testPath });

        const connPromise = listener.accept();
        connPromise.catch(() => {});

        await flushPromises();
        assertEquals(await peekPromiseState(connPromise), "pending");

        listener.close();

        await flushPromises();
        assertEquals(await peekPromiseState(connPromise), "rejected");
        await assertRejects(
          () => Deno.stat(testPath),
          Error,
          "(os error 2)", // ERROR_PATH_NOT_FOUND
        );
      });
      await t.step("after .accept() multiple calls", async () => {
        const testPath = createTestPipePath();
        using listener = listen({ path: testPath, maxInstances: 3 });

        const promises = [
          listener.accept(),
          listener.accept(),
          listener.accept(),
        ];
        Promise.allSettled(promises);

        await flushPromises();
        assertEquals(await peekPromiseState(promises[0]), "pending");
        assertEquals(await peekPromiseState(promises[1]), "pending");
        assertEquals(await peekPromiseState(promises[2]), "pending");

        listener.close();

        await flushPromises();
        assertEquals(await peekPromiseState(promises[0]), "rejected");
        assertEquals(await peekPromiseState(promises[1]), "rejected");
        assertEquals(await peekPromiseState(promises[2]), "rejected");
        await assertRejects(
          () => Deno.stat(testPath),
          Error,
          "(os error 2)", // ERROR_PATH_NOT_FOUND
        );
      });
    });
    await t.step("throws if listener already closes", () => {
      const testPath = createTestPipePath();
      using listener = listen({ path: testPath, maxInstances: 3 });
      listener.close();

      assertThrows(() => listener.close(), Error, "resource closed");
    });
  });
  await t.step("[@@dispose]()", async (t) => {
    const testPath = createTestPipePath();
    using listener = listen({ path: testPath });
    const listener_close = spy(listener, "close");

    await t.step("calls .close()", async () => {
      listener[Symbol.dispose]();

      assertSpyCalls(listener_close, 1);
      await assertRejects(
        () => Deno.stat(testPath),
        Error,
        "(os error 2)", // ERROR_PATH_NOT_FOUND
      );
    });
    await t.step("does not calls .close() if already closed", () => {
      listener[Symbol.dispose]();

      assertSpyCalls(listener_close, 1);
    });
  });
  await t.step("[@@asyncIterator]()", async (t) => {
    using stack = new DisposableStack();
    const testPath = createTestPipePath();
    const listener = stack.use(listen({ path: testPath, maxInstances: 2 }));
    const conns: NamedPipeConn[] = [];

    await t.step("returns self", () => {
      const iterator = listener[Symbol.asyncIterator]();

      assertStrictEquals(iterator, listener);
    });
    await t.step(".next()", async (t) => {
      const iterator = listener[Symbol.asyncIterator]();

      await t.step("resolves when client connects", async (t) => {
        const resPromise = iterator.next();

        await flushPromises();
        assertEquals(await peekPromiseState(resPromise), "pending");

        stack.adopt(
          await Deno.open(testPath, { append: true }),
          (f) => f.close(),
        );

        await flushPromises();
        assertEquals(await peekPromiseState(resPromise), "fulfilled");

        await t.step("as IteratorResult<NamedPipeConn>", async () => {
          const res = await resPromise;

          assertObjectMatch(res, { done: false });
          assertEquals(Deno.inspect(res.value), "NamedPipeServerConn {}");
          conns.push(stack.use(res.value));
        });
      });
      await t.step(
        "resolves when calls no more than `maxInstances` times",
        async () => {
          const resPromise = iterator.next();

          await flushPromises();
          assertEquals(await peekPromiseState(resPromise), "pending");

          stack.adopt(
            await Deno.open(testPath, { append: true }),
            (f) => f.close(),
          );

          await flushPromises();
          assertEquals(await peekPromiseState(resPromise), "fulfilled");
          const res = await resPromise;
          assertObjectMatch(res, { done: false });
          assertEquals(Deno.inspect(res.value), "NamedPipeServerConn {}");
          conns.push(stack.use(res.value));
        },
      );
      await t.step(
        "pendings when calls more than `maxInstances` times",
        async (t) => {
          const resPromise = iterator.next();

          await flushPromises();
          assertEquals(await peekPromiseState(resPromise), "pending");

          await assertRejects(
            () => Deno.open(testPath, { append: true }),
            Error,
            "(os error 231)", // ERROR_PIPE_BUSY
          );

          await flushPromises();
          assertEquals(await peekPromiseState(resPromise), "pending");

          await t.step("and resolves when previous conn closes", async () => {
            conns[0].close();

            await resolveMicrotasks();

            stack.adopt(
              await Deno.open(testPath, { append: true }),
              (f) => f.close(),
            );

            await flushPromises();
            assertEquals(await peekPromiseState(resPromise), "fulfilled");
            const res = await resPromise;
            assertObjectMatch(res, { done: false });
            assertEquals(Deno.inspect(res.value), "NamedPipeServerConn {}");
            stack.use(res.value);
          });
        },
      );
      await t.step("resolves when listener closes", async () => {
        const resPromise = iterator.next();

        await flushPromises();
        assertEquals(await peekPromiseState(resPromise), "pending");

        listener.close();

        await flushPromises();
        assertEquals(await peekPromiseState(resPromise), "fulfilled");

        const res = await resPromise;
        assertEquals(res, { done: true, value: undefined });
      });
    });
    await t.step("closes listener when iterator breaks", async () => {
      using stack = new DisposableStack();
      const testPath = createTestPipePath();
      const listener = stack.use(listen({ path: testPath, maxInstances: 2 }));

      const iteratorPromise = (async () => {
        for await (const conn of listener) {
          stack.use(conn);
          break;
        }
      })();

      stack.adopt(
        await Deno.open(testPath, { append: true }),
        (f) => f.close(),
      );

      await flushPromises();
      assertEquals(await peekPromiseState(iteratorPromise), "fulfilled");
      assertThrows(() => listener.close(), Error, "resource closed");
    });
  });
});
