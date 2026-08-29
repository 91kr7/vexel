import { test } from "node:test";
import assert from "node:assert/strict";
import express, { type Express } from "express";
import { containersRouter } from "../../src/containers/containers-routes.js";
import { networksRouter } from "../../src/networks/networks-routes.js";
import { systemRouter } from "../../src/system/system-routes.js";
import { volumesRouter } from "../../src/volumes/volumes-routes.js";
import type { ContainerSummary } from "../../src/containers/containers-service.js";
import type { NetworkSummary } from "../../src/networks/networks-service.js";
import type { SystemOverview } from "../../src/system/overview-service.js";
import type { VolumeSummary } from "../../src/volumes/volumes-service.js";
import { ALPINE_IMAGE, ensureImage } from "../support/base-images.js";
import {
  fixtureName,
  ownershipArgs,
  removeContainerQuietly,
  removeNetworkQuietly,
  removeVolumeQuietly,
  startApp,
} from "../support/fixtures.js";
import { execFileAsync } from "../support/docker-cli.js";

// The guardrail of the batch that made one container listing serve every
// consumer (plan-docker_management_app-refresh_cache/REQ-43): every endpoint
// answers what it answers today — the same containers, the same volumes with
// the same mounting containers, the same networks with the same attached
// containers, the same dashboard counts, each in the same order.
//
// Against the real daemon and on this file's own fixtures. The fixtures are
// named so that the documented order is unambiguous on them alone — `a2` before
// `a10` under the numeric collation, both before `b1` — so their *relative*
// order in the answer is an assertion about the order without being an
// assertion about the host's contents.

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/api/containers", containersRouter);
  app.use("/api/volumes", volumesRouter);
  app.use("/api/networks", networksRouter);
  app.use("/api/system", systemRouter);
  return app;
}

async function fetchJson<T>(url: string, path: string): Promise<T> {
  const response = await fetch(`${url}${path}`);
  const text = await response.text();
  assert.equal(response.status, 200, `expected ${path}, got ${response.status}: ${text}`);
  return JSON.parse(text) as T;
}

/** The three fixture names, in the order the list-order rule puts them in. */
const ORDERED_SUFFIXES = ["a2", "a10", "b1"] as const;

async function runContainer(caseName: string, extraArgs: string[] = []): Promise<string> {
  const name = fixtureName(caseName);
  await execFileAsync("docker", [
    "run",
    "-d",
    "--name",
    name,
    ...ownershipArgs(caseName),
    ...extraArgs,
    "--entrypoint",
    "sleep",
    ALPINE_IMAGE,
    "300",
  ]);
  return name;
}

/** The fixtures' own entries, in the order the endpoint returned them. */
function sequenceOf(names: string[], all: string[]): string[] {
  return all.filter((entry) => names.includes(entry));
}

// REQ-43, REQ-39 — the container listing answers the same fields, the same values and the same
// order (containers-service.md — ContainerSummary, "Ordered by container name … with the
// container's id as the final comparison"), and the dashboard counts that same listing
// (overview-service.md).
test("the container listing and the dashboard counts answer the same containers, in the documented order", async () => {
  const names = ORDERED_SUFFIXES.map((suffix) => fixtureName(`guard-${suffix}`));
  const { url, close } = await startApp(buildApp());
  try {
    await ensureImage(ALPINE_IMAGE);
    // Created out of order, so the answer's order is the service's own and not the daemon's.
    await runContainer("guard-b1");
    await runContainer("guard-a10");
    await runContainer("guard-a2");

    const containers = await fetchJson<ContainerSummary[]>(url, "/api/containers");
    const overview = await fetchJson<SystemOverview>(url, "/api/system/overview");

    assert.deepEqual(
      sequenceOf(names, containers.map((entry) => entry.name)),
      names,
      "the container listing is not ordered by name",
    );

    const first = containers.find((entry) => entry.name === names[0]);
    assert.ok(first, "the container created here is not in the listing");
    assert.deepEqual(Object.keys(first).sort(), ["id", "image", "name", "ports", "shortId", "state", "status"]);
    assert.equal(first.shortId, first.id.slice(0, 12));
    assert.equal(first.image, ALPINE_IMAGE);
    assert.equal(first.state, "running");
    assert.ok(first.status.length > 0, "the daemon's own status text is missing");
    assert.deepEqual(first.ports, []);

    // overview-service.md — the counts come from that same listing, so they account for exactly
    // what it holds and split into running / paused / stopped without remainder.
    assert.equal(overview.containers.total, containers.length);
    assert.equal(overview.containers.running, containers.filter((entry) => entry.state === "running").length);
    assert.equal(overview.containers.paused, containers.filter((entry) => entry.state === "paused").length);
    assert.equal(
      overview.containers.running + overview.containers.paused + overview.containers.stopped,
      overview.containers.total,
    );
  } finally {
    for (const name of names) await removeContainerQuietly(name);
    await close();
  }
});

// REQ-43 — the volume list still carries its mounting containers and the network list its attached
// containers, both in the documented order (volumes-service.md — named volumes by name;
// networks-service.md — by network name).
test("the volume list and the network list answer their mounting and attached containers, in the documented order", async () => {
  const volumeNames = ORDERED_SUFFIXES.map((suffix) => fixtureName(`guardvol-${suffix}`));
  const networkNames = ORDERED_SUFFIXES.map((suffix) => fixtureName(`guardnet-${suffix}`));
  let containerName = "";
  const { url, close } = await startApp(buildApp());
  try {
    await ensureImage(ALPINE_IMAGE);
    for (const name of [...volumeNames].reverse()) {
      await execFileAsync("docker", ["volume", "create", ...ownershipArgs("guardvol"), name]);
    }
    for (const name of [...networkNames].reverse()) {
      await execFileAsync("docker", ["network", "create", ...ownershipArgs("guardnet"), name]);
    }
    containerName = await runContainer("guard-mounter", [
      "-v",
      `${volumeNames[0]}:/data`,
      "--network",
      networkNames[0]!,
    ]);

    const volumes = await fetchJson<VolumeSummary[]>(url, "/api/volumes");
    const networks = await fetchJson<NetworkSummary[]>(url, "/api/networks");

    assert.deepEqual(
      sequenceOf(volumeNames, volumes.map((entry) => entry.name)),
      volumeNames,
      "the volume list is not ordered by name",
    );
    assert.deepEqual(
      sequenceOf(networkNames, networks.map((entry) => entry.name)),
      networkNames,
      "the network list is not ordered by name",
    );

    const mounted = volumes.find((entry) => entry.name === volumeNames[0]);
    assert.ok(mounted, "the volume created here is not in the listing");
    assert.deepEqual(mounted.mountedBy, [containerName]);
    const unmounted = volumes.find((entry) => entry.name === volumeNames[1]);
    assert.deepEqual(unmounted!.mountedBy, []);

    const attached = networks.find((entry) => entry.name === networkNames[0]);
    assert.ok(attached, "the network created here is not in the listing");
    assert.deepEqual(attached.attachedContainers, [containerName]);
    const unattached = networks.find((entry) => entry.name === networkNames[1]);
    assert.deepEqual(unattached!.attachedContainers, []);
  } finally {
    await removeContainerQuietly(containerName);
    for (const name of networkNames) await removeNetworkQuietly(name);
    for (const name of volumeNames) await removeVolumeQuietly(name);
    await close();
  }
});
