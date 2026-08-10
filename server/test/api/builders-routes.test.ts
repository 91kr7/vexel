import { test } from "node:test";
import assert from "node:assert/strict";
import { buildersRouter } from "../../src/builders/builders-routes.js";
import type { BuilderSummary } from "../../src/builders/builders-service.js";
import { buildApp, startApp } from "../support/fixtures.js";
import { execFileAsync } from "../support/docker-cli.js";

const RUN_ID = `${process.pid}-${Date.now()}`;

// Nothing here builds an image or reads the build cache, so no base image is
// needed and no test switches the machine-wide active builder: the two cases
// that must switch it (`POST /api/builders/:name/use`, and the cache inventory
// which can only be attributed to a builder that is active) run alone, in
// test/exclusive/builders-active-routes.test.ts.

function fixtureName(caseName: string): string {
  return `vexel-test-builder-${caseName}-${RUN_ID}`;
}

async function fetchBuilders(url: string): Promise<BuilderSummary[]> {
  const response = await fetch(`${url}/api/builders`);
  return (await response.json()) as BuilderSummary[];
}

async function createBuilderQuietly(name: string, extraArgs: string[] = []): Promise<void> {
  await execFileAsync("docker", ["buildx", "create", "--name", name, "--driver", "docker-container", ...extraArgs]);
}

async function removeBuilderQuietly(name: string): Promise<void> {
  await execFileAsync("docker", ["buildx", "rm", name]).catch(() => undefined);
}

// plan-docker_management_app/REQ-88 — buildx builders are listed with name, driver, endpoint,
// supported platforms, status and cache size; the builder currently in use is identified
test("GET /api/builders lists a created builder with its driver, platforms and endpoint, not marked active", async () => {
  const name = fixtureName("list");
  const { url, close } = await startApp(buildApp("/api/builders", buildersRouter));
  try {
    await createBuilderQuietly(name, ["--platform", "linux/amd64,linux/arm64"]);
    const builders = await fetchBuilders(url);
    const found = builders.find((builder) => builder.name === name);
    assert.ok(found, "created builder not found in the list");
    assert.equal(found!.driver, "docker-container");
    assert.deepEqual(found!.platforms.sort(), ["linux/amd64", "linux/arm64"]);
    assert.ok(found!.endpoint.length > 0);
    assert.equal(found!.active, false);
    // Never bootstrapped: its cache cannot be read, so cacheBytes stays omitted rather than 0.
    assert.equal(found!.cacheBytes, undefined);
  } finally {
    await removeBuilderQuietly(name);
    await close();
  }
});

// plan-docker_management_app/REQ-89 — a builder can be created with a name, driver and platforms
test("POST /api/builders creates a builder with the given name, driver and platforms", async () => {
  const name = fixtureName("create");
  const { url, close } = await startApp(buildApp("/api/builders", buildersRouter));
  try {
    const response = await fetch(`${url}/api/builders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, driver: "docker-container", platforms: ["linux/amd64"] }),
    });
    assert.equal(response.status, 201);
    const created = (await response.json()) as BuilderSummary;
    assert.equal(created.name, name);
    assert.equal(created.driver, "docker-container");
    assert.deepEqual(created.platforms, ["linux/amd64"]);
    assert.equal(created.active, false);

    const builders = await fetchBuilders(url);
    assert.ok(builders.some((builder) => builder.name === name));
  } finally {
    await removeBuilderQuietly(name);
    await close();
  }
});

// builders-endpoints.md — name/driver are required
test("POST /api/builders with a missing driver is rejected with 400, creating nothing", async () => {
  const { url, close } = await startApp(buildApp("/api/builders", buildersRouter));
  try {
    const response = await fetch(`${url}/api/builders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: fixtureName("no-driver") }),
    });
    assert.equal(response.status, 400);
    const body = (await response.json()) as { error?: string };
    assert.ok(typeof body.error === "string" && body.error.length > 0);
  } finally {
    await close();
  }
});

// builders-service.md — createBuilder rejects with the daemon's own message on a name collision
test("POST /api/builders with a name colliding with an existing builder responds with the daemon's own rejection message", async () => {
  const name = fixtureName("dup");
  const { url, close } = await startApp(buildApp("/api/builders", buildersRouter));
  try {
    await createBuilderQuietly(name);
    const response = await fetch(`${url}/api/builders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, driver: "docker-container" }),
    });
    assert.ok(response.status >= 400, `expected an error status, got ${response.status}`);
    const body = (await response.json()) as { error?: string };
    assert.match(body.error ?? "", /existing instance/i);
  } finally {
    await removeBuilderQuietly(name);
    await close();
  }
});

// builders-endpoints.md — "Any daemon/CLI-side failure on the above -> 502 (or the error's own
// status code)". Recorded explicitly rather than folded into the message-only assertion above.
test("a CLI-side failure on POST /api/builders defaults to 502 per the endpoint contract", async () => {
  const name = fixtureName("dup-status");
  const { url, close } = await startApp(buildApp("/api/builders", buildersRouter));
  try {
    await createBuilderQuietly(name);
    const response = await fetch(`${url}/api/builders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, driver: "docker-container" }),
    });
    assert.equal(response.status, 502);
  } finally {
    await removeBuilderQuietly(name);
    await close();
  }
});

// plan-docker_management_app/REQ-89 — a builder can be removed
test("DELETE /api/builders/:name removes the builder so it no longer appears in the list", async () => {
  const name = fixtureName("remove");
  const { url, close } = await startApp(buildApp("/api/builders", buildersRouter));
  try {
    await createBuilderQuietly(name);
    const response = await fetch(`${url}/api/builders/${name}`, { method: "DELETE" });
    assert.equal(response.status, 204);

    const builders = await fetchBuilders(url);
    assert.ok(!builders.some((builder) => builder.name === name));
  } finally {
    await removeBuilderQuietly(name);
    await close();
  }
});

// builders-service.md — removeBuilder rejects with the daemon's own message for an unknown name
test("DELETE /api/builders/:name for an unknown name responds with the daemon's own rejection message", async () => {
  const { url, close } = await startApp(buildApp("/api/builders", buildersRouter));
  try {
    const response = await fetch(`${url}/api/builders/does-not-exist-${Date.now()}`, { method: "DELETE" });
    assert.ok(response.status >= 400, `expected an error status, got ${response.status}`);
    const body = (await response.json()) as { error?: string };
    assert.match(body.error ?? "", /no builder|not found/i);
  } finally {
    await close();
  }
});

