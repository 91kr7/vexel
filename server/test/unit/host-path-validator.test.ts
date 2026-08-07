import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateHostPath } from "../../src/host-fs/host-path-validator.js";

const root = mkdtempSync(join(tmpdir(), "vexel-host-path-root-"));
const fileInRoot = join(root, "context.txt");
writeFileSync(fileInRoot, "content", "utf-8");
const dirInRoot = join(root, "subdir");
mkdirSync(dirInRoot);

const outsideRoot = mkdtempSync(join(tmpdir(), "vexel-host-path-outside-"));
const escapingLink = join(root, "escape-link");
symlinkSync(outsideRoot, escapingLink);

// local-persistence/specs/host-path-validator.md — a relative path is refused
test("validateHostPath refuses a path that is not absolute", () => {
  const result = validateHostPath({ path: "relative/context" });
  assert.equal(result.valid, false);
  assert.match(result.reason ?? "", /absolute/i);
});

// local-persistence/specs/host-path-validator.md — a '..' segment is refused, checked before the existence check
test("validateHostPath refuses a path containing a '..' segment even when it would not otherwise exist", () => {
  const result = validateHostPath({ path: `${root}/../does-not-exist` });
  assert.equal(result.valid, false);
  assert.match(result.reason ?? "", /traversal|\.\./i);
});

// local-persistence/specs/host-path-validator.md — a non-existent absolute path is refused
test("validateHostPath refuses an absolute path that does not exist", () => {
  const result = validateHostPath({ path: join(root, "missing-file.txt") });
  assert.equal(result.valid, false);
  assert.match(result.reason ?? "", /exist/i);
});

// local-persistence/specs/host-path-validator.md — a symlink resolving outside the allowed root is refused
test("validateHostPath refuses a symlink that resolves outside the allowed root", () => {
  const result = validateHostPath({ path: escapingLink, root });
  assert.equal(result.valid, false);
  assert.match(result.reason ?? "", /root/i);
});

// local-persistence/specs/host-path-validator.md — a kind mismatch is refused, naming the actual kind
test("validateHostPath refuses a directory when a file was requested, naming the actual kind", () => {
  const result = validateHostPath({ path: dirInRoot, kind: "file" });
  assert.equal(result.valid, false);
  assert.equal(result.kind, "directory");
});

// local-persistence/specs/host-path-validator.md — a valid path of the requested kind within the root resolves successfully
test("validateHostPath accepts an existing, readable path of the requested kind within the root", () => {
  const result = validateHostPath({ path: fileInRoot, kind: "file", root });
  assert.equal(result.valid, true);
  assert.equal(result.kind, "file");
  assert.equal(result.readable, true);
  assert.ok(result.resolvedPath);
});

// local-persistence/specs/host-path-validator.md — an unreadable path is refused, carrying its reason
test("validateHostPath refuses a path it cannot read", () => {
  const unreadableFile = join(root, "no-read.txt");
  writeFileSync(unreadableFile, "secret", "utf-8");
  chmodSync(unreadableFile, 0o000);
  try {
    const result = validateHostPath({ path: unreadableFile });
    assert.equal(result.valid, false);
    assert.match(result.reason ?? "", /readable/i);
  } finally {
    chmodSync(unreadableFile, 0o644);
  }
});
