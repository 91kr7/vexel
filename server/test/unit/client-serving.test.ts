import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import express, { type Express } from "express";
import { mountClientApp, resolveClientDistDir } from "../../src/client-serving.js";
import { startApp, type RunningApp } from "../support/fixtures.js";

// REQ ids below belong to plan-docker_management_app-single_process_serving,
// component contract in .sdd/modules/server-app/specs/client-serving.md.

const DIST_DIR_ENV = "VEXEL_CLIENT_DIST";

/** Marker the fixture build's entry document carries, so a response can be identified as it. */
const ENTRY_MARKER = "vexel-test-entry-document";
/** Marker the fixture build's static asset carries. */
const ASSET_MARKER = "vexel-test-static-asset";

/** Temporary directories this file created, removed once the file is done. */
const temporaryDirs: string[] = [];

async function makeTemporaryDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "vexel-client-serving-"));
  temporaryDirs.push(dir);
  return dir;
}

/** A throwaway directory holding a build: an entry document and one hashed asset. */
async function makeFixtureBuild(): Promise<string> {
  const dir = await makeTemporaryDir();
  await writeFile(join(dir, "index.html"), `<!doctype html><title>${ENTRY_MARKER}</title>`, "utf8");
  await mkdir(join(dir, "assets"), { recursive: true });
  await writeFile(join(dir, "assets", "app-1234.js"), `console.log("${ASSET_MARKER}");`, "utf8");
  return dir;
}

/** A path that does not exist, so the build is absent. */
async function makeMissingDir(): Promise<string> {
  return join(await makeTemporaryDir(), "never-created");
}

interface Composed {
  running: RunningApp;
  served: boolean;
  reports: string[];
}

/**
 * Composes an app the way the bootstrap does — `/health`, an `/api` router, then
 * the client serving last of all — plus a terminator standing for "the request
 * was passed on", so a test can tell a request the fallback answered from one it
 * declined.
 */
async function compose(distDir: string): Promise<Composed> {
  const app: Express = express();
  const reports: string[] = [];
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.get("/api/probe", (_req, res) => {
    res.json({ probe: "answered" });
  });
  const served = mountClientApp(app, { distDir, report: (message) => reports.push(message) });
  app.use((_req, res) => {
    res.status(418).json({ passedOn: true });
  });
  return { running: await startApp(app), served, reports };
}

after(async () => {
  for (const dir of temporaryDirs) await rm(dir, { recursive: true, force: true });
});

// REQ-10 — the build directory is resolved from the server's own location, not from
// the working directory, so it is the same wherever the process was started from.
test("resolveClientDistDir defaults to the repository's client/dist, independently of the working directory", () => {
  const previous = process.env[DIST_DIR_ENV];
  const previousCwd = process.cwd();
  delete process.env[DIST_DIR_ENV];
  try {
    const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
    assert.equal(resolveClientDistDir(), join(repositoryRoot, "client", "dist"));
    // Started from anywhere else, the answer has to be the same one: a
    // cwd-relative resolution would follow the working directory instead.
    process.chdir(tmpdir());
    assert.equal(resolveClientDistDir(), join(repositoryRoot, "client", "dist"));
  } finally {
    process.chdir(previousCwd);
    if (previous === undefined) delete process.env[DIST_DIR_ENV];
    else process.env[DIST_DIR_ENV] = previous;
  }
});

// REQ-10 — the location can be pointed elsewhere at run time, without rebuilding.
test("resolveClientDistDir honours VEXEL_CLIENT_DIST and makes it absolute", () => {
  const previous = process.env[DIST_DIR_ENV];
  try {
    process.env[DIST_DIR_ENV] = join(tmpdir(), "some-other-build");
    assert.equal(resolveClientDistDir(), resolve(join(tmpdir(), "some-other-build")));

    process.env[DIST_DIR_ENV] = "relative/build";
    assert.equal(resolveClientDistDir(), resolve("relative/build"));
    assert.ok(resolveClientDistDir().startsWith("/"), "expected an absolute path");
  } finally {
    if (previous === undefined) delete process.env[DIST_DIR_ENV];
    else process.env[DIST_DIR_ENV] = previous;
  }
});

// specs/client-serving.md — the override counts only when it is set and not blank.
test("resolveClientDistDir ignores a blank VEXEL_CLIENT_DIST", () => {
  const previous = process.env[DIST_DIR_ENV];
  try {
    delete process.env[DIST_DIR_ENV];
    const fallback = resolveClientDistDir();
    process.env[DIST_DIR_ENV] = "   ";
    assert.equal(resolveClientDistDir(), fallback);
  } finally {
    if (previous === undefined) delete process.env[DIST_DIR_ENV];
    else process.env[DIST_DIR_ENV] = previous;
  }
});

// REQ-8, REQ-9 — no built interface is a normal state: nothing is mounted, the mount
// reports it once naming the cause and the remedy, and the server keeps its API.
test("mountClientApp serves nothing and reports the cause and the remedy when the build directory is absent", async () => {
  const missing = await makeMissingDir();
  const { running, served, reports } = await compose(missing);
  try {
    assert.equal(served, false);
    assert.equal(reports.length, 1);
    const [message] = reports;
    assert.ok(message.includes(missing), "expected the reported line to name where the build was looked for");
    assert.match(message, /built/i);
    assert.match(message, /npm run build/);

    const health = await fetch(`${running.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok" });

    const api = await fetch(`${running.url}/api/probe`);
    assert.equal(api.status, 200);
    assert.deepEqual(await api.json(), { probe: "answered" });

    // Nothing is mounted, so a page request is passed on rather than answered.
    const page = await fetch(`${running.url}/`);
    assert.equal(page.status, 418);
  } finally {
    await running.close();
  }
});

// specs/client-serving.md — a directory without an entry document is no build either.
test("mountClientApp serves nothing when the directory holds no entry document", async () => {
  const empty = await makeTemporaryDir();
  const { running, served, reports } = await compose(empty);
  try {
    assert.equal(served, false);
    assert.equal(reports.length, 1);
    const page = await fetch(`${running.url}/`);
    assert.equal(page.status, 418);
  } finally {
    await running.close();
  }
});

// specs/client-serving.md — the absence is decided once, at mount time, never probed
// per request: the report stays a single line however many requests arrive.
test("mountClientApp reports the missing build once, not per request", async () => {
  const missing = await makeMissingDir();
  const { running, reports } = await compose(missing);
  try {
    await fetch(`${running.url}/`);
    await fetch(`${running.url}/anything`);
    await fetch(`${running.url}/health`);
    assert.equal(reports.length, 1);
  } finally {
    await running.close();
  }
});

// REQ-3 — an ordinary page request outside the API path is answered with the
// interface's entry document instead of a server "not found".
test("mountClientApp answers a page request outside /api with the entry document", async () => {
  const dist = await makeFixtureBuild();
  const { running, served, reports } = await compose(dist);
  try {
    assert.equal(served, true);
    assert.deepEqual(reports, []);

    for (const path of ["/", "/containers", "/deep/nested/path", "/anything?query=1"]) {
      const response = await fetch(`${running.url}${path}`);
      assert.equal(response.status, 200, `expected the entry document for ${path}`);
      assert.match(await response.text(), new RegExp(ENTRY_MARKER));
    }
  } finally {
    await running.close();
  }
});

// specs/client-serving.md — a HEAD request is a page request too.
test("mountClientApp answers a HEAD request outside /api with the entry document", async () => {
  const dist = await makeFixtureBuild();
  const { running } = await compose(dist);
  try {
    const response = await fetch(`${running.url}/somewhere`, { method: "HEAD" });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/html/);
  } finally {
    await running.close();
  }
});

// specs/client-serving.md — a path that exists in the build is served as that file,
// with the type the build gives it, rather than being swallowed by the fallback.
test("mountClientApp serves a file that exists in the build as itself", async () => {
  const dist = await makeFixtureBuild();
  const { running } = await compose(dist);
  try {
    const response = await fetch(`${running.url}/assets/app-1234.js`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /javascript/);
    const body = await response.text();
    assert.match(body, new RegExp(ASSET_MARKER));
    assert.doesNotMatch(body, new RegExp(ENTRY_MARKER));
  } finally {
    await running.close();
  }
});

// REQ-4 — an address under the API path is never answered with the interface: the
// client serving declines it and the request carries on to the API's own error.
test("mountClientApp never answers an address under /api", async () => {
  const dist = await makeFixtureBuild();
  const { running } = await compose(dist);
  try {
    for (const path of ["/api", "/api/", "/api/unknown", "/api/containers/abc"]) {
      const response = await fetch(`${running.url}${path}`);
      assert.equal(response.status, 418, `expected ${path} to be passed on`);
      assert.doesNotMatch(await response.text(), new RegExp(ENTRY_MARKER));
    }
  } finally {
    await running.close();
  }
});

// REQ-5 — a request outside the API path that is not an ordinary page fetch is passed
// on, so an address that does not exist ends as the error it would otherwise be.
test("mountClientApp never answers a method other than GET or HEAD", async () => {
  const dist = await makeFixtureBuild();
  const { running } = await compose(dist);
  try {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const response = await fetch(`${running.url}/nope`, { method });
      assert.equal(response.status, 418, `expected ${method} to be passed on`);
      assert.doesNotMatch(await response.text(), new RegExp(ENTRY_MARKER));
    }
  } finally {
    await running.close();
  }
});

// REQ-11 — serving the interface introduces no run-time prerequisite: the server's
// runtime dependencies are still the two the architecture declares, so nothing new
// has to be installed for the interface to be served.
test("serving the interface adds no runtime dependency to the server", async () => {
  const manifestPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    dependencies: Record<string, string>;
  };
  assert.deepEqual(Object.keys(manifest.dependencies).sort(), ["express", "ws"]);
});

// REQ-10 — the explicit option overrides both the environment variable and the default.
test("mountClientApp serves the directory given as an option, over the environment variable", async () => {
  const dist = await makeFixtureBuild();
  const previous = process.env[DIST_DIR_ENV];
  process.env[DIST_DIR_ENV] = await makeMissingDir();
  const { running, served } = await compose(dist);
  try {
    assert.equal(served, true);
    const response = await fetch(`${running.url}/`);
    assert.match(await response.text(), new RegExp(ENTRY_MARKER));
  } finally {
    await running.close();
    if (previous === undefined) delete process.env[DIST_DIR_ENV];
    else process.env[DIST_DIR_ENV] = previous;
  }
});
