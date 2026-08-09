import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// REQ ids below belong to plan-docker_management_app-single_process_serving,
// component contract in .sdd/modules/server-app/specs/root-commands.md.
// This file checks repository metadata — the delivered command surface — because
// a drift there is silent: a reordered chain serves the previous build and every
// symptom then looks like an application defect.

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

interface Manifest {
  scripts: Record<string, string>;
}

async function readManifest(...pathSegments: string[]): Promise<Manifest> {
  const raw = await readFile(join(repositoryRoot, ...pathSegments, "package.json"), "utf8");
  return JSON.parse(raw) as Manifest;
}

const rootScripts = (await readManifest()).scripts;
const clientScripts = (await readManifest("client")).scripts;
const serverScripts = (await readManifest("server")).scripts;

/** The links of a shell chain, in order, as the operator's shell would run them. */
function chainLinks(script: string): string[] {
  return script.split("&&").map((link) => link.trim());
}

/**
 * Matches any operator that would let the chain carry on past a failed link:
 * a separator (`;`), an alternative (`||`) or a background launch (a lone `&`).
 */
const FAILURE_TOLERATING_OPERATOR = /;|\|\||(?<!&)&(?!&)/;

// REQ-13, REQ-15 — one command builds the whole application and then runs it, in
// that order and in that one chain: nothing else for the operator to start.
test("start builds the whole application, then serves it, in that order", () => {
  assert.deepEqual(chainLinks(rootScripts.start), ["npm run build", "npm run serve"]);
});

// REQ-15 — the chain propagates failure: a failed build stops the command and
// nothing is served, so the previous build is never left running in its place.
test("start chains its two steps so a failed build stops the command", () => {
  assert.ok(rootScripts.start.includes("&&"), "expected the two steps chained with &&");
  assert.doesNotMatch(
    rootScripts.start,
    FAILURE_TOLERATING_OPERATOR,
    "expected no operator that would serve despite a failed build",
  );
});

// REQ-15 — the interface is built before the process that serves it, since that
// process serves the client's build output.
test("build builds the client before the server", () => {
  const links = chainLinks(rootScripts.build);
  assert.deepEqual(links, ["npm run build -w client", "npm run build -w server"]);
  assert.ok(
    links.indexOf("npm run build -w client") < links.indexOf("npm run build -w server"),
    "expected the client build to come first",
  );
});

// REQ-15 — the client build failing must leave the server build unrun and the
// command failing, rather than producing a half-built application.
test("build chains its two steps so a failed client build stops the command", () => {
  assert.ok(rootScripts.build.includes("&&"), "expected the two builds chained with &&");
  assert.doesNotMatch(rootScripts.build, FAILURE_TOLERATING_OPERATOR);
});

// REQ-14 — running an already-built application is its own command and triggers
// no build of either workspace, so a restart costs no build time.
test("serve runs the built server and rebuilds nothing", () => {
  assert.equal(rootScripts.serve.trim(), "npm start -w server");
  assert.doesNotMatch(rootScripts.serve, /build|tsc|vite/);
  assert.equal(serverScripts.start.trim(), "node dist/index.js");
  assert.doesNotMatch(serverScripts.start, /build|tsc|vite/);
});

// REQ-13, REQ-17 — no command of the run chain starts a development server, and
// none of them starts more than the single long-running process.
test("no command in the run chain starts a development server", () => {
  for (const name of ["start", "serve", "build"]) {
    assert.doesNotMatch(rootScripts[name], /\bdev\b/, `expected ${name} to reference no dev script`);
  }
  // The client's build invokes Vite as a build tool, never as a server.
  assert.match(clientScripts.build, /vite build/);
  assert.doesNotMatch(clientScripts.build, /vite(?!\s+build)/);
  assert.doesNotMatch(serverScripts.build, /watch|vite/);
});

// REQ-16 — the development pair is unchanged and still available: the same two
// commands, each running its workspace's development server in watch mode.
test("the development pair is the same two commands, in watch mode", () => {
  assert.equal(rootScripts["dev:client"].trim(), "npm run dev -w client");
  assert.equal(rootScripts["dev:server"].trim(), "npm run dev -w server");
  assert.equal(clientScripts.dev.trim(), "vite");
  assert.match(serverScripts.dev, /tsx watch/);
});

// REQ-16, REQ-17 — the development interface reaches the API, the event stream and
// the interactive-session upgrades through its own proxy, and needs no client build.
test("the development client proxies /api to the server, WebSocket upgrades included", async () => {
  const config = await readFile(join(repositoryRoot, "client", "vite.config.ts"), "utf8");
  assert.match(config, /['"]\/api['"]/, "expected /api to be proxied");
  assert.match(config, /http:\/\/localhost:3000/, "expected the proxy to target the server's port");
  assert.match(config, /ws:\s*true/, "expected WebSocket upgrades to be forwarded");
});

// REQ-17 — neither arrangement requires a step of the other: the development flow
// builds nothing, and the delivered flow starts no Vite server.
test("neither arrangement requires a step of the other", () => {
  for (const name of ["dev:client", "dev:server"]) {
    assert.doesNotMatch(rootScripts[name], /build/, `expected ${name} to need no build`);
  }
  assert.doesNotMatch(clientScripts.dev, /build/);
  assert.doesNotMatch(serverScripts.dev, /build/);
  assert.doesNotMatch(rootScripts.serve, /vite/);
});

// REQ-18 — the stated commands present the two arrangements plainly distinguished,
// and no instruction still offers the development flow as the way to run the product:
// wherever the development pair is named, the one-command form is stated first and the
// pair is marked as manual development.
test("the instruction documents present the run command first and mark the development pair as development-only", async () => {
  for (const document of ["CLAUDE.md", "README.md", "client/README.md"]) {
    const text = await readFile(join(repositoryRoot, document), "utf8");
    const developmentPair = text.search(/npm run dev:(client|server)/);
    if (developmentPair === -1) continue;

    const runCommand = text.search(/npm start\b/);
    assert.notEqual(runCommand, -1, `${document} names the development pair but not npm start`);
    assert.ok(
      runCommand < developmentPair,
      `${document} names the development pair before the command that runs the product`,
    );
    assert.match(
      text,
      /development only|manual development|developing|developer's/i,
      `${document} does not mark the development pair as the developer's arrangement`,
    );
  }
});
