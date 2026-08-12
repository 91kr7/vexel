import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";

// BuildCacheService talks to buildx only through the shared CLI runner: the
// mock stands in for it, so the usage-state derivation and the reclaimed-space
// parsing are the only behaviours under test (build-cache-service.md). Field
// names in the fixtures below (ID, Type, Size, Shared, Reclaimable) mirror
// `docker buildx du --format json`'s own real output.
interface FakeResult {
  stdout?: string;
  exitCode?: number;
}

let handler: (args: string[]) => FakeResult = () => ({ stdout: "", exitCode: 0 });

mock.module(new URL("../../src/docker/cli-runner.ts", import.meta.url).href, {
  namedExports: {
    runCliCommand: (_command: string, args: string[]) => {
      const { stdout = "", exitCode = 0 } = handler(args);
      return {
        cancel: () => undefined,
        onStdout: (listener: (chunk: string) => void) => {
          if (stdout) listener(stdout);
        },
        onStderr: () => undefined,
        onSpawnError: () => undefined,
        done: Promise.resolve({ exitCode }),
      };
    },
    detectCliAvailability: async () => ({
      docker: { available: true },
      compose: { available: true },
      buildx: { available: true },
    }),
  },
});

const { listBuildCache, pruneBuildCache } = await import("../../src/builders/build-cache-service.js");
const { DockerDaemonError } = await import("../../src/docker/errors.js");

beforeEach(() => {
  handler = () => ({ stdout: "", exitCode: 0 });
});

function record(overrides: Partial<{ ID: string; Type: string; Size: string; Shared: boolean; Reclaimable: boolean }>) {
  return { ID: "rec-1", Type: "regular", Size: "10MB", Shared: false, Reclaimable: true, ...overrides };
}

// build-cache-service.md pseudocode — "if record is not reclaimable -> 'in-use' (attached to a
// build in progress)", regardless of whether it is also shared
test("listBuildCache reports 'in-use' for a non-reclaimable record even when it is also shared", async () => {
  handler = () => ({ stdout: JSON.stringify(record({ Reclaimable: false, Shared: true })), exitCode: 0 });

  const records = await listBuildCache();

  assert.equal(records[0]!.usageState, "in-use");
});

// build-cache-service.md pseudocode — "else if record is shared -> 'shared'"
test("listBuildCache reports 'shared' for a reclaimable record referenced by more than one build", async () => {
  handler = () => ({ stdout: JSON.stringify(record({ Reclaimable: true, Shared: true })), exitCode: 0 });

  const records = await listBuildCache();

  assert.equal(records[0]!.usageState, "shared");
});

// build-cache-service.md pseudocode — "else -> 'reclaimable'"
test("listBuildCache reports 'reclaimable' for a reclaimable, unshared record", async () => {
  handler = () => ({ stdout: JSON.stringify(record({ Reclaimable: true, Shared: false })), exitCode: 0 });

  const records = await listBuildCache();

  assert.equal(records[0]!.usageState, "reclaimable");
});

// build-cache-service.md — "BuildCacheRecord: { id, type, sizeBytes, usageState }"
test("listBuildCache maps id, type and a positive size from the daemon's own record", async () => {
  handler = () => ({ stdout: JSON.stringify(record({ ID: "abc123", Type: "source.local", Size: "4.096kB" })), exitCode: 0 });

  const records = await listBuildCache();

  assert.equal(records[0]!.id, "abc123");
  assert.equal(records[0]!.type, "source.local");
  assert.ok(typeof records[0]!.sizeBytes === "number" && records[0]!.sizeBytes > 0);
});

// build-cache-service.md — "docker buildx du output is read as newline-delimited JSON ... never
// assumed to be exactly one of those shapes"
test("listBuildCache parses genuine newline-delimited JSON, one record per line", async () => {
  const line1 = JSON.stringify(record({ ID: "rec-a" }));
  const line2 = JSON.stringify(record({ ID: "rec-b" }));
  handler = () => ({ stdout: `${line1}\n${line2}\n`, exitCode: 0 });

  const records = await listBuildCache();

  assert.deepEqual(
    records.map((r) => r.id),
    ["rec-a", "rec-b"],
  );
});

test("listBuildCache parses a single-line JSON array", async () => {
  handler = () => ({ stdout: JSON.stringify([record({ ID: "arr-a" }), record({ ID: "arr-b" })]), exitCode: 0 });

  const records = await listBuildCache();

  assert.deepEqual(
    records.map((r) => r.id),
    ["arr-a", "arr-b"],
  );
});

// build-cache-service.md — "Ordered by record identifier, ascending, under the list-order rule".
// The identifier stands in for the name a record has not got, so it goes through the same
// comparison: a digit run in it reads as a number (REQ-37).
test("listBuildCache orders the records by identifier, reading digit runs in it as numbers", async () => {
  handler = () => ({
    stdout: [record({ ID: "cache-10" }), record({ ID: "cache-3" }), record({ ID: "cache-2" })].map((entry) => JSON.stringify(entry)).join("\n"),
    exitCode: 0,
  });

  const records = await listBuildCache();

  assert.deepEqual(
    records.map((entry) => entry.id),
    ["cache-2", "cache-3", "cache-10"],
  );
});

// build-cache-service.md — the identifier is "also the final comparison, so two records never tie",
// and "the same records produce the same sequence on every read, whatever order buildx du listed
// them in" (REQ-37, REQ-43, REQ-6).
//
// The pairs below tie under the name comparison, so only the exact comparison of that same
// identifier separates them; asserting the result is merely ascending would pass on a comparator
// that had dropped it.
test("listBuildCache produces one sequence for tying identifiers, whatever order buildx du listed them in", async () => {
  const listed = [record({ ID: "Beta-x" }), record({ ID: "beta-x" }), record({ ID: "alpha-1" }), record({ ID: "alpha-01" })];
  const expected = ["alpha-01", "alpha-1", "Beta-x", "beta-x"];
  const listedAs = (entries: unknown[]) => ({ stdout: entries.map((entry) => JSON.stringify(entry)).join("\n"), exitCode: 0 });

  handler = () => listedAs(listed);
  const asListed = (await listBuildCache()).map((entry) => entry.id);

  handler = () => listedAs([...listed].reverse());
  const reversedListing = (await listBuildCache()).map((entry) => entry.id);

  assert.deepEqual(asListed, expected);
  assert.deepEqual(reversedListing, expected, "the same records must come out the same way in either input order");
});

// build-cache-service.md — "The order is deliberately not a ranking: not by size, not by usage
// state, not by the recorded build step ... ranking the panel is a product decision that has not
// been taken, and must not arrive as a side effect of a determinism fix" (REQ-38).
//
// Pinned deliberately: a later change to a meaningful ranking has to come here first and be taken
// on purpose, rather than arriving unnoticed.
test("listBuildCache orders by identifier and not by size, in either direction", async () => {
  handler = () => ({
    stdout: [
      record({ ID: "aaa-record", Size: "50MB" }),
      record({ ID: "zzz-record", Size: "1MB" }),
      record({ ID: "mmm-record", Size: "500MB" }),
    ]
      .map((entry) => JSON.stringify(entry))
      .join("\n"),
    exitCode: 0,
  });

  const records = await listBuildCache();

  assert.deepEqual(
    records.map((entry) => entry.id),
    ["aaa-record", "mmm-record", "zzz-record"],
    "the records are ordered by identifier",
  );
  const sizes = records.map((entry) => entry.sizeBytes);
  assert.notDeepEqual([...sizes].sort((left, right) => right - left), sizes, "the order must not be size-descending");
  assert.notDeepEqual([...sizes].sort((left, right) => left - right), sizes, "nor size-ascending");
});

test("listBuildCache rejects rather than silently misreading genuinely malformed output", async () => {
  handler = () => ({ stdout: "not json at all", exitCode: 0 });

  await assert.rejects(() => listBuildCache());
});

// build-cache-service.md — "A non-zero exit ... rejects with a DockerDaemonError (docker-access,
// code DaemonRejected) carrying the daemon's own message, so the REST layer maps it to 502"
test("listBuildCache rejects with a DaemonRejected DockerDaemonError when the CLI exits non-zero", async () => {
  handler = () => ({ stdout: "", exitCode: 1 });

  await assert.rejects(
    () => listBuildCache(),
    (error: unknown) => {
      assert.ok(error instanceof DockerDaemonError, "expected a DockerDaemonError");
      assert.equal(error.code, "DaemonRejected");
      return true;
    },
  );
});

test("pruneBuildCache rejects with a DaemonRejected DockerDaemonError when the CLI exits non-zero", async () => {
  handler = () => ({ stdout: "", exitCode: 1 });

  await assert.rejects(
    () => pruneBuildCache(),
    (error: unknown) => {
      assert.ok(error instanceof DockerDaemonError, "expected a DockerDaemonError");
      assert.equal(error.code, "DaemonRejected");
      return true;
    },
  );
});

// build-cache-service.md — "pruneBuildCache ... the reclaimed figure parsed from buildx's own
// 'Total:' line"
test("pruneBuildCache reports the reclaimed space parsed from buildx's own Total line", async () => {
  handler = () => ({ stdout: "ID\tRECLAIMABLE\tSIZE\nrec-1*\ttrue\t10MB\nTotal:\t10MB\n", exitCode: 0 });

  const result = await pruneBuildCache();

  assert.ok(typeof result.reclaimedBytes === "number" && result.reclaimedBytes > 0);
});

// build-cache-service.md — "rejects if buildx prune's own reclaimed-space report cannot be parsed,
// rather than reporting zero"
test("pruneBuildCache rejects, rather than reporting zero, when the Total line cannot be found", async () => {
  handler = () => ({ stdout: "nothing to prune here\n", exitCode: 0 });

  await assert.rejects(() => pruneBuildCache());
});
