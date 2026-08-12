import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { pluginsRouter } from "../../src/plugins/plugins-routes.js";
import type { CliPlugin, PluginListing } from "../../src/plugins/cli-plugins-service.js";
import type { DaemonPlugin } from "../../src/plugins/daemon-plugins-service.js";
import type { PluginPrivilege } from "../../src/plugins/plugin-management-service.js";
import { byNameThenIdentity } from "../../src/list-order/list-order.js";
import { REGISTRY_IMAGE, ensureImages } from "../support/base-images.js";
import { RUN_ID, buildApp, startApp } from "../support/fixtures.js";
import { pluginIsInstalled, removePluginQuietly, startPluginFixture, type PluginFixture } from "../support/plugin-fixture.js";

// The plugin endpoints against the operator's own daemon (REQ-98, REQ-99,
// REQ-111).
//
// Nothing in this file installs a plugin. `docker plugin ls` is the operator's
// own list, and the one successful install lives in the exclusive pass, where
// it is alone and can be undone; here the install endpoint is only ever driven
// to its refusals — which is exactly where REQ-99's promise lives: the
// privileges are read first, and a grant that is not the set the plugin asks
// for installs nothing.
//
// The reference every privilege reading and every refusal is aimed at is a
// plugin this file builds and pushes to a throwaway registry of its own, so
// what it asks for is written in the fixture rather than taken from whatever
// Docker Hub happens to serve today.
await ensureImages([REGISTRY_IMAGE]);

let fixture: PluginFixture | undefined;

function app() {
  return buildApp("/api/plugins", pluginsRouter);
}

async function getJson<T>(url: string, path: string): Promise<{ status: number; body: T; text: string }> {
  const response = await fetch(`${url}${path}`);
  const text = await response.text();
  return { status: response.status, body: JSON.parse(text) as T, text };
}

async function postJson(url: string, path: string, body: unknown): Promise<{ status: number; text: string }> {
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, text: await response.text() };
}

/** The fixture's privileges as the endpoint reports them, compared as a set of name/values pairs. */
function shapeOf(privileges: PluginPrivilege[]): string[] {
  return privileges.map((privilege) => `${privilege.name}=${privilege.values.join("|")}`).sort();
}

before(async () => {
  fixture = await startPluginFixture("plugins-api", `api-${RUN_ID}`);
});

after(async () => {
  // Belt and braces: no test here installs, but a run killed mid-way must still
  // leave `docker plugin ls` exactly as it was found.
  if (fixture) await removePluginQuietly(fixture.installedName);
  await fixture?.stop();
});

// plan-docker_management_app/REQ-98, plan-docker_management_app/REQ-99;
// plugins-endpoints.md — "200 -> { cli: PluginListing<CliPlugin>, daemon: PluginListing<DaemonPlugin> }"
// and "The two inventories are read as one round, and each carries its own unavailability".
test("GET /api/plugins answers with both inventories in one reading, each with its own unavailability", async () => {
  const { url, close } = await startApp(app());
  try {
    const { status, body } = await getJson<{ cli: PluginListing<CliPlugin>; daemon: PluginListing<DaemonPlugin> }>(url, "/api/plugins");

    assert.equal(status, 200);
    assert.ok(Array.isArray(body.cli?.items), "the CLI side must always carry an items array");
    assert.ok(Array.isArray(body.daemon?.items), "the daemon side must always carry an items array");
    // Whether this installation ships CLI plugins is the machine's business, not
    // the contract's: what is asserted is that an empty reading says why
    // (cli-plugins-service.md).
    if (body.cli.items.length === 0) {
      assert.ok((body.cli.unavailableReason ?? "").length > 0, "an empty CLI inventory must state why");
    }
    if (body.daemon.items.length === 0) {
      // A daemon that answers with no plugin says nothing more: "none installed"
      // is a legitimate answer (daemon-plugins-service.md).
      assert.ok(body.daemon.unavailableReason === undefined || body.daemon.unavailableReason.length > 0);
    }
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-98 — CLI plugins are listed "with name, version and availability
// state, as far as the local Docker installation exposes them"; cli-plugins-service.md — command is
// the full invocation, availability is one of three, and only `unavailable` carries a reason.
test("GET /api/plugins reports every CLI plugin with its invocation, version and availability", async () => {
  const { url, close } = await startApp(app());
  try {
    const { body } = await getJson<{ cli: PluginListing<CliPlugin> }>(url, "/api/plugins");

    for (const plugin of body.cli.items) {
      assert.ok(plugin.name.length > 0, "a CLI plugin must be named");
      assert.equal(plugin.command, `docker ${plugin.name}`, "the command is the full invocation");
      assert.ok(["enabled", "available", "unavailable"].includes(plugin.availability), `unexpected availability ${plugin.availability}`);
      assert.ok(plugin.version === undefined || plugin.version.length > 0, "a version, when reported, is not blank");
      if (plugin.availability === "unavailable") {
        assert.ok((plugin.unavailableReason ?? "").length > 0, `${plugin.name} is unavailable and must say why`);
      } else {
        assert.equal(plugin.unavailableReason, undefined, `${plugin.name} is runnable and must carry no refusal reason`);
      }
    }
    // Ordered by the product's own rule, whichever plugins this installation happens to ship.
    // Asserted against `byNameThenIdentity` rather than against a bare `localeCompare`: that was
    // the host-locale, tiebreak-less comparison this ordering work removed, and re-sorting the
    // served list with it here would have agreed with the product only for as long as no installed
    // plugin carried a digit run or a case twin.
    assert.deepEqual(
      body.cli.items.map((plugin) => plugin.name),
      [...body.cli.items]
        .sort(byNameThenIdentity<CliPlugin>({ name: (plugin) => plugin.name, identity: (plugin) => plugin.name }))
        .map((plugin) => plugin.name),
    );
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-99 — daemon plugins are listed with name, type and enabled/disabled
// state; daemon-plugins-service.md — DaemonPlugin's shape and ordering.
test("GET /api/plugins reports every daemon plugin with its name, interface in words and state", async () => {
  const { url, close } = await startApp(app());
  try {
    const { body } = await getJson<{ daemon: PluginListing<DaemonPlugin> }>(url, "/api/plugins");

    for (const plugin of body.daemon.items) {
      assert.ok(plugin.name.length > 0, "a daemon plugin must be named");
      assert.equal(typeof plugin.enabled, "boolean", "a daemon plugin says whether it is enabled");
      assert.ok(Array.isArray(plugin.interfaceTypes));
      assert.ok(plugin.type.length > 0, "a daemon plugin's interface is always said in words");
    }
    assert.deepEqual(
      body.daemon.items.map((plugin) => plugin.name),
      [...body.daemon.items]
        .sort(byNameThenIdentity<DaemonPlugin>({ name: (plugin) => plugin.name, identity: (plugin) => plugin.id }))
        .map((plugin) => plugin.name),
    );
    // This file installs nothing: its own plugin is not in the daemon's list.
    assert.equal(
      body.daemon.items.some((plugin) => plugin.name === fixture!.installedName),
      false,
      "reading the inventory must not have installed the fixture plugin",
    );
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-111 — a plugin is installed "reviewing and granting the privileges
// it requests"; plugins-endpoints.md — "GET /api/plugins/privileges?remote=<reference> -> what the
// reference asks for, installing nothing".
test("GET /api/plugins/privileges reports exactly what the reference asks for, and installs nothing", async () => {
  const { url, close } = await startApp(app());
  try {
    const { status, body } = await getJson<PluginPrivilege[]>(url, `/api/plugins/privileges?remote=${encodeURIComponent(fixture!.reference)}`);

    assert.equal(status, 200, JSON.stringify(body));
    assert.deepEqual(shapeOf(body), shapeOf(fixture!.privileges as PluginPrivilege[]));
    for (const privilege of body) {
      assert.ok(privilege.name.length > 0, "a privilege names what is being asked for");
      assert.ok(Array.isArray(privilege.values), "a privilege carries the exact value(s) asked for");
    }
    assert.equal(await pluginIsInstalled(fixture!.installedName), false, "reading the privileges must install nothing");
  } finally {
    await close();
  }
});

// plugins-endpoints.md — "400 -> remote missing or blank"
test("GET /api/plugins/privileges is rejected with 400 when the reference is missing or blank", async () => {
  const { url, close } = await startApp(app());
  try {
    const missing = await getJson<{ error?: string }>(url, "/api/plugins/privileges");
    const blank = await getJson<{ error?: string }>(url, "/api/plugins/privileges?remote=%20%20");

    assert.equal(missing.status, 400);
    assert.ok((missing.body.error ?? "").length > 0);
    assert.equal(blank.status, 400);
  } finally {
    await close();
  }
});

// plugin-management-service.md — a reference the registry does not have is the daemon's own answer,
// passed on as it is; and whatever that answer is, granting it installs nothing (REQ-99). This
// daemon answers "it asks for nothing" rather than failing, which is the case worth pinning: an
// empty reading must not become an empty grant that quietly installs something.
test("a reference the registry does not have is passed on as the daemon answers it, and installs nothing", async () => {
  const { url, close } = await startApp(app());
  const unknown = `${fixture!.reference.split("/")[0]}/vexel-test-no-such-plugin-${RUN_ID}:v1`;
  try {
    const reading = await getJson<PluginPrivilege[] | { error?: string }>(url, `/api/plugins/privileges?remote=${encodeURIComponent(unknown)}`);

    if (reading.status === 200) {
      // The reading said nothing is asked for; granting exactly that must still
      // not put a plugin on the daemon.
      const install = await postJson(url, "/api/plugins/install", {
        remote: unknown,
        grantedPrivileges: reading.body,
        enable: false,
      });
      assert.ok(install.status >= 400, `installing a reference nobody publishes must fail, got ${install.status}: ${install.text}`);
      assert.match(install.text, /error/i, "the daemon's own message must reach the caller");
    } else {
      assert.ok(((reading.body as { error?: string }).error ?? "").length > 0, "a refused reading must carry the daemon's own message");
    }
    assert.equal(await pluginIsInstalled(unknown), false, "nothing may be installed for a reference nobody publishes");
  } finally {
    await removePluginQuietly(unknown);
    await close();
  }
});

// plan-docker_management_app/REQ-99 — "the privileges a plugin requests are shown before they are
// granted"; plugins-endpoints.md — "400 -> grantedPrivileges absent or not a list, stating that a
// plugin is never installed without its privileges being granted".
test("POST /api/plugins/install is refused with 400 when no privileges are granted at all", async () => {
  const { url, close } = await startApp(app());
  try {
    const absent = await postJson(url, "/api/plugins/install", { remote: fixture!.reference });
    const notAList = await postJson(url, "/api/plugins/install", { remote: fixture!.reference, grantedPrivileges: "all of them" });
    const nullGrant = await postJson(url, "/api/plugins/install", { remote: fixture!.reference, grantedPrivileges: null });

    for (const [name, response] of Object.entries({ absent, notAList, nullGrant })) {
      assert.equal(response.status, 400, `${name} must be refused with 400, got ${response.status}: ${response.text}`);
      assert.match(response.text, /granted/i, `${name} must say a plugin is never installed without its privileges being granted`);
    }
    assert.equal(await pluginIsInstalled(fixture!.installedName), false, "a refused install must install nothing");
  } finally {
    await close();
  }
});

// plugins-endpoints.md — "400 -> remote missing or blank"
test("POST /api/plugins/install is refused with 400 when the reference is missing or blank", async () => {
  const { url, close } = await startApp(app());
  try {
    const missing = await postJson(url, "/api/plugins/install", { grantedPrivileges: [] });
    const blank = await postJson(url, "/api/plugins/install", { remote: "   ", grantedPrivileges: [] });

    assert.equal(missing.status, 400);
    assert.equal(blank.status, 400);
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-99 / plugin-management-service.md — "no caller can install a plugin
// by skipping the review": the server re-reads what the plugin asks for and refuses with 409 unless
// the caller hands back exactly that set. Probed against a real daemon and a real reference, one
// dishonest grant at a time; after each, the plugin is still not installed.
test("POST /api/plugins/install answers 409 and installs nothing for a grant that is not exactly what the plugin asks for", async () => {
  const { url, close } = await startApp(app());
  const asked = fixture!.privileges.map((privilege) => ({ name: privilege.name, values: [...privilege.values] }));
  const grants: Record<string, unknown> = {
    // The review skipped: an empty grant for a plugin that asks for three things.
    reviewSkipped: [],
    // A subset: two of the three granted.
    subset: asked.slice(0, 2),
    // A superset: everything asked for, plus one nobody asked for.
    superset: [...asked, { name: "device", values: ["/dev/fuse"] }],
    // A widened value: the same privilege, granted over a broader path.
    widened: asked.map((privilege) => (privilege.name === "mount" ? { name: privilege.name, values: ["/"] } : privilege)),
    // A value added next to the one asked for.
    valueAdded: asked.map((privilege) => (privilege.name === "network" ? { name: privilege.name, values: [...privilege.values, "bridge"] } : privilege)),
    // The names right, the values dropped.
    valuesDropped: asked.map((privilege) => ({ name: privilege.name, values: [] })),
    // A privilege renamed to something the plugin never asked for.
    renamed: asked.map((privilege) => (privilege.name === "capabilities" ? { name: "capability", values: privilege.values } : privilege)),
  };

  try {
    for (const [name, grantedPrivileges] of Object.entries(grants)) {
      const response = await postJson(url, "/api/plugins/install", {
        remote: fixture!.reference,
        grantedPrivileges,
        enable: false,
      });

      assert.equal(response.status, 409, `${name} must be refused with 409, got ${response.status}: ${response.text}`);
      const body = JSON.parse(response.text) as { error?: string };
      assert.match(body.error ?? "", /nothing has been installed/i, `${name}: the refusal must say nothing was installed`);
      assert.equal(await pluginIsInstalled(fixture!.installedName), false, `${name}: the plugin must not be on the daemon`);
    }
  } finally {
    await removePluginQuietly(fixture!.installedName);
    await close();
  }
});

// plugins-endpoints.md — "GET /api/plugins/inspect?name=<name>"; "400 -> name missing, blank, or not
// a plugin name"; daemon-plugins-service.md — "A name outside that alphabet is refused before any
// call is made (400), so a name can never walk out of the plugin routes."
test("GET /api/plugins/inspect refuses a name that is not a plugin name, and never reaches the route it imitates", async () => {
  const { url, close } = await startApp(app());
  const notNames = ["../containers/json", "../../info", "vieux/../../../info", "name with space", "sshfs:latest?all=1"];
  try {
    const missing = await getJson<{ error?: string }>(url, "/api/plugins/inspect");
    const blank = await getJson<{ error?: string }>(url, "/api/plugins/inspect?name=%20");
    assert.equal(missing.status, 400);
    assert.equal(blank.status, 400);

    for (const name of notNames) {
      const { status, text } = await getJson<{ error?: string }>(url, `/api/plugins/inspect?name=${encodeURIComponent(name)}`);

      assert.equal(status, 400, `"${name}" must be refused with 400, got ${status}: ${text}`);
      // Whatever the Engine would have answered on the path this name imitates
      // must not be what comes back.
      assert.ok(!/"Image"|"Command"|"ServerVersion"|"Containers"/.test(text), `"${name}" reached an Engine path it should never have: ${text}`);
    }
  } finally {
    await close();
  }
});

// daemon-plugins-service.md — "A plugin name carries a registry host that may itself carry a port
// ... and reach the daemon as they are"; "A `:…` on the first component is a port only when path
// components follow it; on a name with no path, a trailing `:…` is the tag."
//
// None of these plugins is on this daemon, so what is asserted is that the name got through: the
// answer is the daemon's own "not found", never the application's "is not a plugin name".
test("a name carrying a registry port, and a plain tagged name, both reach the Engine instead of being refused", async () => {
  const { url, close } = await startApp(app());
  const names = [
    `localhost:5000/vexel-test-driver-${RUN_ID}:v1`,
    `registry.internal:5000/vexel-test-driver-${RUN_ID}:v1`,
    `localhost:5000/team/vexel-test-driver-${RUN_ID}`,
    // With no path component after it, this colon is a tag, not a port: a plugin
    // named `localhost` tagged `5000`, which the daemon simply does not have.
    "localhost:5000",
    `vexel-test-driver-${RUN_ID}:v1`,
  ];
  try {
    for (const name of names) {
      const { status, body, text } = await getJson<{ error?: string }>(url, `/api/plugins/inspect?name=${encodeURIComponent(name)}`);

      assert.notEqual(status, 400, `"${name}" is a plugin name and must not be refused as one: ${text}`);
      assert.ok((body.error ?? "").length > 0, `"${name}" must come back with the daemon's own message`);
      assert.ok(!/is not a plugin name/.test(body.error ?? ""), `"${name}" was refused by the name check: ${text}`);
    }
  } finally {
    await close();
  }
});

// plugins-endpoints.md — any Docker-side failure comes back with Docker's own message;
// daemon-plugins-service.md — "Either lookup with a name the daemon does not know -> the daemon's
// own 'not found' failure."
test("GET /api/plugins/inspect reports the daemon's own failure for a plugin it does not know", async () => {
  const { url, close } = await startApp(app());
  const unknown = `vexel-test-absent-${RUN_ID}:v1`;
  try {
    const { status, body } = await getJson<{ error?: string }>(url, `/api/plugins/inspect?name=${encodeURIComponent(unknown)}`);

    assert.ok(status >= 400 && status !== 400, `the daemon's own refusal is not a validation error, got ${status}`);
    assert.ok((body.error ?? "").length > 0, "the daemon's own message must reach the caller");
  } finally {
    await close();
  }
});

// plugins-endpoints.md — "POST /api/plugins/enable -> request { name }; 400 when blank"; same for
// disable and for the removal's query parameter.
test("the state-changing endpoints are refused with 400 without a name, and for a name that is not a plugin name", async () => {
  const { url, close } = await startApp(app());
  try {
    for (const path of ["/api/plugins/enable", "/api/plugins/disable"]) {
      assert.equal((await postJson(url, path, {})).status, 400, `${path} without a name`);
      assert.equal((await postJson(url, path, { name: "  " })).status, 400, `${path} with a blank name`);
      const notAName = await postJson(url, path, { name: "../containers/json" });
      assert.equal(notAName.status, 400, `${path} with a name that is not one: ${notAName.text}`);
    }

    const noName = await fetch(`${url}/api/plugins`, { method: "DELETE" });
    assert.equal(noName.status, 400);
    const blankName = await fetch(`${url}/api/plugins?name=%20`, { method: "DELETE" });
    assert.equal(blankName.status, 400);
    const notAName = await fetch(`${url}/api/plugins?name=${encodeURIComponent("../containers/json")}`, { method: "DELETE" });
    assert.equal(notAName.status, 400, await notAName.text());
  } finally {
    await close();
  }
});
