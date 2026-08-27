import { test } from "node:test";
import assert from "node:assert/strict";
import express, { type Express } from "express";
import { createServer, type AddressInfo } from "node:net";
import { containersRouter } from "../../src/containers/containers-routes.js";
import { ownershipArgs } from "../support/fixtures.js";
import { INTERNAL_CONTAINER_LABEL } from "../../src/image-analysis/filesystem-extraction-service.js";
import { ALPINE_IMAGE, REGISTRY_IMAGE, ensureImages } from "../support/base-images.js";

// Shared infrastructure, not fixtures: ensured before the first test, and removed by nothing.
// `registry:2` is here for one fixture — a container whose **image** exposes a port of its own,
// which is the case REQ-59 draws its "and only those" line through.
await ensureImages([ALPINE_IMAGE, REGISTRY_IMAGE]);
import type {
  ContainerConfigUpdateResult,
  ContainerInspect,
  ContainerSummary,
} from "../../src/containers/containers-service.js";
import { execFileAsync } from "../support/docker-cli.js";

function startApp(app: Express): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((closeResolve) => server.close(() => closeResolve())),
      });
    });
  });
}

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/api/containers", containersRouter);
  return app;
}

// A tiny image (ensured local above) whose entrypoint is overridden to `sleep`
// so the container starts instantly and needs no network pull or app init.
async function createSleepingContainer(name: string, extraArgs: string[] = []): Promise<string> {
  const { stdout } = await execFileAsync("docker", [
    "run",
    "-d",
    "--name",
    name,
    ...ownershipArgs(name),
    ...extraArgs,
    "--entrypoint",
    "sleep",
    "alpine:3.20",
    "300",
  ]);
  return stdout.trim();
}

async function removeContainerQuietly(name: string): Promise<void> {
  await execFileAsync("docker", ["rm", "-fv", name]).catch(() => undefined);
}

async function removeVolumeQuietly(name: string): Promise<void> {
  await execFileAsync("docker", ["volume", "rm", "-f", name]).catch(() => undefined);
}

async function fetchList(url: string): Promise<ContainerSummary[]> {
  const response = await fetch(`${url}/api/containers`);
  return (await response.json()) as ContainerSummary[];
}

/**
 * Waits for the list to report a container in the given state.
 *
 * The daemon acknowledges a lifecycle command once it has *accepted* it — `kill`
 * answers when the signal has been delivered, not when the process has gone — so
 * the state that follows arrives a moment later. REQ-20 promises the row
 * reflects the resulting state, not that it does so within one round trip:
 * reading the list once turns that promise into a race, and it lost one, finding
 * `running` on a container it had just killed.
 */
async function expectListedState(url: string, id: string, expected: ContainerSummary["state"]): Promise<void> {
  const deadline = Date.now() + 15_000;
  let seen: string | undefined;
  for (;;) {
    seen = (await fetchList(url)).find((container) => container.id === id)?.state;
    if (seen === expected) return;
    if (Date.now() > deadline) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(seen, expected, `the list still reports ${String(seen)} rather than ${expected}`);
}

// plan-docker_management_app/REQ-19 — the list carries name, short id, state, image, published ports and uptime
test("GET /api/containers lists a running container with its name, short id, state, image, published ports and status", async () => {
  const name = `vexel-test-list-${Date.now()}`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const id = await createSleepingContainer(name, ["-p", "0:5432"]);
    const containers = await fetchList(url);
    const found = containers.find((container) => container.name === name);
    assert.ok(found, "created container not found in the list");
    assert.equal(found!.shortId, id.slice(0, 12));
    assert.equal(found!.state, "running");
    assert.equal(found!.image, "alpine:3.20");
    assert.ok(found!.ports.some((port) => port.privatePort === 5432 && typeof port.publicPort === "number"));
    assert.ok(found!.status.length > 0);
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// plan-docker_management_app-containers_card_view/REQ-5, REQ-12, REQ-15 — each mapping reported
// once, in one order, on every read, against the daemon's own answer.
test("GET /api/containers reports each published mapping once, in one order, on every read", async () => {
  const name = `vexel-test-ports-${Date.now()}`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    await createSleepingContainer(name, ["-p", "0:9090", "-p", "0:5432", "-p", "0:8080", "-p", "0:6379"]);

    // The daemon's own answer, so a passing assertion below is known not to be vacuous: on a
    // dual-stack host `docker port` reports two bindings for one container port.
    const { stdout: bindings } = await execFileAsync("docker", ["port", name]);
    console.log(`[REQ-5] the daemon reports ${bindings.trim().split("\n").length} bindings for ${name}:\n${bindings.trim()}`);

    const reads: string[][] = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const found = (await fetchList(url)).find((candidate) => candidate.name === name);
      assert.ok(found, "created container not found in the list");
      reads.push(found!.ports.map((port) => `${port.type}:${port.publicPort ?? "-"}->${port.privatePort}`));
    }

    const [first] = reads;
    // Every mapping the container publishes is there, and each of them exactly once.
    assert.deepEqual(
      [...first].sort(),
      [...new Set(first)].sort(),
      `a mapping is reported more than once: ${JSON.stringify(first)}`,
    );
    for (const privatePort of [5432, 6379, 8080, 9090]) {
      assert.equal(
        first.filter((mapping) => mapping.endsWith(`->${privatePort}`)).length,
        1,
        `${privatePort} is reported ${first.filter((mapping) => mapping.endsWith(`->${privatePort}`)).length} times: ${JSON.stringify(first)}`,
      );
    }

    // The order is the service's own — private port, then public port, then protocol — and not the
    // daemon's, which rotates between reads.
    const privatePorts = first.map((mapping) => Number(mapping.split("->")[1]));
    assert.deepEqual(privatePorts, [...privatePorts].sort((left, right) => left - right), `the ports are not ordered: ${JSON.stringify(first)}`);

    // Three reads of an unchanged container: one sequence, so the two chips a card draws are the
    // same two while the operator watches.
    for (const read of reads) assert.deepEqual(read, first, `two reads of ${name} disagree: ${JSON.stringify(reads)}`);
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

/**
 * `…-tabs_composition_refactor/REQ-60` — the summary lists the container's **publications and only
 * those**, so it answers the same question the inspect reading answers.
 *
 * **This is the reversal of what this file asserted until 2026-08-27**, when the same fixture proved
 * the opposite: the 2026-08-25 annotation of `containers_card_view/REQ-5` had the card carry
 * exposed-but-unpublished ports too, grounded on `containers_card_view/REQ-12` — no value the
 * delivered row showed may disappear. The same human reversed it on new evidence, after being shown
 * that earlier ruling: `EXPOSE` binds no host port and gates no container-to-container traffic, so
 * such an entry never told the operator anything. REQ-12 stands for every other value.
 *
 * `GET /containers/json` is the one place the drop is falsifiable, and the daemon's own answer is
 * read here so a passing assertion is known not to be vacuous: it lists the exposure, carrying no
 * public port, and the service is what drops it.
 */
test("GET /api/containers reports no entry for a port the container exposes without publishing", async () => {
  const name = `vexel-test-exposed-${Date.now()}`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    await createSleepingContainer(name, ["--expose", "7777"]);
    const { stdout: daemonPorts } = await execFileAsync("docker", ["ps", "--filter", `name=${name}`, "--format", "{{.Ports}}"]);
    console.log(`[REQ-60] the daemon lists ${name} as: ${daemonPorts.trim() || "(nothing)"}`);
    assert.ok(
      daemonPorts.includes("7777/tcp"),
      `the daemon no longer lists the exposure at all, so this fixture no longer covers the case: ${daemonPorts}`,
    );

    const found = (await fetchList(url)).find((candidate) => candidate.name === name);
    assert.ok(found, "created container not found in the list");
    assert.deepEqual(
      found!.ports.filter((port) => port.privatePort === 7777),
      [],
      `a port that is exposed and published nowhere is reported as a mapping: ${JSON.stringify(found!.ports)}`,
    );
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

/**
 * `…-tabs_composition_refactor/REQ-60` — "the two readings answer the same question on the same
 * container", asserted on one container rather than inferred from two checks of two fixtures.
 *
 * The fixture publishes **and** exposes, and publishes in the third "the daemon chooses" spelling:
 * `-p 0:5432` stores `HostPort: "0"` literally in `HostConfig.PortBindings`, which is a host port of
 * `0` and not a host port in force (`containers-service.md`). The number the daemon actually chose
 * is read off the daemon and demanded of both readings, so a reading that reported `0`, or none,
 * fails here.
 */
test("GET /api/containers and the inspect state the same publication for a container that publishes and exposes", async () => {
  const name = `vexel-test-both-readings-${Date.now()}`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const id = await createSleepingContainer(name, ["-p", "0:5432", "--expose", "7777"]);
    const maps = await portMapsOf(id);
    const { stdout: published } = await execFileAsync("docker", ["port", name, "5432/tcp"]);
    console.log(`[REQ-60] ${name}: PortBindings ${maps.bindings} / NetworkSettings.Ports ${maps.network} / docker port ${published.trim().replace(/\n/g, " | ")}`);

    // The premise of the third spelling, asserted rather than assumed.
    assert.ok(maps.bindings.includes('"HostPort":"0"'), `-p 0:5432 no longer stores a literal 0 binding: ${maps.bindings}`);
    const hostPort = Number(published.trim().split("\n")[0].split(":").pop());
    assert.ok(Number.isInteger(hostPort) && hostPort > 0, `the daemon published no host port at all: ${published}`);

    const found = (await fetchList(url)).find((candidate) => candidate.name === name);
    assert.ok(found, "created container not found in the list");
    assert.deepEqual(
      found!.ports.map((port) => `${port.privatePort}/${port.type}->${port.publicPort ?? "none"}`),
      [`5432/tcp->${hostPort}`],
      `the summary is not the container's publications and only those: ${JSON.stringify(found!.ports)}`,
    );

    const inspect = await inspectOf(url, id);
    assert.deepEqual(
      inspect.ports.map((port) => `${port.containerPort}/${port.protocol}->${port.hostPort ?? "none"}`),
      [`5432/tcp->${hostPort}`],
      `the inspect reading is not the container's publications and only those: ${JSON.stringify(inspect.ports)}`,
    );
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// plan-docker_management_app/REQ-20 — stop applies to the daemon and the row reflects the resulting state
test("POST /api/containers/:id/stop stops a running container and the list reflects the exited state", async () => {
  const name = `vexel-test-stop-${Date.now()}`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const id = await createSleepingContainer(name);
    const response = await fetch(`${url}/api/containers/${id}/stop`, { method: "POST" });
    assert.equal(response.status, 204);
    await expectListedState(url, id, "exited");
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// plan-docker_management_app/REQ-20 — pause and unpause apply to the daemon and the row reflects each resulting state
test("POST pause and unpause toggle a running container's reported state", async () => {
  const name = `vexel-test-pause-${Date.now()}`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const id = await createSleepingContainer(name);
    const pauseResponse = await fetch(`${url}/api/containers/${id}/pause`, { method: "POST" });
    assert.equal(pauseResponse.status, 204);
    await expectListedState(url, id, "paused");

    const unpauseResponse = await fetch(`${url}/api/containers/${id}/unpause`, { method: "POST" });
    assert.equal(unpauseResponse.status, 204);
    await expectListedState(url, id, "running");
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// plan-docker_management_app/REQ-20 — kill applies to the daemon and the row reflects the resulting state
test("POST /api/containers/:id/kill kills a running container and the list reflects the exited state", async () => {
  const name = `vexel-test-kill-${Date.now()}`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const id = await createSleepingContainer(name);
    const response = await fetch(`${url}/api/containers/${id}/kill`, { method: "POST" });
    assert.equal(response.status, 204);
    await expectListedState(url, id, "exited");
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// plan-docker_management_app/REQ-20 — restart applies to the daemon and the container is running again afterwards
test("POST /api/containers/:id/restart restarts a running container", async () => {
  const name = `vexel-test-restart-${Date.now()}`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const id = await createSleepingContainer(name);
    const response = await fetch(`${url}/api/containers/${id}/restart`, { method: "POST" });
    assert.equal(response.status, 204);
    await expectListedState(url, id, "running");
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// plan-docker_management_app/REQ-20 — remove is offered regardless of state and applies to the daemon
test("DELETE /api/containers/:id removes the container so it no longer appears in the list", async () => {
  const name = `vexel-test-remove-${Date.now()}`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const id = await createSleepingContainer(name);
    const response = await fetch(`${url}/api/containers/${id}`, { method: "DELETE" });
    assert.equal(response.status, 204);
    const containers = await fetchList(url);
    assert.ok(!containers.some((container) => container.id === id));
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// plan-docker_management_app/REQ-54 — an intermediate filesystem-extraction container is never listed.
test("GET /api/containers excludes an intermediate filesystem-extraction container from the list, and so from its count", async () => {
  const ordinaryName = `vexel-test-int7-ordinary-${Date.now()}`;
  const internalName = `vexel-test-int7-internal-${Date.now()}`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const ordinaryId = await createSleepingContainer(ordinaryName);
    const { stdout } = await execFileAsync("docker", [
      "create",
      "--name",
      internalName,
      ...ownershipArgs(internalName),
      "--label",
      `${INTERNAL_CONTAINER_LABEL}=true`,
      "alpine:3.20",
    ]);
    const internalId = stdout.trim();
    const containers = await fetchList(url);

    assert.ok(containers.some((container) => container.id === ordinaryId), "expected the ordinary container to still be listed");
    assert.ok(!containers.some((container) => container.id === internalId), "expected the intermediate extraction container to be excluded from the list");
    assert.ok(
      !containers.some((container) => container.name === internalName),
      "expected the intermediate extraction container to be excluded by name too",
    );
  } finally {
    await removeContainerQuietly(ordinaryName);
    await removeContainerQuietly(internalName);
    await close();
  }
});

// containers-endpoints.md — a daemon rejection (unknown id) surfaces the daemon's own message instead of succeeding silently
test("POST /api/containers/:id/stop with an unknown id responds with the daemon's own rejection message", async () => {
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const response = await fetch(`${url}/api/containers/does-not-exist-${Date.now()}/stop`, { method: "POST" });
    assert.notEqual(response.status, 204);
    const body = (await response.json()) as { error?: string };
    assert.ok(typeof body.error === "string" && body.error.length > 0);
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-21 — a container can be renamed and the change is reflected in the list
test("POST /api/containers/:id/rename renames the container", async () => {
  const originalName = `vexel-test-rename-${Date.now()}`;
  const newName = `${originalName}-renamed`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const id = await createSleepingContainer(originalName);
    const response = await fetch(`${url}/api/containers/${id}/rename`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: newName }),
    });
    assert.equal(response.status, 204);
    const containers = await fetchList(url);
    const found = containers.find((container) => container.id === id);
    assert.equal(found?.name, newName);
  } finally {
    await removeContainerQuietly(newName);
    await removeContainerQuietly(originalName);
    await close();
  }
});

// containers-endpoints.md — a blank name is rejected with 400 before reaching the daemon (REQ-21)
test("POST /api/containers/:id/rename rejects a blank name with 400 and leaves the container untouched", async () => {
  const name = `vexel-test-rename-blank-${Date.now()}`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const id = await createSleepingContainer(name);
    const response = await fetch(`${url}/api/containers/${id}/rename`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "   " }),
    });
    assert.equal(response.status, 400);
    const body = (await response.json()) as { error?: string };
    assert.ok(typeof body.error === "string" && body.error.length > 0);
    const containers = await fetchList(url);
    assert.equal(containers.find((container) => container.id === id)?.name, name);
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// plan-docker_management_app/REQ-24 — the detail view's inspect data carries identity, image, restart
// policy, resource limits, environment, ports, labels, networks and state
test("GET /api/containers/:id/inspect returns the full configuration of a container", async () => {
  const name = `vexel-test-inspect-${Date.now()}`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const id = await createSleepingContainer(name, [
      "-p",
      "0:5432",
      "-e",
      "FOO=bar",
      "--label",
      "team=vexel",
      "--restart",
      "on-failure:3",
      "--cpus",
      "0.5",
      "--memory",
      "128m",
    ]);
    const response = await fetch(`${url}/api/containers/${id}/inspect`);
    assert.equal(response.status, 200);
    const inspect = (await response.json()) as ContainerInspect;

    assert.equal(inspect.name, name);
    assert.equal(inspect.image, "alpine:3.20");
    assert.ok(inspect.entrypoint.includes("sleep"));
    assert.deepEqual(inspect.restartPolicy, { name: "on-failure", maximumRetryCount: 3 });
    assert.ok(inspect.resourceLimits.cpus && Math.abs(inspect.resourceLimits.cpus - 0.5) < 0.01);
    assert.equal(inspect.resourceLimits.memoryBytes, 128 * 1024 * 1024);
    assert.ok(inspect.env.includes("FOO=bar"));
    assert.equal(inspect.labels.team, "vexel");
    assert.ok(inspect.ports.some((port) => port.containerPort === 5432 && typeof port.hostPort === "number"));
    assert.ok(inspect.networks.some((network) => network.name === "bridge"));
    assert.equal(inspect.state.status, "running");
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

/**
 * A host port nothing on this machine is holding, taken by letting the operating system name one
 * and releasing it immediately. A literal high number would be a guess, and two test files guessing
 * at once is a `port is already allocated` that says nothing about the product.
 */
function freeHostPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

/** The daemon's own two port maps, read straight off the container, for the record of a run. */
async function portMapsOf(id: string): Promise<{ bindings: string; network: string; exposed: string }> {
  const read = async (field: string) => (await execFileAsync("docker", ["inspect", "--format", `{{json .${field}}}`, id])).stdout.trim();
  return { bindings: await read("HostConfig.PortBindings"), network: await read("NetworkSettings.Ports"), exposed: await read("Config.ExposedPorts") };
}

async function inspectOf(url: string, id: string): Promise<ContainerInspect> {
  const response = await fetch(`${url}/api/containers/${id}/inspect`);
  assert.equal(response.status, 200);
  return (await response.json()) as ContainerInspect;
}

/**
 * `…-tabs_composition_refactor/REQ-59` — **the case the mechanism exists for**, and the one no
 * stub of `HostConfig.PortBindings` can reach: `docker run -P` fills the bindings with `{}` and puts
 * the whole publication in `NetworkSettings.Ports`, host port and all. A reading confined to the
 * bindings reports nothing for a container that is genuinely published on the host.
 *
 * **This replaces the check that stood here for REQ-52 as first read** — "a port exposed without
 * publishing is carried by the inspect data" — which REQ-59 reverses; the `--expose`-only fixture
 * now has a check of its own, below, asserting the opposite.
 */
test("GET /api/containers/:id/inspect states the host port the daemon chose for a -P publication", async () => {
  const name = `vexel-test-inspect-publish-all-${Date.now()}`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const id = await createSleepingContainer(name, ["--expose", "5000", "-P"]);
    const maps = await portMapsOf(id);
    const { stdout: published } = await execFileAsync("docker", ["port", name, "5000/tcp"]);
    console.log(`[REQ-59] ${name}: PortBindings ${maps.bindings} / NetworkSettings.Ports ${maps.network} / docker port ${published.trim().replace(/\n/g, " | ")}`);

    // The premise, asserted rather than assumed: a daemon that started filling the bindings for `-P`
    // would make every assertion below pass through a path this check does not mean to exercise.
    assert.equal(maps.bindings, "{}", `a -P container no longer arrives with empty bindings: ${maps.bindings}`);
    const hostPort = Number(published.trim().split("\n")[0].split(":").pop());
    assert.ok(Number.isInteger(hostPort) && hostPort > 0, `the daemon published no host port at all: ${published}`);

    const inspect = await inspectOf(url, id);
    const entries = inspect.ports.filter((candidate) => candidate.containerPort === 5000);
    assert.equal(entries.length, 1, `the -P publication is reported ${entries.length} times: ${JSON.stringify(inspect.ports)}`);
    assert.equal(entries[0].protocol, "tcp");
    assert.equal(entries[0].hostPort, hostPort, `the -P publication reads ${String(entries[0].hostPort)} where the daemon published ${hostPort}`);
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// `…-tabs_composition_refactor/REQ-59` — the operator publishes a port and names no host number, so
// the daemon chooses one. The binding is there but carries an empty host port, and before REQ-59
// the detail read `not published` on a port the container's own card showed a number for.
test("GET /api/containers/:id/inspect resolves the host port of a publication whose host number the operator left to the daemon", async () => {
  const name = `vexel-test-inspect-chosen-port-${Date.now()}`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const id = await createSleepingContainer(name, ["-p", "80"]);
    const maps = await portMapsOf(id);
    const { stdout: published } = await execFileAsync("docker", ["port", name, "80/tcp"]);
    console.log(`[REQ-59] ${name}: PortBindings ${maps.bindings} / NetworkSettings.Ports ${maps.network} / docker port ${published.trim().replace(/\n/g, " | ")}`);

    const hostPort = Number(published.trim().split("\n")[0].split(":").pop());
    assert.ok(Number.isInteger(hostPort) && hostPort > 0, `the daemon published no host port at all: ${published}`);

    const inspect = await inspectOf(url, id);
    const entries = inspect.ports.filter((candidate) => candidate.containerPort === 80);
    assert.equal(entries.length, 1, `the publication is reported ${entries.length} times: ${JSON.stringify(inspect.ports)}`);
    assert.equal(entries[0].hostPort, hostPort, `the publication reads ${String(entries[0].hostPort)} where the daemon published ${hostPort}`);
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// `…-tabs_composition_refactor/REQ-59` — "one entry per publication". The daemon records one
// publication once per IP stack, so `docker port` reports it twice; the reading collapses that to
// the single publication it is, and the host port survives the collapse.
test("GET /api/containers/:id/inspect reports one publication once, though the daemon records it on both IP stacks", async () => {
  const name = `vexel-test-inspect-one-entry-${Date.now()}`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const hostPort = await freeHostPort();
    const id = await createSleepingContainer(name, ["-p", `${hostPort}:${hostPort}`]);
    const maps = await portMapsOf(id);
    const { stdout: published } = await execFileAsync("docker", ["port", name]);
    console.log(`[REQ-59] ${name}: PortBindings ${maps.bindings} / NetworkSettings.Ports ${maps.network} / docker port ${published.trim().replace(/\n/g, " | ")}`);

    const inspect = await inspectOf(url, id);
    const entries = inspect.ports.filter((candidate) => candidate.containerPort === hostPort);
    assert.equal(entries.length, 1, `the publication is reported ${entries.length} times: ${JSON.stringify(inspect.ports)}`);
    assert.equal(entries[0].hostPort, hostPort, `the publication lost its host port: ${JSON.stringify(entries[0])}`);
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// `…-tabs_composition_refactor/REQ-59`, and **the certified behaviour the collapse above must not
// reach**: a publication the *operator* made twice, on two host addresses, is two bindings and stays
// the two entries it is, each keeping the address it was made on. Two publications that differ only
// by an address the shape did not carry would be indistinguishable, which is why the summary shape's
// duplicate-collapsing rule is about that shape alone (containers-service.md).
test("GET /api/containers/:id/inspect keeps a publication made on two host addresses as two entries", async () => {
  const name = `vexel-test-inspect-two-addresses-${Date.now()}`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const loopbackPort = await freeHostPort();
    const anyPort = await freeHostPort();
    const id = await createSleepingContainer(name, ["-p", `127.0.0.1:${loopbackPort}:80`, "-p", `0.0.0.0:${anyPort}:80`]);
    const maps = await portMapsOf(id);
    console.log(`[REQ-59] ${name}: PortBindings ${maps.bindings} / NetworkSettings.Ports ${maps.network}`);

    const inspect = await inspectOf(url, id);
    const entries = inspect.ports.filter((candidate) => candidate.containerPort === 80);
    assert.deepEqual(
      entries.map((entry) => ({ hostIp: entry.hostIp, hostPort: entry.hostPort })).sort((left, right) => (left.hostPort ?? 0) - (right.hostPort ?? 0)),
      [
        { hostIp: "127.0.0.1", hostPort: loopbackPort },
        { hostIp: "0.0.0.0", hostPort: anyPort },
      ].sort((left, right) => left.hostPort - right.hostPort),
      `the two publications of port 80 are reported as ${JSON.stringify(entries)}`,
    );
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

/**
 * `…-tabs_composition_refactor/REQ-59` — "**and only those**. A port that is merely declared is not
 * an entry here." `--expose` and no `-p`: the daemon answers with empty bindings and a
 * `NetworkSettings.Ports` entry carrying a **null** binding list, which is an exposure and not a
 * publication.
 *
 * **This is the reversal of what this file asserted until 2026-08-27.** REQ-52 was first read as
 * "an exposed port is carried by the inspect data" and this same fixture was used to prove it;
 * REQ-58 then took the reading as far as `Config.ExposedPorts` and was withdrawn the same day, on
 * the ground that `EXPOSE` binds no host port and gates no traffic, so such a row states something
 * reachable from nowhere. The payload is read here as well as the shape, so a daemon that stopped
 * answering this way would say so rather than letting the check pass for a new reason.
 */
test("GET /api/containers/:id/inspect reports no entry for a port the container exposes without publishing", async () => {
  const name = `vexel-test-inspect-exposed-${Date.now()}`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const id = await createSleepingContainer(name, ["--expose", "5000"]);
    const maps = await portMapsOf(id);
    console.log(`[REQ-59] ${name}: PortBindings ${maps.bindings} / NetworkSettings.Ports ${maps.network} / Config.ExposedPorts ${maps.exposed}`);

    assert.ok(maps.network.includes("5000/tcp"), `the daemon no longer records the exposed port at all: ${maps.network}`);
    assert.ok(maps.exposed.includes("5000/tcp"), `the daemon no longer declares the exposed port at all: ${maps.exposed}`);

    const inspect = await inspectOf(url, id);
    assert.deepEqual(
      inspect.ports.filter((candidate) => candidate.containerPort === 5000),
      [],
      `a port that is exposed and published nowhere is reported as a mapping: ${JSON.stringify(inspect.ports)}`,
    );
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// `…-tabs_composition_refactor/REQ-59` — the same rule where the container publishes as well, which
// is where a declaration could most easily be smuggled in beside a publication. **The image's own
// `EXPOSE` is what makes this fixture the human's case**: `registry:2` declares `5000/tcp` on its
// own behalf, and REQ-58 was withdrawn precisely because reading that declaration put a port
// "declared by somebody else" in front of an operator who had declared nothing of the kind. The
// operator's publication is reported; the image's declaration is not.
test("GET /api/containers/:id/inspect reports the publications alone for a container whose image exposes a port of its own", async () => {
  const name = `vexel-test-inspect-image-exposed-${Date.now()}`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const hostPort = await freeHostPort();
    const { stdout } = await execFileAsync("docker", ["run", "-d", "--name", name, ...ownershipArgs(name), "-p", `${hostPort}:80`, REGISTRY_IMAGE]);
    const id = stdout.trim();
    const maps = await portMapsOf(id);
    console.log(`[REQ-59] ${name}: PortBindings ${maps.bindings} / NetworkSettings.Ports ${maps.network} / Config.ExposedPorts ${maps.exposed}`);

    assert.ok(maps.exposed.includes("5000/tcp"), `the image no longer declares 5000/tcp, so this fixture no longer covers the case: ${maps.exposed}`);

    const inspect = await inspectOf(url, id);
    assert.deepEqual(
      inspect.ports.map((port) => ({ containerPort: port.containerPort, hostPort: port.hostPort })),
      [{ containerPort: 80, hostPort }],
      `the reading is not the container's publications and only those: ${JSON.stringify(inspect.ports)}`,
    );
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// containers-endpoints.md — a daemon rejection (unknown id) surfaces the daemon's own message on inspect
test("GET /api/containers/:id/inspect with an unknown id responds with the daemon's own rejection message", async () => {
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const response = await fetch(`${url}/api/containers/does-not-exist-${Date.now()}/inspect`);
    assert.notEqual(response.status, 200);
    const body = (await response.json()) as { error?: string };
    assert.ok(typeof body.error === "string" && body.error.length > 0);
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-26 — the raw inspect payload is exactly what the Engine API returned, unmodified
test("GET /api/containers/:id/inspect carries the raw payload exactly as received from the Engine API", async () => {
  const name = `vexel-test-inspect-raw-${Date.now()}`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const id = await createSleepingContainer(name);
    const response = await fetch(`${url}/api/containers/${id}/inspect`);
    const inspect = (await response.json()) as ContainerInspect;
    const raw = inspect.raw as { Id: string; Name: string; Config: { Image: string } };

    const { stdout } = await execFileAsync("docker", ["inspect", id]);
    const [daemonRaw] = JSON.parse(stdout) as [{ Id: string; Name: string; Config: { Image: string } }];

    assert.equal(raw.Id, daemonRaw.Id);
    assert.equal(raw.Name, daemonRaw.Name);
    assert.equal(raw.Config.Image, daemonRaw.Config.Image);
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// plan-docker_management_app/REQ-25 — restart policy alone is applied to the daemon in place, keeping the same container id
test("PATCH /api/containers/:id/config applies a restart-policy-only change in place", async () => {
  const name = `vexel-test-config-inplace-${Date.now()}`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const id = await createSleepingContainer(name);
    const response = await fetch(`${url}/api/containers/${id}/config`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ restartPolicy: { name: "always" } }),
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as ContainerConfigUpdateResult;
    assert.equal(body.path, "in-place");
    assert.equal(body.container.id, id);

    const { stdout } = await execFileAsync("docker", ["inspect", "--format", "{{.HostConfig.RestartPolicy.Name}}", id]);
    assert.equal(stdout.trim(), "always");
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// plan-docker_management_app/REQ-25 — an environment change recreates the container, preserving its name, mounts and networks,
// and restarting it since it was running before
test("PATCH /api/containers/:id/config recreates the container for an environment change, preserving name, mounts and networks", async () => {
  const name = `vexel-test-config-recreate-${Date.now()}`;
  const volumeName = `vexel-test-config-recreate-vol-${Date.now()}`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const id = await createSleepingContainer(name, ["-v", `${volumeName}:/data`]);
    const response = await fetch(`${url}/api/containers/${id}/config`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ env: ["FOO=recreated"] }),
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as ContainerConfigUpdateResult;
    assert.equal(body.path, "recreate");
    assert.notEqual(body.container.id, id);
    assert.equal(body.container.name, name);
    assert.equal(body.container.state, "running");

    const inspectResponse = await fetch(`${url}/api/containers/${body.container.id}/inspect`);
    const inspect = (await inspectResponse.json()) as ContainerInspect;
    assert.ok(inspect.env.includes("FOO=recreated"));
    assert.ok(inspect.mounts.some((mount) => mount.destination === "/data"));
    assert.ok(inspect.networks.some((network) => network.name === "bridge"));
  } finally {
    await removeContainerQuietly(name);
    await removeVolumeQuietly(volumeName);
    await close();
  }
});

// containers-endpoints.md — a daemon rejection (unknown id) surfaces the daemon's own message on a configuration update
test("PATCH /api/containers/:id/config with an unknown id responds with the daemon's own rejection message", async () => {
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const response = await fetch(`${url}/api/containers/does-not-exist-${Date.now()}/config`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ restartPolicy: { name: "always" } }),
    });
    assert.notEqual(response.status, 200);
    const body = (await response.json()) as { error?: string };
    assert.ok(typeof body.error === "string" && body.error.length > 0);
  } finally {
    await close();
  }
});
