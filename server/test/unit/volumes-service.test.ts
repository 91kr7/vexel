import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DockerDaemonError } from "../../src/docker/errors.js";

// The service talks to the daemon only through the shared EngineClient: the
// mock stands in for it, so the size/mountedBy merge, the create/prune request
// shaping and daemon-failure propagation are the only behaviours under test.
let volumesBody = "[]";
let dfBody = "{}";
let containersBody = "[]";
let inspectBody = "{}";
let createResponseBody = "{}";
let pruneResponseBody = "{}";
let requestFailure: Error | undefined;
const requestedPaths: string[] = [];
let lastRequestInit: { method?: string; body?: string } | undefined;

mock.module(new URL("../../src/connectivity/connection-status-service.ts", import.meta.url).href, {
  namedExports: {
    getEngineClient: () => ({
      request: async (path: string, init?: { method?: string; body?: string }) => {
        requestedPaths.push(path);
        lastRequestInit = init;
        if (requestFailure) throw requestFailure;
        if (path === "/volumes") return { statusCode: 200, body: volumesBody };
        if (path === "/system/df") return { statusCode: 200, body: dfBody };
        if (path === "/containers/json?all=true") return { statusCode: 200, body: containersBody };
        if (path.startsWith("/volumes/") && path.endsWith("?force=true")) return { statusCode: 204, body: "" };
        if (path === "/volumes/create") return { statusCode: 201, body: createResponseBody };
        if (path.startsWith("/volumes/prune")) return { statusCode: 200, body: pruneResponseBody };
        if (path.startsWith("/volumes/")) return { statusCode: 200, body: inspectBody };
        throw new Error(`unexpected path: ${path}`);
      },
    }),
  },
});

const { listVolumes, getVolumeInspect, createVolume, removeVolume, pruneVolumes, volumeSizeCache } = await import(
  "../../src/volumes/volumes-service.js"
);
const { resetRefreshCache } = await import("../../src/refresh-cache/refresh-cache.js");

beforeEach(() => {
  // The sizes are held process-wide and their refresher outlives the test that
  // started it: without this, a removal in one test marks them due and the
  // /system/df read that follows lands among the next test's recorded paths.
  resetRefreshCache();
  volumesBody = "[]";
  dfBody = "{}";
  containersBody = "[]";
  inspectBody = "{}";
  createResponseBody = "{}";
  pruneResponseBody = "{}";
  requestFailure = undefined;
  requestedPaths.length = 0;
  lastRequestInit = undefined;
});

// volumes-service.md — sizeBytes is undefined when the daemon has not computed disk usage for that volume yet
test("listVolumes leaves sizeBytes undefined for a volume /system/df has no usage data for", async () => {
  volumesBody = JSON.stringify({ Volumes: [{ Name: "vol-a", Driver: "local", Mountpoint: "/data/vol-a", Scope: "local" }] });
  dfBody = JSON.stringify({ Volumes: [{ Name: "vol-other", UsageData: { Size: 1024 } }] });

  const volumes = await listVolumes();

  assert.equal(volumes[0]!.sizeBytes, undefined);
});

// volumes-service.md — sizeBytes is joined in from the held sizes, never read by the listing: a
// volume no size is held for yet is listed without one and gains it on a later read
// (plan-docker_management_app-refresh_cache/REQ-18, REQ-19)
test("listVolumes joins in a held size, and lists a volume without one until a size is held", async () => {
  volumesBody = JSON.stringify({ Volumes: [{ Name: "vol-a", Driver: "local", Mountpoint: "/data/vol-a", Scope: "local" }] });
  dfBody = JSON.stringify({ Volumes: [{ Name: "vol-a", UsageData: { Size: 4096 } }] });

  const beforeAnySizeIsHeld = await listVolumes();
  assert.equal(
    beforeAnySizeIsHeld[0]!.sizeBytes,
    undefined,
    "the listing waited for a size instead of listing the volume without one",
  );

  await volumeSizeCache.read();
  const afterTheSizesArrived = await listVolumes();

  assert.equal(afterTheSizesArrived[0]!.sizeBytes, 4096);
});

// volumes-service.md — mountedBy carries the names of every container (running or stopped) whose
// mounts reference the volume; empty for an unattached volume
test("listVolumes reports the containers mounting a volume, and an empty list for an unattached one", async () => {
  volumesBody = JSON.stringify({
    Volumes: [
      { Name: "attached", Driver: "local", Mountpoint: "/data/attached", Scope: "local" },
      { Name: "unattached", Driver: "local", Mountpoint: "/data/unattached", Scope: "local" },
    ],
  });
  containersBody = JSON.stringify([
    { Names: ["/consumer-a"], Mounts: [{ Type: "volume", Name: "attached" }] },
    { Names: ["/consumer-b"], Mounts: [{ Type: "volume", Name: "attached" }] },
    { Names: ["/consumer-c"], Mounts: [{ Type: "bind", Name: "attached" }] },
  ]);

  const volumes = await listVolumes();

  const attached = volumes.find((volume) => volume.name === "attached")!;
  const unattached = volumes.find((volume) => volume.name === "unattached")!;
  assert.deepEqual(attached.mountedBy.sort(), ["consumer-a", "consumer-b"]);
  assert.deepEqual(unattached.mountedBy, []);
});

// volumes-service.md — every call rejects with a DockerDaemonError carrying the daemon's own message on failure
test("listVolumes rejects with the daemon's own error message on failure", async () => {
  requestFailure = new DockerDaemonError("DaemonRejected", "server error - please retry");

  await assert.rejects(() => listVolumes(), /server error - please retry/);
});

interface RawVolumeFixture {
  Name: string;
  Driver: string;
  Mountpoint: string;
  Scope: string;
  CreatedAt?: string;
}

function volume(name: string, createdAt?: string): RawVolumeFixture {
  const fixture: RawVolumeFixture = { Name: name, Driver: "local", Mountpoint: `/data/${name}`, Scope: "local" };
  if (createdAt !== undefined) fixture.CreatedAt = createdAt;
  return fixture;
}

/** A name of exactly 64 hexadecimal characters — the shape the daemon generates for a volume nobody named. */
function hexName(prefix: string): string {
  return prefix + "0".repeat(64 - prefix.length);
}

/** The listed names in the order they came back: a volume carries no identifier but its name, so the name is the whole sequence. */
async function listedNames(payload: RawVolumeFixture[]): Promise<string[]> {
  volumesBody = JSON.stringify({ Volumes: payload });
  const volumes = await listVolumes();
  return volumes.map((entry) => entry.name);
}

// volumes-service.md — "every named volume comes before every anonymous one, ordered by name under
// the list-order rule", "the anonymous ones follow as one block, newest first by createdAt"
// (REQ-13, REQ-14)
test("listVolumes orders named volumes by name ahead of every anonymous one, the anonymous block newest first", async () => {
  const older = hexName("b2");
  const newer = hexName("a1");

  const names = await listedNames([
    volume(older, "2026-01-02T00:00:00Z"),
    volume("vol-10", "2026-01-01T00:00:00Z"),
    volume(newer, "2026-01-03T00:00:00Z"),
    volume("api-data", "2026-01-01T00:00:00Z"),
    volume("vol-2", "2026-01-01T00:00:00Z"),
    volume("Backup", "2026-01-01T00:00:00Z"),
  ]);

  assert.deepEqual(names, ["api-data", "Backup", "vol-2", "vol-10", newer, older]);
});

// volumes-service.md — "the anonymous ones follow as one block, newest first by createdAt, with the
// name compared exactly as the final comparison" (REQ-14): two anonymous volumes created in the
// same instant are separated by their names rather than left in the daemon's order.
test("listVolumes separates two anonymous volumes sharing a creation instant by their names, both ways round", async () => {
  const first = hexName("aa");
  const second = hexName("ab");

  const forwards = await listedNames([volume(second, "2026-01-01T00:00:00Z"), volume(first, "2026-01-01T00:00:00Z")]);
  const backwards = await listedNames([volume(first, "2026-01-01T00:00:00Z"), volume(second, "2026-01-01T00:00:00Z")]);

  assert.deepEqual(forwards, [first, second]);
  assert.deepEqual(backwards, forwards);
});

// list-order.md — "a row with no creation instant comes after the rows that have one", then the
// exact name comparison separates them (REQ-14, REQ-16)
test("listVolumes places an anonymous volume with no creation instant after those carrying one, separated by name", async () => {
  const dated = hexName("cc");
  const undatedFirst = hexName("da");
  const undatedSecond = hexName("db");

  const forwards = await listedNames([volume(undatedSecond), volume(undatedFirst), volume(dated, "2026-01-01T00:00:00Z")]);
  const backwards = await listedNames([volume(dated, "2026-01-01T00:00:00Z"), volume(undatedFirst), volume(undatedSecond)]);

  assert.deepEqual(forwards, [dated, undatedFirst, undatedSecond]);
  assert.deepEqual(backwards, forwards);
});

// volumes-service.md — "A volume is anonymous when its name is exactly 64 hexadecimal characters",
// "a volume an operator deliberately named with 64 hexadecimal characters is grouped with the
// anonymous ones: no heuristic rescues it" (REQ-15)
test("listVolumes groups any name of exactly 64 hexadecimal characters with the anonymous ones, and nothing else", async () => {
  const daemonShaped = hexName("f1");
  const upperCase = hexName("AB").toUpperCase();
  const tooShort = hexName("e1").slice(0, 63);
  const notHex = `${hexName("e2").slice(0, 63)}z`;

  const names = await listedNames([
    volume(daemonShaped, "2026-01-02T00:00:00Z"),
    volume(upperCase, "2026-01-03T00:00:00Z"),
    volume(tooShort, "2026-01-01T00:00:00Z"),
    volume(notHex, "2026-01-01T00:00:00Z"),
  ]);

  assert.deepEqual(names, [tooShort, notHex, upperCase, daemonShaped]);
});

// volumes-service.md — "with the name compared exactly as the final comparison ..., so data and Data
// are separated rather than tied" (REQ-5, REQ-13)
test("listVolumes separates two named volumes whose names differ only in case, both ways round", async () => {
  const forwards = await listedNames([volume("data", "2026-01-01T00:00:00Z"), volume("Data", "2026-01-01T00:00:00Z")]);
  const backwards = await listedNames([volume("Data", "2026-01-01T00:00:00Z"), volume("data", "2026-01-01T00:00:00Z")]);

  assert.deepEqual(forwards, ["Data", "data"]);
  assert.deepEqual(backwards, forwards);
});

// volumes-service.md — "The same volumes produce the same sequence on every read, whatever order the
// daemon supplied them in" (REQ-6, REQ-16): the only check that detects a missing final comparison,
// since a sort that is stable keeps whatever the payload happened to say.
test("listVolumes produces one sequence whichever order the daemon supplied the volumes in", async () => {
  const newestAnonymous = hexName("ba");
  const oldestAnonymous = hexName("bb");
  const payload = [
    volume("vol-1", "2026-01-01T00:00:00Z"),
    volume(oldestAnonymous, "2026-01-01T00:00:00Z"),
    volume("Data", "2026-01-01T00:00:00Z"),
    volume("vol-10", "2026-01-01T00:00:00Z"),
    volume(newestAnonymous, "2026-01-05T00:00:00Z"),
    volume("data", "2026-01-01T00:00:00Z"),
    volume("vol-01", "2026-01-01T00:00:00Z"),
    volume("vol-2", "2026-01-01T00:00:00Z"),
  ];

  const forwards = await listedNames(payload);
  const backwards = await listedNames([...payload].reverse());

  assert.deepEqual(forwards, [
    "Data",
    "data",
    "vol-01",
    "vol-1",
    "vol-2",
    "vol-10",
    newestAnonymous,
    oldestAnonymous,
  ]);
  assert.deepEqual(backwards, forwards);
});

// volumes-service.md — getVolumeInspect returns VolumeSummary & { raw }, raw being the full payload as received
test("getVolumeInspect carries the raw payload exactly as received, alongside the summary fields", async () => {
  const raw = { Name: "vol-a", Driver: "local", Mountpoint: "/data/vol-a", Scope: "local", ExtraDaemonField: "kept as-is" };
  inspectBody = JSON.stringify(raw);

  const inspect = await getVolumeInspect("vol-a");

  assert.equal(inspect.name, "vol-a");
  assert.deepEqual(inspect.raw, raw);
});

// volumes-service.md — createVolume(input) posts to /volumes/create (REQ-71)
test("createVolume posts the given name, driver, driver options and labels to /volumes/create", async () => {
  createResponseBody = JSON.stringify({ Name: "pgdata", Driver: "local", Mountpoint: "/data/pgdata", Scope: "local" });

  await createVolume({ name: "pgdata", driver: "local", driverOpts: { type: "tmpfs" }, labels: { team: "vexel" } });

  assert.equal(requestedPaths.at(-1), "/volumes/create");
  const body = JSON.parse(lastRequestInit!.body!) as Record<string, unknown>;
  assert.equal(body.Name, "pgdata");
  assert.equal(body.Driver, "local");
  assert.deepEqual(body.DriverOpts, { type: "tmpfs" });
  assert.deepEqual(body.Labels, { team: "vexel" });
});

// volumes-service.md — an empty/blank name lets the daemon generate one
test("createVolume omits the Name field for a blank name, letting the daemon generate one", async () => {
  createResponseBody = JSON.stringify({ Name: "generated", Driver: "local", Mountpoint: "/data/generated", Scope: "local" });

  await createVolume({ name: "   " });

  const body = JSON.parse(lastRequestInit!.body!) as Record<string, unknown>;
  assert.equal(body.Name, undefined);
});

// volumes-service.md — removeVolume force-removes via DELETE /volumes/{name}?force=true
test("removeVolume issues a force DELETE against the volume's own path", async () => {
  await removeVolume("pgdata");

  assert.equal(requestedPaths.at(-1), "/volumes/pgdata?force=true");
});

// volumes-service.md — pruneVolumes prunes every currently unused volume (named or anonymous), not just anonymous ones
test("pruneVolumes requests prune with the all:true filter and reports removed names and reclaimed bytes", async () => {
  pruneResponseBody = JSON.stringify({ VolumesDeleted: ["orphan-1", "orphan-2"], SpaceReclaimed: 2048 });

  const result = await pruneVolumes();

  const requestedPath = requestedPaths.at(-1)!;
  assert.ok(requestedPath.startsWith("/volumes/prune?filters="));
  const filters = JSON.parse(decodeURIComponent(requestedPath.split("filters=")[1]!)) as { all: string[] };
  assert.deepEqual(filters, { all: ["true"] });
  assert.deepEqual(result.removedNames, ["orphan-1", "orphan-2"]);
  assert.equal(result.reclaimedBytes, 2048);
});
