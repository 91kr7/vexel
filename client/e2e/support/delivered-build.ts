/**
 * The **delivered build**, served beside the one under test.
 *
 * The foundation batch's acceptance is a negative claim — the thirteen screens
 * render as they did before it — and a claim about what did *not* change can
 * only be checked against what was there before. A build measured on its own
 * says nothing: a surface dragged 2px, 20px or off the screen entirely still
 * has a box, still has every child and still passes every assertion written
 * about its content. So the batch's predecessor is checked out, built, and
 * served by the same server binary on a port of its own, and the two are
 * measured minutes apart against the same daemon.
 *
 * The server is deliberately **not** rebuilt: this plan is a client-side one,
 * and the server tree is identical at both revisions (asserted below), so the
 * one process the suite already built serves either interface through
 * `VEXEL_CLIENT_DIST`. What differs between the two origins is the client
 * bundle and nothing else.
 *
 * Everything it creates — a git worktree, a build, a data directory, a process
 * — is removed by `stop()`, in a `finally` at the call site.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The revision the batch was delivered on top of — batch 4, tested and
 * certified. Overridable, so the comparison can be re-run against another
 * point (or after a rebase) without editing the spec.
 */
const DELIVERED_REF = process.env.VEXEL_DELIVERED_REF ?? '17ed9afa84cf26fba1b4fd0becf034f903199025';

/** The delivered build's own port: neither the suite's 3100 nor a developer's 3000. */
const DELIVERED_PORT = Number(process.env.VEXEL_DELIVERED_PORT ?? 3101);

const repositoryRoot = join(process.cwd(), '..');

export interface DeliveredBuild {
  /** Where the delivered interface is served, e.g. `http://localhost:3101`. */
  origin: string;
  /** The revision it was built from, for the report. */
  revision: string;
  stop(): Promise<void>;
}

function git(...args: string[]): string {
  const result = spawnSync('git', args, { cwd: repositoryRoot, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
  return result.stdout.trim();
}

/**
 * Builds the delivered client and serves it, returning once it answers on
 * `/health`.
 */
export async function startDeliveredBuild(): Promise<DeliveredBuild> {
  const serverEntry = join(repositoryRoot, 'server', 'dist', 'index.js');
  if (!existsSync(serverEntry)) {
    throw new Error(`no built server at ${serverEntry}: the suite's web server builds it, so this ran too early`);
  }

  const revision = git('rev-parse', DELIVERED_REF);
  // The one thing that would invalidate serving both interfaces from the same
  // process: a server that is not the same server.
  const serverDiff = git('diff', '--name-only', revision, 'HEAD', '--', 'server');
  if (serverDiff !== '') {
    throw new Error(`the server tree differs between ${revision} and HEAD, so one process cannot serve both builds:\n${serverDiff}`);
  }

  const workspace = mkdtempSync(join(tmpdir(), 'vexel-delivered-build-'));
  const worktree = join(workspace, 'tree');
  const dataDir = join(workspace, 'data');
  mkdirSync(dataDir, { recursive: true });
  git('worktree', 'add', '--detach', worktree, revision);
  // The dependencies are the repository's own, borrowed rather than installed:
  // nothing is fetched, and the delivered build is built with exactly the
  // toolchain the current one was.
  symlinkSync(join(repositoryRoot, 'node_modules'), join(worktree, 'node_modules'));

  const build = spawnSync(process.execPath, [join(repositoryRoot, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'], {
    cwd: join(worktree, 'client'),
    encoding: 'utf8',
  });
  if (build.status !== 0) {
    rmSync(workspace, { recursive: true, force: true });
    throw new Error(`the delivered client did not build at ${revision}:\n${build.stdout}\n${build.stderr}`);
  }

  const server: ChildProcess = spawn(process.execPath, [serverEntry], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      PORT: String(DELIVERED_PORT),
      VEXEL_CLIENT_DIST: join(worktree, 'client', 'dist'),
      VEXEL_DATA_DIR: dataDir,
    },
    stdio: 'ignore',
  });

  const origin = `http://localhost:${DELIVERED_PORT}`;
  const stop = async () => {
    server.kill('SIGTERM');
    await new Promise((resolve) => {
      server.once('exit', resolve);
      setTimeout(resolve, 5_000);
    });
    try {
      git('worktree', 'remove', '--force', worktree);
    } catch {
      // The worktree is removed with the workspace below; an administrative
      // record left behind is pruned rather than left to fail the run.
      git('worktree', 'prune');
    }
    rmSync(workspace, { recursive: true, force: true });
  };

  try {
    await waitForHealth(origin);
  } catch (error) {
    await stop();
    throw error;
  }

  return { origin, revision, stop };
}

async function waitForHealth(origin: string, budget = 30_000): Promise<void> {
  const deadline = Date.now() + budget;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${origin}/health`);
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`the delivered build never answered on ${origin}/health`);
}
