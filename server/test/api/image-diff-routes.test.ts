import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express, { type Express } from "express";
import type { AddressInfo } from "node:net";
import { imageAnalysisRouter } from "../../src/image-analysis/image-analysis-routes.js";
import type { ImageDiffEntry, ImageFilesystemDiff } from "../../src/image-analysis/image-diff-service.js";

import { ownershipArgs } from "../support/fixtures.js";
import { REGISTRY_IMAGE, ensureImages } from "../support/base-images.js";
import { execFileAsync } from "../support/docker-cli.js";

// A pruned daemon is a starting state like any other: the base images this
// file's fixtures are built on are ensured here, before the first test, so no
// test has to assume a warm daemon nor depend on another file having pulled
// them. They are shared infrastructure, not fixtures: nothing removes them.
await ensureImages([REGISTRY_IMAGE]);

function startApp(app: Express): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise((closeResolve) => {
            server.closeAllConnections();
            server.close(() => closeResolve());
          }),
      });
    });
  });
}

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/api/images", imageAnalysisRouter);
  return app;
}

interface SseEvent {
  event: string;
  data: unknown;
}

/** Reads an SSE response body until `end` or `error` is seen, or a hard timeout is hit. */
async function readSseUntilDone(response: Response, timeoutMs = 90_000): Promise<SseEvent[]> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const events: SseEvent[] = [];
  let buffer = "";
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const eventLine = frame.split("\n").find((line) => line.startsWith("event: "));
      const dataLine = frame.split("\n").find((line) => line.startsWith("data: "));
      if (!eventLine || !dataLine) continue;
      const event = eventLine.slice("event: ".length);
      const data = JSON.parse(dataLine.slice("data: ".length)) as unknown;
      events.push({ event, data });
      if (event === "end" || event === "error") {
        await reader.cancel().catch(() => undefined);
        return events;
      }
    }
  }
  await reader.cancel().catch(() => undefined);
  return events;
}

async function dockerInspect(format: string, reference: string): Promise<string> {
  const { stdout } = await execFileAsync("docker", ["inspect", reference, "--format", format]);
  return stdout.trim();
}

async function buildImage(tag: string, dockerfile: string): Promise<void> {
  const contextDir = await mkdtemp(join(tmpdir(), "vexel-diff-fixture-"));
  await writeFile(join(contextDir, "Dockerfile"), dockerfile);
  await execFileAsync("docker", ["build", ...ownershipArgs(tag), "-t", tag, contextDir]);
}

async function removeImageQuietly(tag: string): Promise<void> {
  await execFileAsync("docker", ["rmi", "-f", tag]).catch(() => undefined);
}

async function runDiffStream(url: string, imageIdA: string, imageIdB: string): Promise<SseEvent[]> {
  const query = new URLSearchParams({ a: imageIdA, b: imageIdB });
  const response = await fetch(`${url}/api/images/diff/stream?${query.toString()}`);
  return readSseUntilDone(response);
}

function entry(entries: ImageDiffEntry[], path: string): ImageDiffEntry | undefined {
  return entries.find((candidate) => candidate.path === path);
}

// Two small scratch images, deliberately crafted so every REQ-64 change nature is exercised exactly
// once, alongside one path present only in A, one only in B, and one byte-identical path present in
// both — the last one is the "no nature difference at all" case, which REQ-63/64 require to be
// excluded from the diff entirely.
const TAG_A = `vexel-test-diff-a-${process.pid}-${Date.now()}:1`;
const TAG_B = `vexel-test-diff-b-${process.pid}-${Date.now()}:1`;
let imageIdA = "";
let imageIdB = "";
// The one comparison this whole file needs is run once in `before`, since it also drives the two
// images' own (uncached) extraction — several seconds of daemon round trips reused by every test.
let compareResult: ImageFilesystemDiff;

before(async () => {
  await buildImage(
    TAG_A,
    [
      "FROM registry:2 AS builder",
      "RUN set -e && \\",
      "    mkdir -p /out/nested && \\",
      "    printf 'identical-body' > /out/same.txt && \\",
      "    printf 'only-in-a-body' > /out/only-a.txt && \\",
      "    printf 'mode-body' > /out/mode-file.txt && chmod 644 /out/mode-file.txt && \\",
      "    printf 'owner-body' > /out/owner-file.txt && chown 1000:1000 /out/owner-file.txt && \\",
      "    ln -s target-a-does-not-exist /out/mylink && \\",
      "    printf 'content-version-A1' > /out/nested/changed-content.txt && \\",
      "    printf 'short' > /out/nested/changed-size.txt",
      "FROM scratch",
      "COPY --from=builder /out/ /",
      "",
    ].join("\n"),
  );
  imageIdA = await dockerInspect("{{.Id}}", TAG_A);

  await buildImage(
    TAG_B,
    [
      "FROM registry:2 AS builder",
      "RUN set -e && \\",
      "    mkdir -p /out/nested && \\",
      "    printf 'identical-body' > /out/same.txt && \\",
      "    printf 'only-in-b-body' > /out/only-b.txt && \\",
      "    printf 'mode-body' > /out/mode-file.txt && chmod 600 /out/mode-file.txt && \\",
      "    printf 'owner-body' > /out/owner-file.txt && chown 2000:2000 /out/owner-file.txt && \\",
      "    ln -s target-b-does-not-exist /out/mylink && \\",
      "    printf 'content-version-B1' > /out/nested/changed-content.txt && \\",
      "    printf 'a-lot-longer-value' > /out/nested/changed-size.txt",
      "FROM scratch",
      "COPY --from=builder /out/ /",
      "",
    ].join("\n"),
  );
  imageIdB = await dockerInspect("{{.Id}}", TAG_B);

  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const events = await runDiffStream(url, imageIdA, imageIdB);
    const resultEvent = events.find((event) => event.event === "result");
    assert.ok(resultEvent, `expected a result event from the fixture comparison, got: ${JSON.stringify(events)}`);
    compareResult = resultEvent!.data as ImageFilesystemDiff;
  } finally {
    await close();
  }
});

after(async () => {
  await removeImageQuietly(TAG_A);
  await removeImageQuietly(TAG_B);
});

// plan-docker_management_app/REQ-63 — a path present on only one side is added (in B, not A) or
// removed (in A, not B); a byte-identical path present on both sides is excluded entirely.
test("GET /api/images/diff/stream reports a path only in B as added, a path only in A as removed, and drops an identical path", async () => {
  const added = entry(compareResult.entries, "only-b.txt");
  const removed = entry(compareResult.entries, "only-a.txt");

  assert.ok(added, "expected only-b.txt to be reported");
  assert.equal(added!.status, "added");
  assert.ok(removed, "expected only-a.txt to be reported");
  assert.equal(removed!.status, "removed");
  assert.equal(entry(compareResult.entries, "same.txt"), undefined, "expected the byte-identical path to be excluded from the diff");
});

// plan-docker_management_app/REQ-64 — a mode-only difference is reported with the 'mode' nature.
test("GET /api/images/diff/stream reports a permissions-only difference with the 'mode' nature", async () => {
  const changed = entry(compareResult.entries, "mode-file.txt");

  assert.ok(changed, "expected mode-file.txt to be reported as changed");
  assert.equal(changed!.status, "changed");
  assert.deepEqual(changed!.natures, ["mode"]);
});

// plan-docker_management_app/REQ-64 — an ownership-only difference is reported with the 'ownership' nature.
test("GET /api/images/diff/stream reports an ownership-only difference with the 'ownership' nature", async () => {
  const changed = entry(compareResult.entries, "owner-file.txt");

  assert.ok(changed, "expected owner-file.txt to be reported as changed");
  assert.equal(changed!.status, "changed");
  assert.deepEqual(changed!.natures, ["ownership"]);
});

// plan-docker_management_app/REQ-64 — a symlink target difference is reported with the 'symlink-target' nature, with no content comparison for a symlink.
test("GET /api/images/diff/stream reports a symlink target difference with the 'symlink-target' nature", async () => {
  const changed = entry(compareResult.entries, "mylink");

  assert.ok(changed, "expected mylink to be reported as changed");
  assert.equal(changed!.status, "changed");
  assert.deepEqual(changed!.natures, ["symlink-target"]);
});

// plan-docker_management_app/REQ-64 — two files of equal size but different content are compared by
// hash and reported with the 'content' nature alone (no size difference to report).
test("GET /api/images/diff/stream reports an equal-size content difference with the 'content' nature alone", async () => {
  const changed = entry(compareResult.entries, "nested/changed-content.txt");

  assert.ok(changed, "expected nested/changed-content.txt to be reported as changed");
  assert.equal(changed!.status, "changed");
  assert.deepEqual(changed!.natures, ["content"]);
});

// plan-docker_management_app/REQ-64 — a size difference is reported with both 'size' and 'content'
// natures (a size mismatch already proves the content differs, with no further read needed).
test("GET /api/images/diff/stream reports a size difference with both the 'size' and 'content' natures", async () => {
  const changed = entry(compareResult.entries, "nested/changed-size.txt");

  assert.ok(changed, "expected nested/changed-size.txt to be reported as changed");
  assert.equal(changed!.status, "changed");
  assert.deepEqual([...changed!.natures!].sort(), ["content", "size"]);
});

// plan-docker_management_app/REQ-63 — entries are flat and sorted by path, and the summary counts
// match the actual number of added/removed/changed entries.
test("GET /api/images/diff/stream returns entries sorted by path with counts matching the entries themselves", async () => {
  const paths = compareResult.entries.map((item) => item.path);
  assert.deepEqual(paths, [...paths].sort(), "expected entries sorted by path");

  assert.equal(compareResult.addedCount, compareResult.entries.filter((item) => item.status === "added").length);
  assert.equal(compareResult.removedCount, compareResult.entries.filter((item) => item.status === "removed").length);
  assert.equal(compareResult.changedCount, compareResult.entries.filter((item) => item.status === "changed").length);
  assert.equal(compareResult.addedCount, 1);
  assert.equal(compareResult.removedCount, 1);
  assert.equal(compareResult.changedCount, 5);
});

// plan-docker_management_app/REQ-63 — a pair that has never been compared answers 404.
test("GET /api/images/diff/entries answers 404 for a pair that has not been compared yet", async () => {
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const response = await fetch(`${url}/api/images/diff/entries?a=never-compared-a&b=never-compared-b`);
    assert.equal(response.status, 404);
    const body = (await response.json()) as { error?: string };
    assert.ok(typeof body.error === "string" && body.error.length > 0);
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-63 — the root level of the cached diff tree lists the real
// added/removed/changed root paths plus a bare, synthesized 'nested' directory node carrying the
// roll-up count of the real changes nested underneath it.
test("GET /api/images/diff/entries lists the root's real changes plus a synthesized ancestor directory with roll-up counts", async () => {
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const query = new URLSearchParams({ a: imageIdA, b: imageIdB });
    const response = await fetch(`${url}/api/images/diff/entries?${query.toString()}`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { entries: ImageDiffEntry[] };

    assert.equal(entry(body.entries, "only-a.txt")?.status, "removed");
    assert.equal(entry(body.entries, "only-b.txt")?.status, "added");
    assert.equal(entry(body.entries, "mode-file.txt")?.status, "changed");
    assert.equal(entry(body.entries, "same.txt"), undefined, "expected the identical path to be absent from the root listing too");

    const nested = entry(body.entries, "nested");
    assert.ok(nested, "expected a synthesized 'nested' directory node carrying the nested changes down");
    assert.equal(nested!.status, undefined, "expected the synthesized ancestor to carry no status of its own");
    assert.deepEqual(nested!.rollup, { added: 0, removed: 0, changed: 2 });
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-63 — a directory level is read one level at a time: the nested
// level's own two changed paths are only returned when that level is explicitly requested.
test("GET /api/images/diff/entries?path=nested lists the nested level's own changed paths", async () => {
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const query = new URLSearchParams({ a: imageIdA, b: imageIdB, path: "nested" });
    const response = await fetch(`${url}/api/images/diff/entries?${query.toString()}`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { entries: ImageDiffEntry[] };

    assert.equal(entry(body.entries, "nested/changed-content.txt")?.status, "changed");
    assert.equal(entry(body.entries, "nested/changed-size.txt")?.status, "changed");
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-63 — comparing (A, B) and (B, A) are tracked as distinct, directional
// pairs: the very same path flips from removed to added once the two sides are swapped.
test("comparing the pair in reverse order flips added/removed for the same path, tracked as a distinct ordered pair", async () => {
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const events = await runDiffStream(url, imageIdB, imageIdA);
    const resultEvent = events.find((event) => event.event === "result");
    assert.ok(resultEvent, `expected a result event, got: ${JSON.stringify(events)}`);
    const reversed = resultEvent!.data as ImageFilesystemDiff;

    // only-a.txt exists in the original A only; swapped, A is now "b, not a" -> added.
    assert.equal(entry(reversed.entries, "only-a.txt")?.status, "added");
    // only-b.txt exists in the original B only; swapped, B is now "a, not b" -> removed.
    assert.equal(entry(reversed.entries, "only-b.txt")?.status, "removed");
  } finally {
    await close();
  }
});

// image-analysis-endpoints.md — an unknown image id surfaces the daemon's own rejection through the
// comparison stream's error event, rather than the stream hanging or succeeding silently.
test("GET /api/images/diff/stream with an unknown image id reports the daemon's own rejection as an error event", async () => {
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const events = await runDiffStream(url, `does-not-exist-${Date.now()}`, imageIdB);
    const errorEvent = events.find((event) => event.event === "error");
    assert.ok(errorEvent, `expected an error event, got: ${JSON.stringify(events)}`);
    const data = errorEvent!.data as { message?: string };
    assert.ok(typeof data.message === "string" && data.message.length > 0);
    assert.ok(!events.some((event) => event.event === "result"), "expected no result event once the comparison failed");
  } finally {
    await close();
  }
});
