import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";
import { createSleepingContainer, removeContainerQuietly } from "../support/fixtures.js";
import { ALPINE_IMAGE, ensureImages } from "../support/base-images.js";

// The delivered form: one process, started as the operator starts it, serving the
// built interface and the API at one origin. REQ ids below belong to
// plan-docker_management_app-single_process_serving.

// A pruned daemon is a starting state like any other: the base image the session
// fixture below is built on is ensured before the first test.
await ensureImages([ALPINE_IMAGE]);

const serverDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const repositoryRoot = resolve(serverDir, "..");
const entrypoint = join(serverDir, "src", "index.ts");
// Resolved here rather than passed as a bare name: a check below starts the
// process from a directory that is not the repository, and a bare specifier
// would be looked up from there.
const typescriptLoader = import.meta.resolve("tsx");

/** Marker the fixture build's entry document carries, so a response can be identified as it. */
const ENTRY_MARKER = "vexel-test-entry-document";
/** Marker the fixture build's static asset carries. */
const ASSET_MARKER = "vexel-test-static-asset";

const temporaryDirs: string[] = [];

async function makeTemporaryDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirs.push(dir);
  return dir;
}

/** A throwaway directory standing in for a built interface. */
async function makeFixtureBuild(): Promise<string> {
  const dir = await makeTemporaryDir("vexel-single-origin-dist-");
  await writeFile(join(dir, "index.html"), `<!doctype html><title>${ENTRY_MARKER}</title>`, "utf8");
  await mkdir(join(dir, "assets"), { recursive: true });
  await writeFile(join(dir, "assets", "app-1234.js"), `console.log("${ASSET_MARKER}");`, "utf8");
  return dir;
}

/** A port nothing is listening on, so the process can be bound away from its default. */
function findFreePort(): Promise<number> {
  return new Promise((resolvePort) => {
    const probe = createServer();
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolvePort(port));
    });
  });
}

interface StartedProcess {
  origin: string;
  port: number;
  output: () => string;
  stop: () => Promise<void>;
}

/**
 * Starts the server's own entrypoint the way the operator's single command does:
 * one process, one port, no second thing to launch. Its data directory is its
 * own, so the run never writes to the operator's or to another test's.
 */
async function startServerProcess(options: {
  cwd?: string;
  clientDist?: string | null;
}): Promise<StartedProcess> {
  const port = await findFreePort();
  const dataDir = await makeTemporaryDir("vexel-single-origin-data-");
  const env: NodeJS.ProcessEnv = { ...process.env, PORT: String(port), VEXEL_DATA_DIR: dataDir };
  if (options.clientDist === null || options.clientDist === undefined) delete env.VEXEL_CLIENT_DIST;
  else env.VEXEL_CLIENT_DIST = options.clientDist;

  const child = spawn(
    process.execPath,
    ["--import", typescriptLoader, entrypoint],
    { cwd: options.cwd ?? serverDir, env, stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => (output += chunk));
  child.stderr.on("data", (chunk: string) => (output += chunk));

  const origin = `http://127.0.0.1:${port}`;
  const stop = async (): Promise<void> => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill("SIGKILL");
    await new Promise((exited) => child.once("exit", exited));
  };

  const deadline = Date.now() + 60_000;
  for (;;) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`the server process exited before serving anything:\n${output}`);
    }
    const alive = await fetch(`${origin}/health`).then(
      (response) => response.status === 200,
      () => false,
    );
    if (alive) break;
    if (Date.now() > deadline) {
      await stop();
      throw new Error(`the server process did not answer within 60s:\n${output}`);
    }
    await new Promise((wait) => setTimeout(wait, 200));
  }

  return { origin, port, output: () => output, stop };
}

after(async () => {
  for (const dir of temporaryDirs) await rm(dir, { recursive: true, force: true });
});

describe("one process serving the interface and the API at one origin", () => {
  let server: StartedProcess;
  let distDir: string;

  before(async () => {
    distDir = await makeFixtureBuild();
    server = await startServerProcess({ clientDist: distDir });
  });

  after(async () => {
    await server?.stop();
  });

  // REQ-1, REQ-7 — the API answers at that one address exactly as it did, with no
  // second origin and no change for a caller beyond the host and port.
  test("the API answers at the bound port", async () => {
    const health = await fetch(`${server.origin}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok" });

    const containers = await fetch(`${server.origin}/api/containers`);
    assert.equal(containers.status, 200);
    assert.match(containers.headers.get("content-type") ?? "", /application\/json/);
    assert.ok(Array.isArray(await containers.json()), "expected the container list to answer as before");
  });

  // REQ-1, REQ-3, REQ-10 — the interface answers at that same address and port, from
  // the directory pointed at at run time.
  test("the interface answers at the same port, from the directory it was pointed at", async () => {
    const page = await fetch(`${server.origin}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), new RegExp(ENTRY_MARKER));

    const asset = await fetch(`${server.origin}/assets/app-1234.js`);
    assert.equal(asset.status, 200);
    assert.match(await asset.text(), new RegExp(ASSET_MARKER));
  });

  // REQ-3 — reloading the browser or pasting the address with any trailing path lands
  // in the running application rather than on a server "not found".
  test("a page request with any trailing path is answered with the interface", async () => {
    for (const path of ["/", "/containers", "/images/layers", "/anything/at/all"]) {
      const response = await fetch(`${server.origin}${path}`);
      assert.equal(response.status, 200, `expected the interface for ${path}`);
      assert.match(await response.text(), new RegExp(ENTRY_MARKER), `expected the interface for ${path}`);
    }
  });

  // REQ-4 — an unrecognised address under the API path fails as an API error a program
  // can detect, never with the interface's page.
  test("an unrecognised address under /api fails as an API error, not as the interface", async () => {
    for (const method of ["GET", "POST", "DELETE"]) {
      const response = await fetch(`${server.origin}/api/no-such-route`, { method });
      assert.equal(response.status, 404, `expected a not-found for ${method}`);
      assert.match(
        response.headers.get("content-type") ?? "",
        /application\/json/,
        `expected a JSON error body for ${method}`,
      );
      const body = (await response.json()) as { error?: unknown };
      assert.equal(typeof body.error, "string", `expected a described error for ${method}`);
    }

    // An address the API does claim a prefix of, but does not serve, is the same case.
    const nested = await fetch(`${server.origin}/api/containers/no/such/thing`);
    assert.equal(nested.status, 404);
    assert.doesNotMatch(await nested.text(), new RegExp(ENTRY_MARKER));
  });

  // REQ-5 — a request outside the API path that is not an ordinary page fetch is
  // answered as an error, not with the interface.
  test("a submission to an address outside /api that does not exist is answered as an error", async () => {
    for (const method of ["POST", "PUT", "DELETE"]) {
      const response = await fetch(`${server.origin}/nope`, { method });
      assert.ok(response.status >= 400, `expected an error for ${method}, got ${response.status}`);
      assert.doesNotMatch(await response.text(), new RegExp(ENTRY_MARKER), `expected no interface for ${method}`);
    }
  });

  // REQ-2, REQ-12 — one address is the whole exposure decision: no credentials are
  // demanded, and no cross-origin arrangement is set up for a second origin to use.
  test("neither the interface nor the API demands credentials or announces a second origin", async () => {
    for (const path of ["/", "/health", "/api/containers"]) {
      const response = await fetch(`${server.origin}${path}`);
      assert.notEqual(response.status, 401, `expected no authentication challenge on ${path}`);
      assert.equal(response.headers.get("www-authenticate"), null, `expected no authentication challenge on ${path}`);
      assert.equal(
        response.headers.get("access-control-allow-origin"),
        null,
        `expected no cross-origin arrangement on ${path}`,
      );
    }
  });

  // REQ-6 — the live channel, which carries the daemon events since
  // …-multiplexed_sse/REQ-1, is established as promptly as before, with the
  // client serving now in the middleware chain.
  test("the live channel still streams through the process serving the interface", async () => {
    const abort = new AbortController();
    try {
      const response = await fetch(`${server.origin}/api/live`, { signal: abort.signal });
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);
      assert.notEqual(response.headers.get("content-length"), "0");
      // A buffering middleware would have made the body unreadable as a stream.
      assert.ok(response.body !== null, "expected a readable stream body");
    } finally {
      abort.abort();
    }
  });

  // REQ-6 — an interactive session is an HTTP upgrade on an /api path: it is handled
  // outside the middleware chain and nothing mounted on the app intercepts it.
  test("an interactive session upgrade on an /api path is still handled", async () => {
    const caseName = "single-origin-session";
    const { id, name } = await createSleepingContainer(caseName);
    let socket: WebSocket | undefined;
    try {
      const url = `ws://127.0.0.1:${server.port}/api/containers/${id}/exec?cmd=%2Fbin%2Fsh`;
      socket = new WebSocket(url);
      let text = "";
      socket.on("message", (data: Buffer, isBinary: boolean) => {
        if (isBinary) text += data.toString("utf8");
      });
      await new Promise<void>((opened, failed) => {
        socket!.once("open", () => opened());
        socket!.once("error", (error) => failed(error));
      });
      socket.send(Buffer.from("echo single-origin-ok\n", "utf8"));
      const deadline = Date.now() + 10_000;
      while (!text.includes("single-origin-ok") && Date.now() < deadline) {
        await new Promise((wait) => setTimeout(wait, 100));
      }
      assert.match(text, /single-origin-ok/, "expected the interactive session to echo what was typed");
    } finally {
      socket?.close();
      await removeContainerQuietly(name);
    }
  });
});

describe("the same process with no built interface", () => {
  let server: StartedProcess;
  let missingDist: string;

  before(async () => {
    missingDist = join(await makeTemporaryDir("vexel-single-origin-nobuild-"), "never-built");
    server = await startServerProcess({ clientDist: missingDist });
  });

  after(async () => {
    await server?.stop();
  });

  // REQ-8 — a fresh checkout, or a developer running the server alone, gets a process
  // that runs and serves its whole API rather than one that refuses to.
  test("the server starts and serves its whole API when no interface is built", async () => {
    const health = await fetch(`${server.origin}/health`);
    assert.equal(health.status, 200);

    const containers = await fetch(`${server.origin}/api/containers`);
    assert.equal(containers.status, 200);
    assert.ok(Array.isArray(await containers.json()));

    const images = await fetch(`${server.origin}/api/images`);
    assert.equal(images.status, 200);
  });

  // REQ-8 — with no interface built there is no interface to answer with; the request
  // fails plainly instead of getting a blank page.
  test("a page request is not answered with an interface that was never built", async () => {
    const response = await fetch(`${server.origin}/`);
    assert.equal(response.status, 404);
  });

  // REQ-9 — the absence is reported in terms that name the cause and the remedy,
  // rather than a blank page, a generic error or silence.
  test("the absence is reported once, naming the cause and the remedy", async () => {
    const output = server.output();
    const lines = output.split("\n").filter((line) => /has not been built|npm run build/.test(line));
    assert.equal(lines.length, 1, `expected exactly one reported line, got:\n${output}`);
    const [line] = lines;
    assert.ok(line.includes(missingDist), "expected the line to name where the interface was looked for");
    assert.match(line, /npm run build/);
  });
});

describe("the default location of the built interface", () => {
  // REQ-1, REQ-3 — with nothing pointed anywhere, the process serves the repository's
  // own build, found from the server's own location however it was started. The build
  // is an artifact: this check contracts it only when it is there.
  test("the repository's build is served whatever directory the process was started from", async (t) => {
    if (!existsSync(join(repositoryRoot, "client", "dist", "index.html"))) {
      t.skip("the interface has not been built in this checkout");
      return;
    }
    const startedFrom = await makeTemporaryDir("vexel-single-origin-cwd-");
    const server = await startServerProcess({ cwd: startedFrom, clientDist: null });
    try {
      const page = await fetch(`${server.origin}/`);
      assert.equal(page.status, 200);
      assert.match(page.headers.get("content-type") ?? "", /text\/html/);

      const health = await fetch(`${server.origin}/health`);
      assert.equal(health.status, 200);
    } finally {
      await server.stop();
    }
  });
});

describe("the interface addresses the API relative to where it was served from", () => {
  // REQ-2 — no base URL, no configured host, no cross-origin arrangement in the client:
  // its calls are relative, so it works unchanged at whatever address the process is
  // bound to. This is a preservation requirement: the client is not modified here.
  test("no address in the client's API layer is absolute or configured", async () => {
    const dataDir = join(repositoryRoot, "client", "src", "data");
    const entries = await readdir(dataDir, { recursive: true, withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name));
    assert.ok(files.length > 0, "expected the client's API layer to hold files");

    for (const file of files) {
      const source = await readFile(join(file.parentPath, file.name), "utf8");
      assert.doesNotMatch(
        source,
        /["'`](https?|wss?):\/\//,
        `${file.name} addresses the API through an absolute origin`,
      );
      assert.doesNotMatch(
        source,
        /import\.meta\.env/,
        `${file.name} configures the API address at build time`,
      );
    }
  });

  // REQ-2 — the interactive-session URL included: it is derived from the address the
  // interface was served from, not from a configured host.
  test("the interactive-session URL is derived from the address the interface was served from", async () => {
    const source = await readFile(
      join(repositoryRoot, "client", "src", "data", "container-session-client.ts"),
      "utf8",
    );
    assert.match(source, /window\.location\.host/);
    assert.match(source, /window\.location\.protocol/);
  });
});
