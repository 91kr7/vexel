import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import type { ContainerLogLine, ContainerLogOptions } from "../../src/containers/container-logs-service.js";

// The service talks to the daemon through the shared EngineClient: the mock
// stands in for it, handing out a controllable stream and recording the paths
// requested, which is the only place the option mapping is observable.
let tty = false;
let requestedPaths: string[] = [];
let currentStream: PassThrough | undefined;
let inspectFailure: Error | undefined;
let streamFailure: Error | undefined;

mock.module(new URL("../../src/connectivity/connection-status-service.ts", import.meta.url).href, {
  namedExports: {
    getEngineClient: () => ({
      request: async (path: string) => {
        requestedPaths.push(path);
        if (inspectFailure) throw inspectFailure;
        return { statusCode: 200, body: JSON.stringify({ Config: { Tty: tty } }) };
      },
      requestStream: async (path: string) => {
        requestedPaths.push(path);
        if (streamFailure) throw streamFailure;
        currentStream = new PassThrough();
        return currentStream;
      },
    }),
  },
});

const { streamContainerLogs } = await import("../../src/containers/container-logs-service.js");

beforeEach(() => {
  tty = false;
  requestedPaths = [];
  currentStream = undefined;
  inspectFailure = undefined;
  streamFailure = undefined;
});

/** One multiplexed (non-TTY) Docker log frame: 8-byte header then the payload. */
function frame(stream: "stdout" | "stderr", text: string): Buffer {
  const payload = Buffer.from(text, "utf8");
  const header = Buffer.alloc(8);
  header[0] = stream === "stdout" ? 1 : 2;
  header.writeUInt32BE(payload.length, 4);
  return Buffer.concat([header, payload]);
}

interface Collected {
  lines: ContainerLogLine[];
  errors: string[];
  ends: number;
}

async function start(options: ContainerLogOptions = {}): Promise<{
  cancel: () => void;
  stream: PassThrough;
  collected: Collected;
  logQuery: string;
}> {
  const collected: Collected = { lines: [], errors: [], ends: 0 };
  const cancel = await streamContainerLogs("container-1", options, {
    onLine: (line) => collected.lines.push(line),
    onError: (message) => collected.errors.push(message),
    onEnd: () => {
      collected.ends += 1;
    },
  });
  const logPath = [...requestedPaths].reverse().find((path) => path.includes("/logs")) ?? "";
  return { cancel, stream: currentStream!, collected, logQuery: logPath.slice(logPath.indexOf("?") + 1) };
}

function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

// container-logs-service.md — one onLine per log line, stdout/stderr tagged, seq increasing by one
test("emits one tagged line per multiplexed log line, with seq increasing by one", async () => {
  const { stream, collected } = await start();

  stream.write(frame("stdout", "first line\n"));
  stream.write(frame("stderr", "an error line\n"));
  await settle();

  assert.deepEqual(
    collected.lines.map((line) => ({ seq: line.seq, stream: line.stream, text: line.text })),
    [
      { seq: 1, stream: "stdout", text: "first line" },
      { seq: 2, stream: "stderr", text: "an error line" },
    ],
  );
});

// container-logs-service.md — partial output split across chunks is buffered until the line is complete
test("buffers a line split across chunks and emits it once, whole", async () => {
  const { stream, collected } = await start();

  const whole = frame("stdout", "split across chunks\n");
  stream.write(whole.subarray(0, 5));
  await settle();
  assert.equal(collected.lines.length, 0);

  stream.write(whole.subarray(5, 12));
  await settle();
  assert.equal(collected.lines.length, 0);

  stream.write(whole.subarray(12));
  await settle();
  assert.deepEqual(
    collected.lines.map((line) => line.text),
    ["split across chunks"],
  );
});

// container-logs-service.md — a trailing incomplete line is emitted when the stream ends; onEnd fires exactly once
test("emits the trailing incomplete line at the end and calls onEnd exactly once", async () => {
  const { stream, collected } = await start();

  stream.write(frame("stdout", "complete\nincomplete-tail"));
  await settle();
  assert.deepEqual(
    collected.lines.map((line) => line.text),
    ["complete"],
  );

  stream.end();
  await settle();

  assert.deepEqual(
    collected.lines.map((line) => line.text),
    ["complete", "incomplete-tail"],
  );
  assert.equal(collected.ends, 1);
});

// container-logs-service.md — a raw (TTY) stream is decoded too, and every line is tagged stdout
test("decodes a raw TTY stream, tagging every line stdout", async () => {
  tty = true;
  const { stream, collected } = await start();

  stream.write(Buffer.from("tty line one\ntty line two\n", "utf8"));
  await settle();

  assert.deepEqual(
    collected.lines.map((line) => ({ stream: line.stream, text: line.text })),
    [
      { stream: "stdout", text: "tty line one" },
      { stream: "stdout", text: "tty line two" },
    ],
  );
});

// container-logs-service.md — the timestamp Docker prefixes is reported separately and not repeated inside text
test("separates the requested timestamp from the line text", async () => {
  const { stream, collected } = await start({ timestamps: true });

  stream.write(frame("stdout", "2026-08-06T10:00:00.123456789Z hello world\n"));
  await settle();

  assert.equal(collected.lines[0]?.timestamp, "2026-08-06T10:00:00.123456789Z");
  assert.equal(collected.lines[0]?.text, "hello world");
});

// container-logs-service.md — without `timestamps` no timestamp is reported and the text is left intact
test("reports no timestamp when timestamps were not requested", async () => {
  const { stream, collected } = await start();

  stream.write(frame("stdout", "plain text line\n"));
  await settle();

  assert.equal(collected.lines[0]?.timestamp, undefined);
  assert.equal(collected.lines[0]?.text, "plain text line");
});

// container-logs-service.md — after a cancel no handler is invoked any more, not even onEnd
test("invokes no handler after the cancel function is called", async () => {
  const { stream, collected, cancel } = await start();

  stream.write(frame("stdout", "before cancel\n"));
  await settle();
  cancel();

  stream.write(frame("stdout", "after cancel\n"));
  stream.end();
  await settle();

  assert.deepEqual(
    collected.lines.map((line) => line.text),
    ["before cancel"],
  );
  assert.equal(collected.ends, 0);
});

// container-logs-service.md — stdout/stderr default to true, and both false is treated as both true
test("requests both streams by default and when both are explicitly false", async () => {
  const byDefault = await start();
  assert.match(byDefault.logQuery, /stdout=(1|true)/);
  assert.match(byDefault.logQuery, /stderr=(1|true)/);

  const bothOff = await start({ stdout: false, stderr: false });
  assert.match(bothOff.logQuery, /stdout=(1|true)/);
  assert.match(bothOff.logQuery, /stderr=(1|true)/);
});

// container-logs-service.md — a single selected stream is the only one requested from the daemon
test("requests only the selected stream when one of the two is turned off", async () => {
  const { logQuery } = await start({ stdout: false, stderr: true });

  assert.match(logQuery, /stdout=(0|false)/);
  assert.match(logQuery, /stderr=(1|true)/);
});

// container-logs-service.md — `follow` defaults to true and is honoured when turned off
test("follows by default and stops following when follow is false", async () => {
  const followed = await start();
  assert.match(followed.logQuery, /follow=(1|true)/);

  const notFollowed = await start({ follow: false });
  assert.match(notFollowed.logQuery, /follow=(0|false)/);
});

// container-logs-service.md — `tail` defaults to 'all' and otherwise bounds the output to the last n lines
test("asks for the whole output by default and for the last n lines when tail is a number", async () => {
  const all = await start();
  assert.match(all.logQuery, /tail=all/);

  const bounded = await start({ tail: 100 });
  assert.match(bounded.logQuery, /tail=100/);
});

// container-logs-service.md — since/until accept an ISO-8601 instant or a relative duration
test("bounds the stream in time from an ISO instant and from a relative duration", async () => {
  const iso = await start({ since: "2026-08-06T10:00:00Z" });
  const isoSince = new URLSearchParams(iso.logQuery).get("since");
  assert.ok(isoSince, "expected the ISO since bound to reach the daemon");
  assert.equal(Number(isoSince), Math.floor(Date.parse("2026-08-06T10:00:00Z") / 1000));

  const relative = await start({ since: "5m" });
  const relativeSince = Number(new URLSearchParams(relative.logQuery).get("since"));
  const expected = Math.floor(Date.now() / 1000) - 300;
  assert.ok(Math.abs(relativeSince - expected) <= 2, `expected a bound around ${expected}, got ${relativeSince}`);

  const until = await start({ until: "1d" });
  const untilValue = Number(new URLSearchParams(until.logQuery).get("until"));
  assert.ok(Math.abs(untilValue - (Math.floor(Date.now() / 1000) - 86400)) <= 2);
});

// container-logs-service.md — an invalid since/until value is ignored rather than failing the stream
test("ignores an unparseable since/until value and still streams", async () => {
  const { stream, collected, logQuery } = await start({ since: "not-a-date", until: "???" });

  assert.equal(new URLSearchParams(logQuery).get("since"), null);
  assert.equal(new URLSearchParams(logQuery).get("until"), null);

  stream.write(frame("stdout", "still streaming\n"));
  await settle();

  assert.deepEqual(
    collected.lines.map((line) => line.text),
    ["still streaming"],
  );
  assert.deepEqual(collected.errors, []);
});

// container-logs-service.md — the call rejects with the daemon's own error when the daemon refuses the request
test("rejects with the daemon's own error when the daemon refuses the request", async () => {
  streamFailure = new Error("No such container: container-1");

  await assert.rejects(
    () => streamContainerLogs("container-1", {}, { onLine: () => {}, onError: () => {}, onEnd: () => {} }),
    /No such container/,
  );
});

// container-logs-service.md — a mid-flight stream failure is reported through onError
test("reports a mid-flight stream failure through onError", async () => {
  const { stream, collected } = await start();

  stream.emit("error", new Error("connection reset by peer"));
  await settle();

  assert.deepEqual(collected.errors, ["connection reset by peer"]);
});
