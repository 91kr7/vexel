import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";

// The service talks to the daemon only through the shared EngineClient: the
// mock stands in for it, recording every request/hijack call and handing out
// a controllable hijacked socket, which is the only place the service's own
// behaviour (relaying, resize, teardown) is observable.
let calls: Array<{ kind: "request" | "hijack"; path: string }> = [];
let hijackFailure: Error | undefined;
let currentSocket: PassThrough | undefined;

mock.module(new URL("../../src/connectivity/connection-status-service.ts", import.meta.url).href, {
  namedExports: {
    getEngineClient: () => ({
      request: async (path: string) => {
        calls.push({ kind: "request", path });
        return { statusCode: 200, body: "" };
      },
      hijack: async (path: string) => {
        calls.push({ kind: "hijack", path });
        if (hijackFailure) throw hijackFailure;
        currentSocket = new PassThrough();
        return { socket: currentSocket, head: Buffer.alloc(0) };
      },
    }),
  },
});

const { startAttachSession } = await import("../../src/containers/container-attach-service.js");

beforeEach(() => {
  calls = [];
  hijackFailure = undefined;
  currentSocket = undefined;
});

function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

interface Collected {
  data: Buffer[];
  exits: Array<number | null>;
  errors: string[];
}

function collector(): Collected & { handlers: { onData: (chunk: Buffer) => void; onExit: (code: number | null) => void; onError: (message: string) => void } } {
  const collected: Collected = { data: [], exits: [], errors: [] };
  return {
    ...collected,
    handlers: {
      onData: (chunk) => collected.data.push(chunk),
      onExit: (code) => collected.exits.push(code),
      onError: (message) => collected.errors.push(message),
    },
  };
}

// container-attach-service.md — startAttachSession hijacks the container's own stdio
test("hijacks the container's own stdio", async () => {
  const collected = collector();
  await startAttachSession("container-1", collected.handlers);

  const hijackCall = calls.find((call) => call.kind === "hijack");
  assert.ok(hijackCall, "expected a hijack call");
  assert.match(hijackCall!.path, /\/containers\/container-1\/attach/);
});

// container-attach-service.md — onData fires with the container's raw stdio bytes as they arrive
test("relays the container's raw stdio bytes through onData", async () => {
  const collected = collector();
  await startAttachSession("container-1", collected.handlers);

  currentSocket!.write(Buffer.from("stdio bytes from the container's main process"));
  await settle();

  assert.equal(Buffer.concat(collected.data).toString("utf8"), "stdio bytes from the container's main process");
});

// container-attach-service.md — write(data) forwards input into the container's own stdin
test("write() forwards input into the hijacked socket", async () => {
  const collected = collector();
  const session = await startAttachSession("container-1", collected.handlers);
  const received: Buffer[] = [];
  currentSocket!.on("data", (chunk: Buffer) => received.push(chunk));

  session.write(Buffer.from("operator input\n"));
  await settle();

  assert.equal(Buffer.concat(received).toString("utf8"), "operator input\n");
});

// container-attach-service.md — resize(cols, rows) propagates a terminal size change
test("resize() propagates the chosen terminal size", async () => {
  const collected = collector();
  const session = await startAttachSession("container-1", collected.handlers);
  calls = [];

  session.resize(100, 30);
  await settle();

  const resizeCall = calls.find((call) => call.kind === "request" && call.path.includes("/resize"));
  assert.ok(resizeCall, "expected a resize request");
  assert.match(resizeCall!.path, /100/);
  assert.match(resizeCall!.path, /30/);
});

// container-attach-service.md — onExit always fires with null: attach has no exit code of its own
test("a daemon-initiated socket close resolves the session with onExit(null)", async () => {
  const collected = collector();
  await startAttachSession("container-1", collected.handlers);

  currentSocket!.destroy();
  await settle();

  assert.deepEqual(collected.exits, [null]);
});

// container-attach-service.md — a daemon-initiated close resolves the session via onExit(null), same as an explicit close()
test("an explicit close() resolves the session with onExit(null), same as a daemon-initiated close", async () => {
  const collected = collector();
  const session = await startAttachSession("container-1", collected.handlers);

  session.close();
  await settle();

  assert.deepEqual(collected.exits, [null]);
});

// container-attach-service.md — close() destroys only the client's side of the socket; it never issues a stop/kill request
test("close() never issues a stop or kill request against the container", async () => {
  const collected = collector();
  const session = await startAttachSession("container-1", collected.handlers);
  calls = [];

  session.close();
  await settle();

  assert.equal(
    calls.some((call) => call.path.includes("/stop") || call.path.includes("/kill")),
    false,
    "expected no lifecycle request to have been issued on detach",
  );
});

// container-attach-service.md — rejects with the daemon's own error when the container cannot be attached to
test("rejects with the daemon's own error when the container cannot be attached to", async () => {
  hijackFailure = new Error("container is not running");
  const collected = collector();

  await assert.rejects(() => startAttachSession("container-1", collected.handlers), /container is not running/);
});
