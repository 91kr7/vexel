import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { pluginsRouter } from "../../src/plugins/plugins-routes.js";
import type { PluginListing } from "../../src/plugins/cli-plugins-service.js";
import type { DaemonPlugin, PluginInspect } from "../../src/plugins/daemon-plugins-service.js";
import { REGISTRY_IMAGE, ensureImages } from "../support/base-images.js";
import { RUN_ID, buildApp, startApp } from "../support/fixtures.js";
import { pluginIsInstalled, removePluginQuietly, startPluginFixture, type PluginFixture } from "../support/plugin-fixture.js";
import { execFileAsync } from "../support/docker-cli.js";

// The one place a plugin is actually installed (REQ-111).
//
// `docker plugin ls` is a single, host-wide list that no label can scope, so
// installing into it cannot be done alongside anything else: this file lives in
// the exclusive pass, installs one plugin of its own making, and removes it in
// a `finally` that runs on failure too, leaving the list exactly as it found
// it. The plugin comes from a throwaway registry started here, so nothing is
// pulled from the internet and what it asks for is written in the fixture.
//
// It is never enabled on purpose: its entrypoint is not a plugin binary, which
// makes it the honest fixture for the other half of the contract — the daemon's
// refusal, surfaced as the daemon words it, with nothing forced.
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

/** The privileges the reference asks for, read exactly as an honest caller would before granting them. */
async function reviewPrivileges(url: string, remote: string): Promise<unknown[]> {
  const { status, body, text } = await getJson<unknown[]>(url, `/api/plugins/privileges?remote=${encodeURIComponent(remote)}`);
  assert.equal(status, 200, `reading the privileges failed: ${text}`);
  return body;
}

before(async () => {
  fixture = await startPluginFixture("plugins-lifecycle", `excl-${RUN_ID}`);
});

after(async () => {
  if (fixture) {
    await removePluginQuietly(fixture.installedName);
    await removePluginQuietly(fixture.alias);
  }
  await fixture?.stop();
});

// plan-docker_management_app/REQ-111 — a daemon plugin "can be installed from a reference (reviewing
// and granting the privileges it requests), ... inspected and removed, each state change being
// reflected in the list"; plugins-endpoints.md — "201 -> the installed plugin", "204 -> removed";
// plugin-management-service.md — "only an explicit false leaves the plugin installed and disabled".
test("a granted install puts the plugin on the daemon, where it can be inspected and removed again", async () => {
  const { url, close } = await startApp(app());
  const remote = fixture!.reference;
  const name = fixture!.alias;
  try {
    const granted = await reviewPrivileges(url, remote);
    assert.equal(await pluginIsInstalled(name), false, "the plugin must not be installed before the grant");

    const install = await postJson(url, "/api/plugins/install", { remote, alias: name, grantedPrivileges: granted, enable: false });
    assert.equal(install.status, 201, `the install failed: ${install.text}`);
    const installed = JSON.parse(install.text) as DaemonPlugin;
    assert.equal(installed.name, name, "the answer names the plugin as the daemon filed it");
    assert.equal(installed.enabled, false, "enable: false leaves the plugin installed and disabled");
    assert.equal(installed.type, "volume driver", "the interface the fixture declares, said in words");
    assert.equal(await pluginIsInstalled(name), true, "the daemon must now hold the plugin");

    // The state change is reflected in the list the screen reads.
    const listed = await getJson<{ daemon: PluginListing<DaemonPlugin> }>(url, "/api/plugins");
    const row = listed.body.daemon.items.find((plugin) => plugin.name === name);
    assert.ok(row, `the installed plugin must be listed, among ${listed.body.daemon.items.map((plugin) => plugin.name).join(", ")}`);
    assert.equal(row!.enabled, false);

    // ...and it can be inspected in full: what it runs with, plus the daemon's own document.
    const inspect = await getJson<PluginInspect>(url, `/api/plugins/inspect?name=${encodeURIComponent(name)}`);
    assert.equal(inspect.status, 200, inspect.text);
    assert.equal(inspect.body.name, name);
    assert.deepEqual(inspect.body.capabilities, ["CAP_SYS_ADMIN"], "the capabilities the fixture asks for");
    assert.ok(inspect.body.mounts.length > 0, "the fixture declares a mount, which the inspection must show");
    assert.equal(inspect.body.documentation, "https://example.invalid/vexel-test-plugin");
    assert.ok(inspect.body.raw !== undefined && inspect.body.raw !== null, "the daemon's own document comes back untouched");

    // ...and removed, after which the list no longer holds it.
    const removal = await fetch(`${url}/api/plugins?name=${encodeURIComponent(name)}`, { method: "DELETE" });
    assert.equal(removal.status, 204, await removal.text());
    assert.equal(await pluginIsInstalled(name), false, "the plugin must be gone from the daemon");
    const after = await getJson<{ daemon: PluginListing<DaemonPlugin> }>(url, "/api/plugins");
    assert.equal(
      after.body.daemon.items.some((plugin) => plugin.name === name),
      false,
      "the removal must be reflected in the list",
    );
  } finally {
    await removePluginQuietly(name);
    await close();
  }
});

// plan-docker_management_app/REQ-111 — a state change that the daemon refuses is the daemon's
// refusal; plugin-management-service.md — "Nothing is ever forced ... the daemon's refusal is passed
// on rather than overridden on the operator's behalf", and the list keeps showing what is true.
test("a state change the daemon refuses comes back in the daemon's own words, and changes nothing", async () => {
  const { url, close } = await startApp(app());
  const remote = fixture!.reference;
  const name = fixture!.alias;
  try {
    const granted = await reviewPrivileges(url, remote);
    const install = await postJson(url, "/api/plugins/install", { remote, alias: name, grantedPrivileges: granted, enable: false });
    assert.equal(install.status, 201, `the install failed: ${install.text}`);

    // This plugin cannot come up — its entrypoint is not a plugin binary — so
    // the daemon refuses to enable it. That refusal is the operator's to read.
    const enable = await postJson(url, "/api/plugins/enable", { name });

    assert.ok(enable.status >= 400, `the daemon's refusal must reach the caller, got ${enable.status}`);
    const failure = JSON.parse(enable.text) as { error?: string };
    assert.ok((failure.error ?? "").length > 0, "the daemon's own message must be reported");

    // Nothing was forced and nothing was left lying about it: the plugin is
    // still there, still disabled, and the list says so.
    const listed = await getJson<{ daemon: PluginListing<DaemonPlugin> }>(url, "/api/plugins");
    const row = listed.body.daemon.items.find((plugin) => plugin.name === name);
    assert.ok(row, "a plugin that failed to enable is still installed and must still be listed");
    assert.equal(row!.enabled, false, "a refused enable must leave the plugin disabled");
  } finally {
    await removePluginQuietly(name);
    await close();
  }
});

// daemon-plugins-service.md — "A plugin name carries a repository path and a tag, so its slashes
// belong to it and reach the daemon as they are — exactly as the Docker CLI sends them", and
// plan-docker_management_app/REQ-111 — such a plugin can be installed, inspected and removed.
//
// A plugin held in a registry that listens on a port is addressed by a name carrying that port
// (`registry.internal:5000/driver:v1`), which is what the Docker CLI installs it under and what the
// daemon files it as. This is the plain private-registry case, not an exotic one.
test("a plugin whose registry carries a port can be installed from its reference like any other", async () => {
  const { url, close } = await startApp(app());
  const remote = fixture!.reference;
  try {
    const granted = await reviewPrivileges(url, remote);

    const install = await postJson(url, "/api/plugins/install", { remote, grantedPrivileges: granted, enable: false });

    assert.equal(install.status, 201, `installing from ${remote} was refused: ${install.text}`);
    assert.equal(await pluginIsInstalled(remote), true, "the daemon must hold the plugin under the name it was installed by");
  } finally {
    await removePluginQuietly(remote);
    await close();
  }
});

// plan-docker_management_app/REQ-99, plan-docker_management_app/REQ-111 — a plugin the daemon holds
// is listed, and every plugin listed can be inspected and removed. The plugin here is put on the
// daemon by the Docker CLI itself, so what is under test is only whether the endpoints can address
// the name the daemon actually filed it under.
test("a plugin the daemon holds under a registry-qualified name can be inspected and removed through the endpoints", async () => {
  const { url, close } = await startApp(app());
  const remote = fixture!.reference;
  try {
    await execFileAsync("docker", ["plugin", "install", "--disable", "--grant-all-permissions", remote]);

    const listed = await getJson<{ daemon: PluginListing<DaemonPlugin> }>(url, "/api/plugins");
    const row = listed.body.daemon.items.find((plugin) => plugin.name === remote);
    assert.ok(row, `the plugin must be listed, among ${listed.body.daemon.items.map((plugin) => plugin.name).join(", ")}`);

    const inspect = await getJson<PluginInspect>(url, `/api/plugins/inspect?name=${encodeURIComponent(remote)}`);
    assert.equal(inspect.status, 200, `inspecting the listed plugin was refused: ${inspect.text}`);

    const removal = await fetch(`${url}/api/plugins?name=${encodeURIComponent(remote)}`, { method: "DELETE" });
    assert.equal(removal.status, 204, `removing the listed plugin was refused: ${await removal.text()}`);
    assert.equal(await pluginIsInstalled(remote), false);
  } finally {
    await removePluginQuietly(remote);
    await close();
  }
});
