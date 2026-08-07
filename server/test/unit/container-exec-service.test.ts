import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";

// The service talks to the daemon only through the shared EngineClient: the
// mock stands in for it, recording the create/resize/exit requests and
// handing out a controllable hijacked socket, which is the only place the
// service's own behaviour (tty framing, teardown, exit-code lookup) is
// observable.
let requestCalls: Array<{ path: string; body?: string }> = [];
let createFailure: Error | undefined;
let hijackFailure: Error | undefined;
let exitCodeResponse: { ExitCode: number | null } | undefined;
let exitCodeFailure: Error | undefined;
let currentSocket: PassThrough | undefined;
let execCounter = 0;

mock.module(new URL("../../src/connectivity/connection-status-service.ts", import.meta.url).href, {
  namedExports: {
    getEngineClient: () => ({
      request: async (path: string, init?: { method?: string; body?: string }) => {
        requestCalls.push({ path, body: init?.body });
        if (path.endsWith("/exec")) {
          if (createFailure) throw createFailure;
          execCounter += 1;
          return { statusCode: 201, body: JSON.stringify({ Id: `exec-${execCounter}` }) };
        }
        if (path.includes("/json")) {
          if (exitCodeFailure) throw exitCodeFailure;
          return { statusCode: 200, body: JSON.stringify(exitCodeResponse ?? { ExitCode: 0 }) };
        }
        // resize
        return { statusCode: 200, body: "" };
      },
      hijack: async (path: string, init?: { body?: string }) => {
        requestCalls.push({ path, body: init?.body });
        if (hijackFailure) throw hijackFailure;
        currentSocket = new PassThrough();
        return { socket: currentSocket, head: Buffer.alloc(0) };
      },
    }),
  },
});

const { startExecSession } = await import("../../src/containers/container-exec-service.js");

beforeEach(() => {
  requestCalls = [];
  createFailure = undefined;
  hijackFailure = undefined;
  exitCodeResponse = undefined;
  exitCodeFailure = undefined;
  currentSocket = undefined;
  execCounter = 0;
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

// container-exec-service.md — startExecSession creates the exec instance with the chosen command, user, working directory, and always a tty
test("creates the exec instance with the chosen command, user, working directory and a tty", async () => {
  const collected = collector();
  await startExecSession("container-1", { cmd: ["/bin/bash"], user: "root", workingDir: "/app" }, collected.handlers);

  const createCall = requestCalls.find((call) => call.path.endsWith("/exec"));
  assert.ok(createCall, "expected the exec-create request");
  const body = JSON.parse(createCall!.body!) as { Cmd: string[]; User?: string; WorkingDir?: string; Tty: boolean };
  assert.deepEqual(body.Cmd, ["/bin/bash"]);
  assert.equal(body.User, "root");
  assert.equal(body.WorkingDir, "/app");
  assert.equal(body.Tty, true);
});

// container-exec-service.md — onData fires with the raw tty bytes relayed from the hijacked socket
test("relays hijacked socket data through onData", async () => {
  const collected = collector();
  await startExecSession("container-1", { cmd: ["/bin/sh"] }, collected.handlers);

  currentSocket!.write(Buffer.from("interleaved stdout/stderr bytes"));
  await settle();

  assert.equal(Buffer.concat(collected.data).toString("utf8"), "interleaved stdout/stderr bytes");
});

// container-exec-service.md — write(data) sends input into the hijacked socket
test("write() forwards keystrokes into the hijacked socket", async () => {
  const collected = collector();
  const session = await startExecSession("container-1", { cmd: ["/bin/sh"] }, collected.handlers);
  const received: Buffer[] = [];
  currentSocket!.on("data", (chunk: Buffer) => received.push(chunk));

  session.write(Buffer.from("ls -la\n"));
  await settle();

  assert.equal(Buffer.concat(received).toString("utf8"), "ls -la\n");
});

// container-exec-service.md — resize(cols, rows) propagates a terminal size change to the exec instance
test("resize() propagates the chosen terminal size to the exec instance", async () => {
  const collected = collector();
  const session = await startExecSession("container-1", { cmd: ["/bin/sh"] }, collected.handlers);
  requestCalls = [];

  session.resize(120, 40);
  await settle();

  const resizeCall = requestCalls.find((call) => call.path.includes("/resize"));
  assert.ok(resizeCall, "expected a resize request");
  assert.match(resizeCall!.path, /120/);
  assert.match(resizeCall!.path, /40/);
});

// container-exec-service.md — onExit fires exactly once, with the exec instance's exit code, when the socket closes
test("onExit fires once with the exec instance's exit code when the socket closes", async () => {
  exitCodeResponse = { ExitCode: 137 };
  const collected = collector();
  await startExecSession("container-1", { cmd: ["/bin/sh"] }, collected.handlers);

  currentSocket!.destroy();
  await settle();
  await settle();

  assert.deepEqual(collected.exits, [137]);
});

// container-exec-service.md — onExit resolves with null when the exit code cannot be read
test("onExit resolves with null when the exit code cannot be read", async () => {
  exitCodeFailure = new Error("exec instance already gone");
  const collected = collector();
  await startExecSession("container-1", { cmd: ["/bin/sh"] }, collected.handlers);

  currentSocket!.destroy();
  await settle();
  await settle();

  assert.deepEqual(collected.exits, [null]);
});

// container-exec-service.md — close() and a daemon-initiated socket close both tear down the exec instance; no handler fires twice
test("close() tears down the session and no handler fires again afterwards", async () => {
  const collected = collector();
  const session = await startExecSession("container-1", { cmd: ["/bin/sh"] }, collected.handlers);

  session.close();
  await settle();
  currentSocket!.emit("data", Buffer.from("should be ignored"));
  await settle();

  assert.equal(collected.data.length, 0);
  assert.equal(collected.exits.length, 1);
});

// container-exec-service.md — rejects with the daemon's own error when the exec instance cannot be created
test("rejects with the daemon's own error when the exec instance cannot be created", async () => {
  createFailure = new Error("No such container: container-missing");
  const collected = collector();

  await assert.rejects(
    () => startExecSession("container-missing", { cmd: ["/bin/sh"] }, collected.handlers),
    /No such container/,
  );
});
