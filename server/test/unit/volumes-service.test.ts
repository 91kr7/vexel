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

const { listVolumes, getVolumeInspect, createVolume, removeVolume, pruneVolumes } = await import(
  "../../src/volumes/volumes-service.js"
);

beforeEach(() => {
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

// volumes-service.md — sizeBytes comes from /system/df's per-volume UsageData.Size
test("listVolumes reads sizeBytes from /system/df's matching volume", async () => {
  volumesBody = JSON.stringify({ Volumes: [{ Name: "vol-a", Driver: "local", Mountpoint: "/data/vol-a", Scope: "local" }] });
  dfBody = JSON.stringify({ Volumes: [{ Name: "vol-a", UsageData: { Size: 4096 } }] });

  const volumes = await listVolumes();

  assert.equal(volumes[0]!.sizeBytes, 4096);
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
