import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { installEngineMock } from "../support/engine-mock.js";
import type { DaemonEvent } from "../../src/events/event-stream-service.js";

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
const { attachContainer, detachContainer, listNetworks, networkListCache } = await import(
  "../../src/networks/networks-service.js"
);
const { getSystemOverview } = await import("../../src/system/overview-service.js");
const { resetRefreshCache, DEMAND_EXPIRY_MS } = await import("../../src/refresh-cache/refresh-cache.js");
const { eventStreamService } = await import("../../src/events/event-stream-service.js");

/** containers-service.md — the containers kind's own period. */
const CONTAINER_PERIOD_MS = 20_000;

const VOLUME_NAME = "shared-data";
const NETWORK_NAME = "shared-net";
const GHOST_NAME = "ghost";
const NETWORK_ID = "n".repeat(64);
const CONTAINER_ID = "a".repeat(64);

/** A running container as `GET /containers/json?all=true` reports one, mounting the volume and on the network. */
function ghostContainer(): unknown {
  return {
    Id: CONTAINER_ID,
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

/** A republished daemon event, as the cache's own listener receives one. */
function daemonEvent(type: string, action: string): DaemonEvent {
  return { id: `${type}-${action}-${Math.random()}`, timestamp: new Date().toISOString(), type, action };
}

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
  engine.on("GET", "/networks", () => [{ Id: NETWORK_ID, Name: NETWORK_NAME, Driver: "bridge", Scope: "local" }]);
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

/** The same container, off the network: what the daemon reports before an attach and after a detach. */
function detachedContainer(): unknown {
  return { ...(ghostContainer() as Record<string, unknown>), NetworkSettings: { Networks: {} } };
}

/**
 * The daemon as it behaves around an attach: the connect call puts the
 * container on the network, the disconnect takes it off, and both show in the
 * container listing that is read afterwards — which is where the attachments
 * are now read from.
 */
function daemonAttachesOnConnect(): void {
  engine.on("POST", /^\/networks\/[^/]+\/connect$/, () => {
    containerPayload = [ghostContainer()];
    return {};
  });
  engine.on("POST", /^\/networks\/[^/]+\/disconnect$/, () => {
    containerPayload = [detachedContainer()];
    return {};
  });
  engine.on("GET", /^\/networks\/[^/]+$/, () => ({
    Id: NETWORK_ID,
    Name: NETWORK_NAME,
    Driver: "bridge",
    Scope: "local",
    Containers: {},
  }));
}

/**
 * An operator's action lands a measurable instant after the listing that was
 * held before it. A mocked daemon answers inside a single millisecond, which a
 * real one never does, and "the value was read before the change" is measured
 * in whole milliseconds.
 */
function anInstantPasses(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 5));
}

// REQ-38 — networks-service.md: "An attach or a detach says it of the container listing as well,
// and of that one first, in the same synchronous step … Marking the container listing first is what
// makes the network refresh that immediately follows await a read covering the change rather than
// the one before it." Marking only the network kind — or marking it first — leaves this red.
test("the next network list carries the container the application has just attached", async () => {
  containerPayload = [detachedContainer()];
  daemonAttachesOnConnect();

  const before = await networkListCache.read();
  assert.deepEqual(before.value[0]!.attachedContainers, [], "the container is on the network before the attach");
  await anInstantPasses();

  await attachContainer(NETWORK_ID, CONTAINER_ID);

  const after = await networkListCache.read();
  assert.deepEqual(
    after.value[0]!.attachedContainers,
    [GHOST_NAME],
    "the network list does not name the container the application had just attached",
  );
});

// REQ-38 — the other half of the same rule: a detach is equally an operation on a container.
test("the next network list no longer carries the container the application has just detached", async () => {
  containerPayload = [ghostContainer()];
  daemonAttachesOnConnect();

  const before = await networkListCache.read();
  assert.deepEqual(before.value[0]!.attachedContainers, [GHOST_NAME]);
  await anInstantPasses();

  await detachContainer(NETWORK_ID, CONTAINER_ID);

  const after = await networkListCache.read();
  assert.deepEqual(
    after.value[0]!.attachedContainers,
    [],
    "the network list still names the container the application had just detached",
  );
});

// REQ-38, the cold path — refresh-cache.md: markChanged "does nothing while nobody is asking for the
// kind: there is no held value to correct", and a kind holding nothing "waits for a read". So an
// attach performed before anything was ever asked for needs no case of its own: the first ask reads
// the daemon as it is after the attach.
test("an attach made before anything was ever asked for is carried by the very first network list", async () => {
  containerPayload = [detachedContainer()];
  daemonAttachesOnConnect();
  assert.equal(containerListCache.isRefreshing(), false, "something was already asking for the container listing");

  await attachContainer(NETWORK_ID, CONTAINER_ID);

  const first = await networkListCache.read();
  assert.deepEqual(first.value[0]!.attachedContainers, [GHOST_NAME]);
});

// REQ-44 — "The held container listing is marked due by the daemon's network events as well as its
// container ones, because a container's network attachments are part of what that listing now
// carries" (containers-service.md — "What invalidates this listing is stated on the kind, not left
// to the routes"). The application says nothing here: the event alone is what invalidates it.
test("a network event makes the held container listing be read again, and an undeclared type does not", async () => {
  mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  try {
    await readContainerList();
    const afterTheFirstRead = containerListCalls();

    // Clear of the grouping window, so what follows is not folded into the read
    // that has just happened.
    await advance(1_000);
    eventStreamService.emit("event", daemonEvent("image", "pull"));
    await advance(1_000);
    assert.equal(
      containerListCalls(),
      afterTheFirstRead,
      "an event of a type the container listing does not declare made it read again",
    );

    eventStreamService.emit("event", daemonEvent("network", "connect"));
    await settle();

    assert.equal(
      containerListCalls(),
      afterTheFirstRead + 1,
      "a network event did not make the held container listing be read again",
    );
  } finally {
    mock.timers.reset();
  }
});
