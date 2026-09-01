import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { DiskUsageTotalCategory, DiskUsageTotals } from "../../src/system/disk-usage-service.js";

// SystemOverviewService assembles the dashboard's whole reading of the host out
// of the services that already own each number (overview-service.md). All of
// them are mocked here — the disk-usage accounting, the container listing, the
// compose discovery and the builder inventory — so what is under test is only
// the assembly: the counts by state, where each figure is taken from, and how a
// capability the host lacks is reported instead of failing the payload. The
// engine client is mocked too, recording every call, because the service is
// contracted to issue none of its own.

let diskUsageTotalsResult: () => Promise<DiskUsageTotals> = async () => totalsOf();
let heldContainerListResult: () => Promise<unknown> = async () => [];
let imageListResult: () => Promise<unknown[]> = async () => [];
let volumeListResult: () => Promise<unknown[]> = async () => [];
let listComposeProjectsResult: () => Promise<unknown[]> = async () => [];
let listBuildersResult: () => Promise<unknown[]> = async () => [];
const requestedCalls: string[] = [];

/** How often each held source was actually read, which is how REQ-22 is counted below. */
const reads = { images: 0, volumes: 0, compose: 0, builders: 0 };

mock.module(new URL("../../src/connectivity/connection-status-service.ts", import.meta.url).href, {
  namedExports: {
    getEngineClient: () => ({
      request: async (path: string, init?: { method?: string }) => {
        requestedCalls.push(`${init?.method ?? "GET"} ${path}`);
        throw new Error(`unexpected path: ${path}`);
      },
    }),
  },
});

mock.module(new URL("../../src/system/disk-usage-service.ts", import.meta.url).href, {
  namedExports: {
    getDiskUsageTotals: () => diskUsageTotalsResult(),
    DISK_USAGE_TOTAL_CATEGORY_IDS: ["images", "containers", "volumes", "build-cache"],
  },
});

mock.module(new URL("../../src/containers/containers-service.ts", import.meta.url).href, {
  namedExports: { readHeldContainerList: () => heldContainerListResult(), CONTAINER_LIST_KIND: "containers" },
});

// The four listings the overview counts from are held kinds of the refresh
// cache and are read through their `read()`, so the stand-ins are real kinds
// over stubbed readers: a second overview inside a period is then answered from
// what is held, as the contract says.
const { registerRefreshKind, resetRefreshCache } = await import("../../src/refresh-cache/refresh-cache.js");
const imageListCache = registerRefreshKind({
  key: "images",
  periodMs: 30000,
  read: async () => {
    reads.images += 1;
    return imageListResult();
  },
});
const volumeListCache = registerRefreshKind({
  key: "volumes",
  periodMs: 30000,
  read: async () => {
    reads.volumes += 1;
    return volumeListResult();
  },
});
const composeProjectsCache = registerRefreshKind({
  key: "compose-projects",
  periodMs: 30000,
  read: async () => {
    reads.compose += 1;
    return listComposeProjectsResult();
  },
});
const builderListCache = registerRefreshKind({
  key: "builders",
  periodMs: 30000,
  read: async () => {
    reads.builders += 1;
    return listBuildersResult();
  },
});

mock.module(new URL("../../src/images/images-service.ts", import.meta.url).href, {
  namedExports: { imageListCache },
});

mock.module(new URL("../../src/volumes/volumes-service.ts", import.meta.url).href, {
  namedExports: { volumeListCache },
});

mock.module(new URL("../../src/compose/compose-discovery-service.ts", import.meta.url).href, {
  namedExports: { listComposeProjects: () => listComposeProjectsResult(), composeProjectsCache },
});

mock.module(new URL("../../src/builders/builders-service.ts", import.meta.url).href, {
  namedExports: { listBuilders: () => listBuildersResult(), builderListCache },
});

const { getSystemOverview } = await import("../../src/system/overview-service.js");

/** The occupied-space breakdown the overview takes its image, volume and build-cache figures from. */
function totalsOf(overrides: Partial<Record<DiskUsageTotalCategory["id"], Partial<DiskUsageTotalCategory>>> = {}): DiskUsageTotals {
  const categories: DiskUsageTotalCategory[] = (["images", "containers", "volumes", "build-cache"] as const).map((id) => ({
    id,
    sizeBytes: 0,
    itemCount: 0,
    ...overrides[id],
  }));
  return { categories, totalBytes: categories.reduce((total, entry) => total + entry.sizeBytes, 0) };
}

/** A daemon listing entry, the shape the held container listing carries (containers-service.md, RawContainer). */
function container(state: string, name = `fixture-${state}`) {
  return { Id: `id-${name}`, Names: [`/${name}`], Image: "alpine:3.20", State: state, Status: "", Ports: [] };
}

function composeProject(name: string) {
  return { name, configFiles: [], state: "running", services: [] };
}

function builder(name: string, active: boolean) {
  return { name, driver: "docker", endpoint: "unix:///var/run/docker.sock", platforms: [], status: "running", active };
}

beforeEach(() => {
  // The held listings outlive the case that read them; without this a case is
  // answered from what the one before it held.
  resetRefreshCache();
  diskUsageTotalsResult = async () => totalsOf();
  heldContainerListResult = async () => [];
  imageListResult = async () => [];
  volumeListResult = async () => [];
  listComposeProjectsResult = async () => [];
  listBuildersResult = async () => [];
  requestedCalls.length = 0;
  reads.images = 0;
  reads.volumes = 0;
  reads.compose = 0;
  reads.builders = 0;
});

/** As many entries as asked for; only their number reaches the overview. */
function listOf(count: number): unknown[] {
  return Array.from({ length: count }, (_unused, index) => ({ id: `entry-${index}` }));
}

// overview-service.md — "stopped is every container that is neither running nor paused (created,
// restarting, removing, exited, dead), so running + paused + stopped === total"
test("counts the containers by state, with everything that is neither running nor paused counted as stopped", async () => {
  heldContainerListResult = async () => [
    container("running", "run-one"),
    container("running", "run-two"),
    container("paused"),
    container("created"),
    container("restarting"),
    container("removing"),
    container("exited"),
    container("dead"),
  ];

  const { containers } = await getSystemOverview();

  assert.equal(containers.total, 8);
  assert.equal(containers.running, 2);
  assert.equal(containers.paused, 1);
  assert.equal(containers.stopped, 5);
  assert.equal(containers.running + containers.paused + containers.stopped, containers.total);
});

// overview-service.md — "Every number comes from the service that already owns it — the container
// listing …": the overview counts what that listing reports and nothing else, which is also what
// keeps this application's own internal containers out of the figure.
test("counts exactly the containers the container listing reports", async () => {
  heldContainerListResult = async () => [container("running"), container("exited")];

  assert.equal((await getSystemOverview()).containers.total, 2);
});

// overview-service.md — "images: count from the held image listing, sizeBytes … from the held disk
// accounting" / "volumes: count from the held volume listing, sizeBytes from the held disk
// accounting" / "diskUsage — unchanged from the disk-usage service". The listings and the accounting
// are given different figures on purpose: that is what tells which one each half came from.
test("counts the images and volumes from their held listings and sizes them from the disk accounting", async () => {
  const totals = totalsOf({
    images: { itemCount: 7, sizeBytes: 900_000 },
    containers: { itemCount: 3, sizeBytes: 1_000 },
    volumes: { itemCount: 4, sizeBytes: 50_000 },
    "build-cache": { itemCount: 2, sizeBytes: 20_000 },
  });
  diskUsageTotalsResult = async () => totals;
  imageListResult = async () => listOf(9);
  volumeListResult = async () => listOf(5);

  const overview = await getSystemOverview();

  assert.deepEqual(overview.images, { count: 9, sizeBytes: 900_000 });
  assert.deepEqual(overview.volumes, { count: 5, sizeBytes: 50_000 });
  assert.deepEqual(overview.diskUsage, totals);
});

// overview-service.md — "stacks: { compose, total } — total is every kind of stack this
// application knows, which since 2026-08-27 is the compose projects alone, so the two figures are
// equal" (plan-docker_management_app-swarm_removal/REQ-6)
test("counts the compose projects as the whole of the stacks, and totals them alone", async () => {
  listComposeProjectsResult = async () => [composeProject("shop"), composeProject("blog")];

  const { stacks } = await getSystemOverview();

  assert.equal(stacks.compose, 2);
  assert.equal(stacks.total, 2);
});

// plan-docker_management_app-swarm_removal/REQ-6 — no place outside the withdrawn screen summarises
// cluster state any longer: the section carries the two figures and nothing else, neither a cluster
// count nor a reason one could not be read.
test("states nothing about a cluster in the stacks section", async () => {
  listComposeProjectsResult = async () => [composeProject("shop")];

  const { stacks } = await getSystemOverview();

  assert.deepEqual(Object.keys(stacks).sort(), ["compose", "total"]);
});

// overview-service.md — "A host without the compose plugin contributes 0 compose stacks rather than
// a reason"
test("a host whose compose discovery fails contributes no compose stack and no reason", async () => {
  listComposeProjectsResult = async () => {
    throw new Error("docker: 'compose' is not a docker command");
  };

  const { stacks } = await getSystemOverview();

  assert.equal(stacks.compose, 0);
  assert.equal(stacks.total, 0);
});

// overview-service.md — "buildCache: sizeBytes — every build-cache record, whatever its usage
// state" / "activeBuilder — the name of the builder docker buildx build uses by default"
test("names the active builder beside the whole build-cache size", async () => {
  diskUsageTotalsResult = async () => totalsOf({ "build-cache": { itemCount: 5, sizeBytes: 4_096 } });
  listBuildersResult = async () => [builder("default", false), builder("multiarch", true)];

  const { buildCache } = await getSystemOverview();

  assert.equal(buildCache.sizeBytes, 4_096);
  assert.equal(buildCache.activeBuilder, "multiarch");
  assert.equal(buildCache.unavailableDetail, undefined);
});

// overview-service.md — "activeBuilder — absent when no builder is marked active"
test("names no builder when none is marked active, without calling the build cache unavailable", async () => {
  diskUsageTotalsResult = async () => totalsOf({ "build-cache": { sizeBytes: 512 } });
  listBuildersResult = async () => [builder("default", false)];

  const { buildCache } = await getSystemOverview();

  assert.equal(buildCache.activeBuilder, undefined);
  assert.equal(buildCache.unavailableDetail, undefined);
  assert.equal(buildCache.sizeBytes, 512);
});

// overview-service.md — "unavailableDetail — present exactly when the cache inventory could not be
// read; sizeBytes is then 0 and no builder is named". Both readings behind the section go through
// buildx, so a host without it fails both.
test("reports that the cache inventory could not be read, with no size and no builder", async () => {
  diskUsageTotalsResult = async () => totalsOf({ "build-cache": { unavailableDetail: "buildx is not installed" } });
  listBuildersResult = async () => {
    throw new Error("buildx is not installed");
  };

  const { buildCache } = await getSystemOverview();

  assert.equal(buildCache.unavailableDetail, "buildx is not installed");
  assert.equal(buildCache.sizeBytes, 0);
  assert.equal(buildCache.activeBuilder, undefined);
});

// overview-service.md — "if only that second call fails the section stays available and simply
// names no builder — a size that was read is still worth showing": the active-builder reading is a
// separate call, and its failure is not the cache inventory's.
test("a failing active-builder reading leaves the section available, with its size and no builder", async () => {
  diskUsageTotalsResult = async () => totalsOf({ images: { itemCount: 2, sizeBytes: 10 }, "build-cache": { sizeBytes: 8_192 } });
  imageListResult = async () => listOf(2);
  listBuildersResult = async () => {
    throw new Error("cannot list builders");
  };

  const overview = await getSystemOverview();

  assert.equal(overview.buildCache.unavailableDetail, undefined);
  assert.equal(overview.buildCache.sizeBytes, 8_192);
  assert.equal(overview.buildCache.activeBuilder, undefined);
  // The rest of the payload is untouched by that one failing call.
  assert.equal(overview.images.count, 2);
  assert.equal(overview.images.sizeBytes, 10);
});

// overview-service.md — "A daemon that cannot be reached at all does reject: there is then nothing
// to report"
test("rejects when the disk-usage accounting itself cannot be read", async () => {
  diskUsageTotalsResult = async () => {
    throw new Error("daemon unreachable");
  };

  await assert.rejects(getSystemOverview(), /daemon unreachable/);
});

// overview-service.md — "It reads nothing on its own at all: the one reading it used to take for
// itself was the daemon's service list, for a swarm stack count, and that left with the area on
// 2026-08-27" (plan-docker_management_app-swarm_removal/REQ-6) / "The reading never removes anything
// and never starts anything on the daemon."
test("issues no daemon request of its own at all", async () => {
  await getSystemOverview();

  assert.deepEqual(requestedCalls, []);
});

// overview-service.md — "Every figure is assembled from a value the server already holds, so a
// repeated caller asks the daemon and the CLI for nothing"
// (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-22)
test("a series of overviews inside one period reads each held source once", async () => {
  imageListResult = async () => listOf(3);
  volumeListResult = async () => listOf(2);
  listComposeProjectsResult = async () => [composeProject("shop")];
  listBuildersResult = async () => [builder("default", true)];

  const first = await getSystemOverview();
  assert.deepEqual(reads, { images: 1, volumes: 1, compose: 1, builders: 1 }, "the first overview pays for each source");

  for (let index = 0; index < 20; index += 1) {
    const later = await getSystemOverview();
    assert.deepEqual(later, first, "an overview answered from held values reports the same figures");
  }

  assert.deepEqual(reads, { images: 1, volumes: 1, compose: 1, builders: 1 });
});

// overview-service.md — "The payload's shape is exactly what it was before the figures behind it
// became held values: no field added, removed or renamed"
// (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-23)
test("the payload carries exactly the six sections it carried before, and no other field", async () => {
  const overview = await getSystemOverview();

  assert.deepEqual(Object.keys(overview).sort(), ["buildCache", "containers", "diskUsage", "images", "stacks", "volumes"]);
  assert.deepEqual(Object.keys(overview.containers).sort(), ["paused", "running", "stopped", "total"]);
  assert.deepEqual(Object.keys(overview.images).sort(), ["count", "sizeBytes"]);
  assert.deepEqual(Object.keys(overview.volumes).sort(), ["count", "sizeBytes"]);
  assert.deepEqual(Object.keys(overview.diskUsage).sort(), ["categories", "totalBytes"]);
});
