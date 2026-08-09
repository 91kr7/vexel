import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";

// PruneService removes nothing itself: every category goes through the prune of
// its own area (prune-service.md). Those five channels are mocked, so the
// delegation, the canonical order of a scoped run, the survival of a run whose
// category failed and the account it returns are the only behaviours under
// test. The two readings DiskUsageService brings along the import chain are
// mocked to nothing, since no prune test reads a breakdown.

interface ChannelCall {
  channel: string;
}

const calls: ChannelCall[] = [];
let containersOutcome: () => Promise<unknown> = async () => ({ removedIds: [], reclaimedBytes: 0 });
let imagesOutcome: () => Promise<unknown> = async () => ({ removedIds: [], reclaimedBytes: 0 });
let volumesOutcome: () => Promise<unknown> = async () => ({ removedNames: [], reclaimedBytes: 0 });
let networksOutcome: () => Promise<unknown> = async () => ({ removedNames: [] });
let buildCacheOutcome: () => Promise<unknown> = async () => ({ reclaimedBytes: 0 });

function record<T>(channel: string, produce: () => Promise<T>): Promise<T> {
  calls.push({ channel });
  return produce();
}

mock.module(new URL("../../src/connectivity/connection-status-service.ts", import.meta.url).href, {
  namedExports: {
    getEngineClient: () => ({
      request: async () => ({ statusCode: 200, body: "{}" }),
    }),
  },
});

mock.module(new URL("../../src/containers/containers-service.ts", import.meta.url).href, {
  namedExports: { pruneStoppedContainers: () => record("stopped-containers", containersOutcome) },
});

mock.module(new URL("../../src/images/image-transfer-service.ts", import.meta.url).href, {
  namedExports: { pruneDanglingImages: () => record("dangling-images", imagesOutcome) },
});

mock.module(new URL("../../src/volumes/volumes-service.ts", import.meta.url).href, {
  namedExports: { pruneVolumes: () => record("unused-volumes", volumesOutcome) },
});

mock.module(new URL("../../src/networks/networks-service.ts", import.meta.url).href, {
  namedExports: {
    pruneNetworks: () => record("unused-networks", networksOutcome),
    listNetworks: async () => [],
  },
});

mock.module(new URL("../../src/builders/build-cache-service.ts", import.meta.url).href, {
  namedExports: {
    pruneBuildCache: () => record("build-cache", buildCacheOutcome),
    listBuildCache: async () => [],
  },
});

const { pruneCategory, pruneScope, isDiskUsageCategoryId } = await import("../../src/system/prune-service.js");

beforeEach(() => {
  calls.length = 0;
  containersOutcome = async () => ({ removedIds: [], reclaimedBytes: 0 });
  imagesOutcome = async () => ({ removedIds: [], reclaimedBytes: 0 });
  volumesOutcome = async () => ({ removedNames: [], reclaimedBytes: 0 });
  networksOutcome = async () => ({ removedNames: [] });
  buildCacheOutcome = async () => ({ reclaimedBytes: 0 });
});

function channels(): string[] {
  return calls.map((call) => call.channel);
}

// prune-service.md — "stopped-containers -> containers prune (removed = container ids, reclaimed
// reported)"
test("pruneCategory reports the container prune's own ids and reclaimed space", async () => {
  containersOutcome = async () => ({ removedIds: ["c1", "c2"], reclaimedBytes: 4_096 });

  const outcome = await pruneCategory("stopped-containers");

  assert.deepEqual(channels(), ["stopped-containers"]);
  assert.deepEqual(outcome, { categoryId: "stopped-containers", removed: ["c1", "c2"], removedCount: 2, reclaimedBytes: 4_096 });
});

// prune-service.md — "dangling-images -> dangling-image prune (removed = image ids/digests,
// reclaimed reported)"
test("pruneCategory reports the dangling-image prune's own ids and reclaimed space", async () => {
  imagesOutcome = async () => ({ removedIds: ["sha256:aaa"], reclaimedBytes: 2_048 });

  const outcome = await pruneCategory("dangling-images");

  assert.deepEqual(channels(), ["dangling-images"]);
  assert.deepEqual(outcome.removed, ["sha256:aaa"]);
  assert.equal(outcome.removedCount, 1);
  assert.equal(outcome.reclaimedBytes, 2_048);
});

// prune-service.md — "unused-volumes -> volume prune (removed = volume names, reclaimed reported)"
test("pruneCategory reports the volume prune's own names and reclaimed space", async () => {
  volumesOutcome = async () => ({ removedNames: ["vol-a", "vol-b", "vol-c"], reclaimedBytes: 100 });

  const outcome = await pruneCategory("unused-volumes");

  assert.deepEqual(channels(), ["unused-volumes"]);
  assert.deepEqual(outcome.removed, ["vol-a", "vol-b", "vol-c"]);
  assert.equal(outcome.removedCount, 3);
  assert.equal(outcome.reclaimedBytes, 100);
});

// prune-service.md — "unused-networks -> network prune (removed = network names, reclaimed = 0)"
test("pruneCategory reports the network prune's names and no reclaimed space", async () => {
  networksOutcome = async () => ({ removedNames: ["net-a"] });

  const outcome = await pruneCategory("unused-networks");

  assert.deepEqual(channels(), ["unused-networks"]);
  assert.deepEqual(outcome.removed, ["net-a"]);
  assert.equal(outcome.reclaimedBytes, 0);
});

// prune-service.md — "build-cache -> build-cache prune (removed = [], reclaimed reported)"
test("pruneCategory names nothing for the build cache and reports the space it freed", async () => {
  buildCacheOutcome = async () => ({ reclaimedBytes: 9_000 });

  const outcome = await pruneCategory("build-cache");

  assert.deepEqual(channels(), ["build-cache"]);
  assert.deepEqual(outcome.removed, []);
  assert.equal(outcome.removedCount, 0);
  assert.equal(outcome.reclaimedBytes, 9_000);
});

// prune-service.md — "Rejects if the underlying channel rejects."
test("pruneCategory rejects when the channel it delegates to rejects", async () => {
  volumesOutcome = async () => {
    throw new Error("daemon refused the volume prune");
  };

  await assert.rejects(pruneCategory("unused-volumes"), /daemon refused the volume prune/);
});

// prune-service.md — "Runs the requested categories one at a time, always in the canonical category
// order, whatever order the scope names them in"
test("pruneScope runs the scope in the canonical order however the caller ordered it", async () => {
  const result = await pruneScope(["build-cache", "unused-networks", "dangling-images", "unused-volumes", "stopped-containers"]);

  assert.deepEqual(channels(), ["stopped-containers", "dangling-images", "unused-volumes", "unused-networks", "build-cache"]);
  assert.deepEqual(
    result.categories.map((category) => category.categoryId),
    ["stopped-containers", "dangling-images", "unused-volumes", "unused-networks", "build-cache"],
  );
});

// prune-service.md — "a repeated id is run once"
test("pruneScope prunes a repeated category once", async () => {
  const result = await pruneScope(["unused-volumes", "unused-volumes", "unused-volumes"]);

  assert.deepEqual(channels(), ["unused-volumes"]);
  assert.equal(result.categories.length, 1);
});

// prune-service.md — "The scope is honored exactly: a category the caller did not name is never
// pruned, however cheap it would be to include."
test("pruneScope prunes nothing the scope did not name", async () => {
  const result = await pruneScope(["unused-networks"]);

  assert.deepEqual(channels(), ["unused-networks"]);
  assert.deepEqual(
    result.categories.map((category) => category.categoryId),
    ["unused-networks"],
  );
});

// prune-service.md — "A category that fails contributes an outcome carrying error (nothing removed,
// zero reclaimed) and the run continues with the next one."
test("pruneScope records a failing category and carries on with the next", async () => {
  containersOutcome = async () => {
    throw new Error("container prune refused");
  };
  volumesOutcome = async () => ({ removedNames: ["vol-a"], reclaimedBytes: 512 });

  const result = await pruneScope(["stopped-containers", "unused-volumes"]);

  assert.deepEqual(channels(), ["stopped-containers", "unused-volumes"]);
  const failed = result.categories.find((category) => category.categoryId === "stopped-containers")!;
  assert.equal(failed.error, "container prune refused");
  assert.deepEqual(failed.removed, []);
  assert.equal(failed.removedCount, 0);
  assert.equal(failed.reclaimedBytes, 0);
  const succeeded = result.categories.find((category) => category.categoryId === "unused-volumes")!;
  assert.equal(succeeded.error, undefined);
  assert.deepEqual(succeeded.removed, ["vol-a"]);
});

// prune-service.md — "reclaimedBytes is the sum of the outcomes' reclaimed space"
test("pruneScope totals the space the categories actually reclaimed", async () => {
  containersOutcome = async () => ({ removedIds: ["c1"], reclaimedBytes: 1_000 });
  buildCacheOutcome = async () => ({ reclaimedBytes: 250 });

  const result = await pruneScope(["stopped-containers", "build-cache"]);

  assert.equal(result.reclaimedBytes, 1_250);
});

// prune-service.md — "A partial failure never hides the part that succeeded"
test("pruneScope still totals what succeeded when one category failed", async () => {
  containersOutcome = async () => ({ removedIds: ["c1"], reclaimedBytes: 1_000 });
  buildCacheOutcome = async () => {
    throw new Error("buildx is not installed");
  };

  const result = await pruneScope(["stopped-containers", "build-cache"]);

  assert.equal(result.reclaimedBytes, 1_000);
  assert.equal(result.categories.length, 2);
});

// prune-service.md — "isDiskUsageCategoryId(value) — whether an unknown value names a category"
test("isDiskUsageCategoryId recognises the five category ids and nothing else", () => {
  for (const id of ["stopped-containers", "dangling-images", "unused-volumes", "unused-networks", "build-cache"]) {
    assert.equal(isDiskUsageCategoryId(id), true, `${id} should be a category id`);
  }
  for (const value of ["containers", "", "everything", 42, null, undefined, ["stopped-containers"]]) {
    assert.equal(isDiskUsageCategoryId(value), false, `${String(value)} should not be a category id`);
  }
});
