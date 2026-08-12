import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DockerDaemonError } from "../../src/docker/errors.js";
import { installEngineMock } from "../support/engine-mock.js";

// The plugins the daemon itself runs (plugins/specs/daemon-plugins-service.md,
// REQ-99). The daemon is mocked: what is under test is what the service derives
// from the Engine API's answer — the interface said in words, the ordering, the
// difference between "none installed" and "cannot be read" — and the name
// alphabet that stops a name from walking out of the `/plugins` route.
const engine = installEngineMock();

const { listDaemonPlugins, getDaemonPlugin, inspectPlugin } = await import("../../src/plugins/daemon-plugins-service.js");

interface RawOverrides {
  Id?: string;
  Name?: string;
  Enabled?: boolean;
  PluginReference?: string;
  types?: string[];
  Description?: string;
  Config?: Record<string, unknown>;
}

function rawPlugin(overrides: RawOverrides = {}): Record<string, unknown> {
  const {
    Id = "plugin-id",
    Name = "vieux/sshfs:latest",
    Enabled = false,
    PluginReference = "docker.io/vieux/sshfs:latest",
    types = ["docker.volumedriver/1.0"],
    Description = "sshfs plugin for Docker",
    Config = {},
  } = overrides;
  return {
    Id,
    Name,
    Enabled,
    PluginReference,
    Config: { Description, Interface: { Types: types }, ...Config },
  };
}

beforeEach(() => {
  engine.reset();
  engine.on("GET", "/plugins", () => []);
});

// daemon-plugins-service.md — DaemonPlugin = id, name, reference?, enabled, interfaceTypes, type,
// description?
test("listDaemonPlugins reports each plugin with its id, name, reference, state and interfaces", async () => {
  engine.on("GET", "/plugins", () => [rawPlugin({ Id: "abc123", Enabled: true })]);

  const listing = await listDaemonPlugins();

  assert.equal(listing.unavailableReason, undefined);
  assert.deepEqual(listing.items, [
    {
      id: "abc123",
      name: "vieux/sshfs:latest",
      reference: "docker.io/vieux/sshfs:latest",
      enabled: true,
      interfaceTypes: ["docker.volumedriver/1.0"],
      type: "volume driver",
      description: "sshfs plugin for Docker",
    },
  ]);
});

// daemon-plugins-service.md — "type reads 'volume driver', 'network driver', 'IPAM driver',
// 'log driver', 'authorization', 'secret provider' or 'metrics collector'"
test("listDaemonPlugins says each interface in words", async () => {
  const expected: [string, string][] = [
    ["docker.volumedriver/1.0", "volume driver"],
    ["docker.networkdriver/1.0", "network driver"],
    ["docker.ipamdriver/1.0", "IPAM driver"],
    ["docker.logdriver/1.0", "log driver"],
    ["docker.authz/1.0", "authorization"],
    ["docker.secretprovider/1.0", "secret provider"],
    ["docker.metricscollector/1.0", "metrics collector"],
  ];
  engine.on("GET", "/plugins", () =>
    expected.map(([type], index) => rawPlugin({ Name: `p${index}`, types: [type] })),
  );

  const { items } = await listDaemonPlugins();

  assert.deepEqual(
    items.map((plugin) => plugin.type),
    expected.map(([, label]) => label),
  );
});

// daemon-plugins-service.md — "an interface with no such wording is shown as the daemon names it,
// and a plugin declaring none reads 'plugin'"
test("listDaemonPlugins shows an unknown interface as the daemon names it, and 'plugin' when none is declared", async () => {
  engine.on("GET", "/plugins", () => [
    rawPlugin({ Name: "exotic", types: ["docker.somethingelse/2.0"] }),
    rawPlugin({ Name: "bare", types: [] }),
  ]);

  const { items } = await listDaemonPlugins();
  const byName = new Map(items.map((plugin) => [plugin.name, plugin.type]));

  assert.equal(byName.get("exotic"), "docker.somethingelse");
  assert.equal(byName.get("bare"), "plugin");
});

// daemon-plugins-service.md — "The items come back ordered by name."
test("listDaemonPlugins orders the items by name", async () => {
  engine.on("GET", "/plugins", () => [rawPlugin({ Name: "zeta:latest" }), rawPlugin({ Name: "alpha:latest" }), rawPlugin({ Name: "mid:latest" })]);

  const { items } = await listDaemonPlugins();

  assert.deepEqual(
    items.map((plugin) => plugin.name),
    ["alpha:latest", "mid:latest", "zeta:latest"],
  );
});

// daemon-plugins-service.md — "ordered by plugin name under the list-order rule (compareNames)":
// digit runs read as numbers, case not splitting the list into two alphabets (REQ-23).
test("listDaemonPlugins reads digit runs in a plugin name as numbers, and keeps case together", async () => {
  engine.on("GET", "/plugins", () => [
    rawPlugin({ Id: "p1", Name: "driver-10:latest" }),
    rawPlugin({ Id: "p2", Name: "DRIVER-3:latest" }),
    rawPlugin({ Id: "p3", Name: "driver-2:latest" }),
  ]);

  const { items } = await listDaemonPlugins();

  assert.deepEqual(
    items.map((plugin) => plugin.name),
    ["driver-2:latest", "DRIVER-3:latest", "driver-10:latest"],
  );
});

// daemon-plugins-service.md — "with the plugin's id as the final comparison, so two plugins whose
// names differ only in case or in leading zeros never tie; the same plugins produce the same
// sequence on every read" (REQ-25, REQ-6).
test("listDaemonPlugins produces one sequence for tying plugin names, in either input order", async () => {
  const daemonOrder = [
    rawPlugin({ Id: "pl-b", Name: "Sshfs:latest" }),
    rawPlugin({ Id: "pl-a", Name: "sshfs:latest" }),
    rawPlugin({ Id: "pl-d", Name: "loki-1:latest" }),
    rawPlugin({ Id: "pl-c", Name: "loki-01:latest" }),
  ];
  const expected = ["pl-c", "pl-d", "pl-a", "pl-b"];

  engine.on("GET", "/plugins", () => daemonOrder);
  const asListed = (await listDaemonPlugins()).items.map((plugin) => plugin.id);

  engine.on("GET", "/plugins", () => [...daemonOrder].reverse());
  const reversed = (await listDaemonPlugins()).items.map((plugin) => plugin.id);

  assert.deepEqual(asListed, expected);
  assert.deepEqual(reversed, expected, "the same plugins must come out the same way in either input order");
});

// daemon-plugins-service.md — "A daemon that exposes the plugin API and has no plugin answers with
// an empty listing and **no** reason: 'none installed' and 'cannot be read' are never told apart by
// an empty list alone."
test("listDaemonPlugins answers with an empty listing and no reason when the daemon simply has no plugin", async () => {
  engine.on("GET", "/plugins", () => []);

  const listing = await listDaemonPlugins();

  assert.deepEqual(listing.items, []);
  assert.equal(listing.unavailableReason, undefined);
});

// daemon-plugins-service.md — "A daemon that does not expose managed plugins at all -> an empty
// listing whose unavailableReason quotes the daemon"
test("listDaemonPlugins states the reason, quoting the daemon, when the daemon exposes no plugin API", async () => {
  for (const statusCode of [404, 501]) {
    engine.reset();
    engine.on("GET", "/plugins", () => {
      throw new DockerDaemonError("DaemonRejected", `page not found (${statusCode})`, undefined, statusCode);
    });

    const listing = await listDaemonPlugins();

    assert.deepEqual(listing.items, []);
    assert.ok((listing.unavailableReason ?? "").includes(`page not found (${statusCode})`), String(listing.unavailableReason));
  }
});

// daemon-plugins-service.md — "any other daemon failure is raised"
test("listDaemonPlugins raises any other daemon failure rather than reporting an empty inventory", async () => {
  engine.on("GET", "/plugins", () => {
    throw new DockerDaemonError("DaemonUnreachable", "cannot connect to the Docker daemon", undefined, 500);
  });

  await assert.rejects(listDaemonPlugins(), /cannot connect to the Docker daemon/);
});

// daemon-plugins-service.md — a payload that is not a plugin list is a stated reason, not an
// inventory: the panel must never read it as "none installed".
test("listDaemonPlugins states the reason when the daemon does not answer with a plugin list", async () => {
  engine.on("GET", "/plugins", () => "null");

  const listing = await listDaemonPlugins();

  assert.deepEqual(listing.items, []);
  assert.ok((listing.unavailableReason ?? "").length > 0, "an unreadable answer must be explained");
});

// daemon-plugins-service.md — "getDaemonPlugin(name) -> DaemonPlugin — one plugin's summary"; a name
// "carries a repository path and a tag, so its slashes belong to it and reach the daemon as they
// are — exactly as the Docker CLI sends them"
test("getDaemonPlugin reads the plugin the daemon files under that exact name, slashes and tag included", async () => {
  engine.on("GET", /^\/plugins\/.+\/json$/, () => rawPlugin({ Name: "grafana/loki-docker-driver:latest", Enabled: true, types: ["docker.logdriver/1.0"] }));

  const plugin = await getDaemonPlugin("grafana/loki-docker-driver:latest");

  assert.equal(plugin.name, "grafana/loki-docker-driver:latest");
  assert.equal(plugin.enabled, true);
  assert.equal(plugin.type, "log driver");
  assert.deepEqual(
    engine.callsTo("GET", /^\/plugins\/.+\/json$/).map((call) => call.pathname),
    ["/plugins/grafana/loki-docker-driver:latest/json"],
  );
});

// daemon-plugins-service.md — "inspectPlugin(name) -> PluginInspect — the summary plus
// { documentation?, mounts, devices, capabilities, env, raw }, raw being the daemon's own inspect
// document untouched"
test("inspectPlugin adds what the plugin runs with, and hands the daemon's own document back untouched", async () => {
  const raw = rawPlugin({
    Name: "vieux/sshfs:latest",
    Config: {
      Documentation: "https://docs.docker.com/engine/extend/plugins/",
      Mounts: [{ Source: "/var/lib/docker/plugins", Destination: "/mnt/state" }],
      Env: [{ Name: "DEBUG", Value: "1" }, { Name: "QUIET" }],
      Linux: { Capabilities: ["CAP_SYS_ADMIN"], Devices: [{ Path: "/dev/fuse" }] },
    },
  });
  engine.on("GET", /^\/plugins\/.+\/json$/, () => raw);

  const inspect = await inspectPlugin("vieux/sshfs:latest");

  assert.equal(inspect.name, "vieux/sshfs:latest");
  assert.equal(inspect.documentation, "https://docs.docker.com/engine/extend/plugins/");
  assert.equal(inspect.mounts.length, 1);
  assert.ok(inspect.mounts[0]!.includes("/var/lib/docker/plugins") && inspect.mounts[0]!.includes("/mnt/state"), inspect.mounts[0]);
  assert.deepEqual(inspect.devices, ["/dev/fuse"]);
  assert.deepEqual(inspect.capabilities, ["CAP_SYS_ADMIN"]);
  assert.deepEqual(inspect.env, ["DEBUG=1", "QUIET"]);
  assert.deepEqual(inspect.raw, JSON.parse(JSON.stringify(raw)));
});

// daemon-plugins-service.md — "A plugin name carries a registry host that may itself carry a port, a
// repository path and a tag ... so its slashes, port and colon belong to it and reach the daemon as
// they are, exactly as the Docker CLI sends them."
test("a name the Docker CLI would send reaches the daemon exactly as it is", async () => {
  const names = [
    // A private registry listening on a port, with and without a tag, one path
    // component or several.
    "localhost:5000/driver:v1",
    "registry.internal:5000/driver:v1",
    "localhost:5000/team/driver",
    // The Docker Hub forms.
    "grafana/loki-docker-driver:latest",
    "vieux/sshfs:latest",
    "a/b/c:1.0",
    // No path at all: the plain name, tagged or not.
    "sshfs:latest",
    "sshfs",
    // daemon-plugins-service.md — "A `:…` on the first component is a port only when path components
    // follow it; on a name with no path, a trailing `:…` is the tag": `localhost:5000` is therefore a
    // plugin named `localhost` tagged `5000`, not a host, and is a name like any other.
    "localhost:5000",
  ];

  for (const name of names) {
    engine.reset();
    engine.on("GET", /^\/plugins\/.+\/json$/, () => rawPlugin({ Name: name }));

    const plugin = await getDaemonPlugin(name);

    assert.equal(plugin.name, name);
    assert.deepEqual(
      engine.calls.map((call) => call.pathname),
      [`/plugins/${name}/json`],
      `"${name}" must reach the daemon unchanged`,
    );
  }
});

// daemon-plugins-service.md — "A private registry listening on a port is named that way on every
// call, listing included": the name the listing shows is the one every later call addresses it by.
test("a plugin from a ported registry is named the same way by the listing and by every call on it", async () => {
  const name = "localhost:5000/driver:v1";
  engine.on("GET", "/plugins", () => [rawPlugin({ Name: name, PluginReference: name })]);
  engine.on("GET", /^\/plugins\/.+\/json$/, () => rawPlugin({ Name: name, PluginReference: name }));

  const { items } = await listDaemonPlugins();
  assert.deepEqual(
    items.map((plugin) => plugin.name),
    [name],
  );

  const inspected = await inspectPlugin(items[0]!.name);

  assert.equal(inspected.name, name);
  assert.deepEqual(
    engine.callsTo("GET", /^\/plugins\/.+\/json$/).map((call) => call.pathname),
    [`/plugins/${name}/json`],
  );
});

// daemon-plugins-service.md — "A name outside that alphabet is refused before any call is made
// (400), so a name can never walk out of the plugin routes."
test("a name outside the plugin alphabet is refused with 400 before the daemon is called at all", async () => {
  const outside = [
    // Traversal, in the shapes a caller would try it in.
    "../containers/json",
    "vieux/../../info",
    "x/../y",
    "..",
    "/plugins",
    "/leading-slash",
    // Malformed paths and components.
    "a//b",
    "-bad/name",
    ".hidden/x",
    "a b/c",
    "name with space",
    // A colon with nothing after it is neither a port nor a tag; two of them are neither either.
    "a/b:",
    "a:5000:6000/b",
    // Anything that would smuggle a second request part into the path.
    "name?query=1",
    "name#fragment",
    "name%2Fescaped",
  ];

  for (const name of outside) {
    engine.reset();
    engine.on("GET", /^\/plugins\/.*$/, () => rawPlugin());

    await assert.rejects(
      inspectPlugin(name),
      (error: unknown) => {
        assert.ok(error instanceof DockerDaemonError, `${name} must be refused as a Docker-side rejection`);
        assert.equal(error.statusCode, 400, `${name} must be refused with 400`);
        return true;
      },
      `"${name}" must not be accepted as a plugin name`,
    );
    assert.deepEqual(engine.calls, [], `no daemon call may be made for "${name}"`);
  }
});

// daemon-plugins-service.md — "Either lookup with a name the daemon does not know -> the daemon's
// own 'not found' failure."
test("a name the daemon does not know comes back as the daemon's own failure", async () => {
  engine.on("GET", /^\/plugins\/.+\/json$/, () => {
    throw new DockerDaemonError("DaemonRejected", "plugin \"nosuch:latest\" not found", undefined, 404);
  });

  await assert.rejects(getDaemonPlugin("nosuch:latest"), /plugin "nosuch:latest" not found/);
});

// daemon-plugins-service.md — "Read-only: nothing here installs, enables, disables or removes."
test("nothing in the inventory writes to the daemon", async () => {
  engine.on("GET", "/plugins", () => [rawPlugin()]);
  engine.on("GET", /^\/plugins\/.+\/json$/, () => rawPlugin());

  await listDaemonPlugins();
  await inspectPlugin("vieux/sshfs:latest");

  assert.deepEqual(
    engine.calls.filter((call) => call.method !== "GET"),
    [],
    "the inventory must only ever read",
  );
});
