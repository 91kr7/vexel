/**
 * What a daemon-backed file finds on the daemon it was handed
 * (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-65,
 * REQ-66, REQ-76).
 *
 * This file creates nothing and removes nothing: everything it asserts on was
 * put there by the reset that ran before it, which is the whole subject. It is
 * therefore also the one file of this tree whose fixtures are the reset's own,
 * and it names them one by one rather than counting anything on the host.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileAsync } from "../support/docker-cli.js";
import { REGISTRY_CONTAINER, TINY_IMAGE } from "../support/base-images.js";

async function imageExists(reference: string): Promise<boolean> {
  return await execFileAsync("docker", ["image", "inspect", reference]).then(
    () => true,
    () => false,
  );
}

/** Where the run's own registry answers, from the port it published. */
async function registryHost(): Promise<string> {
  const { stdout: mappings } = await execFileAsync("docker", ["port", REGISTRY_CONTAINER, "5000/tcp"]);
  const mapping = mappings.split("\n").map((line) => line.trim()).find((line) => line.length > 0);
  assert.ok(mapping, "the run's registry publishes no host port");
  return `localhost:${mapping.slice(mapping.lastIndexOf(":") + 1)}`;
}

// REQ-66 — the base images are put back at the end of every reset, so a file
// starting to run finds all three, under the names a spec writes.
test("every base image is on the daemon when a file starts", async () => {
  const present = await Promise.all(
    ["alpine:3.20", "registry:2", "vexel-test-tiny:1"].map(async (reference) => [reference, await imageExists(reference)] as const),
  );

  assert.deepEqual(
    present.filter(([, found]) => !found).map(([reference]) => reference),
    [],
    "a base image the reset restores is missing when the file starts",
  );
});

// REQ-66 — what makes "out of the run's own registry, never from Docker Hub"
// possible: the mirror holds the image the next restore needs. The provenance of
// a copy already on the daemon cannot be read off it — a mirrored image carries
// the manifest digest of the one it was copied from — so what is asserted is the
// local source, under the repository the Hub name maps to.
test("the run's own registry holds the image the next restore pulls", async () => {
  const host = await registryHost();

  const response = await fetch(`http://${host}/v2/alpine/tags/list`);
  assert.equal(response.status, 200, `the run's registry does not hold alpine at all (${response.status})`);
  const { tags } = (await response.json()) as { tags?: string[] | null };

  assert.ok(
    (tags ?? []).includes("3.20"),
    `the run's registry holds no alpine:3.20, so a restore would have to reach Docker Hub: ${(tags ?? []).join(", ")}`,
  );
});

// REQ-76 — the single-layer image is built locally and is not published to the
// run's registry: nothing pulls it, so nothing has to. Asserted on the catalog
// rather than on one repository, so publishing it under any name fails here.
test("the run's own registry does not hold the single-layer image", async () => {
  const repository = TINY_IMAGE.slice(0, TINY_IMAGE.lastIndexOf(":"));

  const response = await fetch(`http://${await registryHost()}/v2/_catalog?n=1000`);
  assert.equal(response.status, 200, `the run's registry does not answer its catalog (${response.status})`);
  const { repositories } = (await response.json()) as { repositories?: string[] | null };

  assert.deepEqual(
    (repositories ?? []).filter((held) => held === repository || held.endsWith(`/${repository}`)),
    [],
    `${TINY_IMAGE} is published to the run's registry rather than built on the daemon`,
  );
});

// REQ-65 — the run's registry container survives every reset, because it is what
// keeps `registry:2` in use.
test("the run's own registry is still running", async () => {
  const { stdout } = await execFileAsync("docker", [
    "ps",
    "--filter",
    `name=^${REGISTRY_CONTAINER}$`,
    "--format",
    "{{.Names}} {{.State}}",
  ]);

  assert.match(stdout.trim(), new RegExp(`^${REGISTRY_CONTAINER} running$`, "m"), `the registry container was removed by the reset: ${stdout.trim() || "not listed"}`);
});
