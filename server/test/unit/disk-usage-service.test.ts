import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";

// DiskUsageService reads the daemon's own disk usage through the shared
// EngineClient and the two services that own the remaining categories: all
// three are mocked, so what each category counts, the item cap and the
// per-category failure handling are the only behaviours under test
// (disk-usage-service.md). Field names in the fixtures below (Containers,
// Images, Volumes, SizeRw, SharedSize, RepoTags, UsageData) mirror the
// daemon's own `/system/df` payload.

let diskUsageBody = "{}";
let diskUsageFailure: Error | undefined;
let listNetworksResult: () => Promise<unknown> = async () => [];
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
  namedExports: { listNetworks: () => listNetworksResult() },
});

// The build-cache inventory is a held kind of the refresh cache; the reclaimable
// breakdown does not read it that way, but the module under test imports it.
const { registerRefreshKind } = await import("../../src/refresh-cache/refresh-cache.js");
const buildCacheListCache = registerRefreshKind({
  key: "build-cache",
  periodMs: 30000,
  read: () => listBuildCacheResult(),
});

mock.module(new URL("../../src/builders/build-cache-service.ts", import.meta.url).href, {
  namedExports: { listBuildCache: () => listBuildCacheResult(), buildCacheListCache },
});

const { getDiskUsage, DISK_USAGE_CATEGORY_IDS } = await import("../../src/system/disk-usage-service.js");
type CategoryId = (typeof DISK_USAGE_CATEGORY_IDS)[number];

beforeEach(() => {
  diskUsageBody = JSON.stringify({ Containers: [], Images: [], Volumes: [] });
  diskUsageFailure = undefined;
  listNetworksResult = async () => [];
  listBuildCacheResult = async () => [];
  requestedCalls.length = 0;
});

function container(overrides: Record<string, unknown> = {}) {
  return { Id: "c1", Names: ["/fixture-one"], State: "exited", SizeRw: 0, ...overrides };
}

function image(overrides: Record<string, unknown> = {}) {
  return { Id: "sha256:0123456789abcdef0123", RepoTags: null, Size: 0, SharedSize: 0, Containers: 0, ...overrides };
}

function volume(overrides: Record<string, unknown> = {}) {
  return { Name: "fixture-volume", UsageData: { Size: 0, RefCount: 0 }, ...overrides };
}

function network(name: string, attachedContainers: unknown[] = []) {
  return { id: `net-${name}`, name, attachedContainers };
}

function cacheRecord(overrides: Record<string, unknown> = {}) {
  return { id: "rec-1", type: "regular", sizeBytes: 0, usageState: "reclaimable", ...overrides };
}

function setDiskUsage(parts: { Containers?: unknown[]; Images?: unknown[]; Volumes?: unknown[] }): void {
  diskUsageBody = JSON.stringify({ Containers: [], Images: [], Volumes: [], ...parts });
}

async function categoryOf(id: CategoryId) {
  const breakdown = await getDiskUsage();
  return breakdown.categories.find((candidate) => candidate.id === id)!;
}

// disk-usage-service.md — "the categories are always returned in that order, exactly once each"
test("getDiskUsage returns the five categories once each, in the canonical order", async () => {
  const breakdown = await getDiskUsage();

  assert.deepEqual(
    breakdown.categories.map((category) => category.id),
    ["stopped-containers", "dangling-images", "unused-volumes", "unused-networks", "build-cache"],
  );
  assert.deepEqual(breakdown.categories.map((category) => category.id), DISK_USAGE_CATEGORY_IDS);
});

// disk-usage-service.md — "stopped-containers -> containers in state created / exited / dead"
test("stopped-containers counts the containers in the created, exited and dead states", async () => {
  setDiskUsage({
    Containers: [
      container({ Id: "a", Names: ["/created-one"], State: "created" }),
      container({ Id: "b", Names: ["/exited-one"], State: "exited" }),
      container({ Id: "c", Names: ["/dead-one"], State: "dead" }),
    ],
  });

  const category = await categoryOf("stopped-containers");

  assert.equal(category.itemCount, 3);
  assert.deepEqual(category.items, ["created-one", "exited-one", "dead-one"]);
});

// disk-usage-service.md — "A paused or restarting container is not counted as stopped: `docker
// container prune` does not remove one, so counting it would promise space that no prune reclaims."
test("stopped-containers ignores running, paused and restarting containers", async () => {
  setDiskUsage({
    Containers: [
      container({ Id: "a", Names: ["/running-one"], State: "running", SizeRw: 100 }),
      container({ Id: "b", Names: ["/paused-one"], State: "paused", SizeRw: 200 }),
      container({ Id: "c", Names: ["/restarting-one"], State: "restarting", SizeRw: 400 }),
    ],
  });

  const category = await categoryOf("stopped-containers");

  assert.equal(category.itemCount, 0);
  assert.deepEqual(category.items, []);
  assert.equal(category.sizeBytes, 0);
});

// disk-usage-service.md — "size = sum of their writable-layer size"
test("stopped-containers sizes the category as the sum of the stopped containers' writable layers", async () => {
  setDiskUsage({
    Containers: [
      container({ Id: "a", Names: ["/one"], State: "exited", SizeRw: 1_500 }),
      container({ Id: "b", Names: ["/two"], State: "dead", SizeRw: 2_500 }),
      container({ Id: "c", Names: ["/three"], State: "running", SizeRw: 9_000 }),
    ],
  });

  assert.equal((await categoryOf("stopped-containers")).sizeBytes, 4_000);
});

// disk-usage-service.md — "dangling-images -> images with no tag other than <none>:<none> and no
// container using them"
test("dangling-images counts the untagged, unreferenced images and no other", async () => {
  setDiskUsage({
    Images: [
      image({ Id: "sha256:aaaaaaaaaaaaaaaaaaaa", RepoTags: null }),
      image({ Id: "sha256:bbbbbbbbbbbbbbbbbbbb", RepoTags: ["<none>:<none>"] }),
      image({ Id: "sha256:cccccccccccccccccccc", RepoTags: ["alpine:3.20"] }),
      image({ Id: "sha256:dddddddddddddddddddd", RepoTags: null, Containers: 1 }),
    ],
  });

  const category = await categoryOf("dangling-images");

  assert.equal(category.itemCount, 2);
  assert.ok(category.items.every((item) => item.startsWith("aaaa") || item.startsWith("bbbb")), `unexpected items: ${category.items.join(", ")}`);
});

// disk-usage-service.md — "size = sum of (own size − size shared with other images), never negative"
test("dangling-images sizes each image as its own size minus what it shares, never below zero", async () => {
  setDiskUsage({
    Images: [
      image({ Id: "sha256:aaaaaaaaaaaaaaaaaaaa", Size: 10_000, SharedSize: 4_000 }),
      image({ Id: "sha256:bbbbbbbbbbbbbbbbbbbb", Size: 1_000, SharedSize: 3_000 }),
    ],
  });

  assert.equal((await categoryOf("dangling-images")).sizeBytes, 6_000);
});

// disk-usage-service.md — "unused-volumes -> volumes with no container referencing them; size = sum
// of their usage size"
test("unused-volumes counts only the volumes no container references, sized by their usage", async () => {
  setDiskUsage({
    Volumes: [
      volume({ Name: "free-one", UsageData: { Size: 2_048, RefCount: 0 } }),
      volume({ Name: "attached-one", UsageData: { Size: 8_192, RefCount: 1 } }),
    ],
  });

  const category = await categoryOf("unused-volumes");

  assert.deepEqual(category.items, ["free-one"]);
  assert.equal(category.itemCount, 1);
  assert.equal(category.sizeBytes, 2_048);
});

// disk-usage-service.md — "unused-networks -> networks with no attached container, excluding
// bridge / host / none"
test("unused-networks excludes the predefined networks and any network with an attached container", async () => {
  listNetworksResult = async () => [
    network("bridge"),
    network("host"),
    network("none"),
    network("fixture-idle"),
    network("fixture-busy", [{ id: "c1", name: "app" }]),
  ];

  const category = await categoryOf("unused-networks");

  assert.deepEqual(category.items, ["fixture-idle"]);
  assert.equal(category.itemCount, 1);
});

// disk-usage-service.md — "size = 0 (a network occupies no disk)"
test("unused-networks reports a size of zero even when it holds networks", async () => {
  listNetworksResult = async () => [network("fixture-idle"), network("fixture-idle-2")];

  assert.equal((await categoryOf("unused-networks")).sizeBytes, 0);
});

// disk-usage-service.md — "build-cache -> build-cache records in the 'reclaimable' state; size =
// sum of their sizes" / "only records the prune actually takes are counted, never the shared or
// in-use ones"
test("build-cache counts only the reclaimable records and sums their sizes", async () => {
  listBuildCacheResult = async () => [
    cacheRecord({ id: "rec-free", sizeBytes: 1_000, usageState: "reclaimable" }),
    cacheRecord({ id: "rec-shared", sizeBytes: 2_000, usageState: "shared" }),
    cacheRecord({ id: "rec-busy", sizeBytes: 4_000, usageState: "in-use" }),
  ];

  const category = await categoryOf("build-cache");

  assert.deepEqual(category.items, ["rec-free"]);
  assert.equal(category.itemCount, 1);
  assert.equal(category.sizeBytes, 1_000);
});

// disk-usage-service.md — "items — Capped at 20 entries; itemCount is the true count"
test("a category names at most twenty of its items while still counting them all", async () => {
  setDiskUsage({
    Containers: Array.from({ length: 25 }, (_unused, index) =>
      container({ Id: `c${index}`, Names: [`/fixture-${index}`], State: "exited" }),
    ),
  });

  const category = await categoryOf("stopped-containers");

  assert.equal(category.itemCount, 25);
  assert.equal(category.items.length, 20);
});

// disk-usage-service.md — "unavailableDetail — present exactly when that one category could not be
// read; its sizeBytes and itemCount are then 0 and items empty" / "A failure to read one category
// never fails the whole breakdown"
test("a category that cannot be read reports the reason and leaves the other four readable", async () => {
  setDiskUsage({ Volumes: [volume({ Name: "free-one", UsageData: { Size: 512, RefCount: 0 } })] });
  listBuildCacheResult = async () => {
    throw new Error("buildx is not installed");
  };

  const breakdown = await getDiskUsage();
  const buildCache = breakdown.categories.find((category) => category.id === "build-cache")!;

  assert.equal(buildCache.unavailableDetail, "buildx is not installed");
  assert.equal(buildCache.sizeBytes, 0);
  assert.equal(buildCache.itemCount, 0);
  assert.deepEqual(buildCache.items, []);
  assert.equal(breakdown.categories.length, 5);
  assert.equal(breakdown.categories.find((category) => category.id === "unused-volumes")!.sizeBytes, 512);
  assert.equal(
    breakdown.categories.filter((category) => category.unavailableDetail !== undefined).length,
    1,
    "only the category that failed carries a reason",
  );
});

// disk-usage-service.md — the networks reading is the other one that can fail on its own
test("a failing network listing leaves its own category unavailable and the rest intact", async () => {
  listNetworksResult = async () => {
    throw new Error("daemon refused the network listing");
  };

  const breakdown = await getDiskUsage();

  assert.equal(
    breakdown.categories.find((category) => category.id === "unused-networks")!.unavailableDetail,
    "daemon refused the network listing",
  );
  assert.equal(breakdown.categories.find((category) => category.id === "stopped-containers")!.unavailableDetail, undefined);
});

// disk-usage-service.md — "A failure of the daemon's own disk-usage reading does reject — without it
// there is no breakdown at all."
test("getDiskUsage rejects when the daemon's own disk-usage reading fails", async () => {
  diskUsageFailure = new Error("daemon unreachable");

  await assert.rejects(getDiskUsage(), /daemon unreachable/);
});

// disk-usage-service.md — "totalReclaimableBytes — the sum of the categories' sizeBytes"
test("totalReclaimableBytes is the sum of the categories' sizes", async () => {
  setDiskUsage({
    Containers: [container({ Id: "a", Names: ["/one"], State: "exited", SizeRw: 100 })],
    Images: [image({ Id: "sha256:aaaaaaaaaaaaaaaaaaaa", Size: 300, SharedSize: 100 })],
    Volumes: [volume({ Name: "free-one", UsageData: { Size: 50, RefCount: 0 } })],
  });
  listNetworksResult = async () => [network("fixture-idle")];
  listBuildCacheResult = async () => [cacheRecord({ sizeBytes: 7 })];

  const breakdown = await getDiskUsage();

  assert.equal(
    breakdown.totalReclaimableBytes,
    breakdown.categories.reduce((total, category) => total + category.sizeBytes, 0),
  );
  // 100 (writable layer) + 200 (300 own − 100 shared) + 50 (volume usage) + 0 (network) + 7 (cache)
  assert.equal(breakdown.totalReclaimableBytes, 357);
});

// disk-usage-service.md — "The reading never removes anything and never starts anything on the
// daemon": the only daemon call it makes is the read-only disk-usage one.
test("the reading issues no request other than the daemon's disk-usage reading", async () => {
  await getDiskUsage();

  assert.deepEqual(requestedCalls, ["GET /system/df"]);
});

// disk-usage-service.md — "The reclaimable breakdown stays direct and is held nowhere. It is read
// when the screen asks for it and never on a schedule"
// (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-23)
test("the reclaimable breakdown is read from the daemon on every call, never from a held reading", async () => {
  setDiskUsage({ Volumes: [volume({ Name: "idle", UsageData: { Size: 512, RefCount: 0 } })] });

  await getDiskUsage();
  await getDiskUsage();
  await getDiskUsage();

  assert.deepEqual(requestedCalls, ["GET /system/df", "GET /system/df", "GET /system/df"]);
});
