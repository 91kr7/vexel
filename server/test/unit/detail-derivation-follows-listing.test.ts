import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { installEngineMock } from "../support/engine-mock.js";
import type { DaemonEvent } from "../../src/events/event-stream-service.js";
import type { DiskUsageTotals } from "../../src/system/disk-usage-service.js";

// A volume's detail names the containers mounting it as the daemon holds them
// when it is asked (plan-docker_management_app-refresh_cache/REQ-58, REQ-59,
// REQ-60, REQ-61). Docker's own volume inspect carries no map of who mounts a
// volume, so that part of the detail is derived from the held container
// listing; the detail is read on daemon events and on nothing else, so an
// answer built on the copy the announcement is replacing stays on the screen.
//
// The subject is what the detail ends up naming, what that costs the daemon and
// who else waits for it, so the daemon is mocked and every call it receives is
// counted.
//
// Every case here starts from a **held** container listing (REQ-62): with
// nothing held, the derived read joins the read in flight and is served the
// right answer without the correction, so a case written against a cold cache
// passes either way and states nothing.
const engine = installEngineMock();

// The dashboard overview is one of the three readers REQ-60 says must not wait,
// so it is driven for real here. Everything it assembles besides the container
// counts is beside the point and would spawn a CLI in a unit pass, so those
// three services answer with nothing; the counts keep coming from the real held
// listing, which is what this file measures.
mock.module(new URL("../../src/system/disk-usage-service.ts", import.meta.url).href, {
  namedExports: {
    getDiskUsageTotals: async (): Promise<DiskUsageTotals> => ({ categories: [], totalBytes: 0 }),
    DISK_USAGE_TOTAL_CATEGORY_IDS: ["images", "containers", "volumes", "build-cache"],
  },
});
mock.module(new URL("../../src/compose/compose-discovery-service.ts", import.meta.url).href, {
  namedExports: { listComposeProjects: async () => [] },
});
mock.module(new URL("../../src/builders/builders-service.ts", import.meta.url).href, {
  namedExports: { listBuilders: async () => [] },
});

const { containerListCache } = await import("../../src/containers/containers-service.js");
const { volumeListCache, volumeSizeCache, getVolumeInspect } = await import("../../src/volumes/volumes-service.js");
const { networkListCache } = await import("../../src/networks/networks-service.js");
const { resetRefreshCache, EVENT_GROUPING_WINDOW_MS } = await import("../../src/refresh-cache/refresh-cache.js");
const { eventStreamService } = await import("../../src/events/event-stream-service.js");
const { getSystemOverview } = await import("../../src/system/overview-service.js");

const VOLUME_NAME = "detail-data";
const OTHER_VOLUME_NAME = "detail-other-data";
const NETWORK_NAME = "detail-net";
const OTHER_NETWORK_NAME = "detail-other-net";
const CONTAINER_NAME = "detail-mounting-container";
const CONTAINER_ID = "c".repeat(64);
const NETWORK_ID = "n".repeat(63);

/**
 * Far shorter than the grouping window, and the reason it exists:
 * `.sdd/tech-debt/entries/change-coverage-millisecond-window.md` — a read that
 * started in the same millisecond as a notice counts as covering it. A frozen
 * fake clock makes that tie certain, so a case that needs the notice to land
 * after an earlier read moves the clock by this much first.
 */
const AFTER_THE_LAST_READ_MS = 5;

/** The container as `GET /containers/json?all=true` reports it, with the volumes it mounts and the networks it is on. */
function containerEntry(id: string, name: string, mounts: string[], networks: string[]): unknown {
  return {
    Id: id,
    Names: [`/${name}`],
    Image: "alpine:3.20",
    State: "running",
    Ports: [],
    Labels: {},
    Mounts: mounts.map((volume) => ({ Type: "volume", Name: volume })),
    NetworkSettings: { Networks: Object.fromEntries(networks.map((network) => [network, {}])) },
  };
}

/** The one container of every case here, mounting the volume and on the network. */
function mountingContainer(): unknown[] {
  return [containerEntry(CONTAINER_ID, CONTAINER_NAME, [VOLUME_NAME], [NETWORK_NAME])];
}

let containerPayload: unknown[] = [];
let uptimeSeconds = 0;

/** A republished daemon event, as the cache's own listener receives one. */
function daemonEvent(type: string, action: string): DaemonEvent {
  return { id: `${type}-${action}-${Math.random()}`, timestamp: new Date().toISOString(), type, action };
}

/**
 * Container listings that reached the daemon, in any form: `callsTo` strips the
 * query, so it cannot tell `/containers/json?all=true` from the sampler's
 * `/containers/json`. The whole path is what REQ-59 is counted on.
 */
function containerListCalls(): number {
  return engine.calls.filter((call) => call.path.startsWith("/containers/json")).length;
}

function volumeInspectCalls(): number {
  return engine.calls.filter((call) => call.path === `/volumes/${VOLUME_NAME}`).length;
}

/** Lets the pending reads run their awaits out; a fake clock does not advance microtasks. */
async function settle(): Promise<void> {
  for (let index = 0; index < 20; index += 1) await new Promise((resolve) => setImmediate(resolve));
}

/** Advances the fake clock in slices, so a timer chained after an awaited read still fires. */
async function advance(milliseconds: number): Promise<void> {
  for (let elapsed = 0; elapsed < milliseconds; elapsed += 250) {
    mock.timers.tick(Math.min(250, milliseconds - elapsed));
    await settle();
  }
}

/**
 * Whether a call has answered yet. With the fake clock frozen, a caller waiting
 * for a read the grouping window deferred cannot have answered, so this tells
 * "served from the held value at once" from "waited".
 */
function watch<T>(promise: Promise<T>): { answered: () => boolean; value: Promise<T> } {
  let answered = false;
  const value = promise.then((result) => {
    answered = true;
    return result;
  });
  return { answered: () => answered, value };
}

beforeEach(() => {
  // The cache is process-wide and its refreshers outlive the test that started
  // them: without this, one case is served what another one's read put there.
  resetRefreshCache();
  engine.reset();
  containerPayload = mountingContainer();
  uptimeSeconds = 0;
  // Every read answers with a listing of its own, carrying the humanized uptime
  // a real host's answer moves on every read — the field the containers kind's
  // own declaration deliberately leaves out (containers-service.md).
  engine.on("GET", "/containers/json", () => {
    uptimeSeconds += 5;
    return containerPayload.map((entry) => ({ ...(entry as object), Status: `Up ${uptimeSeconds} seconds` }));
  });
  engine.on("GET", "/volumes", () => ({
    Volumes: [VOLUME_NAME, OTHER_VOLUME_NAME].map((name) => ({
      Name: name,
      Driver: "local",
      Mountpoint: `/data/${name}`,
      Scope: "local",
    })),
  }));
  engine.on("GET", `/volumes/${VOLUME_NAME}`, () => ({
    Name: VOLUME_NAME,
    Driver: "local",
    Mountpoint: `/data/${VOLUME_NAME}`,
    Scope: "local",
    CreatedAt: "2026-08-31T00:00:00Z",
    Labels: {},
    Options: {},
  }));
  engine.on("GET", "/networks", () =>
    [NETWORK_NAME, OTHER_NETWORK_NAME].map((name, index) => ({
      Id: `${NETWORK_ID}${index}`,
      Name: name,
      Driver: "bridge",
      Scope: "local",
    })),
  );
  engine.on("GET", "/system/df", () => ({ LayersSize: 0, Images: [], Containers: [], Volumes: [], BuildCache: [] }));
});

/**
 * Brings the cache to the state every case here needs: the container listing
 * held, and the lists and sizes built on it held under it (REQ-62). The sizes
 * are held first because the **first** ones to arrive mark the volume list
 * changed, which would read it again in the middle of a case. The clock is then
 * a full grouping window clear of the last read, so what the case does next is
 * not folded into a read that has just happened.
 */
async function holdTheListingTheDetailDerivesFrom(): Promise<void> {
  await volumeSizeCache.read();
  await volumeListCache.read();
  await networkListCache.read();
  await containerListCache.read();
  await settle();
  await advance(EVENT_GROUPING_WINDOW_MS + 250);
}

/** The mounting containers the volume list reports, which is what the detail must not be answered from. */
async function mountedByOfTheList(): Promise<string[]> {
  const volumes = (await volumeListCache.read()).value;
  const found = volumes.find((volume) => volume.name === VOLUME_NAME);
  assert.ok(found, "the fixture volume is not in the volume list at all");
  return found.mountedBy;
}

// REQ-58 — "an answer given after the daemon has announced a container's removal never names that
// container", on a server that already holds a container listing. The request arrives **on** the
// announcement, which is when the panel is in fact asked: the client re-reads the detail on the
// same event that marked the listing due.
test("the volume detail asked on the announcement no longer names the container that has gone", async () => {
  mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  try {
    await holdTheListingTheDetailDerivesFrom();
    assert.deepEqual(await mountedByOfTheList(), [CONTAINER_NAME], "the held listing does not name the container this case removes");

    // The daemon no longer holds the container, and announces it.
    containerPayload = [];
    eventStreamService.emit("event", daemonEvent("container", "destroy"));

    // Asked once, on the announcement, and asserted once (REQ-63): nothing here
    // retries and nothing polls. The clock is advanced because a fake one runs
    // no read the grouping window deferred, not to give the answer more time —
    // an answer already given is not changed by it.
    const inspecting = getVolumeInspect(VOLUME_NAME);
    await advance(EVENT_GROUPING_WINDOW_MS + 250);

    assert.deepEqual(
      (await inspecting).mountedBy,
      [],
      "the detail named a container the daemon had announced the removal of",
    );
  } finally {
    mock.timers.reset();
  }
});

// REQ-58, the other half — "an answer given after it announced a container mounting the volume
// names it", which is the second acceptance scenario of this batch: the panel is open on a volume
// nothing mounts and a container mounting it is started from outside the application.
test("the volume detail asked on the announcement names the container that has just started mounting", async () => {
  mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  try {
    containerPayload = [];
    await holdTheListingTheDetailDerivesFrom();
    assert.deepEqual(await mountedByOfTheList(), [], "the held listing already names a container mounting the volume");

    containerPayload = mountingContainer();
    eventStreamService.emit("event", daemonEvent("container", "start"));

    const inspecting = getVolumeInspect(VOLUME_NAME);
    await advance(EVENT_GROUPING_WINDOW_MS + 250);

    assert.deepEqual(
      (await inspecting).mountedBy,
      [CONTAINER_NAME],
      "the detail was answered from the listing the announcement was replacing",
    );
  } finally {
    mock.timers.reset();
  }
});

// REQ-61 — "whether that read was already under way when the request arrived or the grouping window
// had deferred it". The deferred order is the ordinary one: the three events of `docker rm -fv`
// arrive inside one window, so the read that covers the last of them has not started when the
// detail is asked. An implementation that awaits whatever read happens to be in flight leaves this
// red.
test("the volume detail follows a listing re-read the grouping window deferred", async () => {
  mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  try {
    await holdTheListingTheDetailDerivesFrom();
    const listingsHeld = containerListCalls();

    // The first announcement of the burst: its read starts at once and opens
    // the kind's grouping window.
    eventStreamService.emit("event", daemonEvent("container", "kill"));
    await settle();
    assert.equal(
      containerListCalls() - listingsHeld,
      1,
      "the first announcement started no read, so this case never opens the window it is about",
    );

    // Still inside that window, the container is gone and the daemon says so.
    // The clock moves by a few milliseconds first, so the read that has just
    // finished cannot count as covering the announcement that follows it.
    await advance(AFTER_THE_LAST_READ_MS);
    containerPayload = [];
    eventStreamService.emit("event", daemonEvent("container", "destroy"));
    await settle();
    assert.equal(
      containerListCalls() - listingsHeld,
      1,
      "the second announcement was read at once, so this case never arranges the deferral it is about",
    );

    const inspecting = getVolumeInspect(VOLUME_NAME);
    await advance(EVENT_GROUPING_WINDOW_MS + 250);

    assert.deepEqual(
      (await inspecting).mountedBy,
      [],
      "the detail was answered before the read the grouping window had deferred",
    );
  } finally {
    mock.timers.reset();
  }
});

// REQ-59 — "Closing this costs the daemon no further call. The detail is still built from the one
// container listing the server holds, no read is started for it beyond the one the announcement had
// already caused." One announcement with the window clear is one read (refresh-cache.md, event
// grouping), and the detail itself is the one `GET /volumes/{name}` it costs today.
test("the covered detail adds no container listing read and costs the one volume inspect", async () => {
  mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  try {
    await holdTheListingTheDetailDerivesFrom();
    const listingsAfterWarmUp = containerListCalls();
    const inspectsAfterWarmUp = volumeInspectCalls();

    containerPayload = [];
    eventStreamService.emit("event", daemonEvent("container", "destroy"));

    const inspecting = getVolumeInspect(VOLUME_NAME);
    await advance(EVENT_GROUPING_WINDOW_MS + 250);

    assert.deepEqual(
      (await inspecting).mountedBy,
      [],
      "the detail never followed the announcement, so there is no covered answer to count the cost of",
    );
    assert.equal(
      containerListCalls() - listingsAfterWarmUp,
      1,
      "the covered detail cost a container listing beside the one the announcement had already caused",
    );
    assert.equal(
      volumeInspectCalls() - inspectsAfterWarmUp,
      1,
      "the detail asked the daemon for the volume more than the once it costs today",
    );
  } finally {
    mock.timers.reset();
  }
});

// REQ-60 — "Only the reader that asks for it waits. The list endpoints, the dashboard overview and
// the statistics sampler are answered from the held value without waiting, exactly as they are
// today." With the same announcement outstanding, and the read it caused deferred by the grouping
// window, the detail is still waiting while the three of them have answered — from the listing held,
// which still names the container that has gone. An implementation that made the wait unconditional
// passes every case above and puts a grouping window in front of every list in the product.
test("the lists and the dashboard answer from the held listing while the detail waits", async () => {
  mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  try {
    await holdTheListingTheDetailDerivesFrom();
    const listingsHeld = containerListCalls();

    eventStreamService.emit("event", daemonEvent("container", "kill"));
    await settle();
    await advance(AFTER_THE_LAST_READ_MS);
    containerPayload = [];
    eventStreamService.emit("event", daemonEvent("container", "destroy"));
    await settle();
    assert.equal(
      containerListCalls() - listingsHeld,
      1,
      "the announcement was read at once, so nothing is outstanding for anybody to wait on",
    );

    const detail = watch(getVolumeInspect(VOLUME_NAME));
    const volumes = watch(volumeListCache.read());
    const networks = watch(networkListCache.read());
    const overview = watch(getSystemOverview());
    await settle();

    assert.equal(volumes.answered(), true, "the volume list waited for the read the announcement had caused");
    assert.equal(networks.answered(), true, "the network list waited for the read the announcement had caused");
    assert.equal(overview.answered(), true, "the dashboard overview waited for the read the announcement had caused");
    assert.equal(
      detail.answered(),
      false,
      "the detail answered without the deferred read, so this case never arranges the wait the three others must not share",
    );

    const listed = (await volumes.value).value.find((volume) => volume.name === VOLUME_NAME);
    assert.deepEqual(listed?.mountedBy, [CONTAINER_NAME], "the volume list was not answered from the value held");
    const network = (await networks.value).value.find((entry) => entry.name === NETWORK_NAME);
    assert.deepEqual(network?.attachedContainers, [CONTAINER_NAME], "the network list was not answered from the value held");
    assert.equal((await overview.value).containers.total, 1, "the dashboard overview was not answered from the value held");

    // And the reader that did wait is answered by the read the window deferred.
    await advance(EVENT_GROUPING_WINDOW_MS + 250);
    assert.deepEqual((await detail.value).mountedBy, [], "the detail never followed the announcement it waited for");
  } finally {
    mock.timers.reset();
  }
});
