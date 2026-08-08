import { test } from "node:test";
import assert from "node:assert/strict";
import express, { type Express } from "express";
import type { AddressInfo } from "node:net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hostPathsRouter } from "../../src/host-fs/host-path-routes.js";
import type { HostPathValidationResult } from "../../src/host-fs/host-path-validator.js";

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

function mountedApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/host-paths", hostPathsRouter);
  return app;
}

const existingDir = mkdtempSync(join(tmpdir(), "vexel-host-path-endpoint-"));

// plan-docker_management_app/REQ-116 — an existing, absolute path validates successfully
test("POST /api/host-paths/validate accepts an existing absolute path", async () => {
  const { url, close } = await startApp(mountedApp());
  try {
    const response = await fetch(`${url}/api/host-paths/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: existingDir, kind: "directory" }),
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as HostPathValidationResult;
    assert.equal(body.valid, true);
    assert.equal(body.kind, "directory");
  } finally {
    await close();
  }
});

// local-persistence/specs/host-path-endpoint.md — a refusal is a 200 carrying valid:false and a reason, not an HTTP error
test("POST /api/host-paths/validate reports a refusal as a 200 response with a reason", async () => {
  const { url, close } = await startApp(mountedApp());
  try {
    const response = await fetch(`${url}/api/host-paths/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "relative/path" }),
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as HostPathValidationResult;
    assert.equal(body.valid, false);
    assert.ok(typeof body.reason === "string" && body.reason.length > 0);
  } finally {
    await close();
  }
});

// local-persistence/specs/host-path-endpoint.md — a missing path field is a 400, not silently accepted
test("POST /api/host-paths/validate responds 400 when the path field is missing", async () => {
  const { url, close } = await startApp(mountedApp());
  try {
    const response = await fetch(`${url}/api/host-paths/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(response.status, 400);
  } finally {
    await close();
  }
});
