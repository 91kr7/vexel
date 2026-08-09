import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";

// The occupied-space half of DiskUsageService (disk-usage-service.md,
// `getDiskUsageTotals`): what each of the four categories counts, how a
// category that cannot be read reports itself, and the single `/system/df`
// reading each call is allowed. The daemon and the build-cache service are
// mocked; the reclaimable half lives in disk-usage-service.test.ts.
//
// Field names in the fixtures (Containers, Images, Volumes, LayersSize, SizeRw,
// UsageData, Labels) mirror the daemon's own `/system/df` payload.

let diskUsageBody = "{}";
let diskUsageFailure: Error | undefined;
let listBuildCacheResult: () => Promise<unknown> = async () => [];
const requestedCalls: string[] = [];

mock.module(new URL("../../src/connectivity/connection-status-service.ts", import.meta.url).href, {
  namedExports: {
    getEngineClient: () => ({
      request: async (path: string, init?: { method?: string }) => {
        requestedCalls.push(`${init?.method ?? "GET"} ${path}`);
        if (diskUsageFailure) throw diskUsageFailure;
        if (path === "/system/df") return { statusCode: 200, body: diskUsageBody };
        throw new Error(`unexpected path: ${path}`);
      },
    }),
  },
});

mock.module(new URL("../../src/networks/networks-service.ts", import.meta.url).href, {
  namedExports: { listNetworks: async () => [] },
});

mock.module(new URL("../../src/builders/build-cache-service.ts", import.meta.url).href, {
  namedExports: { listBuildCache: () => listBuildCacheResult() },
});

const { getDiskUsageTotals, DISK_USAGE_TOTAL_CATEGORY_IDS } = await import("../../src/system/disk-usage-service.js");
type TotalCategoryId = (typeof DISK_USAGE_TOTAL_CATEGORY_IDS)[number];

/** The label this application puts on the containers it creates to extract an image's filesystem. */
const INTERNAL_CONTAINER_LABEL = "vexel.internal-container";

beforeEach(() => {
  diskUsageBody = JSON.stringify({ LayersSize: 0, Containers: [], Images: [], Volumes: [] });
  diskUsageFailure = undefined;
  listBuildCacheResult = async () => [];
  requestedCalls.length = 0;
});

function setDiskUsage(parts: { LayersSize?: number; Containers?: unknown[]; Images?: unknown[]; Volumes?: unknown[] }): void {
  diskUsageBody = JSON.stringify({ LayersSize: 0, Containers: [], Images: [], Volumes: [], ...parts });
}

function container(overrides: Record<string, unknown> = {}) {
  return { Id: "c1", Names: ["/fixture-one"], State: "running", SizeRw: 0, ...overrides };
}

function image(overrides: Record<string, unknown> = {}) {
  return { Id: "sha256:0123456789abcdef0123", RepoTags: ["alpine:3.20"], Size: 0, SharedSize: 0, Containers: 0, ...overrides };
}

function volume(overrides: Record<string, unknown> = {}) {
  return { Name: "fixture-volume", UsageData: { Size: 0, RefCount: 0 }, ...overrides };
}

function cacheRecord(overrides: Record<string, unknown> = {}) {
  return { id: "rec-1", type: "regular", sizeBytes: 0, usageState: "reclaimable", ...overrides };
}

async function categoryOf(id: TotalCategoryId) {
  const totals = await getDiskUsageTotals();
  return totals.categories.find((candidate) => candidate.id === id)!;
}

// disk-usage-service.md — "the categories are always returned in that order, exactly once each —
// also exported as DISK_USAGE_TOTAL_CATEGORY_IDS"
test("getDiskUsageTotals returns the four categories once each, in the canonical order", async () => {
  const totals = await getDiskUsageTotals();

  assert.deepEqual(
    totals.categories.map((category) => category.id),
    ["images", "containers", "volumes", "build-cache"],
  );
  assert.deepEqual(totals.categories.map((category) => category.id), DISK_USAGE_TOTAL_CATEGORY_IDS);
});

// disk-usage-service.md — "images -> every image the daemon lists; size = the daemon's own
// image-store total, layers shared between two images counted once (so smaller than the sum of the
// images' individual sizes)"
test("images counts every image the daemon lists and sizes them by the image store, not by their sum", async () => {
  setDiskUsage({
    LayersSize: 12_000,
    Images: [
      image({ Id: "sha256:aaaaaaaaaaaaaaaaaaaa", Size: 10_000, SharedSize: 8_000 }),
      image({ Id: "sha256:bbbbbbbbbbbbbbbbbbbb", Size: 10_000, SharedSize: 8_000, RepoTags: null }),
    ],
  });

  const category = await categoryOf("images");

  assert.equal(category.itemCount, 2);
  assert.equal(category.sizeBytes, 12_000);
  assert.ok(category.sizeBytes < 20_000, "shared layers must be counted once, not once per image");
});

// disk-usage-service.md — "containers -> every container, whatever its state … size = sum of their
// writable-layer size"
test("containers counts every container whatever its state, sized by their writable layers", async () => {
  setDiskUsage({
    Containers: [
      container({ Id: "a", State: "running", SizeRw: 100 }),
      container({ Id: "b", State: "paused", SizeRw: 200 }),
      container({ Id: "c", State: "exited", SizeRw: 400 }),
      container({ Id: "d", State: "created", SizeRw: 800 }),
    ],
  });

  const category = await categoryOf("containers");

  assert.equal(category.itemCount, 4);
  assert.equal(category.sizeBytes, 1_500);
});

// disk-usage-service.md — "minus this application's own internal filesystem-extraction containers,
// which are plumbing the operator never sees anywhere in the application"
test("containers leaves out this application's own internal filesystem-extraction containers", async () => {
  setDiskUsage({
    Containers: [
      container({ Id: "a", State: "running", SizeRw: 100 }),
      container({ Id: "b", State: "running", SizeRw: 900, Labels: { [INTERNAL_CONTAINER_LABEL]: "true" } }),
    ],
  });

  const category = await categoryOf("containers");

  assert.equal(category.itemCount, 1);
  assert.equal(category.sizeBytes, 100);
});

// disk-usage-service.md — "volumes -> every volume the daemon lists; size = sum of their usage size"
test("volumes counts every volume, in use or not, sized by their usage", async () => {
  setDiskUsage({
    Volumes: [
      volume({ Name: "attached", UsageData: { Size: 2_048, RefCount: 1 } }),
      volume({ Name: "idle", UsageData: { Size: 1_024, RefCount: 0 } }),
    ],
  });

  const category = await categoryOf("volumes");

  assert.equal(category.itemCount, 2);
  assert.equal(category.sizeBytes, 3_072);
});

// disk-usage-service.md — "build-cache -> every build-cache record, whatever its usage state"
// (unlike the reclaimable breakdown, which counts only the records a prune would take)
test("build-cache counts every record whatever its usage state", async () => {
  listBuildCacheResult = async () => [
    cacheRecord({ id: "rec-free", sizeBytes: 1_000, usageState: "reclaimable" }),
    cacheRecord({ id: "rec-shared", sizeBytes: 2_000, usageState: "shared" }),
    cacheRecord({ id: "rec-busy", sizeBytes: 4_000, usageState: "in-use" }),
  ];

  const category = await categoryOf("build-cache");

  assert.equal(category.itemCount, 3);
  assert.equal(category.sizeBytes, 7_000);
});

// disk-usage-service.md — "unavailableDetail — present exactly when that one category could not be
// read; its sizeBytes and itemCount are then 0" / "A failure to read one category never fails the
// whole breakdown … Both readings behave this way."
test("a category that cannot be read reports the reason and leaves the others readable", async () => {
  setDiskUsage({ LayersSize: 5_000, Volumes: [volume({ UsageData: { Size: 512, RefCount: 0 } })] });
  listBuildCacheResult = async () => {
    throw new Error("buildx is not installed");
  };

  const totals = await getDiskUsageTotals();
  const buildCache = totals.categories.find((category) => category.id === "build-cache")!;

  assert.equal(buildCache.unavailableDetail, "buildx is not installed");
  assert.equal(buildCache.sizeBytes, 0);
  assert.equal(buildCache.itemCount, 0);
  assert.equal(totals.categories.find((category) => category.id === "images")!.sizeBytes, 5_000);
  assert.equal(
    totals.categories.filter((category) => category.unavailableDetail !== undefined).length,
    1,
    "only the category that failed carries a reason",
  );
});

// disk-usage-service.md — "totalBytes — the sum of the categories' sizeBytes"
test("totalBytes is the sum of the categories' sizes", async () => {
  setDiskUsage({
    LayersSize: 5_000,
    Containers: [container({ SizeRw: 300 })],
    Volumes: [volume({ UsageData: { Size: 50, RefCount: 1 } })],
  });
  listBuildCacheResult = async () => [cacheRecord({ sizeBytes: 7 })];

  const totals = await getDiskUsageTotals();

  assert.equal(
    totals.totalBytes,
    totals.categories.reduce((sum, category) => sum + category.sizeBytes, 0),
  );
  assert.equal(totals.totalBytes, 5_357);
});

// disk-usage-service.md — "A failure of the daemon's own disk-usage reading does reject — without it
// there is no breakdown at all. Both readings behave this way."
test("getDiskUsageTotals rejects when the daemon's own disk-usage reading fails", async () => {
  diskUsageFailure = new Error("daemon unreachable");

  await assert.rejects(getDiskUsageTotals(), /daemon unreachable/);
});

// disk-usage-service.md — "Each call makes exactly one such reading, whichever question it answers"
// / "The reading never removes anything and never starts anything on the daemon."
test("the reading issues exactly one, read-only, disk-usage request", async () => {
  await getDiskUsageTotals();

  assert.deepEqual(requestedCalls, ["GET /system/df"]);
});
