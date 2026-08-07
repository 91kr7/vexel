import { test } from "node:test";
import assert from "node:assert/strict";
import express, { type Express } from "express";
import type { AddressInfo } from "node:net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

process.env.VEXEL_DATA_DIR = mkdtempSync(join(tmpdir(), "vexel-persistence-routes-"));

const { persistenceRouter, DEFAULT_PREFERENCES } = await import("../../src/persistence/persistence-routes.js");

function mountedApp(router: typeof persistenceRouter) {
  const app = express();
  app.use(express.json());
  app.use("/api/persistence", router);
  return app;
}

// plan-docker_management_app/REQ-115 — nothing persisted yet returns the server defaults
test("GET /api/persistence/preferences returns the server defaults before anything is stored", async () => {
  const { url, close } = await startApp(mountedApp(persistenceRouter));
  try {
    const response = await fetch(`${url}/api/persistence/preferences`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), DEFAULT_PREFERENCES);
  } finally {
    await close();
  }
});

// local-persistence/specs/persistence-endpoints.md — PUT merges a partial patch, keeping fields it does not mention
test("PUT /api/persistence/preferences merges a partial patch onto the stored preferences", async () => {
  const { url, close } = await startApp(mountedApp(persistenceRouter));
  try {
    const first = await fetch(`${url}/api/persistence/preferences`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lastScreenId: "containers", logFollow: false }),
    });
    assert.equal((await first.json()).lastScreenId, "containers");

    const second = await fetch(`${url}/api/persistence/preferences`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selectedContext: "staging" }),
    });
    const merged = await second.json();
    assert.equal(merged.selectedContext, "staging");
    assert.equal(merged.lastScreenId, "containers");
    assert.equal(merged.logFollow, false);
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-115 — preferences written before a restart are still returned after
test("preferences written before a simulated restart are returned by a freshly mounted router afterwards", async () => {
  const before = await startApp(mountedApp(persistenceRouter));
  await fetch(`${before.url}/api/persistence/preferences`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lastScreenId: "volumes-networks", logTimestamps: true }),
  });
  await before.close();

  const { persistenceRouter: restartedRouter } = await import(
    `../../src/persistence/persistence-routes.js?restart=${Date.now()}`
  );
  const after = await startApp(mountedApp(restartedRouter));
  try {
    const response = await fetch(`${after.url}/api/persistence/preferences`);
    const body = await response.json();
    assert.equal(body.lastScreenId, "volumes-networks");
    assert.equal(body.logTimestamps, true);
  } finally {
    await after.close();
  }
});

// local-persistence/specs/persistence-endpoints.md — analysis-cache usage is exposed and clearable through the API
test("GET and POST /api/persistence/analysis-cache expose the cache size and clear resets it to zero", async () => {
  const { url, close } = await startApp(mountedApp(persistenceRouter));
  try {
    const usage = await fetch(`${url}/api/persistence/analysis-cache`);
    assert.equal(usage.status, 200);
    assert.equal(typeof (await usage.json()).totalSizeBytes, "number");

    const clearResponse = await fetch(`${url}/api/persistence/analysis-cache/clear`, { method: "POST" });
    assert.equal(clearResponse.status, 204);

    const afterClear = await fetch(`${url}/api/persistence/analysis-cache`);
    assert.equal((await afterClear.json()).totalSizeBytes, 0);
  } finally {
    await close();
  }
});
