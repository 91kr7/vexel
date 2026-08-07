import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import express, { type Express } from "express";
import type { AddressInfo } from "node:net";
import { imagesRouter } from "../../src/images/images-routes.js";
import type { ImageInspect, ImageSummary } from "../../src/images/images-service.js";

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

async function fetchList(url: string): Promise<ImageSummary[]> {
  const response = await fetch(`${url}/api/images`);
  return (await response.json()) as ImageSummary[];
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

// plan-docker_management_app/REQ-37 — the images screen lists local images with repository:tag (all tags), digest, platform(s), size and age
test("GET /api/images lists a local image with its tags, size and creation age", async () => {
  const tag = `vessel-test-list-${Date.now()}:v1`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  await execFileAsync("docker", ["tag", "postgres:16", tag]);
  try {
    const images = await fetchList(url);
    const found = images.find((image) => image.tags.includes(tag));
    assert.ok(found, "tagged image not found in the list");
    assert.ok(typeof found!.sizeBytes === "number" && found!.sizeBytes > 0);
    assert.ok(!Number.isNaN(new Date(found!.createdAt).getTime()), "createdAt should be a valid instant");
    assert.ok(Array.isArray(found!.platforms));
  } finally {
    await removeTagQuietly(tag);
    await close();
  }
});

// plan-docker_management_app/REQ-40 — inspect data carries config, entrypoint/cmd, env, labels, exposed ports, size and history.
// A synthetic image (built with docker commit --change) gives full control over its config, rather than asserting on the
// internals of a third-party image, which can change across versions.
test("GET /api/images/:id/inspect returns the image's full inspect data", async () => {
  const app = buildApp();
  const { url, close } = await startApp(app);
  const containerName = `vessel-test-inspect-src-${Date.now()}`;
  const tag = `vessel-test-inspect-${Date.now()}:v1`;
  await execFileAsync("docker", ["create", "--name", containerName, "hello-world"]);
  await execFileAsync("docker", [
    "commit",
    "--change",
    "LABEL team=vessel",
    "--change",
    "EXPOSE 9999/tcp",
    "--change",
    "ENV FOO=bar",
    containerName,
    tag,
  ]);
  try {
    const response = await fetch(`${url}/api/images/${tag}/inspect`);
    assert.equal(response.status, 200);
    const inspect = (await response.json()) as ImageInspect;

    assert.ok(inspect.tags.includes(tag));
    assert.deepEqual(inspect.entrypoint, []);
    assert.deepEqual(inspect.command, ["/hello"]);
    assert.ok(inspect.env.includes("FOO=bar"));
    assert.equal(inspect.labels.team, "vessel");
    assert.ok(inspect.exposedPorts.includes("9999/tcp"));
    assert.ok(inspect.history.length > 0);
    assert.ok(typeof inspect.sizeBytes === "number" && inspect.sizeBytes > 0);
  } finally {
    await execFileAsync("docker", ["rm", "-f", containerName]).catch(() => undefined);
    await removeTagQuietly(tag);
    await close();
  }
});

// images-service.md — digest is the first RepoDigest shortened to algorithm:first-12-hex-chars
test("GET /api/images/:id/inspect shortens the digest to algorithm:12-hex-chars for a registry-pulled image", async () => {
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const response = await fetch(`${url}/api/images/postgres:16/inspect`);
    const inspect = (await response.json()) as ImageInspect;

    assert.ok(inspect.digest, "expected postgres:16 to carry a RepoDigest");
    assert.match(inspect.digest!, /^[a-z0-9]+:[0-9a-f]{12}$/);
  } finally {
    await close();
  }
});

// images-endpoints.md — a daemon rejection (unknown id) surfaces the daemon's own message instead of succeeding silently
test("GET /api/images/:id/inspect with an unknown id responds with the daemon's own rejection message", async () => {
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const response = await fetch(`${url}/api/images/does-not-exist-${Date.now()}/inspect`);
    assert.notEqual(response.status, 200);
    const body = (await response.json()) as { error?: string };
    assert.ok(typeof body.error === "string" && body.error.length > 0);
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-38 — pulling by reference shows per-layer progress until completion
test("GET /api/images/pull/stream streams per-layer progress and ends once the pull completes", async () => {
  const app = buildApp();
  const { url, close } = await startApp(app);
  await removeTagQuietly("hello-world:latest");
  try {
    const response = await fetch(`${url}/api/images/pull/stream?reference=hello-world:latest`);
    assert.equal(response.headers.get("content-type"), "text/event-stream");
    const events = await readSseUntilDone(response);

    assert.ok(events.some((event) => event.event === "step"), "expected at least one progress step");
    assert.equal(events.at(-1)!.event, "end");

    const images = await fetchList(url);
    assert.ok(images.some((image) => image.tags.includes("hello-world:latest")), "pulled image should now be listed");
  } finally {
    await removeTagQuietly("hello-world:latest");
    await close();
  }
});

// image-transfer-service.md — onError fires on the stream when the daemon rejects the pull (e.g. an unknown reference)
test("GET /api/images/pull/stream reports the daemon's rejection as an error event for an unresolvable reference", async () => {
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const response = await fetch(`${url}/api/images/pull/stream?reference=vessel-e2e-nonexistent-repo-${Date.now()}:latest`);
    const events = await readSseUntilDone(response);

    const errorEvent = events.find((event) => event.event === "error");
    assert.ok(errorEvent, "expected an error event for an unresolvable reference");
    assert.ok(typeof errorEvent!.data.message === "string" && (errorEvent!.data.message as string).length > 0);
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-39 — an image can be tagged with a new reference
test("POST /api/images/:id/tag adds a new reference, reflected in the list", async () => {
  const sourceTag = `vessel-test-tagsrc-${Date.now()}:v1`;
  const newTag = `vessel-test-tagged-${Date.now()}:v1`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  await execFileAsync("docker", ["tag", "postgres:16", sourceTag]);
  try {
    const response = await fetch(`${url}/api/images/${sourceTag}/tag`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reference: newTag }),
    });
    assert.equal(response.status, 204);
    const images = await fetchList(url);
    assert.ok(images.some((image) => image.tags.includes(newTag)));
  } finally {
    await removeTagQuietly(newTag);
    await removeTagQuietly(sourceTag);
    await close();
  }
});

// images-endpoints.md — a missing/blank reference is rejected with 400 before reaching the daemon
test("POST /api/images/:id/tag rejects a blank reference with 400", async () => {
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const response = await fetch(`${url}/api/images/postgres:16/tag`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reference: "   " }),
    });
    assert.equal(response.status, 400);
    const body = (await response.json()) as { error?: string };
    assert.ok(typeof body.error === "string" && body.error.length > 0);
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-39 — a tag can be removed (untagged), leaving the underlying image and its other tags in place
test("DELETE /api/images/untag removes just that tag reference, leaving the image's other tag in place", async () => {
  const keptTag = `vessel-test-untag-keep-${Date.now()}:v1`;
  const removedTag = `vessel-test-untag-remove-${Date.now()}:v1`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  await execFileAsync("docker", ["tag", "postgres:16", keptTag]);
  await execFileAsync("docker", ["tag", "postgres:16", removedTag]);
  try {
    const response = await fetch(`${url}/api/images/untag?reference=${encodeURIComponent(removedTag)}`, { method: "DELETE" });
    assert.equal(response.status, 204);

    const images = await fetchList(url);
    assert.ok(!images.some((image) => image.tags.includes(removedTag)), "removed tag should be gone");
    assert.ok(images.some((image) => image.tags.includes(keptTag)), "the other tag should remain");
  } finally {
    await removeTagQuietly(keptTag);
    await removeTagQuietly(removedTag);
    await close();
  }
});

// images-endpoints.md — a missing/blank reference is rejected with 400 before reaching the daemon
test("DELETE /api/images/untag rejects a missing reference with 400", async () => {
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const response = await fetch(`${url}/api/images/untag`, { method: "DELETE" });
    assert.equal(response.status, 400);
    const body = (await response.json()) as { error?: string };
    assert.ok(typeof body.error === "string" && body.error.length > 0);
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-39 — an image can be removed
test("DELETE /api/images/:id force-removes the image so it no longer appears in the list", async () => {
  const tag = `vessel-test-remove-${Date.now()}:v1`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  await execFileAsync("docker", ["tag", "postgres:16", tag]);
  try {
    const response = await fetch(`${url}/api/images/${tag}`, { method: "DELETE" });
    assert.equal(response.status, 204);
    const images = await fetchList(url);
    assert.ok(!images.some((image) => image.tags.includes(tag)));
  } finally {
    await removeTagQuietly(tag);
    await close();
  }
});

// plan-docker_management_app/REQ-39 — dangling images can be pruned, reporting the space reclaimed. This exercises the
// daemon's own prune semantics, which remove every currently dangling image on the host, not only the one set up here.
test("POST /api/images/prune removes dangling images and reports the reclaimed space", async () => {
  const app = buildApp();
  const { url, close } = await startApp(app);
  const containerName = `vessel-test-prune-src-${Date.now()}`;
  const danglingTag = `vessel-test-prune-dangling-${Date.now()}:v1`;
  await execFileAsync("docker", ["create", "--name", containerName, "hello-world"]);
  const { stdout: firstId } = await execFileAsync("docker", ["commit", "--change", "LABEL step=1", containerName, danglingTag]);
  await new Promise((resolve) => setTimeout(resolve, 1100)); // ensure a different image config timestamp
  await execFileAsync("docker", ["commit", "--change", "LABEL step=2", containerName, danglingTag]);
  try {
    const beforeImages = await fetchList(url);
    assert.ok(
      beforeImages.some((image) => image.id === firstId.trim() && image.tags.length === 0),
      "the superseded image should be dangling before pruning",
    );

    const response = await fetch(`${url}/api/images/prune`, { method: "POST" });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { removedCount: number; reclaimedBytes: number };
    assert.ok(body.removedCount >= 1);
    assert.ok(typeof body.reclaimedBytes === "number" && body.reclaimedBytes >= 0);

    const afterImages = await fetchList(url);
    assert.ok(!afterImages.some((image) => image.id === firstId.trim()), "the pruned dangling image should be gone");
  } finally {
    await execFileAsync("docker", ["rm", "-f", containerName]).catch(() => undefined);
    await removeTagQuietly(danglingTag);
    await close();
  }
});
