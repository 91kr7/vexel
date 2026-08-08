import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile as readFileFs, writeFile } from "node:fs/promises";
import { readFileSync, readlinkSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, posix, sep } from "node:path";
import { imageAnalysisRouter } from "../../src/image-analysis/image-analysis-routes.js";
import { getExtractedFilesystem } from "../../src/image-analysis/filesystem-extraction-service.js";
import { buildApp, startApp, type RunningApp } from "../support/fixtures.js";

import { ownershipArgs } from "../support/fixtures.js";
import { ALPINE_IMAGE, ensureImages } from "../support/base-images.js";

// A pruned daemon is a starting state like any other: the base images this
// file's fixtures are built on are ensured here, before the first test, so no
// test has to assume a warm daemon nor depend on another file having pulled
// them. They are shared infrastructure, not fixtures: nothing removes them.
await ensureImages([ALPINE_IMAGE]);

const execFileAsync = promisify(execFile);

interface SseEvent {
  event: string;
  data: Record<string, unknown>;
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
      const data = JSON.parse(dataLine.slice("data: ".length)) as Record<string, unknown>;
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

async function removeImageQuietly(tag: string): Promise<void> {
  await execFileAsync("docker", ["rmi", "-f", tag]).catch(() => undefined);
}

/**
 * Minimal USTAR reader — only what is needed to check the shape of an archive
 * this test produced, never to trust anything the code under test claims about
 * itself: entry name (with the name/prefix split honoured), type flag and
 * (for a symlink) its link name.
 */
interface TarEntry {
  name: string;
  typeflag: string;
  linkname: string;
  content: Buffer;
}

function readCString(buffer: Buffer, start: number, length: number): string {
  const slice = buffer.subarray(start, start + length);
  const nul = slice.indexOf(0);
  return (nul === -1 ? slice : slice.subarray(0, nul)).toString("utf-8");
}

function parseUstarEntries(buffer: Buffer): TarEntry[] {
  const entries: TarEntry[] = [];
  let offset = 0;
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break; // one of the two closing zero blocks
    const name = readCString(header, 0, 100);
    const typeflag = readCString(header, 156, 1) || "0";
    const linkname = readCString(header, 157, 100);
    const prefix = readCString(header, 345, 155);
    const sizeOctal = readCString(header, 124, 12).trim();
    const size = sizeOctal.length > 0 ? parseInt(sizeOctal, 8) : 0;
    const fullName = prefix.length > 0 ? `${prefix}/${name}` : name;
    offset += 512;
    const content = buffer.subarray(offset, offset + size);
    entries.push({ name: fullName, typeflag, linkname, content: Buffer.from(content) });
    offset += Math.ceil(size / 512) * 512;
  }
  return entries;
}

const FIXTURE_TAG = `vexel-test-fs-ops-${process.pid}-${Date.now()}:1`;
let fixtureImageId = "";
let hostPasswdContent = "";
let containerOwnPasswdContent = "";

before(async () => {
  const contextDir = await mkdtemp(join(tmpdir(), "vexel-fs-ops-fixture-"));
  await writeFile(
    join(contextDir, "Dockerfile"),
    [
      "FROM alpine:3.20",
      "RUN mkdir -p /data/nested /many-matches",
      "RUN printf 'hello world' > /data/hello.txt",
      "RUN printf '\\000\\001\\002binarydata' > /data/small-binary.bin",
      "RUN yes 'line of readable text content for the truncation bound test' | head -c 300000 > /data/big-text.txt",
      "RUN dd if=/dev/zero of=/data/big-binary.bin bs=1024 count=300",
      // An absolute symlink target: per REQ-62, read as tree-root-relative — it must resolve to this
      // tree's own /etc/passwd, never to the host's.
      "RUN ln -s /etc/passwd /data/link-absolute",
      // A relative chain that climbs past the tree root once resolved against its own directory
      // (data/nested): a genuine escape attempt, expected to be excluded at indexing time.
      "RUN ln -s ../../../../etc/shadow /data/nested/link-escape",
      // A legitimate relative symlink, staying inside the tree, for a sanity check alongside the two above.
      "RUN ln -s ../hello.txt /data/nested/link-ok",
      "RUN i=1; while [ \"$i\" -le 250 ]; do touch \"/many-matches/match-target-$i.txt\"; i=$((i+1)); done",
      "",
    ].join("\n"),
  );
  await execFileAsync("docker", ["build", ...ownershipArgs(FIXTURE_TAG), "-t", FIXTURE_TAG, contextDir]);
  fixtureImageId = await dockerInspect("{{.Id}}", FIXTURE_TAG);

  hostPasswdContent = await readFileFs("/etc/passwd", "utf-8");
  const { stdout } = await execFileAsync("docker", ["run", "--rm", "--entrypoint", "cat", FIXTURE_TAG, "/etc/passwd"]);
  containerOwnPasswdContent = stdout;
});

after(async () => {
  await removeImageQuietly(FIXTURE_TAG);
});

async function withApp<T>(run: (app: RunningApp) => Promise<T>): Promise<T> {
  const app = await startApp(buildApp("/api/images", imageAnalysisRouter));
  try {
    return await run(app);
  } finally {
    await app.close();
  }
}

async function ensureExtracted(): Promise<void> {
  await withApp(async ({ url }) => {
    const response = await fetch(`${url}/api/images/${encodeURIComponent(fixtureImageId)}/filesystem/stream?force=true`);
    const events = await readSseUntilDone(response);
    assert.ok(events.find((event) => event.event === "result"), `expected the fixture's extraction to succeed, got: ${JSON.stringify(events)}`);
  });
}

// plan-docker_management_app/REQ-62 — a symlink target climbing past the tree root once resolved
// against its own directory is excluded at indexing time and reported, with its reason, through
// `getExtractedFilesystem`'s own `refusals` (not merely counted).
test("extraction excludes a symlink whose relative target climbs past the tree root, and reports why", async () => {
  await ensureExtracted();
  const filesystem = await getExtractedFilesystem(fixtureImageId);
  assert.ok(filesystem, "expected a cached extraction");
  const refusal = filesystem!.refusals.find((entry) => entry.path.includes("link-escape"));
  assert.ok(refusal, `expected a refusal naming the escaping symlink, got: ${JSON.stringify(filesystem!.refusals)}`);
  assert.ok(refusal!.reason.length > 0, "expected a human-readable reason");
});

// plan-docker_management_app/REQ-58 — a file entry's full metadata is reported.
test("GET .../filesystem/metadata reports a file entry's size, permissions, owner, modification time and type", async () => {
  await ensureExtracted();
  await withApp(async ({ url }) => {
    const response = await fetch(`${url}/api/images/${encodeURIComponent(fixtureImageId)}/filesystem/metadata?path=data/hello.txt`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { metadata: Record<string, unknown> };
    assert.equal(body.metadata.path, "data/hello.txt");
    assert.equal(body.metadata.kind, "file");
    assert.equal(body.metadata.sizeBytes, 11);
    assert.match(body.metadata.permissions as string, /^[-rwxst]{9}$/);
    assert.equal(typeof body.metadata.uid, "number");
    assert.equal(typeof body.metadata.gid, "number");
    assert.ok(!Number.isNaN(Date.parse(body.metadata.modifiedAt as string)), "expected a valid ISO-8601 modification time");
  });
});

// plan-docker_management_app/REQ-58, plan-docker_management_app/REQ-62 — a symlink's reported
// target is already contained: an absolute target is shown as the tree-relative path it maps to,
// never as the literal host-looking string that was written into the image.
test("GET .../filesystem/metadata reports an absolute symlink's target as tree-relative, not as the raw host-looking path", async () => {
  await ensureExtracted();
  await withApp(async ({ url }) => {
    const response = await fetch(`${url}/api/images/${encodeURIComponent(fixtureImageId)}/filesystem/metadata?path=data/link-absolute`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { metadata: Record<string, unknown> };
    assert.equal(body.metadata.kind, "symlink");
    assert.equal(body.metadata.linkTarget, "etc/passwd");
  });
});

// plan-docker_management_app/REQ-62 — an entry excluded at indexing time never entered the browsed
// tree, so its metadata is reported as absent, exactly like any other unknown path.
test("GET .../filesystem/metadata answers 404 for an entry that was refused at extraction time", async () => {
  await ensureExtracted();
  await withApp(async ({ url }) => {
    const response = await fetch(`${url}/api/images/${encodeURIComponent(fixtureImageId)}/filesystem/metadata?path=data/nested/link-escape`);
    assert.equal(response.status, 404);
  });
});

// plan-docker_management_app/REQ-59 — a text file previews as text; the same content requested as
// hex differs from the auto-detected mode.
test("GET .../filesystem/content previews a text file as text, and can be forced to hex", async () => {
  await ensureExtracted();
  await withApp(async ({ url }) => {
    const auto = await fetch(`${url}/api/images/${encodeURIComponent(fixtureImageId)}/filesystem/content?path=data/hello.txt`);
    assert.equal(auto.status, 200);
    const autoBody = (await auto.json()) as { result: Record<string, unknown> };
    assert.equal(autoBody.result.mode, "text");
    assert.equal(autoBody.result.autoMode, "text");
    assert.equal(autoBody.result.content, "hello world");
    assert.equal(autoBody.result.truncated, false);
    assert.equal(autoBody.result.totalSizeBytes, 11);

    const forcedHex = await fetch(`${url}/api/images/${encodeURIComponent(fixtureImageId)}/filesystem/content?path=data/hello.txt&mode=hex`);
    const forcedHexBody = (await forcedHex.json()) as { result: Record<string, unknown> };
    assert.equal(forcedHexBody.result.mode, "hex");
    assert.equal(forcedHexBody.result.autoMode, "text", "expected the auto-detected mode to still be reported, so the override can be surfaced as a divergence");
    assert.notEqual(forcedHexBody.result.content, autoBody.result.content);
    assert.match((forcedHexBody.result.content as string).split("\n")[0]!, /^[0-9a-f]{8}/i, "expected an 8-digit hex offset to open the first row");
  });
});

// plan-docker_management_app/REQ-59 — a binary file (any NUL byte) auto-detects as hex, and the
// operator can force it back to text.
test("GET .../filesystem/content auto-detects a NUL-carrying file as hex, overridable to text", async () => {
  await ensureExtracted();
  await withApp(async ({ url }) => {
    const auto = await fetch(`${url}/api/images/${encodeURIComponent(fixtureImageId)}/filesystem/content?path=data/small-binary.bin`);
    const autoBody = (await auto.json()) as { result: Record<string, unknown> };
    assert.equal(autoBody.result.mode, "hex");
    assert.equal(autoBody.result.autoMode, "hex");
    assert.equal(autoBody.result.totalSizeBytes, 13);

    const forcedText = await fetch(`${url}/api/images/${encodeURIComponent(fixtureImageId)}/filesystem/content?path=data/small-binary.bin&mode=text`);
    const forcedTextBody = (await forcedText.json()) as { result: Record<string, unknown> };
    assert.equal(forcedTextBody.result.mode, "text");
    assert.equal(forcedTextBody.result.autoMode, "hex");
  });
});

// plan-docker_management_app/REQ-59 — an oversized text file, and an oversized binary file, are
// both truncated, and the truncation is stated alongside the real total size.
test("GET .../filesystem/content truncates an oversized file (text and binary) and states it", async () => {
  await ensureExtracted();
  await withApp(async ({ url }) => {
    const text = await fetch(`${url}/api/images/${encodeURIComponent(fixtureImageId)}/filesystem/content?path=data/big-text.txt`);
    const textBody = (await text.json()) as { result: Record<string, unknown> };
    assert.equal(textBody.result.mode, "text");
    assert.equal(textBody.result.truncated, true);
    assert.equal(textBody.result.totalSizeBytes, 300_000);
    assert.ok((textBody.result.content as string).length < 300_000, "expected less than the full file to have been read");

    const binary = await fetch(`${url}/api/images/${encodeURIComponent(fixtureImageId)}/filesystem/content?path=data/big-binary.bin`);
    const binaryBody = (await binary.json()) as { result: Record<string, unknown> };
    assert.equal(binaryBody.result.mode, "hex");
    assert.equal(binaryBody.result.truncated, true);
    assert.equal(binaryBody.result.totalSizeBytes, 300 * 1024);
  });
});

// filesystem-content-service.md — a directory and a symlink have no content of their own.
test("GET .../filesystem/content refuses a directory and a symlink, each with 409", async () => {
  await ensureExtracted();
  await withApp(async ({ url }) => {
    const directory = await fetch(`${url}/api/images/${encodeURIComponent(fixtureImageId)}/filesystem/content?path=data`);
    assert.equal(directory.status, 409);

    const symlink = await fetch(`${url}/api/images/${encodeURIComponent(fixtureImageId)}/filesystem/content?path=data/link-absolute`);
    assert.equal(symlink.status, 409);
  });
});

// plan-docker_management_app/REQ-62 — an absolute symlink target is contained to the tree's own
// content: reading the path it resolves to returns THIS image's own /etc/passwd, provably not the
// host's (the two differ, verified byte-for-byte against the host's real file).
test("reading the path an absolute symlink resolves to serves the tree's own content, never a byte of the host's", async () => {
  await ensureExtracted();
  await withApp(async ({ url }) => {
    const response = await fetch(`${url}/api/images/${encodeURIComponent(fixtureImageId)}/filesystem/content?path=etc/passwd`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { result: Record<string, unknown> };
    assert.equal(body.result.mode, "text");
    assert.equal(body.result.content, containerOwnPasswdContent);
    assert.notEqual(body.result.content, hostPasswdContent, "must never serve the host's own /etc/passwd");
  });
});

// plan-docker_management_app/REQ-62 — a request path carrying a '../' segment is refused before it
// drives any lookup, with a 400 and the refusal's reason — verified on a path that was never part
// of any extracted tree at all, across every in-tree operation endpoint that takes a `path`.
test("a request path with a '../' segment climbing past the root is refused with 400 on every in-tree endpoint", async () => {
  await ensureExtracted();
  const hostileQuery = "path=" + encodeURIComponent("data/../../../etc/shadow");
  await withApp(async ({ url }) => {
    const base = `${url}/api/images/${encodeURIComponent(fixtureImageId)}/filesystem`;
    for (const endpoint of ["metadata", "content", "subtree-summary", "download", "subtree-download"]) {
      const response = await fetch(`${base}/${endpoint}?${hostileQuery}`);
      assert.equal(response.status, 400, `expected ${endpoint} to refuse a '../'-climbing path with 400`);
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      assert.ok(body.error && body.error.length > 0, `expected ${endpoint}'s 400 to carry a reason`);
    }
  });
});

// image-analysis-endpoints.md — "answering 400 with the refusal's reason when it carries an
// absolute path or a '../' segment (REQ-62)": an absolute request path must be refused the same
// way a '../'-climbing one is.
test("a request path carrying an absolute path is refused with 400", async () => {
  await ensureExtracted();
  await withApp(async ({ url }) => {
    const response = await fetch(`${url}/api/images/${encodeURIComponent(fixtureImageId)}/filesystem/metadata?path=${encodeURIComponent("/etc/shadow")}`);
    assert.equal(response.status, 400, "expected an absolute request path to be refused with 400 per image-analysis-endpoints.md");
  });
});

// plan-docker_management_app/REQ-60 — a substring of a name locates the matching entry, showing its
// position in the tree.
test("GET .../filesystem/search finds an entry by a name fragment, case-insensitively, at its tree position", async () => {
  await ensureExtracted();
  await withApp(async ({ url }) => {
    const response = await fetch(`${url}/api/images/${encodeURIComponent(fixtureImageId)}/filesystem/search?query=HELLO`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { matches: { path: string; name: string; kind: string; parentPath: string }[]; truncated: boolean };
    const match = body.matches.find((entry) => entry.path === "data/hello.txt");
    assert.ok(match, `expected a case-insensitive match for "HELLO", got: ${JSON.stringify(body.matches)}`);
    assert.equal(match!.parentPath, "data");
    assert.equal(match!.kind, "file");
  });
});

// plan-docker_management_app/REQ-60 — the result count is bounded, and the true count and the
// truncation are both reported.
test("GET .../filesystem/search caps its results at 200 and reports the true count and truncation", async () => {
  await ensureExtracted();
  await withApp(async ({ url }) => {
    const response = await fetch(`${url}/api/images/${encodeURIComponent(fixtureImageId)}/filesystem/search?query=match-target`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { matches: unknown[]; totalMatches: number; truncated: boolean };
    assert.equal(body.matches.length, 200);
    assert.equal(body.totalMatches, 250);
    assert.equal(body.truncated, true);
  });
});

// filesystem-search-service.md — an empty query matches nothing.
test("GET .../filesystem/search with an empty query matches nothing", async () => {
  await ensureExtracted();
  await withApp(async ({ url }) => {
    const response = await fetch(`${url}/api/images/${encodeURIComponent(fixtureImageId)}/filesystem/search?query=`);
    const body = (await response.json()) as { matches: unknown[] };
    assert.deepEqual(body.matches, []);
  });
});

// plan-docker_management_app/REQ-61 — a selected file downloads through the browser as itself.
test("GET .../filesystem/download streams a single file as a browser download", async () => {
  await ensureExtracted();
  await withApp(async ({ url }) => {
    const response = await fetch(`${url}/api/images/${encodeURIComponent(fixtureImageId)}/filesystem/download?path=data/hello.txt`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-disposition") ?? "", /attachment/);
    const body = await response.text();
    assert.equal(body, "hello world");
  });
});

// plan-docker_management_app/REQ-61 — downloading a directory through the single-file endpoint is refused.
test("GET .../filesystem/download refuses a directory", async () => {
  await ensureExtracted();
  await withApp(async ({ url }) => {
    const response = await fetch(`${url}/api/images/${encodeURIComponent(fixtureImageId)}/filesystem/download?path=data`);
    assert.equal(response.status, 409);
  });
});

// plan-docker_management_app/REQ-61, plan-docker_management_app/REQ-62 — a subtree's export summary
// reports what the archive will contain, and does not count the entry already excluded at indexing time.
test("GET .../filesystem/subtree-summary reports the subtree's contents, excluding what was already refused", async () => {
  await ensureExtracted();
  await withApp(async ({ url }) => {
    const response = await fetch(`${url}/api/images/${encodeURIComponent(fixtureImageId)}/filesystem/subtree-summary?path=data`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { summary: { fileCount: number; directoryCount: number; symlinkCount: number; totalBytes: number; refusals: unknown[] } };
    assert.equal(body.summary.fileCount, 4);
    assert.equal(body.summary.directoryCount, 2); // "data" itself plus "data/nested"
    assert.equal(body.summary.symlinkCount, 2);
    assert.equal(body.summary.totalBytes, 11 + 13 + 300_000 + 300 * 1024);
  });
});

// plan-docker_management_app/REQ-61, plan-docker_management_app/REQ-62 — every archive entry NAME
// stays inside the tree (absolute or '../'-carrying entry names are the write-path half of REQ-62,
// forbidden without exception); the entry refused at extraction time never reaches the archive.
test("GET .../filesystem/subtree-download produces a USTAR archive whose entry names never carry an absolute path or a '../' segment", async () => {
  await ensureExtracted();
  await withApp(async ({ url }) => {
    const response = await fetch(`${url}/api/images/${encodeURIComponent(fixtureImageId)}/filesystem/subtree-download?path=data`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-disposition") ?? "", /attachment/);
    const buffer = Buffer.from(await response.arrayBuffer());
    const entries = parseUstarEntries(buffer);
    assert.ok(entries.length >= 7, `expected at least the 4 files, 1 directory and 2 symlinks, got: ${JSON.stringify(entries.map((entry) => entry.name))}`);

    for (const entry of entries) {
      assert.ok(!entry.name.startsWith("/"), `expected no absolute entry name, got "${entry.name}"`);
      assert.ok(
        !entry.name.split("/").includes(".."),
        `expected no '../' segment in an archive entry NAME (the write path), got "${entry.name}"`,
      );
    }

    const escapingLinkEntry = entries.find((entry) => entry.name.includes("link-escape"));
    assert.equal(escapingLinkEntry, undefined, "the entry refused at extraction time must never reach the archive");

    const helloEntry = entries.find((entry) => entry.name === "data/hello.txt");
    assert.ok(helloEntry, "expected data/hello.txt in the archive");
    assert.equal(helloEntry!.content.toString("utf-8"), "hello world");
  });
});

// plan-docker_management_app/REQ-61, plan-docker_management_app/REQ-62 — a symlink's recorded
// TARGET is a separate case from an entry name: it is content, already contained within the tree,
// and must be expressed relative to the symlink's OWN directory (the only form POSIX resolves), even
// where that reintroduces a '../' that cannot reach outside the extracted footprint. Verified end to
// end, through the running server, on a real extracted image: the raw archive bytes fetched over
// HTTP are extracted with the real `tar` binary, and each symlink is actually followed on disk —
// not merely inspected as header bytes — to prove it reaches the intended file and never resolves
// outside the extraction directory. A whole-tree download is the case where every symlink's target
// is necessarily included in the archive, so this is where the fix's own claim is fully checkable.
test("extracting a whole-filesystem archive with the real tar binary resolves every symlink to its intended file, never outside the extraction directory", async () => {
  await ensureExtracted();
  await withApp(async ({ url }) => {
    const response = await fetch(`${url}/api/images/${encodeURIComponent(fixtureImageId)}/filesystem/subtree-download?path=`);
    assert.equal(response.status, 200);
    const buffer = Buffer.from(await response.arrayBuffer());

    const workDir = await mkdtemp(join(tmpdir(), "vexel-fs-ops-archive-whole-"));
    const archivePath = join(workDir, "whole.tar");
    await writeFile(archivePath, buffer);
    const extractDir = join(workDir, "extracted");
    await execFileAsync("mkdir", [extractDir]);
    await execFileAsync("tar", ["-xf", archivePath, "-C", extractDir]);

    const realExtractDir = realpathSync(extractDir);

    // The absolute-target symlink (data/link-absolute -> tree-root-relative "etc/passwd") sits in
    // directory "data"; POSIX resolves its relative linkname against that directory, so the
    // directory-relative form must be "../etc/passwd" — reaching <extractDir>/etc/passwd, which the
    // whole-tree archive does carry.
    const absoluteLinkPath = join(extractDir, "data", "link-absolute");
    const absoluteLinkRecordedTarget = readlinkSync(absoluteLinkPath);
    assert.equal(
      absoluteLinkRecordedTarget,
      posix.relative("data", "etc/passwd"),
      "expected the symlink's recorded target to be directory-relative, per the rewritten REQ-62",
    );
    const absoluteLinkRealTarget = realpathSync(absoluteLinkPath);
    assert.equal(absoluteLinkRealTarget, join(realExtractDir, "etc", "passwd"), "expected the symlink to actually resolve to the extracted etc/passwd, not nowhere and not the host's");
    assert.ok(absoluteLinkRealTarget.startsWith(realExtractDir + sep), "expected the resolved symlink to stay strictly inside the extraction directory");
    assert.equal(readFileSync(absoluteLinkPath, "utf-8"), containerOwnPasswdContent, "expected reading through the symlink to reach the tree's own /etc/passwd content");

    // The legitimate relative symlink (data/nested/link-ok -> tree-root-relative "data/hello.txt")
    // sits in directory "data/nested"; its directory-relative form must be "../hello.txt".
    const relativeLinkPath = join(extractDir, "data", "nested", "link-ok");
    const relativeLinkRecordedTarget = readlinkSync(relativeLinkPath);
    assert.equal(relativeLinkRecordedTarget, posix.relative("data/nested", "data/hello.txt"));
    const relativeLinkRealTarget = realpathSync(relativeLinkPath);
    assert.equal(relativeLinkRealTarget, join(realExtractDir, "data", "hello.txt"));
    assert.ok(relativeLinkRealTarget.startsWith(realExtractDir + sep), "expected the resolved symlink to stay strictly inside the extraction directory");
    assert.equal(readFileSync(relativeLinkPath, "utf-8"), "hello world");
  });
});

// plan-docker_management_app/REQ-61, plan-docker_management_app/REQ-62 — the same check restricted
// to a genuine SUBTREE archive: a symlink whose target lies WITHIN the selected subtree ("data") must
// still resolve to the right file once extracted; one whose already-contained target lies OUTSIDE the
// selected subtree ("etc/passwd" is not under "data/") cannot be satisfied by a partial archive that
// never carries that content — this is an inherent property of any partial export (the same as `tar`
// or `zip` of a subdirectory containing a symlink to a sibling that was not included), not a REQ-62
// safety violation: the recorded target stays directory-relative and non-absolute either way, so
// nothing is ever written that could resolve outside the chosen extraction directory.
test("extracting a subtree archive resolves an in-scope symlink correctly; a symlink pointing outside the selected subtree is safely absent from it, never absolute or resolving onto the host", async () => {
  await ensureExtracted();
  await withApp(async ({ url }) => {
    const response = await fetch(`${url}/api/images/${encodeURIComponent(fixtureImageId)}/filesystem/subtree-download?path=data`);
    assert.equal(response.status, 200);
    const buffer = Buffer.from(await response.arrayBuffer());

    const workDir = await mkdtemp(join(tmpdir(), "vexel-fs-ops-archive-subtree-"));
    const archivePath = join(workDir, "subtree.tar");
    await writeFile(archivePath, buffer);
    const extractDir = join(workDir, "extracted");
    await execFileAsync("mkdir", [extractDir]);
    await execFileAsync("tar", ["-xf", archivePath, "-C", extractDir]);
    const realExtractDir = realpathSync(extractDir);

    // In-scope: data/nested/link-ok points at data/hello.txt, both under the selected "data" subtree.
    const relativeLinkPath = join(extractDir, "data", "nested", "link-ok");
    assert.equal(readlinkSync(relativeLinkPath), posix.relative("data/nested", "data/hello.txt"));
    const relativeLinkRealTarget = realpathSync(relativeLinkPath);
    assert.equal(relativeLinkRealTarget, join(realExtractDir, "data", "hello.txt"));
    assert.ok(relativeLinkRealTarget.startsWith(realExtractDir + sep));
    assert.equal(readFileSync(relativeLinkPath, "utf-8"), "hello world");

    // Out-of-scope: data/link-absolute's already-contained target ("etc/passwd") is outside "data/".
    // Its recorded linkname is still directory-relative and non-absolute (never a raw host-looking
    // path), so extracting it writes only a relative symlink inside the chosen directory — but since
    // this partial archive never carries "etc/passwd", following it here legitimately fails: this is
    // a dangling reference, not an escape.
    const absoluteLinkPath = join(extractDir, "data", "link-absolute");
    const recordedTarget = readlinkSync(absoluteLinkPath);
    assert.equal(recordedTarget, posix.relative("data", "etc/passwd"));
    assert.ok(!recordedTarget.startsWith("/"), "expected the recorded target to remain a relative path even when its file is outside this partial archive");
    assert.throws(() => realpathSync(absoluteLinkPath), /ENOENT/, "expected the out-of-scope target to be genuinely absent from this partial archive, not silently resolved to something on the host");
  });
});
