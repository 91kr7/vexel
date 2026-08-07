import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import express, { type Express } from "express";
import type { AddressInfo } from "node:net";
import { containersRouter } from "../../src/containers/containers-routes.js";
import { ownershipArgs } from "../support/fixtures.js";

const execFileAsync = promisify(execFile);

function startApp(): Promise<{ url: string; close: () => Promise<void> }> {
  const app: Express = express();
  app.use(express.json());
  app.use("/api/containers", containersRouter);
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

// registry:2 (megabytes, not the multi-gigabyte range): `docker export` works on a
// created-but-never-started container just as well as a running one. hello-world would be smaller
// still, but its tag is removed and re-pulled by another test elsewhere in this suite's parallel
// run, so tagging/creating from it here could race that removal; registry:2's tag is never touched
// by a concurrently-running test file.
async function createFilesystemFixtureContainer(caseName: string): Promise<string> {
  const name = `vexel-test-${caseName}-${Date.now()}`;
  const { stdout } = await execFileAsync("docker", ["create", "--name", name, ...ownershipArgs(caseName), "registry:2"]);
  return stdout.trim();
}

async function removeContainerQuietly(id: string): Promise<void> {
  await execFileAsync("docker", ["rm", "-f", id]).catch(() => undefined);
}

async function removeImageQuietly(reference: string): Promise<void> {
  await execFileAsync("docker", ["rmi", "-f", reference]).catch(() => undefined);
}

// plan-docker_management_app/REQ-43 — a container's filesystem can be exported to a tarball downloaded through the browser, and an image can be imported from that tarball under a chosen reference
test("GET /api/containers/:id/export streams a tarball that POST /api/containers/import re-imports as a new image", async () => {
  const { url, close } = await startApp();
  const id = await createFilesystemFixtureContainer("export-import");
  const targetReference = `vexel-test-import-${Date.now()}:v1`;
  try {
    const exportResponse = await fetch(`${url}/api/containers/${id}/export`);
    assert.equal(exportResponse.status, 200);
    assert.equal(exportResponse.headers.get("content-type"), "application/x-tar");
    assert.match(exportResponse.headers.get("content-disposition") ?? "", /attachment; filename="[a-f0-9]{12}-filesystem\.tar"/);
    // container-transfer-service.md — the tarball is piped through as it arrives, so its total size is
    // never known ahead of time: no Content-Length header, unlike a buffered-then-sent response.
    assert.equal(exportResponse.headers.get("content-length"), null);
    const tarball = Buffer.from(await exportResponse.arrayBuffer());
    assert.ok(tarball.length > 0);

    const importResponse = await fetch(`${url}/api/containers/import?${new URLSearchParams({ targetReference }).toString()}`, {
      method: "POST",
      headers: { "content-type": "application/x-tar" },
      body: tarball,
    });
    assert.equal(importResponse.status, 200);
    const importResult = (await importResponse.json()) as { id?: string; reference?: string };
    assert.equal(importResult.reference, targetReference);

    const { stdout } = await execFileAsync("docker", ["image", "inspect", targetReference, "--format", "{{.Id}}"]);
    assert.ok(stdout.trim().length > 0, "the imported reference should resolve to a real image");
  } finally {
    await removeImageQuietly(targetReference);
    await removeContainerQuietly(id);
    await close();
  }
});

// container-transfer-endpoint.md — a custom ?filename= hint is honoured, sanitized the same way as the images module's own save
test("GET /api/containers/:id/export honours a custom filename hint via the ?filename= query parameter", async () => {
  const { url, close } = await startApp();
  const id = await createFilesystemFixtureContainer("export-filename");
  try {
    const response = await fetch(`${url}/api/containers/${id}/export?${new URLSearchParams({ filename: "custom name.tar" }).toString()}`);
    assert.equal(response.headers.get("content-disposition"), 'attachment; filename="custom_name.tar"');
    // Drains the response so the connection actually ends: an unread body keeps the socket open and
    // server.close() below would otherwise wait forever for it (it does not force-close connections).
    await response.arrayBuffer();
  } finally {
    await removeContainerQuietly(id);
    await close();
  }
});

// container-transfer-endpoint.md — a malformed upload is rejected with the daemon's own rejection message rather than succeeding silently
test("POST /api/containers/import with a malformed tarball responds with the daemon's own rejection message", async () => {
  const { url, close } = await startApp();
  try {
    const response = await fetch(`${url}/api/containers/import`, {
      method: "POST",
      headers: { "content-type": "application/x-tar" },
      body: Buffer.from("not a tar file"),
    });
    assert.notEqual(response.status, 200);
    const body = (await response.json()) as { error?: string };
    assert.ok(typeof body.error === "string" && body.error.length > 0);
  } finally {
    await close();
  }
});

// container-transfer-endpoint.md — "import" is registered ahead of ":id/inspect" so it is never read as a container id
test("POST /api/containers/import is never shadowed by the :id/inspect route", async () => {
  const { url, close } = await startApp();
  try {
    const response = await fetch(`${url}/api/containers/import`, {
      method: "POST",
      headers: { "content-type": "application/x-tar" },
      body: Buffer.alloc(0),
    });
    // A request read as an unknown container id ("import") looked up for
    // inspection would 404/502 with a "no such container" message instead of
    // ever reaching the import handler's own tarball-parsing failure.
    const responseBody = (await response.json()) as { error?: string };
    assert.ok(!/no such container/i.test(responseBody.error ?? ""), "the 'import' path segment must not be read as a container id");
  } finally {
    await close();
  }
});
