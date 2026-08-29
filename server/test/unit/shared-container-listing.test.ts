import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { installEngineMock } from "../support/engine-mock.js";

// One container listing serves every consumer
// (plan-docker_management_app-refresh_cache/REQ-37, REQ-38, REQ-42).
//
// The subject is the *traffic* and what the derived readers are served, so the
// daemon is mocked and every call it receives is counted: only that observation
// tells four consumers sharing one listing from four consumers each fetching
// their own. buildx and compose are mocked too — the overview reaches them, and
// neither has anything to do with the container listing.
const engine = installEngineMock();

mock.module(new URL("../../src/builders/build-cache-service.ts", import.meta.url).href, {
  namedExports: { listBuildCache: async () => [] },
});

mock.module(new URL("../../src/builders/builders-service.ts", import.meta.url).href, {
  namedExports: { listBuilders: async () => [] },
});

mock.module(new URL("../../src/compose/compose-discovery-service.ts", import.meta.url).href, {
  namedExports: { listComposeProjects: async () => [] },
});

const { containerListCache, readContainerList } = await import("../../src/containers/containers-service.js");
const { listVolumes, volumeListCache } = await import("../../src/volumes/volumes-service.js");
const { listNetworks } = await import("../../src/networks/networks-service.js");
const { getSystemOverview } = await import("../../src/system/overview-service.js");
const { resetRefreshCache, DEMAND_EXPIRY_MS } = await import("../../src/refresh-cache/refresh-cache.js");

/** containers-service.md — the containers kind's own period. */
const CONTAINER_PERIOD_MS = 20_000;

const VOLUME_NAME = "shared-data";
const NETWORK_NAME = "shared-net";
const GHOST_NAME = "ghost";

/** A running container as `GET /containers/json?all=true` reports one, mounting the volume and on the network. */
function ghostContainer(): unknown {
  return {
    Id: "a".repeat(64),
    Names: [`/${GHOST_NAME}`],
    Image: "alpine:3.20",
    State: "running",
    Status: "Up 2 minutes",
    Ports: [],
    Labels: {},
    Mounts: [{ Type: "volume", Name: VOLUME_NAME }],
    NetworkSettings: { Networks: { [NETWORK_NAME]: {} } },
  };
}

let containerPayload: unknown[] = [];

/** Container listings that have reached the daemon since the last reset. */
function containerListCalls(): number {
  return engine.calls.filter((call) => call.path === "/containers/json?all=true").length;
}

/** Lets the pending reads run their awaits out; a fake clock does not advance microtasks. */
async function settle(): Promise<void> {
  for (let index = 0; index < 10; index += 1) await new Promise((resolve) => setImmediate(resolve));
}

/** Advances the fake clock in slices, so a timer chained after an awaited read still fires. */
async function advance(milliseconds: number): Promise<void> {
  for (let elapsed = 0; elapsed < milliseconds; elapsed += 5_000) {
    mock.timers.tick(Math.min(5_000, milliseconds - elapsed));
    await settle();
  }
}

beforeEach(() => {
  // The cache is process-wide and its refreshers outlive the test that started
  // them: without this, one test is served what another one's read put there.
  resetRefreshCache();
  engine.reset();
  containerPayload = [ghostContainer()];
  engine.on("GET", "/containers/json", () => containerPayload);
  engine.on("GET", "/volumes", () => ({
    Volumes: [{ Name: VOLUME_NAME, Driver: "local", Mountpoint: `/data/${VOLUME_NAME}`, Scope: "local" }],
  }));
  engine.on("GET", "/networks", () => [{ Id: "n".repeat(64), Name: NETWORK_NAME, Driver: "bridge", Scope: "local" }]);
  engine.on("GET", "/system/df", () => ({ LayersSize: 0, Images: [], Containers: [], Volumes: [], BuildCache: [] }));
});

// REQ-37 — "The volume list, the network list and the dashboard overview are built from the
// container listing the server already holds; none of them calls the daemon for a container listing
// of its own."
test("the volume list, the network list and the container listing together cost one container listing", async () => {
  await listVolumes();
  await listNetworks();
  await readContainerList();

  assert.equal(containerListCalls(), 1, "the three listings did not share one read of the daemon's container listing");
});

// REQ-37 — the dashboard is the fourth consumer: it adds no container listing of its own to the one
// already held ("It reads nothing on its own at all", overview-service.md).
test("the dashboard overview asks the daemon for no container listing of its own", async () => {
  await listVolumes();
  const afterTheVolumeList = containerListCalls();

  await getSystemOverview();

  assert.equal(afterTheVolumeList, 1);
  assert.equal(containerListCalls(), afterTheVolumeList, "the overview fetched a container listing of its own");
});

// REQ-37, and the acceptance scenario's "never twice in the same instant": four consumers arriving
// together are one read, not four (refresh-cache.md — "a read already running is joined rather than
// started again").
test("four consumers asking at the same instant are served by one read", async () => {
  await Promise.all([listVolumes(), listNetworks(), readContainerList(), getSystemOverview()]);

  assert.equal(containerListCalls(), 1, "consumers arriving together each started a read of their own");
});

// REQ-38 — "Each of them is served a listing that covers the operator's own last action: after an
// operation the application performed on a container, the next volume list, network list and
// dashboard describe the containers as they are after it." A reader taking the held value with
// `peek()` is served the listing from before the operation and fails here.
test("a container the application has just removed is named by no derived reader on the next read", async () => {
  assert.deepEqual((await listVolumes())[0]!.mountedBy, [GHOST_NAME]);
  assert.deepEqual((await listNetworks())[0]!.attachedContainers, [GHOST_NAME]);
  assert.equal((await getSystemOverview()).containers.total, 1);

  // The operation happens after the listing was held, and "after" is measured
  // in whole milliseconds: a mocked daemon answers inside one, which a real one
  // never does, so the wait is what keeps the two instants distinguishable.
  await new Promise((resolve) => setTimeout(resolve, 5));

  // The application removes it, and says so the way its own routes do.
  containerPayload = [];
  containerListCache.markChanged();

  assert.deepEqual((await listVolumes())[0]!.mountedBy, [], "the volume list still names the removed container");
  assert.deepEqual(
    (await listNetworks())[0]!.attachedContainers,
    [],
    "the network list still names the removed container",
  );
  assert.equal((await getSystemOverview()).containers.total, 0, "the dashboard still counts the removed container");
});

// REQ-42 — "Asking for the volume list … counts as asking for the container listing, so it keeps
// being refreshed while one of those screens is open; while nobody asks for any of them or for the
// containers screen, it is refreshed no more."
test("asking for the volume list alone keeps the container listing refreshed, and nothing asking stops it", async () => {
  mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  try {
    await volumeListCache.read();
    assert.equal(containerListCache.isRefreshing(), true, "asking for the volume list did not put the container listing under refresh");

    const afterTheFirstAsk = containerListCalls();
    await advance(CONTAINER_PERIOD_MS * 2 + 1_000);
    assert.ok(
      containerListCalls() > afterTheFirstAsk,
      "the container listing stopped being refreshed while the volume list was still being asked for",
    );

    // Nobody asks for anything any more: the volume list's own demand expires,
    // and with it the demand it was renewing on the container listing.
    await advance(DEMAND_EXPIRY_MS * 4);
    const whenEverythingHadGoneQuiet = containerListCalls();
    await advance(DEMAND_EXPIRY_MS * 4);

    assert.equal(containerListCache.isRefreshing(), false, "the container listing is still being refreshed with nobody asking");
    assert.equal(
      containerListCalls(),
      whenEverythingHadGoneQuiet,
      "the daemon was still being asked for the container listing with nobody asking for it",
    );
  } finally {
    mock.timers.reset();
  }
});
