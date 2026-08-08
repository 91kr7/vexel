import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import express, { type Express } from "express";
import type { AddressInfo } from "node:net";
import { imagesRouter } from "../../src/images/images-routes.js";
import { ownershipArgs } from "../support/fixtures.js";

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
  app.use("/api/images", imagesRouter);
  return app;
}

async function removeTagQuietly(reference: string): Promise<void> {
  await execFileAsync("docker", ["rmi", "-f", reference]).catch(() => undefined);
}

interface SseEvent {
  event: string;
  data: Record<string, unknown>;
}

/** Reads an SSE response body until `end` or `error` is seen, or a hard timeout is hit. */
async function readSseUntilDone(response: Response, timeoutMs = 60_000): Promise<SseEvent[]> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const events: SseEvent[] = [];
  let buffer = "";
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const eventLine = frame.split("\n").find((line) => line.startsWith("event: "));
      const dataLine = frame.split("\n").find((line) => line.startsWith("data: "));
      if (!eventLine || !dataLine) continue;
      const event = eventLine.slice("event: ".length);
      const data = JSON.parse(dataLine.slice("data: ".length)) as Record<string, unknown>;
      events.push({ event, data });
      if (event === "end" || event === "error") {
        await reader.cancel().catch(() => undefined);
        return events;
      }
    }
  }
  await reader.cancel().catch(() => undefined);
  return events;
}

// A disposable, unauthenticated local registry: lets these tests exercise a real registry round
// trip without depending on any external/authenticated registry. Kept in its own file (rather than
// alongside images-routes.test.ts) so its setup/teardown never runs concurrently with unrelated
// pull/tag/remove/prune tests against the same daemon.
const TEST_REGISTRY_PORT = 5081;
let registryContainerId = "";

before(async () => {
  const { stdout } = await execFileAsync("docker", ["run", "-d", "-p", `${TEST_REGISTRY_PORT}:5000`, ...ownershipArgs("push-registry"), "registry:2"]);
  registryContainerId = stdout.trim();
  const deadline = Date.now() + 15_000;
  for (;;) {
    try {
      const response = await fetch(`http://localhost:${TEST_REGISTRY_PORT}/v2/`);
      if (response.ok) return;
    } catch {
      // registry not ready yet
    }
    if (Date.now() > deadline) throw new Error("local test registry did not become ready in time");
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
});

after(async () => {
  await execFileAsync("docker", ["rm", "-fv", registryContainerId]).catch(() => undefined);
});

// plan-docker_management_app/REQ-38, REQ-39 — pushing an image to a registry shows per-layer progress until completion.
// Docker only pushes a reference the image is already locally tagged as, so the source is tagged
// directly as the destination registry reference (mirrors the images-screen.md flow: pushing one of
// the image's own existing tags).
test("GET /api/images/:id/push/stream pushes an image to a registry and ends once it completes", async () => {
  const app = buildApp();
  const { url, close } = await startApp(app);
  const repository = `vexel-test-push-${Date.now()}`;
  const reference = `localhost:${TEST_REGISTRY_PORT}/${repository}:v1`;
  await execFileAsync("docker", ["tag", "alpine:3.20", reference]);
  const { stdout: imageId } = await execFileAsync("docker", ["inspect", reference, "--format", "{{.Id}}"]);
  try {
    const response = await fetch(`${url}/api/images/${encodeURIComponent(imageId.trim())}/push/stream?reference=${encodeURIComponent(reference)}`);
    assert.equal(response.headers.get("content-type"), "text/event-stream");
    const events = await readSseUntilDone(response, 60_000);

    assert.ok(events.some((event) => event.event === "step"), "expected at least one progress step");
    assert.equal(events.at(-1)!.event, "end");

    // This daemon's containerd image store pushes an OCI-format manifest rather than the classic
    // Docker distribution v2 one, hence the OCI accept header.
    const manifestResponse = await fetch(`http://localhost:${TEST_REGISTRY_PORT}/v2/${repository}/manifests/v1`, {
      headers: { accept: "application/vnd.oci.image.manifest.v1+json" },
    });
    assert.equal(manifestResponse.status, 200, "pushed manifest should be retrievable from the registry");
  } finally {
    await removeTagQuietly(reference);
    await close();
  }
});

// image-transfer-service.md — onError fires on the stream when the daemon rejects the push (e.g. an unreachable registry host)
test("GET /api/images/:id/push/stream reports the daemon's rejection as an error event for an unpushable reference", async () => {
  const app = buildApp();
  const { url, close } = await startApp(app);
  const reference = `localhost:1/nonexistent-registry-${Date.now()}:v1`;
  await execFileAsync("docker", ["tag", "alpine:3.20", reference]);
  const { stdout: imageId } = await execFileAsync("docker", ["inspect", reference, "--format", "{{.Id}}"]);
  try {
    const response = await fetch(`${url}/api/images/${encodeURIComponent(imageId.trim())}/push/stream?reference=${encodeURIComponent(reference)}`);
    // An unreachable host is a dial timeout on the daemon's side (~30s), not a fast rejection.
    const events = await readSseUntilDone(response, 45_000);

    const errorEvent = events.find((event) => event.event === "error");
    assert.ok(errorEvent, "expected an error event for an unpushable reference");
    assert.ok(typeof errorEvent!.data.message === "string" && (errorEvent!.data.message as string).length > 0);
  } finally {
    await removeTagQuietly(reference);
    await close();
  }
});
