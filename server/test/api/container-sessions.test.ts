import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocket } from "ws";
import { handleContainerSessionUpgrade } from "../../src/containers/container-sessions-routes.js";
import { ownershipArgs } from "../support/fixtures.js";
import { ALPINE_IMAGE, ensureImages } from "../support/base-images.js";

// A pruned daemon is a starting state like any other: the base images this
// file's fixtures are built on are ensured here, before the first test, so no
// test has to assume a warm daemon nor depend on another file having pulled
// them. They are shared infrastructure, not fixtures: nothing removes them.
await ensureImages([ALPINE_IMAGE]);

const execFileAsync = promisify(execFile);

interface ControlMessage {
  type: string;
  [key: string]: unknown;
}

interface OpenedSession {
  socket: WebSocket;
  text: () => string;
  controls: () => ControlMessage[];
  sendInput: (text: string) => void;
  sendResize: (cols: number, rows: number) => void;
}

function startApp(): Promise<{ open: (path: string) => Promise<OpenedSession>; close: () => Promise<void> }> {
  const server = createServer((_req, res) => {
    res.writeHead(404);
    res.end();
  });
  server.on("upgrade", (request, socket, head) => {
    const handled = handleContainerSessionUpgrade(request, socket, head);
    if (!handled) socket.destroy();
  });
  return new Promise((resolve) => {
    server.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        open: (path: string) =>
          new Promise((openResolve, openReject) => {
            const socket = new WebSocket(`ws://127.0.0.1:${port}${path}`);
            let text = "";
            const controls: ControlMessage[] = [];
            socket.on("message", (data: Buffer, isBinary: boolean) => {
              if (isBinary) {
                text += data.toString("utf8");
              } else {
                try {
                  controls.push(JSON.parse(data.toString("utf8")) as ControlMessage);
                } catch {
                  // not a control message; ignore
                }
              }
            });
            socket.once("open", () =>
              openResolve({
                socket,
                text: () => text,
                controls: () => controls,
                sendInput: (input: string) => socket.send(Buffer.from(input, "utf8")),
                sendResize: (cols: number, rows: number) => socket.send(JSON.stringify({ type: "resize", cols, rows })),
              }),
            );
            socket.once("error", openReject);
          }),
        close: () =>
          new Promise((closeResolve) => {
            server.closeAllConnections();
            server.close(() => closeResolve());
          }),
      });
    });
  });
}

async function createIdleContainer(name: string): Promise<string> {
  const { stdout } = await execFileAsync("docker", ["run", "-d", "--name", name, ...ownershipArgs(name), "--entrypoint", "sh", "alpine:3.20", "-c", "sleep 300"]);
  return stdout.trim();
}

/** A container whose own main process (no exec involved) keeps printing to stdout, for attach tests. */
async function createTickingContainer(name: string): Promise<string> {
  const { stdout } = await execFileAsync("docker", [
    "run",
    "-d",
    "--name",
    name,
    ...ownershipArgs(name),
    "--entrypoint",
    "sh",
    "alpine:3.20",
    "-c",
    "i=0; while true; do i=$((i+1)); echo tick-$i; sleep 1; done",
  ]);
  return stdout.trim();
}

async function removeContainerQuietly(name: string): Promise<void> {
  await execFileAsync("docker", ["rm", "-fv", name]).catch(() => undefined);
}

async function isRunning(id: string): Promise<boolean> {
  const { stdout } = await execFileAsync("docker", ["inspect", "--format", "{{.State.Running}}", id]).catch(() => ({ stdout: "false" }));
  return stdout.trim() === "true";
}

async function topOutput(id: string): Promise<string> {
  const { stdout } = await execFileAsync("docker", ["top", id]).catch(() => ({ stdout: "" }));
  return stdout;
}

/** Number of processes running inside the container (header row excluded). */
async function processCount(id: string): Promise<number> {
  const output = await topOutput(id);
  return output.split("\n").filter((line) => line.trim() !== "").length - 1;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(predicate: () => boolean | Promise<boolean>, timeoutMs = 15_000, message = "condition not met in time"): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate()) return;
    if (Date.now() > deadline) throw new Error(message);
    await delay(150);
  }
}

// container-sessions-endpoint.md — REQ-34: keystrokes reach the process and its output is rendered.
// The input is sent as soon as the socket reports itself open, which is the earliest an operator
// (or the client hook, which only sends while the channel is open) can type.
test("WS /api/containers/:id/exec — keystrokes reach the process and its output is delivered", async () => {
  const name = `vexel-test-exec-basic-${Date.now()}`;
  const { open, close } = await startApp();
  const id = await createIdleContainer(name);
  try {
    const session = await open(`/api/containers/${id}/exec?cmd=/bin/sh`);

    session.sendInput("echo hello-from-exec\n");
    await waitUntil(() => session.text().includes("hello-from-exec"), 15_000, "expected the echoed line to arrive over the session");

    session.socket.close();
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// container-sessions-endpoint.md — REQ-34: the interactive session runs the chosen command in the chosen working directory
test("WS /api/containers/:id/exec — runs the chosen command in the chosen working directory", async () => {
  const name = `vexel-test-exec-workdir-${Date.now()}`;
  const { open, close } = await startApp();
  const id = await createIdleContainer(name);
  try {
    const session = await open(`/api/containers/${id}/exec?cmd=pwd&workdir=%2Ftmp`);

    await waitUntil(() => session.text().includes("/tmp"), 15_000, "expected pwd to report the chosen working directory");

    session.socket.close();
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// container-sessions-endpoint.md — REQ-34: the interactive session runs as the chosen user
test("WS /api/containers/:id/exec — runs the chosen command as the chosen user", async () => {
  const name = `vexel-test-exec-user-${Date.now()}`;
  const { open, close } = await startApp();
  const id = await createIdleContainer(name);
  try {
    const session = await open(`/api/containers/${id}/exec?cmd=whoami&user=nobody`);

    await waitUntil(() => session.text().includes("nobody"), 15_000, "expected whoami to report the chosen user");

    session.socket.close();
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// container-sessions-endpoint.md — REQ-34: the session follows the available terminal size once resized
test("WS /api/containers/:id/exec — a resize control message reflows the session's terminal size", async () => {
  const name = `vexel-test-exec-resize-${Date.now()}`;
  const { open, close } = await startApp();
  const id = await createIdleContainer(name);
  try {
    const session = await open(`/api/containers/${id}/exec?cmd=/bin/sh`);
    await delay(300); // lets the shell finish starting before it is resized

    session.sendResize(120, 40);
    await delay(300); // lets the resize reach the pty before the next command reads it
    session.sendInput("stty size\n");

    await waitUntil(() => /40 120/.test(session.text()), 15_000, "expected stty size to report the resized terminal (rows cols)");

    session.socket.close();
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// container-sessions-endpoint.md — an exit control frame carries the process's exit code, then the socket closes
test("WS /api/containers/:id/exec — reports the process's exit code and then closes", async () => {
  const name = `vexel-test-exec-exit-${Date.now()}`;
  const { open, close } = await startApp();
  const id = await createIdleContainer(name);
  try {
    const session = await open(`/api/containers/${id}/exec?cmd=/bin/sh`);
    // Waits for the shell's own prompt so this test asserts the exit contract
    // alone, independently of when the session starts accepting input.
    await waitUntil(() => session.text().length > 0, 15_000, "expected the shell to render its prompt");

    session.sendInput("exit 7\n");
    await waitUntil(() => session.controls().some((message) => message.type === "exit"), 15_000, "expected an exit control message");

    const exitMessage = session.controls().find((message) => message.type === "exit");
    assert.equal(exitMessage!.code, 7);
    await waitUntil(() => session.socket.readyState === WebSocket.CLOSED, 5_000, "expected the socket to close after the exit message");
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// container-sessions-endpoint.md — an unopenable exec session reports the daemon's own message and then closes
test("WS /api/containers/:id/exec — an unknown container reports an error control message", async () => {
  const { open, close } = await startApp();
  try {
    const session = await open(`/api/containers/does-not-exist-${Date.now()}/exec?cmd=/bin/sh`);

    await waitUntil(() => session.controls().some((message) => message.type === "error"), 10_000, "expected an error control message");

    const errorMessage = session.controls().find((message) => message.type === "error");
    assert.ok(typeof errorMessage!.message === "string" && (errorMessage!.message as string).length > 0);
    await waitUntil(() => session.socket.readyState === WebSocket.CLOSED, 5_000, "expected the socket to close after the error message");
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-36 — leaving an exec session releases the underlying exec resource
// on the daemon: the shell it started must no longer be running inside the container afterwards.
test("WS /api/containers/:id/exec — closing the client's socket ends the exec'd process on the daemon", async () => {
  const name = `vexel-test-exec-cleanup-${Date.now()}`;
  const { open, close } = await startApp();
  const id = await createIdleContainer(name);
  try {
    const baseline = await processCount(id);
    const session = await open(`/api/containers/${id}/exec?cmd=/bin/sh`);
    await waitUntil(async () => (await processCount(id)) > baseline, 10_000, "expected the exec'd shell to appear in the container");

    session.socket.close();

    await waitUntil(
      async () => (await processCount(id)) === baseline,
      10_000,
      "expected the exec'd shell to be gone from the container after the session closed",
    );
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// container-sessions-endpoint.md — REQ-35: attach relays the container's own stdio
test("WS /api/containers/:id/attach — relays the running container's own stdio", async () => {
  const name = `vexel-test-attach-basic-${Date.now()}`;
  const { open, close } = await startApp();
  const id = await createTickingContainer(name);
  try {
    const session = await open(`/api/containers/${id}/attach`);

    await waitUntil(() => /tick-\d+/.test(session.text()), 15_000, "expected the container's own output over the attach session");

    session.socket.close();
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// plan-docker_management_app/REQ-35, REQ-36 — detaching from an attach session never stops the container
test("WS /api/containers/:id/attach — detaching leaves the container running", async () => {
  const name = `vexel-test-attach-detach-${Date.now()}`;
  const { open, close } = await startApp();
  const id = await createTickingContainer(name);
  try {
    const session = await open(`/api/containers/${id}/attach`);
    await waitUntil(() => /tick-\d+/.test(session.text()), 15_000, "expected the container's own output before detaching");

    session.socket.close();
    await delay(2_000);

    assert.equal(await isRunning(id), true, "expected the container to still be running after detach");
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});
