/**
 * Windows Named Pipes server and client module for Deno.
 *
 * Requires `allow-ffi`, `unstable-ffi` [permission](https://docs.deno.com/runtime/manual/basics/permissions).
 *
 * @module
 */

export * from "./client.ts";
export * from "./error.ts";
export * from "./server.ts";
export type * from "./types.ts";
