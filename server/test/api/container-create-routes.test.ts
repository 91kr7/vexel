import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import express, { type Express } from "express";
import type { AddressInfo } from "node:net";
import { containersRouter } from "../../src/containers/containers-routes.js";

const execFileAsync = promisify(execFile);

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

async function removeContainerQuietly(name: string): Promise<void> {
  await execFileAsync("docker", ["rm", "-fv", name]).catch(() => undefined);
}

async function inspect(name: string, format: string): Promise<string> {
  const { stdout } = await execFileAsync("docker", ["inspect", name, "--format", format]);
  return stdout.trim();
}

type CreateEvent =
  | { type: "image-resolved"; pulled: boolean }
  | { type: "pull-step"; step: { id: string; status: string } }
  | { type: "created"; result: { id: string; name: string; started: boolean; imagePulled: boolean; warnings: string[] } }
  | { type: "error"; message: string };

/** POSTs a creation spec and collects the newline-delimited JSON stream it answers with. */
async function create(url: string, spec: unknown): Promise<{ status: number; contentType: string | null; events: CreateEvent[] }> {
  const response = await fetch(`${url}/api/containers`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(spec),
  });
  const text = await response.text();
  const events = text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as CreateEvent);
  return { status: response.status, contentType: response.headers.get("content-type"), events };
}

function terminalEvents(events: CreateEvent[]): CreateEvent[] {
  return events.filter((event) => event.type === "created" || event.type === "error");
}

// plan-docker_management_app/REQ-27 — a container is created from an image with its full configuration and started immediately
test("POST /api/containers creates and starts a container carrying every configured value", async () => {
  const name = `vexel-test-create-full-${Date.now()}`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const { status, contentType, events } = await create(url, {
      image: "alpine:3.20",
      name,
      entrypoint: ["sleep"],
      command: ["300"],
      env: ["VEXEL_TEST=on"],
      ports: [{ containerPort: 5432, protocol: "tcp", hostPort: 0 }],
      mounts: [{ type: "volume", source: `${name}-vol`, destination: "/data", readOnly: false }],
      restartPolicy: { name: "on-failure", maximumRetryCount: 3 },
      resourceLimits: { cpus: 1.5, memoryBytes: 268435456 },
      labels: { "com.vexel.test": "create" },
      privileged: false,
      capabilities: { add: ["NET_ADMIN"], drop: [] },
      start: true,
    });

    assert.equal(status, 200);
    assert.match(contentType ?? "", /application\/x-ndjson/);
    const terminal = terminalEvents(events);
    assert.equal(terminal.length, 1);
    assert.equal(terminal[0]!.type, "created", `unexpected refusal: ${JSON.stringify(terminal[0])}`);
    const result = (terminal[0] as Extract<CreateEvent, { type: "created" }>).result;
    assert.ok(result.id.length > 0);
    assert.equal(result.started, true);

    assert.equal(await inspect(name, "{{.State.Running}}"), "true");
    assert.equal(await inspect(name, "{{.Config.Image}}"), "alpine:3.20");
    assert.equal(await inspect(name, "{{index .Config.Entrypoint 0}}"), "sleep");
    assert.equal(await inspect(name, "{{index .Config.Cmd 0}}"), "300");
    assert.match(await inspect(name, "{{.Config.Env}}"), /VEXEL_TEST=on/);
    assert.match(await inspect(name, "{{.HostConfig.PortBindings}}"), /5432\/tcp/);
    assert.match(await inspect(name, "{{.HostConfig.Binds}}"), new RegExp(`${name}-vol:/data`));
    assert.equal(await inspect(name, "{{.HostConfig.RestartPolicy.Name}}"), "on-failure");
    assert.equal(await inspect(name, "{{.HostConfig.RestartPolicy.MaximumRetryCount}}"), "3");
    assert.equal(await inspect(name, "{{.HostConfig.Memory}}"), "268435456");
    assert.equal(await inspect(name, `{{index .Config.Labels "com.vexel.test"}}`), "create");
    assert.equal(await inspect(name, "{{.HostConfig.Privileged}}"), "false");
    assert.match(await inspect(name, "{{.HostConfig.CapAdd}}"), /NET_ADMIN/);
  } finally {
    await removeContainerQuietly(name);
    await execFileAsync("docker", ["volume", "rm", "-f", `${name}-vol`]).catch(() => undefined);
    await close();
  }
});

// plan-docker_management_app/REQ-27 — the same configuration can be created only, leaving the container stopped
test("POST /api/containers with start false creates the container without running it", async () => {
  const name = `vexel-test-create-only-${Date.now()}`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const { events } = await create(url, { image: "alpine:3.20", name, entrypoint: ["sleep"], command: ["300"], start: false });

    const terminal = terminalEvents(events);
    assert.equal(terminal.length, 1);
    assert.equal(terminal[0]!.type, "created", `unexpected refusal: ${JSON.stringify(terminal[0])}`);
    assert.equal((terminal[0] as Extract<CreateEvent, { type: "created" }>).result.started, false);
    assert.equal(await inspect(name, "{{.State.Running}}"), "false");
    assert.equal(await inspect(name, "{{.State.Status}}"), "created");
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// plan-docker_management_app/REQ-27 — a container can be attached to a network at creation
test("POST /api/containers attaches the container to the requested network", async () => {
  const name = `vexel-test-create-network-${Date.now()}`;
  const network = `${name}-net`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  await execFileAsync("docker", ["network", "create", network]);
  try {
    const { events } = await create(url, {
      image: "alpine:3.20",
      name,
      entrypoint: ["sleep"],
      command: ["300"],
      networks: [network],
      start: true,
    });

    const terminal = terminalEvents(events);
    assert.equal(terminal[0]!.type, "created", `unexpected refusal: ${JSON.stringify(terminal[0])}`);
    const networks = await inspect(name, "{{range $key, $value := .NetworkSettings.Networks}}{{$key}} {{end}}");
    assert.match(networks, new RegExp(network));
  } finally {
    await removeContainerQuietly(name);
    await execFileAsync("docker", ["network", "rm", network]).catch(() => undefined);
    await close();
  }
});

// plan-docker_management_app/REQ-29 — an image already present locally is used as-is: no pull step, and the image is reported as not pulled
test("POST /api/containers reports the image as already present, with no pull step, when it is local", async () => {
  const name = `vexel-test-create-local-image-${Date.now()}`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const { events } = await create(url, { image: "alpine:3.20", name, entrypoint: ["sleep"], command: ["300"], start: false });

    assert.equal(
      events.some((event) => event.type === "pull-step"),
      false,
    );
    const resolved = events.find((event) => event.type === "image-resolved") as Extract<CreateEvent, { type: "image-resolved" }> | undefined;
    assert.ok(resolved, "expected an image-resolved event");
    assert.equal(resolved!.pulled, false);
    const created = terminalEvents(events)[0] as Extract<CreateEvent, { type: "created" }>;
    assert.equal(created.result.imagePulled, false);
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// plan-docker_management_app/REQ-29 — a reference missing locally is pulled first, with progress, before the container is created
test("POST /api/containers pulls a missing image first, streaming its progress, then creates the container", async () => {
  const name = `vexel-test-create-pull-${Date.now()}`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  await execFileAsync("docker", ["rmi", "-f", "hello-world:latest"]).catch(() => undefined);
  try {
    const { events } = await create(url, { image: "hello-world:latest", name, start: false });

    const pullSteps = events.filter((event) => event.type === "pull-step");
    assert.ok(pullSteps.length > 0, "expected pull progress for a missing image");
    const resolvedIndex = events.findIndex((event) => event.type === "image-resolved");
    const lastPullIndex = events.map((event) => event.type).lastIndexOf("pull-step");
    assert.ok(lastPullIndex < resolvedIndex, `expected every pull step before the image is resolved, got ${events.map((event) => event.type).join(",")}`);
    assert.equal((events[resolvedIndex] as Extract<CreateEvent, { type: "image-resolved" }>).pulled, true);

    const terminal = terminalEvents(events);
    assert.equal(terminal.length, 1);
    assert.equal(terminal[0]!.type, "created", `unexpected refusal: ${JSON.stringify(terminal[0])}`);
    assert.equal((terminal[0] as Extract<CreateEvent, { type: "created" }>).result.imagePulled, true);
    assert.equal(await inspect(name, "{{.Config.Image}}"), "hello-world:latest");
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// plan-docker_management_app/REQ-28 — a daemon refusal keeps the HTTP status at 200 and travels as an error line with the daemon's own message
test("POST /api/containers answers 200 with an error line carrying the daemon's own message when the name is already taken", async () => {
  const name = `vexel-test-create-conflict-${Date.now()}`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const first = await create(url, { image: "alpine:3.20", name, entrypoint: ["sleep"], command: ["300"], start: false });
    assert.equal(terminalEvents(first.events)[0]!.type, "created");

    const second = await create(url, { image: "alpine:3.20", name, entrypoint: ["sleep"], command: ["300"], start: false });

    assert.equal(second.status, 200);
    const terminal = terminalEvents(second.events);
    assert.equal(terminal.length, 1);
    assert.equal(terminal[0]!.type, "error");
    const message = (terminal[0] as Extract<CreateEvent, { type: "error" }>).message;
    assert.match(message, new RegExp(name));
    assert.match(message, /already in use/i);
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// plan-docker_management_app/REQ-28 — an unknown image reference is refused with the daemon's own message, and nothing is created
test("POST /api/containers answers 200 with an error line when the image reference cannot be resolved", async () => {
  const name = `vexel-test-create-unknown-image-${Date.now()}`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const { status, events } = await create(url, { image: `vexel-nonexistent-${Date.now()}:1`, name, start: false });

    assert.equal(status, 200);
    const terminal = terminalEvents(events);
    assert.equal(terminal.length, 1);
    assert.equal(terminal[0]!.type, "error");
    assert.ok((terminal[0] as Extract<CreateEvent, { type: "error" }>).message.length > 0);
    await assert.rejects(() => inspect(name, "{{.Id}}"));
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});
