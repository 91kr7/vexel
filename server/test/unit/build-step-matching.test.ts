import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStepKeyFromCacheDescription, buildStepKeyFromHistory } from "../../src/image-analysis/build-step-matching.js";

// build-step-matching.md — the history side: strip the trailing `# buildkit`
// marker, then the leading `RUN ` verb, then collapse runs of whitespace.

test("buildStepKeyFromHistory strips the buildkit marker and the RUN verb", () => {
  assert.equal(buildStepKeyFromHistory("RUN /bin/sh -c mkdir /a # buildkit"), "/bin/sh -c mkdir /a");
});

test("buildStepKeyFromHistory strips the buildkit marker from a non-RUN step, keeping the verb", () => {
  assert.equal(buildStepKeyFromHistory("COPY x /y # buildkit"), "COPY x /y");
});

test("buildStepKeyFromHistory collapses runs of whitespace to a single space", () => {
  assert.equal(buildStepKeyFromHistory("RUN /bin/sh   -c    mkdir\t/a # buildkit"), "/bin/sh -c mkdir /a");
});

test("buildStepKeyFromHistory yields no key without an argument", () => {
  assert.equal(buildStepKeyFromHistory(undefined), undefined);
});

test("buildStepKeyFromHistory yields no key for a blank command", () => {
  assert.equal(buildStepKeyFromHistory("   "), undefined);
});

test("buildStepKeyFromHistory yields no key for a metadata-only #(nop) step", () => {
  assert.equal(buildStepKeyFromHistory('/bin/sh -c #(nop)  CMD ["/bin/sh"]'), undefined);
});

// build-step-matching.md — the cache-description side: strip a leading bracketed
// step marker, then the executed-step prefix, then collapse whitespace.

test("buildStepKeyFromCacheDescription strips the executed-step prefix", () => {
  assert.equal(buildStepKeyFromCacheDescription("mount / from exec /bin/sh -c mkdir /a"), "/bin/sh -c mkdir /a");
});

test("buildStepKeyFromCacheDescription strips a leading bracketed step marker", () => {
  assert.equal(buildStepKeyFromCacheDescription("[3/3] COPY x /y"), "COPY x /y");
});

test("buildStepKeyFromCacheDescription strips a named-stage bracketed marker", () => {
  assert.equal(buildStepKeyFromCacheDescription("[stage-1 1/1] COPY x /y"), "COPY x /y");
});

test("buildStepKeyFromCacheDescription strips an executed-step prefix mounting a path other than the root", () => {
  assert.equal(buildStepKeyFromCacheDescription("mount /src from exec /bin/sh -c mkdir /a"), "/bin/sh -c mkdir /a");
});

test("buildStepKeyFromCacheDescription collapses runs of whitespace to a single space", () => {
  assert.equal(buildStepKeyFromCacheDescription("[3/3]   COPY   x    /y"), "COPY x /y");
});

test("buildStepKeyFromCacheDescription yields no key without an argument", () => {
  assert.equal(buildStepKeyFromCacheDescription(undefined), undefined);
});

test("buildStepKeyFromCacheDescription yields no key for a description that is blank once stripped", () => {
  assert.equal(buildStepKeyFromCacheDescription("[3/3]   "), undefined);
});

// build-step-matching.md — "The two functions produce the same key for the same
// step: that equality is the whole contract."
test("both sides reduce the same RUN step to the same key", () => {
  const fromHistory = buildStepKeyFromHistory("RUN /bin/sh -c mkdir -p /data && chmod 0700 /data # buildkit");
  const fromCache = buildStepKeyFromCacheDescription("mount / from exec /bin/sh -c mkdir -p /data && chmod 0700 /data");

  assert.ok(fromHistory !== undefined, "expected the history side to yield a key");
  assert.equal(fromCache, fromHistory);
});

test("both sides reduce the same COPY step to the same key", () => {
  const fromHistory = buildStepKeyFromHistory("COPY payload.txt /payload.txt # buildkit");
  const fromCache = buildStepKeyFromCacheDescription("[2/2] COPY payload.txt /payload.txt");

  assert.ok(fromHistory !== undefined, "expected the history side to yield a key");
  assert.equal(fromCache, fromHistory);
});

// build-step-matching.md — "A description that names no build step at all is not
// rejected here — it simply yields a key that no history entry can equal."
test("a description naming no build step still yields a key, one no history entry can equal", () => {
  const key = buildStepKeyFromCacheDescription("local source for context");

  assert.equal(key, "local source for context");
  assert.notEqual(key, buildStepKeyFromHistory("RUN /bin/sh -c mkdir /a # buildkit"));
});
