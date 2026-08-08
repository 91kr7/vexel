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
    records.map((r) => r.id).sort(),
    ["rec-a", "rec-b"],
  );
});

test("listBuildCache rejects rather than silently misreading genuinely malformed output", async () => {
  handler = () => ({ stdout: "not json at all", exitCode: 0 });

  await assert.rejects(() => listBuildCache());
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
