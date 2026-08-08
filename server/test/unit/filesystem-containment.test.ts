import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveEntryPath, resolveRequestPath, resolveSymlinkTarget } from "../../src/image-analysis/filesystem-containment.js";

// filesystem-containment.md, plan-docker_management_app/REQ-62 — a well-formed, nested name stays
// inside the tree and resolves to its own tree-relative path (no false positive from the guard).
test("resolveEntryPath accepts a well-formed nested entry name", () => {
  const result = resolveEntryPath("usr/lib/libc.so");
  assert.deepEqual(result, { path: "usr/lib/libc.so" });
});

// filesystem-containment.md — a redundant "./" prefix is normalized away, not refused.
test("resolveEntryPath accepts a name carrying a redundant './' prefix", () => {
  const result = resolveEntryPath("./etc/passwd");
  assert.deepEqual(result, { path: "etc/passwd" });
});

// plan-docker_management_app/REQ-62 — an absolute entry name is refused outright.
test("resolveEntryPath refuses an absolute entry name", () => {
  const result = resolveEntryPath("/etc/passwd") as { refusal: { path: string; reason: string } };
  assert.ok("refusal" in result, "expected an absolute entry name to be refused");
  assert.match(result.refusal.reason, /absolute|\.\.|leave|escape/i);
});

// plan-docker_management_app/REQ-62 — a leading '..' segment is refused, with a human-readable reason.
test("resolveEntryPath refuses a name starting with a '..' segment", () => {
  const result = resolveEntryPath("../etc/passwd") as { refusal: { path: string; reason: string } };
  assert.ok("refusal" in result, "expected a leading '..' segment to be refused");
  assert.ok(result.refusal.reason.length > 0, "expected a non-empty reason naming what was attempted");
});

// plan-docker_management_app/REQ-62 — the adversarial case the developer reports fixing: a chain
// that only nets negative after first descending must still surface as an escape, not be silently
// re-rooted by a naive `path.posix.normalize` clamp (filesystem-containment.md).
test("resolveEntryPath refuses a net-negative '..' chain that only escapes after descending first", () => {
  const result = resolveEntryPath("a/b/../../../etc/shadow") as { refusal: { path: string; reason: string } };
  assert.ok("refusal" in result, "expected a chain that climbs past the root after descending to be refused, not clamped to '/etc/shadow'");
});

// plan-docker_management_app/REQ-62 — the same adversarial case, this time carrying a leading slash
// too: a naive absolute-path normalization would clamp the excess '..' segments at the root instead
// of refusing them.
test("resolveEntryPath refuses a leading-slash net-negative '..' chain instead of clamping it at the root", () => {
  const result = resolveEntryPath("/a/../../../etc/shadow") as { refusal: { path: string; reason: string } };
  assert.ok("refusal" in result, "expected the excess '..' segments to surface as an escape, not be clamped away");
});

// filesystem-containment.md — a same-directory relative symlink target resolves within the tree.
test("resolveSymlinkTarget resolves a same-directory relative target", () => {
  const result = resolveSymlinkTarget("bin/tool", "helper");
  assert.deepEqual(result, { path: "bin/helper" });
});

// filesystem-containment.md — an absolute symlink target is read as tree-root-relative, matching
// what an absolute symlink means inside the image's own rootfs: not itself a refusal.
test("resolveSymlinkTarget resolves an absolute target as tree-root-relative, not a refusal", () => {
  const result = resolveSymlinkTarget("usr/bin/tool", "/etc/passwd");
  assert.deepEqual(result, { path: "etc/passwd" });
});

// plan-docker_management_app/REQ-62 — a relative chain that climbs past the tree root is refused,
// carrying a reason.
test("resolveSymlinkTarget refuses a relative chain climbing past the tree root", () => {
  const result = resolveSymlinkTarget("top-level-link", "../etc/shadow") as { refusal: { path: string; reason: string } };
  assert.ok("refusal" in result, "expected a symlink target escaping the tree root to be refused");
  assert.ok(result.refusal.reason.length > 0, "expected a non-empty reason");
});

// plan-docker_management_app/REQ-62 — the same net-negative adversarial pattern applied to a
// symlink target from a deeper entry: descending first must not hide the eventual escape.
test("resolveSymlinkTarget refuses a net-negative chain that only escapes after descending first", () => {
  const result = resolveSymlinkTarget("a/b/link", "../../../../etc/shadow") as { refusal: { path: string; reason: string } };
  assert.ok("refusal" in result, "expected the excess '..' segments in the symlink target to surface as an escape");
});

// filesystem-containment.md — resolveRequestPath applies the same rule as resolveEntryPath, since
// routes reuse it for an operator/client-supplied query param (REQ-62).
test("resolveRequestPath refuses a hostile request path the same way resolveEntryPath does", () => {
  const result = resolveRequestPath("../../etc/passwd") as { refusal: { path: string; reason: string } };
  assert.ok("refusal" in result, "expected a hostile request path to be refused");
});

// plan-docker_management_app/REQ-62 — containment is a purely structural check: a well-formed
// request path that was never part of any extracted tree is not itself a refusal (existence is a
// downstream concern, not containment's).
test("resolveRequestPath accepts a well-formed path that never existed in any tree", () => {
  const result = resolveRequestPath("some/nested/path/that/was/never/extracted");
  assert.deepEqual(result, { path: "some/nested/path/that/was/never/extracted" });
});
