import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";

// The service reads the daemon's `/top` payload through the shared
// EngineClient: the mock stands in for it, replying with whatever column
// layout a test needs.
let requestedPaths: string[] = [];
let response: { statusCode: number; body: string } = { statusCode: 200, body: "{}" };
// The EngineClient surfaces a daemon refusal as a rejection carrying the
// daemon's own message, which is what the service is contracted to pass on.
let requestFailure: Error | undefined;

mock.module(new URL("../../src/connectivity/connection-status-service.ts", import.meta.url).href, {
  namedExports: {
    getEngineClient: () => ({
      request: async (path: string) => {
        requestedPaths.push(path);
        if (requestFailure) throw requestFailure;
        return response;
      },
    }),
  },
});

const { listContainerProcesses } = await import("../../src/containers/container-processes-service.js");

beforeEach(() => {
  requestedPaths = [];
  response = { statusCode: 200, body: "{}" };
  requestFailure = undefined;
});

function daemonReplies(titles: string[], processes: string[][]): void {
  response = { statusCode: 200, body: JSON.stringify({ Titles: titles, Processes: processes }) };
}

// container-processes-service.md — pid, user and command are located by their column titles
test("locates the pid, user and command columns by title", async () => {
  daemonReplies(
    ["UID", "PID", "PPID", "C", "STIME", "TTY", "TIME", "CMD"],
    [["999", "555", "532", "0", "12:33", "?", "00:00:02", "postgres"]],
  );

  const listing = await listContainerProcesses("container-1");

  assert.deepEqual(listing.processes, [{ pid: 555, user: "999", command: "postgres", cpuPercent: undefined, memoryPercent: undefined }]);
  assert.match(requestedPaths.at(-1) ?? "", /\/containers\/container-1\/top/);
});

// container-processes-service.md — the titles are matched case-insensitively
test("matches the column titles case-insensitively", async () => {
  daemonReplies(["pid", "user", "command"], [["7", "root", "nginx"]]);

  const listing = await listContainerProcesses("container-1");

  assert.equal(listing.processes[0]?.pid, 7);
  assert.equal(listing.processes[0]?.user, "root");
  assert.equal(listing.processes[0]?.command, "nginx");
});

// container-processes-service.md — USER/UID/OWNER and COMMAND/CMD/ARGS are all accepted as the user/command column
test("accepts every alternative title for the user and command columns", async () => {
  for (const [userTitle, commandTitle] of [
    ["USER", "COMMAND"],
    ["UID", "CMD"],
    ["OWNER", "ARGS"],
  ]) {
    daemonReplies(["PID", userTitle, commandTitle], [["3", "operator", "sleep 1"]]);

    const listing = await listContainerProcesses("container-1");

    assert.equal(listing.processes[0]?.user, "operator", `expected ${userTitle} to be read as the user`);
    assert.equal(listing.processes[0]?.command, "sleep 1", `expected ${commandTitle} to be read as the command`);
  }
});

// container-processes-service.md — %CPU and %MEM are reported when the daemon provides them
test("reports the optional %CPU and %MEM readings when the daemon provides them", async () => {
  daemonReplies(["PID", "USER", "%CPU", "%MEM", "COMMAND"], [["12", "root", "3.5", "0.4", "postgres"]]);

  const listing = await listContainerProcesses("container-1");

  assert.equal(listing.processes[0]?.cpuPercent, 3.5);
  assert.equal(listing.processes[0]?.memoryPercent, 0.4);
});

// container-processes-service.md — a column the daemon does not report reads as '' / 0 / undefined, never a failure
test("reads a column the daemon does not report as an empty value rather than failing", async () => {
  daemonReplies(["TIME"], [["00:00:01"]]);

  const listing = await listContainerProcesses("container-1");

  assert.equal(listing.processes.length, 1);
  assert.equal(listing.processes[0]?.pid, 0);
  assert.equal(listing.processes[0]?.user, "");
  assert.equal(listing.processes[0]?.command, "");
  assert.equal(listing.processes[0]?.cpuPercent, undefined);
  assert.equal(listing.processes[0]?.memoryPercent, undefined);
});

// container-processes-service.md — surplus fields are joined back onto the last column, keeping a command whole
test("joins the surplus fields of a row back onto the last column", async () => {
  daemonReplies(["UID", "PID", "CMD"], [["root", "1", "postgres", "-c", "shared_buffers=1MB"]]);

  const listing = await listContainerProcesses("container-1");

  assert.equal(listing.processes[0]?.command, "postgres -c shared_buffers=1MB");
});

// container-processes-service.md — the daemon's titles and process order are preserved
test("keeps the daemon's column titles and process order", async () => {
  const titles = ["UID", "PID", "PPID", "CMD"];
  daemonReplies(titles, [
    ["root", "1", "0", "first"],
    ["root", "2", "1", "second"],
    ["root", "3", "1", "third"],
  ]);

  const listing = await listContainerProcesses("container-1");

  assert.deepEqual(listing.titles, titles);
  assert.deepEqual(
    listing.processes.map((process) => process.command),
    ["first", "second", "third"],
  );
});

// container-processes-service.md — the listing is a snapshot at call time and is never cached
test("re-reads the daemon on every call rather than caching the listing", async () => {
  daemonReplies(["PID", "USER", "CMD"], [["1", "root", "before"]]);
  const first = await listContainerProcesses("container-1");

  daemonReplies(["PID", "USER", "CMD"], [["1", "root", "before"], ["2", "root", "after"]]);
  const second = await listContainerProcesses("container-1");

  assert.equal(first.processes.length, 1);
  assert.equal(second.processes.length, 2);
  assert.equal(second.processes[1]?.command, "after");
});

// container-processes-service.md — the call rejects with the daemon's own error when the container is not running
test("rejects with the daemon's own error when the container is not running", async () => {
  requestFailure = new Error("Container container-1 is not running");

  await assert.rejects(() => listContainerProcesses("container-1"), /is not running/);
});

// container-processes-service.md — the call rejects with the daemon's own error when the container does not exist
test("rejects with the daemon's own error when the container does not exist", async () => {
  requestFailure = new Error("No such container: container-1");

  await assert.rejects(() => listContainerProcesses("container-1"), /No such container: container-1/);
});
