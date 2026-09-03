import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from './support/test.js';
import { openApp } from './support/fixtures.js';
import { cleanDaemonBeforeAll } from './support/lifecycle.js';

cleanDaemonBeforeAll();

/**
 * The failure modes the single-process form introduces, pinned against the
 * process this suite actually runs: the built server serving the built interface
 * and the API at one origin. REQ ids below belong to
 * plan-docker_management_app-single_process_serving.
 *
 * These are the defects a suite that only clicks through screens cannot catch:
 * they are about which handler answers a request, not about what a screen shows.
 */

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const serverEntrypoint = join(repositoryRoot, 'server', 'dist', 'index.js');

/** A port nothing is listening on, so a spawned process stays clear of the suite's own. */
function findFreePort(): Promise<number> {
  return new Promise((resolvePort) => {
    const probe = createServer();
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolvePort(port));
    });
  });
}

// REQ-20, REQ-4 — an unrecognised address under the API path fails as an API error a
// program can detect, and is never answered with the interface's page. Answering it
// with `index.html` would turn a client bug into a silent "renders the app".
test('an unrecognised address under /api answers as the API error, never as the interface', async ({ request }) => {
  for (const method of ['get', 'post', 'delete'] as const) {
    const response = await request[method]('/api/no-such-address');

    expect(response.status(), `expected a not-found for ${method.toUpperCase()}`).toBe(404);
    expect(response.headers()['content-type'] ?? '', `expected a JSON error body for ${method.toUpperCase()}`).toMatch(
      /application\/json/,
    );
    const body = (await response.json()) as { error?: unknown };
    expect(typeof body.error, `expected a described error for ${method.toUpperCase()}`).toBe('string');
  }

  // An address the API does claim a prefix of, but does not serve, is the same case.
  const nested = await request.get('/api/containers/no/such/address');
  expect(nested.status()).toBe(404);
  expect(await nested.text()).not.toMatch(/<div id="root"/);
});

// REQ-20, REQ-3 — an ordinary page request outside the API path is answered with the
// interface rather than a server "not found".
test('an ordinary page request to an arbitrary path is answered with the interface', async ({ request }) => {
  for (const path of ['/', '/containers', '/images/layers', '/anything/at/all']) {
    const response = await request.get(path);

    expect(response.status(), `expected the interface for ${path}`).toBe(200);
    expect(response.headers()['content-type'] ?? '', `expected the interface for ${path}`).toMatch(/text\/html/);
    expect(await response.text(), `expected the interface for ${path}`).toMatch(/<div id="root"/);
  }
});

// REQ-20, REQ-3 — and in the browser: an arbitrary path opens the running application
// on the screen it persisted as last active (plan-docker_management_app/REQ-115), not
// on a server "not found". No screen has a URL of its own, so the path is incidental:
// what the requirement promises is that the operator lands in the application.
test('an arbitrary path opens the application on the screen it persisted as last active', async ({ page }) => {
  await openApp(page, 'containers');

  await page.goto('/an/arbitrary/path');

  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
});

// REQ-20, REQ-8, REQ-9 — the delivered process started with its interface directory
// pointed at a path that holds no build: it serves its whole API rather than refusing
// to start, and states cause and remedy instead of leaving a blank page or silence.
//
// Spawned by the spec on a spare port, because the suite's own process always has a
// build. It is given its own throwaway data directory, removed with the process in the
// `finally`, so neither the operator's `~/.vexel` nor the run's own store is touched.
test('a process pointed at a missing interface directory serves its API and states the reason', async () => {
  // A cold start of the built server does daemon work before it listens; the default
  // per-test budget is sized for a page interaction, not for that.
  test.setTimeout(120_000);

  expect(
    existsSync(serverEntrypoint),
    'the built server is missing: the suite starts the product with `npm start`, which builds it',
  ).toBe(true);

  const port = await findFreePort();
  const origin = `http://127.0.0.1:${port}`;
  const dataDir = await mkdtemp(join(tmpdir(), 'vexel-e2e-nobuild-data-'));
  const missingDist = join(dataDir, 'interface-never-built');
  let output = '';
  let child: ChildProcess | undefined;

  try {
    child = spawn(process.execPath, [serverEntrypoint], {
      cwd: repositoryRoot,
      env: { ...process.env, PORT: String(port), VEXEL_DATA_DIR: dataDir, VEXEL_CLIENT_DIST: missingDist },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => (output += chunk));
    child.stderr?.on('data', (chunk: string) => (output += chunk));

    // The process starting at all is the first half of REQ-8: a missing build is a
    // normal state, never a reason to refuse to run.
    await expect
      .poll(
        async () => {
          if (child?.exitCode !== null || child?.signalCode !== null) {
            throw new Error(`the server exited before serving anything:\n${output}`);
          }
          return await fetch(`${origin}/health`).then(
            (response) => response.status,
            () => 0,
          );
        },
        { timeout: 90_000, message: `the server did not answer on ${origin}/health:\n${output}` },
      )
      .toBe(200);

    // The second half: the whole API answers, not just the liveness address.
    const containers = await fetch(`${origin}/api/containers`);
    expect(containers.status).toBe(200);
    expect(Array.isArray(await containers.json())).toBe(true);

    // With no interface to serve, a page request fails plainly rather than being
    // answered with a blank page.
    const pageRequest = await fetch(`${origin}/`);
    expect(pageRequest.status).toBe(404);

    // REQ-9 — one line, naming where the interface was looked for and what to run.
    const reported = output.split('\n').filter((line) => /has not been built|npm run build/.test(line));
    expect(reported.length, `expected exactly one reported line, got:\n${output}`).toBe(1);
    expect(reported[0]).toContain(missingDist);
    expect(reported[0]).toMatch(/npm run build/);
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
      await new Promise((exited) => child?.once('exit', exited));
    }
    await rm(dataDir, { recursive: true, force: true });
  }
});
