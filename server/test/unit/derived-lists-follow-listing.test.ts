import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { installEngineMock } from "../support/engine-mock.js";
import type { DaemonEvent } from "../../src/events/event-stream-service.js";

// The lists derived from the held container listing follow it when it is
// replaced (plan-docker_management_app-refresh_cache/REQ-52, REQ-53, REQ-54).
//
// The subject is what the derived lists end up describing and what that costs
// the daemon, so the daemon is mocked and every call it receives is counted.
//
// Every case here starts from a **held** container listing (REQ-56): with
// nothing held, a derived read joins the read in flight and is served the right
// answer without the correction, so a case written against a cold cache passes
// either way and states nothing.
const engine = installEngineMock();

const { containerListCache } = await import("../../src/containers/containers-service.js");
const { volumeListCache } = await import("../../src/volumes/volumes-service.js");
const { networkListCache } = await import("../../src/networks/networks-service.js");
const { resetRefreshCache, EVENT_GROUPING_WINDOW_MS } = await import("../../src/refresh-cache/refresh-cache.js");
const { eventStreamService } = await import("../../src/events/event-stream-service.js");

/** containers-service.md — the containers kind's own period. */
const CONTAINER_PERIOD_MS = 20_000;
/** volumes-service.md and networks-service.md — the two derived kinds' own period. */
const DERIVED_PERIOD_MS = 30_000;

const VOLUME_NAME = "derived-data";
const OTHER_VOLUME_NAME = "derived-other-data";
const NETWORK_NAME = "derived-net";
const OTHER_NETWORK_NAME = "derived-other-net";
const CONTAINER_NAME = "deriving-container";
const CONTAINER_ID = "c".repeat(64);
const SECOND_CONTAINER_NAME = "deriving-container-2";
const SECOND_CONTAINER_ID = "d".repeat(64);
const NETWORK_ID = "n".repeat(64);

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

/** The container of most cases here: on neither the volume nor the network to begin with. */
function loneContainer(mounts: string[] = [], networks: string[] = []): unknown[] {
  return [containerEntry(CONTAINER_ID, CONTAINER_NAME, mounts, networks)];
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
 * `/containers/json`. The whole path is what REQ-54 is counted on.
 */
function containerListCalls(): number {
  return engine.calls.filter((call) => call.path.startsWith("/containers/json")).length;
}

function volumeListCalls(): number {
  return engine.calls.filter((call) => call.path === "/volumes").length;
}

function networkListCalls(): number {
  return engine.calls.filter((call) => call.path === "/networks").length;
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

/** The mounting containers the volume list reports for this file's own volume. */
async function mountedBy(): Promise<string[]> {
  const volumes = (await volumeListCache.read()).value;
  const found = volumes.find((volume) => volume.name === VOLUME_NAME);
  assert.ok(found, "the fixture volume is not in the volume list at all");
  return found.mountedBy;
}

/** The attached containers the network list reports for this file's own network. */
async function attachedContainers(): Promise<string[]> {
  const networks = (await networkListCache.read()).value;
  const found = networks.find((network) => network.name === NETWORK_NAME);
  assert.ok(found, "the fixture network is not in the network list at all");
  return found.attachedContainers;
}

beforeEach(() => {
  // The cache is process-wide and its refreshers outlive the test that started
  // them: without this, one case is served what another one's read put there.
  resetRefreshCache();
  engine.reset();
  containerPayload = loneContainer();
  uptimeSeconds = 0;
  // Every read answers with a listing of its own, carrying the humanized uptime
  // a real host's answer moves on every read — the field the declaration
  // deliberately leaves out (containers-service.md).
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
  engine.on("GET", "/networks", () =>
    [NETWORK_NAME, OTHER_NETWORK_NAME].map((name, index) => ({
      Id: `${NETWORK_ID.slice(0, 63)}${index}`,
      Name: name,
      Driver: "bridge",
      Scope: "local",
    })),
  );
  engine.on("GET", "/system/df", () => ({ LayersSize: 0, Images: [], Containers: [], Volumes: [], BuildCache: [] }));
});

/**
 * Brings the cache to the state every case here needs: the derived lists held,
 * and the container listing they were built on held under them (REQ-56). The
 * clock is then a full grouping window clear of the last read, so what the case
 * does next is not folded into a read that has just happened.
 */
async function holdListsBuiltOnTheListing(): Promise<void> {
  await volumeListCache.read();
  await networkListCache.read();
  // The first volume sizes to arrive ask the volume list to be read again; that
  // read belongs to the warm-up and not to what a case counts afterwards.
  await settle();
  await advance(EVENT_GROUPING_WINDOW_MS + 250);
}

// REQ-52 — "When the container listing the server holds is replaced by a different one, the lists
// derived from it … are read again within a grouping window instead of waiting out their own
// period." The `container` event marks the volume list due beside the container listing, and its
// read is served the listing held before the replacement — so what closes this is the volume list
// being read once more, after the replacement was stored.
test("the volume list names the container that gained a mount in the replacement listing", async () => {
  mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  try {
    await holdListsBuiltOnTheListing();
    assert.deepEqual(await mountedBy(), [], "the container mounts the volume before the case has changed anything");

    // The daemon now reports the container mounting the volume.
    containerPayload = loneContainer([VOLUME_NAME], []);
    eventStreamService.emit("event", daemonEvent("container", "start"));
    await settle();

    // Nothing waits for the answer: the clock is advanced by the window the
    // contract names, once, and the list is read once (REQ-57).
    await advance(EVENT_GROUPING_WINDOW_MS + 250);

    assert.deepEqual(
      await mountedBy(),
      [CONTAINER_NAME],
      "the volume list still describes the container listing that was replaced",
    );
  } finally {
    mock.timers.reset();
  }
});

// REQ-52, the other derived list — networks-service.md: `attachedContainers` comes from the held
// container listing, so a listing replaced by a different one makes the network list read again.
test("the network list names the container attached only in the replacement listing", async () => {
  mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  try {
    await holdListsBuiltOnTheListing();
    assert.deepEqual(await attachedContainers(), [], "the container is on the network before the case has changed anything");

    containerPayload = loneContainer([], [NETWORK_NAME]);
    eventStreamService.emit("event", daemonEvent("container", "start"));
    await settle();

    await advance(EVENT_GROUPING_WINDOW_MS + 250);

    assert.deepEqual(
      await attachedContainers(),
      [CONTAINER_NAME],
      "the network list still describes the container listing that was replaced",
    );
  } finally {
    mock.timers.reset();
  }
});

// REQ-52 — containers-service.md: the declaration covers the container's **name**, which is what a
// derived list displays. Nothing is emitted here: the replacement is stored by the container
// listing's own re-read, so the only thing that can make the volume list follow it is the listing
// telling it.
test("a container renamed in the replacement listing is renamed in the volume list", async () => {
  mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  try {
    containerPayload = loneContainer([VOLUME_NAME], []);
    await holdListsBuiltOnTheListing();
    assert.deepEqual(await mountedBy(), [CONTAINER_NAME]);

    containerPayload = [containerEntry(CONTAINER_ID, "renamed-container", [VOLUME_NAME], [])];
    containerListCache.markChanged();
    await settle();
    await advance(EVENT_GROUPING_WINDOW_MS + 250);

    assert.deepEqual(
      await mountedBy(),
      ["renamed-container"],
      "the volume list still names the container as the replaced listing did",
    );
  } finally {
    mock.timers.reset();
  }
});

// REQ-53 — "A container listing read again and found unchanged makes no derived list read again:
// the container listing's own period drags no volume-list and no network-list read behind it."
// The host is idle, and every read still answers with a listing of its own carrying a moved
// `Status`: a comparison of the whole value would report a difference on each of them and drag a
// volume-list and a network-list read behind every container period.
test("a container listing read again and unchanged drags no derived read behind it", async () => {
  mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  try {
    containerPayload = loneContainer([VOLUME_NAME], [NETWORK_NAME]);
    await holdListsBuiltOnTheListing();
    const baseline = {
      containers: containerListCalls(),
      volumes: volumeListCalls(),
      networks: networkListCalls(),
    };

    // A window of two whole container periods: 40 s, which is also one whole
    // period of each derived kind and short of the 60 s demand expiry.
    const window = CONTAINER_PERIOD_MS * 2;
    await advance(window + 1_000);

    assert.equal(
      containerListCalls() - baseline.containers,
      window / CONTAINER_PERIOD_MS,
      "the container listing was not read on its own period, so this case measures nothing",
    );
    assert.equal(
      volumeListCalls() - baseline.volumes,
      Math.floor(window / DERIVED_PERIOD_MS),
      "the volume list was read more than its own period asks for: an unchanged listing told it it had changed",
    );
    assert.equal(
      networkListCalls() - baseline.networks,
      Math.floor(window / DERIVED_PERIOD_MS),
      "the network list was read more than its own period asks for: an unchanged listing told it it had changed",
    );
  } finally {
    mock.timers.reset();
  }
});

// REQ-53 — containers-service.md: the declaration compares the containers, their mounts and their
// attachments "in an order of this service's own so that the same containers returned in another
// order — containers, mounts or attachments — are not a difference". The daemon guarantees no
// order, so a listing arriving shuffled must cost nothing.
test("the same containers returned in another order are not a different listing", async () => {
  mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  try {
    containerPayload = [
      containerEntry(CONTAINER_ID, CONTAINER_NAME, [VOLUME_NAME, OTHER_VOLUME_NAME], [NETWORK_NAME, OTHER_NETWORK_NAME]),
      containerEntry(SECOND_CONTAINER_ID, SECOND_CONTAINER_NAME, [OTHER_VOLUME_NAME], [OTHER_NETWORK_NAME]),
    ];
    await holdListsBuiltOnTheListing();
    const volumeLists = volumeListCalls();
    const networkLists = networkListCalls();

    // The same two containers, the same mounts and the same attachments — every
    // sequence reversed.
    containerPayload = [
      containerEntry(SECOND_CONTAINER_ID, SECOND_CONTAINER_NAME, [OTHER_VOLUME_NAME], [OTHER_NETWORK_NAME]),
      containerEntry(CONTAINER_ID, CONTAINER_NAME, [OTHER_VOLUME_NAME, VOLUME_NAME], [OTHER_NETWORK_NAME, NETWORK_NAME]),
    ];
    containerListCache.markChanged();
    await settle();
    await advance(EVENT_GROUPING_WINDOW_MS + 250);

    assert.equal(volumeListCalls(), volumeLists, "a listing that only came back shuffled made the volume list read again");
    assert.equal(networkListCalls(), networkLists, "a listing that only came back shuffled made the network list read again");
  } finally {
    mock.timers.reset();
  }
});

// REQ-54 — "The derived lists are still built from the one container listing the server holds:
// closing this costs no further call to the daemon, and no list goes back to asking for a container
// listing of its own." Counted across the whole sequence, the replacement included: the two derived
// lists are read twice each here, and every one of those reads is served the one held listing.
test("the derived re-reads add no container listing read of any form", async () => {
  mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  try {
    await holdListsBuiltOnTheListing();
    const listingsAfterWarmUp = containerListCalls();
    const volumeListsAfterWarmUp = volumeListCalls();
    const networkListsAfterWarmUp = networkListCalls();

    containerPayload = loneContainer([VOLUME_NAME], [NETWORK_NAME]);
    eventStreamService.emit("event", daemonEvent("container", "start"));
    await settle();
    await advance(EVENT_GROUPING_WINDOW_MS + 250);

    assert.deepEqual(await mountedBy(), [CONTAINER_NAME], "the volume list never followed the replaced listing");
    assert.deepEqual(await attachedContainers(), [CONTAINER_NAME], "the network list never followed the replaced listing");

    assert.ok(
      volumeListCalls() > volumeListsAfterWarmUp && networkListCalls() > networkListsAfterWarmUp,
      "neither derived list was read again, so there is no derived re-read to count the cost of",
    );
    assert.equal(
      containerListCalls() - listingsAfterWarmUp,
      1,
      "the derived re-reads cost a container listing of their own beside the one the server holds",
    );
  } finally {
    mock.timers.reset();
  }
});
