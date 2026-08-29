import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express, { type Express } from "express";
import { containersRouter } from "../../src/containers/containers-routes.js";
import { imagesRouter } from "../../src/images/images-routes.js";
import { volumesRouter } from "../../src/volumes/volumes-routes.js";
import { networksRouter } from "../../src/networks/networks-routes.js";
import { composeRouter } from "../../src/compose/compose-routes.js";
import { contextsRouter } from "../../src/contexts/contexts-routes.js";
import { buildersRouter } from "../../src/builders/builders-routes.js";
import { connectivityRouter } from "../../src/connectivity/connectivity-routes.js";
import { EngineClient } from "../../src/docker/engine-client.js";
import { resetRefreshCache } from "../../src/refresh-cache/refresh-cache.js";
import { startApp, ownershipArgs } from "../support/fixtures.js";
import { ALPINE_IMAGE, TINY_IMAGE, ensureImages } from "../support/base-images.js";
import { execFileAsync } from "../support/docker-cli.js";

// Shared infrastructure, not fixtures: ensured before the first test, removed by
// nothing. Every fixture below is built from one of these two.
await ensureImages([ALPINE_IMAGE, TINY_IMAGE]);

const RUN_ID = `${process.pid}-${Date.now()}`;
const OWNER_LABEL = "vexel.test.run";

function fixtureName(caseName: string): string {
  return `vexel-test-refresh-${caseName}-${RUN_ID}`;
}

/**
 * Every call this process makes to the daemon's Engine API, recorded so a test
 * can state that answering a request cost none (REQ-9, REQ-17). The Engine API
 * is the daemon's own surface, so counting calls at it is counting the work the
 * daemon is asked for.
 */
const enginePaths: string[] = [];
const originalRequest = EngineClient.prototype.request;
EngineClient.prototype.request = async function (this: EngineClient, path: string, options = {}) {
  enginePaths.push(path);
  return await originalRequest.call(this, path, options);
};

after(() => {
  EngineClient.prototype.request = originalRequest;
});

function countEngineCalls(pattern: RegExp): number {
  return enginePaths.filter((path) => pattern.test(path)).length;
}

function buildFullApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/api/containers", containersRouter);
  app.use("/api/images", imagesRouter);
  app.use("/api/volumes", volumesRouter);
  app.use("/api/networks", networksRouter);
  app.use("/api/compose", composeRouter);
  app.use("/api/contexts", contextsRouter);
  app.use("/api/builders", buildersRouter);
  app.use("/api/connectivity", connectivityRouter);
  return app;
}

interface ListAnswer<T> {
  status: number;
  readAt: string | null;
  ageMs: number;
  stale: boolean;
  body: T;
}

async function getList<T>(url: string, path: string): Promise<ListAnswer<T>> {
  const response = await fetch(`${url}${path}`);
  const body = (await response.json()) as T;
  return {
    status: response.status,
    readAt: response.headers.get("X-Vexel-Read-At"),
    ageMs: Number(response.headers.get("X-Vexel-Age-Ms")),
    stale: response.headers.get("X-Vexel-Stale") === "true",
    body,
  };
}

/** Puts every kind back to its registered state, so no case inherits what another read. */
function freshCache(): void {
  resetRefreshCache();
  enginePaths.length = 0;
}

interface NamedSummary {
  name: string;
  [key: string]: unknown;
}

function names(list: NamedSummary[]): string[] {
  return list.map((one) => one.name);
}

async function removeContainerQuietly(name: string): Promise<void> {
  await execFileAsync("docker", ["rm", "-fv", name]).catch(() => undefined);
}

async function createSleepingContainer(name: string): Promise<string> {
  const { stdout } = await execFileAsync("docker", [
    "run", "-d", "--name", name, ...ownershipArgs(name), "--entrypoint", "sleep", ALPINE_IMAGE, "300",
  ]);
  return stdout.trim();
}

// plan-docker_management_app-refresh_cache/REQ-9 — a list endpoint answers from a value the server
// already holds, without calling the daemon while the client waits.
test("GET /api/containers answers the second request without calling the daemon for the list", async () => {
  const name = fixtureName("held");
  const { url, close } = await startApp(buildFullApp());
  try {
    freshCache();
    await createSleepingContainer(name);

    const first = await getList<NamedSummary[]>(url, "/api/containers");
    assert.equal(first.status, 200);
    assert.ok(names(first.body).includes(name), "the fixture container is not in the first answer");
    assert.ok(first.readAt !== null, "the answer states no read time");
    assert.equal(
      countEngineCalls(/^\/containers\/json/),
      1,
      "the first request, with nothing held, read once with the client waiting",
    );

    const callsAfterFirst = countEngineCalls(/^\/containers\/json/);
    const second = await getList<NamedSummary[]>(url, "/api/containers");

    assert.equal(second.status, 200);
    assert.equal(
      countEngineCalls(/^\/containers\/json/),
      callsAfterFirst,
      "the second request called the daemon for the list while the client waited",
    );
    assert.equal(second.readAt, first.readAt, "the second answer was read again rather than served from what was held");
    assert.ok(names(second.body).includes(name), "the held answer lost the fixture container");
    assert.ok(second.ageMs >= 0, "the answer states no age");
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// plan-docker_management_app-refresh_cache/REQ-17 — two clients asking for the same list cost the
// daemon what one costs.
test("two clients asking for the container list at once cost the daemon one read", async () => {
  const name = fixtureName("two-clients");
  const { url, close } = await startApp(buildFullApp());
  try {
    freshCache();
    await createSleepingContainer(name);

    const [a, b] = await Promise.all([
      getList<NamedSummary[]>(url, "/api/containers"),
      getList<NamedSummary[]>(url, "/api/containers"),
    ]);

    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal(
      countEngineCalls(/^\/containers\/json/),
      1,
      "two clients arriving together cost the daemon two list reads",
    );
    assert.equal(a.readAt, b.readAt, "the two clients were served values read at different moments");

    // …and a third, arriving after them, costs nothing at all.
    const third = await getList<NamedSummary[]>(url, "/api/containers");
    assert.equal(countEngineCalls(/^\/containers\/json/), 1, "a third client cost the daemon a read of its own");
    assert.equal(third.readAt, a.readAt);
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// plan-docker_management_app-refresh_cache/REQ-9 — every list endpoint of the batch answers from a
// held value, and states when it was read.
test("every list endpoint states its read time and serves the same value on a second request", async () => {
  const paths = [
    "/api/containers",
    "/api/images",
    "/api/volumes",
    "/api/networks",
    "/api/compose/projects",
    "/api/contexts",
    "/api/builders",
    "/api/builders/cache",
    "/api/connectivity/status",
  ];
  const { url, close } = await startApp(buildFullApp());
  try {
    freshCache();
    for (const path of paths) {
      const first = await getList<unknown>(url, path);
      assert.equal(first.status, 200, `${path} answered ${first.status}`);
      assert.ok(first.readAt !== null, `${path} states no read time`);

      const second = await getList<unknown>(url, path);
      assert.equal(second.status, 200, `${path} answered ${second.status} on the second request`);
      assert.equal(second.readAt, first.readAt, `${path} read again while the client waited`);
      assert.deepEqual(second.body, first.body, `${path} answered something else from what it held`);
    }
  } finally {
    await close();
  }
});

// plan-docker_management_app-refresh_cache/REQ-13, REQ-45 — the kill answers when the signal has
// been delivered, not when the container has exited, so what is asserted after it is the read time
// of the listing served, anchored on the instant the kill was sent because the route marks the
// listing changed before it answers; the stop and the start answer with the state settled, so after
// those two it is the state itself. REQ-46 — nothing here may wait, retry or poll for the value it
// expects: such a check would pass while the cache had stopped reading and waited out its period.
test("killing, stopping and starting a container through the application shows in the very next list request", async () => {
  const name = fixtureName("lifecycle");
  const { url, close } = await startApp(buildFullApp());
  try {
    freshCache();
    const id = await createSleepingContainer(name);

    const before = await getList<{ name: string; state: string }[]>(url, "/api/containers");
    assert.equal(before.body.find((one) => one.name === name)?.state, "running");

    const killAskedAt = Date.now();
    const killed = await fetch(`${url}/api/containers/${id}/kill`, { method: "POST" });
    assert.equal(killed.status, 204);

    const afterKill = await getList<{ name: string; state: string }[]>(url, "/api/containers");
    assert.ok(
      Date.parse(afterKill.readAt ?? "") >= killAskedAt,
      `the list served after the kill was read at ${afterKill.readAt}, and the kill was asked for at ${new Date(killAskedAt).toISOString()}`,
    );

    const stopped = await fetch(`${url}/api/containers/${id}/stop`, { method: "POST" });
    assert.equal(stopped.status, 204);

    const afterStop = await getList<{ name: string; state: string }[]>(url, "/api/containers");
    assert.equal(
      afterStop.body.find((one) => one.name === name)?.state,
      "exited",
      "the list still reported the container running after the application stopped it",
    );

    const started = await fetch(`${url}/api/containers/${id}/start`, { method: "POST" });
    assert.equal(started.status, 204);

    const afterStart = await getList<{ name: string; state: string }[]>(url, "/api/containers");
    assert.equal(
      afterStart.body.find((one) => one.name === name)?.state,
      "running",
      "the list still reported the container stopped after the application started it",
    );
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// plan-docker_management_app-refresh_cache/REQ-13 — rename and remove have routes of their own.
test("renaming and removing a container through the application shows in the very next list request", async () => {
  const name = fixtureName("rename");
  const renamed = `${name}-renamed`;
  const { url, close } = await startApp(buildFullApp());
  try {
    freshCache();
    const id = await createSleepingContainer(name);
    await getList<NamedSummary[]>(url, "/api/containers");

    const renameResponse = await fetch(`${url}/api/containers/${id}/rename`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: renamed }),
    });
    assert.equal(renameResponse.status, 204);

    const afterRename = await getList<NamedSummary[]>(url, "/api/containers");
    assert.ok(names(afterRename.body).includes(renamed), "the list still carried the old name after the rename");
    assert.ok(!names(afterRename.body).includes(name), "the list still carried the container under its old name");

    const removeResponse = await fetch(`${url}/api/containers/${id}`, { method: "DELETE" });
    assert.equal(removeResponse.status, 204);

    const afterRemove = await getList<NamedSummary[]>(url, "/api/containers");
    assert.ok(!names(afterRemove.body).includes(renamed), "the list still carried the container after the application removed it");
  } finally {
    await removeContainerQuietly(renamed);
    await removeContainerQuietly(name);
    await close();
  }
});

// plan-docker_management_app-refresh_cache/REQ-13 — creating a container through the application.
test("creating a container through the application shows in the very next list request", async () => {
  const name = fixtureName("create");
  const { url, close } = await startApp(buildFullApp());
  try {
    freshCache();
    await getList<NamedSummary[]>(url, "/api/containers");

    const response = await fetch(`${url}/api/containers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        image: ALPINE_IMAGE,
        name,
        entrypoint: ["sleep"],
        command: ["300"],
        labels: { [OWNER_LABEL]: RUN_ID },
        start: true,
      }),
    });
    const events = (await response.text())
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line) as { type: string; message?: string });
    assert.equal(events.at(-1)?.type, "created", `creation refused: ${JSON.stringify(events.at(-1))}`);

    const after = await getList<NamedSummary[]>(url, "/api/containers");
    assert.ok(names(after.body).includes(name), "the list did not carry the container the application had just created");
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// plan-docker_management_app-refresh_cache/REQ-13 — volumes: create and remove.
test("creating and removing a volume through the application shows in the very next list request", async () => {
  const name = fixtureName("volume");
  const { url, close } = await startApp(buildFullApp());
  try {
    freshCache();
    await getList<NamedSummary[]>(url, "/api/volumes");

    const created = await fetch(`${url}/api/volumes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, labels: { [OWNER_LABEL]: RUN_ID } }),
    });
    assert.equal(created.status, 201);

    const afterCreate = await getList<NamedSummary[]>(url, "/api/volumes");
    assert.ok(names(afterCreate.body).includes(name), "the list did not carry the volume the application had just created");

    const removed = await fetch(`${url}/api/volumes/${name}`, { method: "DELETE" });
    assert.equal(removed.status, 204);

    const afterRemove = await getList<NamedSummary[]>(url, "/api/volumes");
    assert.ok(!names(afterRemove.body).includes(name), "the list still carried the volume the application had just removed");
  } finally {
    await execFileAsync("docker", ["volume", "rm", "-f", name]).catch(() => undefined);
    await close();
  }
});

// plan-docker_management_app-refresh_cache/REQ-13 — networks: create, attach, detach and remove.
test("creating, attaching, detaching and removing a network shows in the very next list request", async () => {
  const name = fixtureName("network");
  const containerName = fixtureName("network-member");
  const { url, close } = await startApp(buildFullApp());
  try {
    freshCache();
    const containerId = await createSleepingContainer(containerName);
    await getList<NamedSummary[]>(url, "/api/networks");

    const created = await fetch(`${url}/api/networks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, labels: { [OWNER_LABEL]: RUN_ID } }),
    });
    assert.equal(created.status, 201);

    const afterCreate = await getList<{ name: string; attachedContainers: string[] }[]>(url, "/api/networks");
    assert.ok(
      afterCreate.body.some((one) => one.name === name),
      "the list did not carry the network the application had just created",
    );

    const attached = await fetch(`${url}/api/networks/${name}/attach`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ containerId }),
    });
    assert.equal(attached.status, 200);

    const afterAttach = await getList<{ name: string; attachedContainers: string[] }[]>(url, "/api/networks");
    const attachedRow = afterAttach.body.find((one) => one.name === name);
    assert.ok(
      (attachedRow?.attachedContainers ?? []).includes(containerName),
      "the network row did not carry the container the application had just attached",
    );

    const detached = await fetch(`${url}/api/networks/${name}/detach`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ containerId }),
    });
    assert.equal(detached.status, 200);

    const afterDetach = await getList<{ name: string; attachedContainers: string[] }[]>(url, "/api/networks");
    const detachedRow = afterDetach.body.find((one) => one.name === name);
    assert.ok(
      !(detachedRow?.attachedContainers ?? []).includes(containerName),
      "the network row still carried the container the application had just detached",
    );

    const removed = await fetch(`${url}/api/networks/${name}`, { method: "DELETE" });
    assert.equal(removed.status, 204);

    const afterRemove = await getList<NamedSummary[]>(url, "/api/networks");
    assert.ok(!names(afterRemove.body).includes(name), "the list still carried the network the application had just removed");
  } finally {
    await removeContainerQuietly(containerName);
    await execFileAsync("docker", ["network", "rm", name]).catch(() => undefined);
    await close();
  }
});

// plan-docker_management_app-refresh_cache/REQ-13 — images: tag and untag.
test("tagging and untagging an image through the application shows in the very next list request", async () => {
  const reference = `${fixtureName("image").toLowerCase()}:1`;
  const { url, close } = await startApp(buildFullApp());
  try {
    freshCache();
    const before = await getList<{ id: string; tags: string[] }[]>(url, "/api/images");
    const source = before.body.find((image) => image.tags.includes(TINY_IMAGE));
    assert.ok(source, `the list does not carry ${TINY_IMAGE}, which this case tags`);

    const tagged = await fetch(`${url}/api/images/${encodeURIComponent(source!.id)}/tag`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reference }),
    });
    assert.equal(tagged.status, 204);

    const afterTag = await getList<{ tags: string[] }[]>(url, "/api/images");
    assert.ok(
      afterTag.body.some((image) => image.tags.includes(reference)),
      "the list did not carry the tag the application had just added",
    );

    const untagged = await fetch(`${url}/api/images/untag?reference=${encodeURIComponent(reference)}`, { method: "DELETE" });
    assert.equal(untagged.status, 204);

    const afterUntag = await getList<{ tags: string[] }[]>(url, "/api/images");
    assert.ok(
      !afterUntag.body.some((image) => image.tags.includes(reference)),
      "the list still carried the tag the application had just removed",
    );
  } finally {
    await execFileAsync("docker", ["rmi", reference]).catch(() => undefined);
    await close();
  }
});

// plan-docker_management_app-refresh_cache/REQ-13 — compose: up and down.
test("bringing a compose project up and down shows in the very next projects request", async () => {
  const projectName = fixtureName("compose").toLowerCase();
  const dir = await mkdtemp(join(tmpdir(), "vexel-test-refresh-compose-"));
  const filePath = join(dir, "docker-compose.yml");
  const { url, close } = await startApp(buildFullApp());
  try {
    freshCache();
    await writeFile(
      filePath,
      [
        "services:",
        "  web:",
        `    image: ${ALPINE_IMAGE}`,
        "    pull_policy: never",
        '    command: ["sleep", "300"]',
        "    labels:",
        `      - "${OWNER_LABEL}=${RUN_ID}"`,
        "",
      ].join("\n"),
      "utf8",
    );
    // Registered without being started, so the lifecycle endpoints can resolve
    // its config files, exactly as compose-routes.test.ts does.
    await execFileAsync("docker", ["compose", "-f", filePath, "-p", projectName, "create"]);

    const before = await getList<{ name: string; state: string }[]>(url, "/api/compose/projects");
    assert.ok(before.body.some((project) => project.name === projectName), "the fixture project is not discovered");

    const upResponse = await fetch(`${url}/api/compose/projects/${projectName}/up`, { method: "POST" });
    assert.equal(upResponse.status, 200);
    await upResponse.text();

    const afterUp = await getList<{ name: string; state: string }[]>(url, "/api/compose/projects");
    assert.equal(
      afterUp.body.find((project) => project.name === projectName)?.state,
      "running",
      "the projects list did not report the project running after the application brought it up",
    );

    const downResponse = await fetch(`${url}/api/compose/projects/${projectName}/down`, { method: "POST" });
    assert.equal(downResponse.status, 200);
    await downResponse.text();

    const afterDown = await getList<{ name: string; state: string }[]>(url, "/api/compose/projects");
    assert.notEqual(
      afterDown.body.find((project) => project.name === projectName)?.state,
      "running",
      "the projects list still reported the project running after the application brought it down",
    );
  } finally {
    const { stdout } = await execFileAsync("docker", [
      "ps", "-aq", "--filter", `label=com.docker.compose.project=${projectName}`,
    ]).catch(() => ({ stdout: "" }));
    const ids = stdout.split("\n").filter((id) => id.length > 0);
    if (ids.length > 0) await execFileAsync("docker", ["rm", "-fv", ...ids]).catch(() => undefined);
    const networks = await execFileAsync("docker", [
      "network", "ls", "-q", "--filter", `label=com.docker.compose.project=${projectName}`,
    ]).catch(() => ({ stdout: "" }));
    const networkIds = networks.stdout.split("\n").filter((id) => id.length > 0);
    if (networkIds.length > 0) await execFileAsync("docker", ["network", "rm", ...networkIds]).catch(() => undefined);
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    await close();
  }
});

// plan-docker_management_app-refresh_cache/REQ-13 — contexts: create and remove. Selecting one is
// machine-wide state, so it stays out of the parallel API pass (see contexts-routes.test.ts).
test("creating and removing a context through the application shows in the very next list request", async () => {
  const name = fixtureName("context").toLowerCase();
  const { url, close } = await startApp(buildFullApp());
  try {
    freshCache();
    await getList<NamedSummary[]>(url, "/api/contexts");

    const created = await fetch(`${url}/api/contexts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, kind: "ssh", host: "operator@build-host", description: "a refresh-cache fixture" }),
    });
    assert.equal(created.status, 201, `creation answered ${created.status}: ${await created.text()}`);

    const afterCreate = await getList<NamedSummary[]>(url, "/api/contexts");
    assert.ok(names(afterCreate.body).includes(name), "the list did not carry the context the application had just created");

    const removed = await fetch(`${url}/api/contexts/${name}`, { method: "DELETE" });
    assert.equal(removed.status, 204);

    const afterRemove = await getList<NamedSummary[]>(url, "/api/contexts");
    assert.ok(!names(afterRemove.body).includes(name), "the list still carried the context the application had just removed");
  } finally {
    await execFileAsync("docker", ["context", "rm", "-f", name]).catch(() => undefined);
    await close();
  }
});

// plan-docker_management_app-refresh_cache/REQ-13 — builders: create and remove. Selecting one is
// machine-wide state, so it stays out of the parallel API pass (see builders-routes.test.ts).
test("creating and removing a builder through the application shows in the very next list request", async () => {
  const name = fixtureName("builder").toLowerCase();
  const { url, close } = await startApp(buildFullApp());
  try {
    freshCache();
    await getList<NamedSummary[]>(url, "/api/builders");

    const created = await fetch(`${url}/api/builders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, driver: "docker-container", platforms: ["linux/amd64"] }),
    });
    assert.equal(created.status, 201, `creation answered ${created.status}: ${await created.text()}`);

    const afterCreate = await getList<NamedSummary[]>(url, "/api/builders");
    assert.ok(names(afterCreate.body).includes(name), "the list did not carry the builder the application had just created");

    const removed = await fetch(`${url}/api/builders/${name}`, { method: "DELETE" });
    assert.equal(removed.status, 204);

    const afterRemove = await getList<NamedSummary[]>(url, "/api/builders");
    assert.ok(!names(afterRemove.body).includes(name), "the list still carried the builder the application had just removed");
  } finally {
    await execFileAsync("docker", ["buildx", "rm", name]).catch(() => undefined);
    await close();
  }
});
