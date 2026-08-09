import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DockerDaemonError } from "../../src/docker/errors.js";
import { installEngineMock } from "../support/engine-mock.js";

// Daemon plugin management (plugins/specs/plugin-management-service.md,
// REQ-99, REQ-111). The daemon is mocked so the grant check can be probed
// adversarially without a plugin ever reaching a host: a plugin runs with the
// mounts, devices and capabilities it asked for, so what is under test is that
// no caller can install one by skipping, trimming, padding or widening the
// review — and that what travels to the daemon is the daemon's own answer, not
// the caller's list.
const engine = installEngineMock();

const { getPluginPrivileges, installPlugin, enablePlugin, disablePlugin, removePlugin } = await import(
  "../../src/plugins/plugin-management-service.js"
);
// The inventory the screen would read next, imported here so "what is actually
// true after a half-failed install" can be asserted rather than assumed.
const { listDaemonPlugins } = await import("../../src/plugins/daemon-plugins-service.js");

const REMOTE = "vieux/sshfs:latest";

/** What the fixture reference asks for, in the daemon's own wire shape. */
const RAW_PRIVILEGES = [
  { Name: "network", Description: "permissions to access a network", Value: ["host"] },
  { Name: "mount", Description: "host path to mount", Value: ["/var/lib/docker/plugins"] },
  { Name: "capabilities", Description: "list of additional capabilities required", Value: ["CAP_SYS_ADMIN"] },
];

/** The same set as the service reports it — what an honest caller hands back. */
const ASKED_FOR = [
  { name: "network", description: "permissions to access a network", values: ["host"] },
  { name: "mount", description: "host path to mount", values: ["/var/lib/docker/plugins"] },
  { name: "capabilities", description: "list of additional capabilities required", values: ["CAP_SYS_ADMIN"] },
];

function rawPlugin(name: string, enabled: boolean, reference = name): Record<string, unknown> {
  return {
    Id: `id-of-${name}`,
    Name: name,
    Enabled: enabled,
    PluginReference: reference,
    Config: { Description: "sshfs plugin for Docker", Interface: { Types: ["docker.volumedriver/1.0"] } },
  };
}

/** A daemon that knows the fixture reference and, once pulled, lists it disabled. */
function daemonWithPullablePlugin(): { installed: () => boolean } {
  let installed = false;
  engine.on("GET", "/plugins/privileges", () => RAW_PRIVILEGES);
  engine.on("POST", "/plugins/pull", () => {
    installed = true;
    return '{"status":"Pulling from vieux/sshfs"}\n{"status":"Download complete"}\n';
  });
  engine.on("GET", "/plugins", () => (installed ? [rawPlugin(REMOTE, false)] : []));
  engine.on("GET", /^\/plugins\/.+\/json$/, () => rawPlugin(REMOTE, false));
  return { installed: () => installed };
}

/** Every call that could change the daemon's plugins. */
function mutatingCalls() {
  return engine.calls.filter((call) => call.method !== "GET");
}

beforeEach(() => {
  engine.reset();
});

// plugin-management-service.md — PluginPrivilege = { name, description?, values }; "Reads what the
// reference asks for **without installing anything**."
test("getPluginPrivileges reports what the reference asks for and installs nothing", async () => {
  engine.on("GET", "/plugins/privileges", () => RAW_PRIVILEGES);

  const privileges = await getPluginPrivileges(REMOTE);

  assert.deepEqual(privileges, ASKED_FOR);
  assert.deepEqual(mutatingCalls(), [], "reading the privileges must change nothing on the daemon");
  assert.equal(engine.callsTo("GET", "/plugins/privileges")[0]!.query.get("remote"), REMOTE);
});

// plugin-management-service.md — a privilege "sometimes asked for with no value" is still a
// privilege: it comes back with an empty value list, not dropped.
test("getPluginPrivileges keeps a privilege the daemon asks for with no value", async () => {
  engine.on("GET", "/plugins/privileges", () => [{ Name: "device", Description: "host device to access", Value: null }]);

  assert.deepEqual(await getPluginPrivileges(REMOTE), [{ name: "device", description: "host device to access", values: [] }]);
});

// plugin-management-service.md — "A daemon-side failure on the read itself (unreachable, refused) ->
// that failure."
test("getPluginPrivileges passes a daemon-side failure of the read itself on", async () => {
  engine.on("GET", "/plugins/privileges", () => {
    throw new DockerDaemonError("DaemonUnreachable", "cannot connect to the Docker daemon", undefined, 502);
  });

  await assert.rejects(getPluginPrivileges("nosuch/plugin:latest"), /cannot connect to the Docker daemon/);
});

// plugin-management-service.md — "A plugin that asks for nothing -> an empty list. So does a
// reference nobody publishes: the daemon answers an unknown reference the same way it answers a
// modest one, and neither the daemon nor this service can tell the two apart before the pull."
test("a modest plugin and a reference nobody publishes are the same empty reading, told apart only at the pull", async () => {
  engine.on("GET", "/plugins/privileges", () => []);

  const modest = await getPluginPrivileges("someone/modest-plugin:v1");
  const unpublished = await getPluginPrivileges("someone/no-such-plugin:v1");

  assert.deepEqual(modest, []);
  assert.deepEqual(unpublished, unpublished.length === 0 ? [] : modest, "the two readings are indistinguishable");
  assert.deepEqual(mutatingCalls(), [], "neither reading installs anything");
});

// plugin-management-service.md — "Nothing is installed either way — a reference that does not exist
// fails at the pull, with the daemon's own message." Granting the empty set the reading gave back
// is an honest grant; it is the pull that discovers there is nothing to install.
test("granting the empty set of a reference nobody publishes installs nothing: the pull fails with the daemon's own message", async () => {
  engine.on("GET", "/plugins/privileges", () => []);
  engine.on("POST", "/plugins/pull", () => {
    throw new DockerDaemonError("DaemonRejected", "manifest for someone/no-such-plugin:v1 not found", undefined, 404);
  });
  engine.on("GET", "/plugins", () => []);

  await assert.rejects(
    installPlugin({ remote: "someone/no-such-plugin:v1", grantedPrivileges: [], enable: false }),
    /manifest for someone\/no-such-plugin:v1 not found/,
  );
  assert.equal(engine.callsTo("POST", /^\/plugins\/.+\/enable$/).length, 0, "a failed pull must not be followed by an enable");
});

// plan-docker_management_app/REQ-111 — a plugin is installed "reviewing and granting the privileges
// it requests"; plugin-management-service.md — "effect on a matching grant: the plugin is pulled
// under ... the reference's own name, then enabled unless enable is false", answering "with the
// installed plugin's summary, read back from the daemon".
test("installPlugin installs and enables the plugin when the grant is exactly what it asks for", async () => {
  const fixture = daemonWithPullablePlugin();
  engine.on("POST", /^\/plugins\/.+\/enable$/, () => ({}));
  engine.on("GET", "/plugins", () => [rawPlugin(REMOTE, true)]);
  engine.on("GET", /^\/plugins\/.+\/json$/, () => rawPlugin(REMOTE, true));

  const installed = await installPlugin({ remote: REMOTE, grantedPrivileges: ASKED_FOR });

  assert.equal(fixture.installed(), true, "a matching grant must install the plugin");
  assert.equal(installed.name, REMOTE);
  assert.equal(installed.enabled, true);
  assert.equal(engine.callsTo("POST", "/plugins/pull")[0]!.query.get("remote"), REMOTE);
  assert.equal(engine.callsTo("POST", /^\/plugins\/.+\/enable$/).length, 1, "the install enables by default");
});

// plugin-management-service.md — "the caller's granted list is the proof of the decision, never the
// payload ... so a privilege cannot be widened on the way through": what reaches the daemon is the
// set the daemon itself just asked for, rebuilt from its own answer.
test("what travels to the daemon is the daemon's own privilege answer, not the caller's copy of it", async () => {
  daemonWithPullablePlugin();
  engine.on("POST", /^\/plugins\/.+\/enable$/, () => ({}));

  // A caller that re-words the descriptions but leaves the names and the values
  // alone still grants exactly what was asked for — and what is sent is the
  // daemon's own wording, never the caller's.
  await installPlugin({
    remote: REMOTE,
    grantedPrivileges: ASKED_FOR.map((privilege) => ({ ...privilege, description: "harmless-looking text" })),
  });

  const sent = engine.callsTo("POST", "/plugins/pull")[0]!.json;
  assert.deepEqual(sent, RAW_PRIVILEGES, "the pull must carry the daemon's own privilege document");
});

// plan-docker_management_app/REQ-99 / plugin-management-service.md — "no caller can install a
// plugin by skipping the review": every grant that is not exactly the asked-for set is refused with
// 409, and nothing is installed.
test("installPlugin refuses with 409, installing nothing, for every grant that is not exactly the asked-for set", async () => {
  const cases: Record<string, unknown[]> = {
    // The review skipped altogether.
    noGrantAtAll: [],
    // One privilege dropped: a subset is not the set.
    subset: [ASKED_FOR[0]!, ASKED_FOR[1]!],
    // One privilege invented: a superset is not the set either.
    superset: [...ASKED_FOR, { name: "device", description: "host device to access", values: ["/dev/fuse"] }],
    // The same privileges, one of them widened.
    widenedValue: ASKED_FOR.map((privilege) => (privilege.name === "mount" ? { ...privilege, values: ["/"] } : privilege)),
    // A value added to a privilege that already had one.
    addedValue: ASKED_FOR.map((privilege) => (privilege.name === "network" ? { ...privilege, values: ["host", "bridge"] } : privilege)),
    // A privilege granted under the right name but with no value at all.
    emptiedValue: ASKED_FOR.map((privilege) => (privilege.name === "capabilities" ? { ...privilege, values: [] } : privilege)),
    // Values regrouped so the joined text reads the same but the request does not.
    resplitValues: [
      { name: "network", description: "permissions to access a network", values: ["ho", "st"] },
      ASKED_FOR[1]!,
      ASKED_FOR[2]!,
    ],
  };

  for (const [name, granted] of Object.entries(cases)) {
    engine.reset();
    const fixture = daemonWithPullablePlugin();
    engine.on("POST", /^\/plugins\/.+\/enable$/, () => ({}));

    await assert.rejects(
      installPlugin({ remote: REMOTE, grantedPrivileges: granted as never }),
      (error: unknown) => {
        assert.ok(error instanceof DockerDaemonError, `${name}: the refusal must be a Docker-side rejection`);
        assert.equal(error.statusCode, 409, `${name}: the refusal must be a 409`);
        assert.match(error.message, /nothing has been installed/i, `${name}: the refusal must say nothing was installed`);
        return true;
      },
      `${name} must not install the plugin`,
    );

    assert.equal(fixture.installed(), false, `${name}: nothing may be pulled`);
    assert.deepEqual(mutatingCalls(), [], `${name}: no call that changes the daemon may be made`);
  }
});

// plugin-management-service.md — the install "re-reads the privileges remote asks for": a set read
// before the plugin changed what it asks for is stale, and granting it installs nothing.
test("installPlugin refuses a grant that matches an earlier reading but not what the plugin asks for now", async () => {
  let reads = 0;
  const reviewed = [{ name: "network", description: "permissions to access a network", values: ["host"] }];
  engine.on("GET", "/plugins/privileges", () => {
    reads += 1;
    // What the review saw, and then what the plugin asks for by the time the
    // grant comes back.
    return reads === 1 ? [{ Name: "network", Description: "permissions to access a network", Value: ["host"] }] : RAW_PRIVILEGES;
  });
  engine.on("POST", "/plugins/pull", () => "");

  const seen = await getPluginPrivileges(REMOTE);
  assert.deepEqual(seen, reviewed);

  await assert.rejects(installPlugin({ remote: REMOTE, grantedPrivileges: seen }), (error: unknown) => {
    assert.equal((error as DockerDaemonError).statusCode, 409);
    return true;
  });
  assert.deepEqual(mutatingCalls(), [], "a stale grant must install nothing");
});

// plugin-management-service.md — "rejects unless grantedPrivileges is exactly that set — same
// privileges, same values": a set has no order, so the same set handed back in another order is the
// same decision.
test("installPlugin accepts the asked-for set handed back in another order", async () => {
  const fixture = daemonWithPullablePlugin();
  engine.on("POST", /^\/plugins\/.+\/enable$/, () => ({}));

  await installPlugin({ remote: REMOTE, grantedPrivileges: [...ASKED_FOR].reverse() });

  assert.equal(fixture.installed(), true);
});

// plugin-management-service.md — a reference that asks for nothing is granted by handing nothing
// back; the review still happened, and the empty set is the set.
test("installPlugin installs a plugin that asks for no privilege when nothing is granted", async () => {
  let installed = false;
  engine.on("GET", "/plugins/privileges", () => []);
  engine.on("POST", "/plugins/pull", () => {
    installed = true;
    return "";
  });
  engine.on("GET", "/plugins", () => (installed ? [rawPlugin(REMOTE, false)] : []));
  engine.on("GET", /^\/plugins\/.+\/json$/, () => rawPlugin(REMOTE, false));

  const plugin = await installPlugin({ remote: REMOTE, grantedPrivileges: [], enable: false });

  assert.equal(installed, true);
  assert.equal(plugin.enabled, false);
});

// plugin-management-service.md — "then enabled unless enable is false"
test("installPlugin leaves the plugin installed and disabled when enable is false", async () => {
  daemonWithPullablePlugin();
  engine.on("POST", /^\/plugins\/.+\/enable$/, () => ({}));

  const plugin = await installPlugin({ remote: REMOTE, grantedPrivileges: ASKED_FOR, enable: false });

  assert.equal(plugin.enabled, false);
  assert.equal(engine.callsTo("POST", /^\/plugins\/.+\/enable$/).length, 0, "enable: false must not enable the plugin");
});

// plugin-management-service.md — "the plugin is pulled under alias (or under the reference's own name)"
test("installPlugin pulls under the alias when one is given", async () => {
  const alias = "sshfs";
  engine.on("GET", "/plugins/privileges", () => RAW_PRIVILEGES);
  engine.on("POST", "/plugins/pull", () => "");
  engine.on("GET", "/plugins", () => [rawPlugin(`${alias}:latest`, false, REMOTE)]);
  engine.on("GET", /^\/plugins\/.+\/json$/, () => rawPlugin(`${alias}:latest`, false, REMOTE));

  const plugin = await installPlugin({ remote: REMOTE, alias, grantedPrivileges: ASKED_FOR, enable: false });

  assert.equal(engine.callsTo("POST", "/plugins/pull")[0]!.query.get("name"), alias);
  assert.equal(plugin.name, `${alias}:latest`);
});

// plugin-management-service.md — "The installed plugin is found in the daemon's own listing rather
// than guessed from the reference: the daemon normalizes a missing tag to :latest, and the name it
// filed the plugin under is the one every later call uses."
test("installPlugin answers with the name the daemon filed the plugin under, not the reference given", async () => {
  engine.on("GET", "/plugins/privileges", () => []);
  engine.on("POST", "/plugins/pull", () => "");
  engine.on("GET", "/plugins", () => [rawPlugin("vieux/sshfs:latest", false, "docker.io/vieux/sshfs:latest")]);
  engine.on("GET", /^\/plugins\/.+\/json$/, () => rawPlugin("vieux/sshfs:latest", false, "docker.io/vieux/sshfs:latest"));

  const plugin = await installPlugin({ remote: "vieux/sshfs", grantedPrivileges: [], enable: false });

  assert.equal(plugin.name, "vieux/sshfs:latest");
});

// plugin-management-service.md — "a failure reported inside the pull's progress stream is the
// failure of the install; nothing is reported as installed"
test("installPlugin fails when the pull's progress stream reports an error, and reports nothing installed", async () => {
  engine.on("GET", "/plugins/privileges", () => RAW_PRIVILEGES);
  engine.on("POST", "/plugins/pull", () => '{"status":"Pulling"}\n{"error":"no matching manifest for linux/arm64"}\n');
  engine.on("GET", "/plugins", () => []);

  await assert.rejects(installPlugin({ remote: REMOTE, grantedPrivileges: ASKED_FOR }), /no matching manifest for linux\/arm64/);
  assert.equal(engine.callsTo("POST", /^\/plugins\/.+\/enable$/).length, 0, "a failed pull must not be followed by an enable");
});

// plugin-management-service.md — "a failure of the enable step that follows a successful pull is
// also the failure of the call — and the plugin stays installed and disabled, since the pull it
// succeeded at is not undone. The next reading of the inventory shows it there, disabled, and its
// switch enables it."
test("an enable that fails after a successful pull fails the install, leaving the plugin installed and disabled", async () => {
  const fixture = daemonWithPullablePlugin();
  engine.on("POST", /^\/plugins\/.+\/enable$/, () => {
    throw new DockerDaemonError("DaemonRejected", "failed to create shim task: exec format error", undefined, 500);
  });

  await assert.rejects(
    installPlugin({ remote: REMOTE, grantedPrivileges: ASKED_FOR }),
    /failed to create shim task: exec format error/,
  );

  // The pull is not undone: the plugin is on the daemon, disabled, and the next
  // reading of the inventory finds it there.
  assert.equal(fixture.installed(), true, "the pull that succeeded is not rolled back");
  assert.equal(engine.callsTo("DELETE", /^\/plugins\/.*$/).length, 0, "nothing tries to remove what was just pulled");
  const { items } = await listDaemonPlugins();
  const row = items.find((plugin) => plugin.name === REMOTE);
  assert.ok(row, "the plugin must still be listed");
  assert.equal(row!.enabled, false, "it is listed disabled, which is what is actually true");

  // ...and its switch enables it, once whatever stopped it is out of the way.
  engine.on("POST", /^\/plugins\/.+\/enable$/, () => ({}));
  engine.on("GET", /^\/plugins\/.+\/json$/, () => rawPlugin(REMOTE, true));
  assert.equal((await enablePlugin(REMOTE)).enabled, true);
});

// plugin-management-service.md — "enablePlugin(name) -> DaemonPlugin — waits as long as the
// plugin's own handshake takes; answers with the plugin, now enabled."
test("enablePlugin waits on the plugin's own handshake and answers with the plugin, enabled", async () => {
  engine.on("POST", /^\/plugins\/.+\/enable$/, () => ({}));
  engine.on("GET", /^\/plugins\/.+\/json$/, () => rawPlugin(REMOTE, true));

  const plugin = await enablePlugin(REMOTE);

  assert.equal(plugin.enabled, true);
  const call = engine.callsTo("POST", /^\/plugins\/.+\/enable$/)[0]!;
  assert.equal(call.pathname, `/plugins/${REMOTE}/enable`);
  assert.equal(call.query.get("timeout"), "0", "a shorter wait would report a failure for a plugin that is merely slow to come up");
});

// plugin-management-service.md — "disablePlugin(name) -> DaemonPlugin — answers with the plugin,
// now disabled"; "Nothing is ever forced, neither on removal nor on disable"
test("disablePlugin answers with the plugin, disabled, and forces nothing", async () => {
  engine.on("POST", /^\/plugins\/.+\/disable$/, () => ({}));
  engine.on("GET", /^\/plugins\/.+\/json$/, () => rawPlugin(REMOTE, false));

  const plugin = await disablePlugin(REMOTE);

  assert.equal(plugin.enabled, false);
  assert.notEqual(engine.callsTo("POST", /^\/plugins\/.+\/disable$/)[0]!.query.get("force"), "true");
});

// plugin-management-service.md — "removePlugin(name) -> void"; "Nothing is ever forced ... an
// enabled plugin may be driving live containers"
test("removePlugin removes the plugin without forcing it", async () => {
  engine.on("DELETE", /^\/plugins\/.+$/, () => ({}));

  await removePlugin(REMOTE);

  const call = engine.callsTo("DELETE", /^\/plugins\/.+$/)[0]!;
  assert.equal(call.pathname, `/plugins/${REMOTE}`);
  assert.notEqual(call.query.get("force"), "true", "an enabled plugin must be disabled by the operator, never forced away");
});

// plugin-management-service.md — "rejects with the daemon's own refusal when the plugin is still
// enabled; nothing is forced" — and no second, forced attempt follows.
test("removePlugin passes the daemon's refusal on when the plugin is still enabled, and does not retry with force", async () => {
  engine.on("DELETE", /^\/plugins\/.+$/, () => {
    throw new DockerDaemonError("DaemonRejected", "plugin vieux/sshfs:latest is enabled", undefined, 409);
  });

  await assert.rejects(removePlugin(REMOTE), /plugin vieux\/sshfs:latest is enabled/);
  assert.equal(engine.callsTo("DELETE", /^\/plugins\/.+$/).length, 1, "the refusal must not be overridden on the operator's behalf");
});

// daemon-plugins-service.md — the name alphabet guards every management call too, so a name can
// never walk out of the `/plugins` route.
test("no management call accepts a name outside the plugin alphabet", async () => {
  for (const action of [enablePlugin, disablePlugin, removePlugin]) {
    engine.reset();
    engine.on("POST", /^\/plugins\/.*$/, () => ({}));
    engine.on("DELETE", /^\/plugins\/.*$/, () => ({}));

    await assert.rejects(action("../containers/json"), (error: unknown) => {
      assert.equal((error as DockerDaemonError).statusCode, 400);
      return true;
    });
    assert.deepEqual(engine.calls, [], "a name outside the alphabet must be refused before any call is made");
  }
});
