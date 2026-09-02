import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { buildersRouter } from "../../src/builders/builders-routes.js";
import { composeRouter } from "../../src/compose/compose-routes.js";
import { containersRouter } from "../../src/containers/containers-routes.js";
import { contextsRouter } from "../../src/contexts/contexts-routes.js";
import { imagesRouter } from "../../src/images/images-routes.js";
import { networksRouter } from "../../src/networks/networks-routes.js";
import { pluginsRouter } from "../../src/plugins/plugins-routes.js";
import { registriesRouter } from "../../src/registries/registries-routes.js";
import { volumesRouter } from "../../src/volumes/volumes-routes.js";
import {
  createSleepingContainer,
  fixtureName,
  ownershipArgs,
  removeContainerQuietly,
  removeNetworkQuietly,
  removeVolumeQuietly,
  startApp,
} from "../support/fixtures.js";
import { ALPINE_IMAGE, ensureImages } from "../support/base-images.js";
import { execFileAsync } from "../support/docker-cli.js";

// The list endpoints stay available and answer as they do today
// (plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-31).
//
// No screen of the interface reads them any more — every listing arrives on the
// live channel (REQ-39) — and that is exactly why this file exists: an endpoint
// nothing in the product calls is an endpoint a refactoring can remove or change
// the shape of without anything noticing. REQ-31 says a caller outside the
// interface still gets what it got, so each of the ten is called directly here
// and its status, its content type and the shape of its body are asserted.
//
// What is *in* the answer is each area's own file's business; this one asserts
// that the answer is still an answer of that shape, and that the fixtures it
// makes are in it.

await ensureImages([ALPINE_IMAGE]);

/** The one application, mounting the routers the way `server/src/index.ts` does. */
function buildListApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use("/api/containers", containersRouter);
  app.use("/api/images", imagesRouter);
  app.use("/api/volumes", volumesRouter);
  app.use("/api/networks", networksRouter);
  app.use("/api/compose", composeRouter);
  app.use("/api/builders", buildersRouter);
  app.use("/api/contexts", contextsRouter);
  app.use("/api/registries", registriesRouter);
  app.use("/api/plugins", pluginsRouter);
  return app;
}

interface ListEndpoint {
  path: string;
  /** What the body has to be for the answer to be the one it has always been. */
  holds: (body: unknown) => boolean;
  shape: string;
}

const LIST_ENDPOINTS: ListEndpoint[] = [
  { path: "/api/containers", holds: Array.isArray, shape: "an array" },
  { path: "/api/images", holds: Array.isArray, shape: "an array" },
  { path: "/api/volumes", holds: Array.isArray, shape: "an array" },
  { path: "/api/networks", holds: Array.isArray, shape: "an array" },
  { path: "/api/compose/projects", holds: Array.isArray, shape: "an array" },
  { path: "/api/builders", holds: Array.isArray, shape: "an array" },
  { path: "/api/builders/cache", holds: Array.isArray, shape: "an array" },
  { path: "/api/contexts", holds: Array.isArray, shape: "an array" },
  { path: "/api/registries", holds: Array.isArray, shape: "an array" },
  {
    path: "/api/plugins",
    holds: (body) => Array.isArray((body as { cli?: { items?: unknown } })?.cli?.items) && Array.isArray((body as { daemon?: { items?: unknown } })?.daemon?.items),
    shape: "two listings, each with its items",
  },
];

// REQ-31 — "No endpoint is removed or changed in shape": every one of the ten still answers, as
// JSON, with the body it has always answered with.
test("every list endpoint answers 200 with the JSON body it has always answered with", async () => {
  const { url, close } = await startApp(buildListApp());
  try {
    for (const endpoint of LIST_ENDPOINTS) {
      const response = await fetch(`${url}${endpoint.path}`);
      // The answer's own text goes into the failure message: an endpoint that
      // did not come back names the reason in its body, and reporting the status
      // alone loses it.
      const text = await response.text();
      assert.equal(response.status, 200, `expected ${endpoint.path} to answer, got ${response.status}: ${text}`);
      assert.match(response.headers.get("content-type") ?? "", /application\/json/, `${endpoint.path} answered something other than JSON`);
      assert.ok(endpoint.holds(JSON.parse(text)), `${endpoint.path} no longer answers with ${endpoint.shape}: ${text}`);
    }
  } finally {
    await close();
  }
});

// REQ-31 — answering "as they do today" is more than answering: the objects on the daemon are in
// the answer, which is what a caller outside the interface reads them for.
test("the list endpoints report the container, volume and network on the daemon", async () => {
  const { url, close } = await startApp(buildListApp());
  const volumeName = fixtureName("list-endpoints-volume");
  const networkName = fixtureName("list-endpoints-network");
  let containerName: string | undefined;
  try {
    containerName = (await createSleepingContainer("list-endpoints")).name;
    await execFileAsync("docker", ["volume", "create", ...ownershipArgs("list-endpoints-volume"), volumeName]);
    await execFileAsync("docker", ["network", "create", ...ownershipArgs("list-endpoints-network"), networkName]);

    const containers = (await (await fetch(`${url}/api/containers`)).json()) as { name: string }[];
    const volumes = (await (await fetch(`${url}/api/volumes`)).json()) as { name: string }[];
    const networks = (await (await fetch(`${url}/api/networks`)).json()) as { name: string }[];
    const images = (await (await fetch(`${url}/api/images`)).json()) as { tags: string[] }[];

    assert.ok(containers.some((container) => container.name === containerName), "the container created is not in the listing");
    assert.ok(volumes.some((volume) => volume.name === volumeName), "the volume created is not in the listing");
    assert.ok(networks.some((network) => network.name === networkName), "the network created is not in the listing");
    assert.ok(images.some((image) => image.tags.includes(ALPINE_IMAGE)), "the image the container runs from is not in the listing");
  } finally {
    if (containerName) await removeContainerQuietly(containerName);
    await removeVolumeQuietly(volumeName);
    await removeNetworkQuietly(networkName);
    await close();
  }
});
