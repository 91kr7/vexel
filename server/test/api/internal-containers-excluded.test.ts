import { test } from "node:test";
import assert from "node:assert/strict";
import express, { type Express } from "express";
import { containersRouter } from "../../src/containers/containers-routes.js";
import { networksRouter } from "../../src/networks/networks-routes.js";
import { systemRouter } from "../../src/system/system-routes.js";
import { volumesRouter } from "../../src/volumes/volumes-routes.js";
import { INTERNAL_CONTAINER_LABEL } from "../../src/image-analysis/filesystem-extraction-service.js";
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

// The application's own internal extraction containers are excluded once, on
// the held listing, so every consumer of it inherits the exclusion
// (plan-docker_management_app-refresh_cache/REQ-41).
//
// Against the real daemon, and only on fixtures of this file's own: the volume
// and the network are created here, so what they name is entirely this test's
// doing. Nothing is asserted about a host total — the dashboard's figure is
// checked against the container listing the same held value produced, which is
// where the exclusion has to show.

/** Every endpoint that derives from the container listing, on one app. */
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
  // The answer's own text goes into the failure message: a reading that did not
  // come back names the reason in its body, and reporting the status alone
  // loses it.
  const text = await response.text();
  assert.equal(response.status, 200, `expected ${path}, got ${response.status}: ${text}`);
  return JSON.parse(text) as T;
}

async function runContainer(caseName: string, extraArgs: string[]): Promise<string> {
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

// REQ-41 — "no volume is listed as mounted by one, and no network as attached to one", and the
// dashboard counts none of them either (overview-service.md — "excluded on the held listing, so they
// are counted nowhere").
test("an internal extraction container is named by no volume, no network and no dashboard figure", async () => {
  const volumeName = fixtureName("internal-excl-volume");
  const networkName = fixtureName("internal-excl-network");
  let ordinaryName = "";
  let internalName = "";
  const { url, close } = await startApp(buildApp());
  try {
    await ensureImage(ALPINE_IMAGE);
    await execFileAsync("docker", ["volume", "create", ...ownershipArgs("internal-excl-volume"), volumeName]);
    await execFileAsync("docker", ["network", "create", ...ownershipArgs("internal-excl-network"), networkName]);

    // Both mount the same volume and sit on the same network: the ordinary one
    // is what proves the derivation works at all, so the internal one's absence
    // is an exclusion and not a reader that names nobody.
    ordinaryName = await runContainer("internal-excl-ordinary", [
      "-v",
      `${volumeName}:/data`,
      "--network",
      networkName,
    ]);
    internalName = await runContainer("internal-excl-internal", [
      "-v",
      `${volumeName}:/data`,
      "--network",
      networkName,
      "--label",
      `${INTERNAL_CONTAINER_LABEL}=true`,
    ]);

    const volumes = await fetchJson<VolumeSummary[]>(url, "/api/volumes");
    const networks = await fetchJson<NetworkSummary[]>(url, "/api/networks");
    const containers = await fetchJson<ContainerSummary[]>(url, "/api/containers");
    const overview = await fetchJson<SystemOverview>(url, "/api/system/overview");

    const volume = volumes.find((entry) => entry.name === volumeName);
    assert.ok(volume, "the volume created here is not in the listing");
    assert.deepEqual(volume.mountedBy, [ordinaryName]);

    const network = networks.find((entry) => entry.name === networkName);
    assert.ok(network, "the network created here is not in the listing");
    assert.deepEqual(network.attachedContainers, [ordinaryName]);

    assert.ok(
      containers.some((entry) => entry.name === ordinaryName),
      "the ordinary container is not in the container listing",
    );
    assert.ok(
      !containers.some((entry) => entry.name === internalName),
      "the internal extraction container is in the container listing",
    );

    // The dashboard counts the listing the exclusion was applied to, so its
    // total is that listing's own length whatever else the host is running.
    assert.equal(overview.containers.total, containers.length);
    assert.equal(overview.containers.running, containers.filter((entry) => entry.state === "running").length);
    assert.equal(overview.containers.paused, containers.filter((entry) => entry.state === "paused").length);
    assert.equal(overview.containers.running + overview.containers.paused + overview.containers.stopped, overview.containers.total);
  } finally {
    await removeContainerQuietly(ordinaryName);
    await removeContainerQuietly(internalName);
    await removeNetworkQuietly(networkName);
    await removeVolumeQuietly(volumeName);
    await close();
  }
});
