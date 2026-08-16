/**
 * **A registry inventory of the run's own, served beside the suite's server.**
 *
 * `plan-ui-coherence-optimisation/REQ-37` is a claim about rows in *different
 * states* — "an authenticated registry naming an account and a credential store
 * occupies exactly as many lines as one that is merely 'not authenticated'" — so
 * a check for it needs both kinds of row on screen at once. The operator's own
 * `~/.docker/config.json` cannot supply them: it holds whatever they happen to
 * be logged in to, it is theirs and not this suite's to write, and reading an
 * account out of it makes the server run the host's credential helper, whose
 * `list` verb blocks on the keychain on this machine.
 *
 * So the inventory is a fixture: a throwaway `DOCKER_CONFIG` directory holding a
 * `config.json` of nine registries in every state a row has to draw, and a second
 * instance of the **already-built** server pointed at it, on a port of its own.
 * The operator's Docker configuration is neither read nor written, no credential
 * helper that exists on this machine is ever named, nothing is created on the
 * daemon, and the directory and the process go in a `finally`.
 *
 * The secrets in it are this file's own inventions, and they are the instrument
 * of REQ-87's half of the check: a string that appears nowhere on screen can be
 * asserted to appear nowhere on screen.
 *
 * The daemon is still the operator's: with `DOCKER_CONFIG` moved, the Engine
 * endpoint falls back to the platform's local socket, which is the same daemon
 * the suite's own server talks to. Nothing here asks it for anything but the
 * `/info` read every registry inventory makes.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** The fixture server's port: neither the suite's 3100, nor the delivered build's 3101, nor a developer's 3000. */
const FIXTURE_PORT = Number(process.env.VEXEL_REGISTRY_FIXTURE_PORT ?? 3102);

const repositoryRoot = join(process.cwd(), '..');

/**
 * Credential-store names that exist nowhere: the server runs
 * `docker-credential-<store> list` for every store it finds named, and a helper
 * this machine actually has must never be one of them.
 */
const ABSENT_HELPER = 'vexel-e2e-absent-helper';

/** Never a real credential, and never one that reaches anything: the string this suite looks for on screen. */
const FIXTURE_SECRET = 'vexel-e2e-fixture-secret-never-sent-anywhere';

export { FIXTURE_SECRET };

/** What the row for a fixture registry must say, derived from `registries-screen.md`. */
export interface FixtureRegistry {
  host: string;
  /** Green dot, and a state line that is not "not authenticated". */
  authenticated: boolean;
  /** The account the row names under the host; absent when the store reports no name. */
  account?: string;
  /** What the credential-store column must state; absent when the registry is not authenticated. */
  credentialStore?: string;
  /** Reached over plain http, so the state line ends with "plain http". */
  plainHttp: boolean;
}

/**
 * Nine registries covering every combination the row has to draw: authenticated
 * and not, with an account and without, backed by a helper and by the
 * configuration file itself, over https and over plain http — and one whose
 * helper is configured while the registry is not logged in, which is the case
 * that decides whether the credential store can share a line with anything else.
 */
export const FIXTURE_REGISTRIES: FixtureRegistry[] = [
  { host: 'docker.io', authenticated: false, plainHttp: false },
  { host: 'ghcr.io', authenticated: true, account: 'octocat', credentialStore: 'docker config file', plainHttp: false },
  { host: 'quay.io', authenticated: true, credentialStore: 'docker config file', plainHttp: false },
  { host: 'ops.azurecr.io', authenticated: true, account: 'ops-ci', credentialStore: ABSENT_HELPER, plainHttp: false },
  { host: 'team.azurecr.io', authenticated: true, credentialStore: ABSENT_HELPER, plainHttp: false },
  { host: 'build.azurecr.io', authenticated: false, plainHttp: false },
  { host: 'registry.internal:5000', authenticated: false, plainHttp: false },
  { host: 'localhost:5000', authenticated: false, plainHttp: true },
  { host: '127.0.0.1:5001', authenticated: true, account: 'local-ci', credentialStore: 'docker config file', plainHttp: true },
];

function encodedCredential(username: string): string {
  return Buffer.from(`${username}:${FIXTURE_SECRET}`, 'utf8').toString('base64');
}

/**
 * The configuration Docker itself would write for that inventory: a credential
 * in the file for the accounts the row names in full, a `credHelpers` entry for
 * the ones a helper backs, and an entry with no credential for a registry that
 * is merely configured.
 */
function fixtureConfig(): string {
  return JSON.stringify(
    {
      auths: {
        'ghcr.io': { auth: encodedCredential('octocat') },
        'quay.io': { auth: encodedCredential('<token>') },
        'ops.azurecr.io': { auth: encodedCredential('ops-ci') },
        'team.azurecr.io': {},
        'registry.internal:5000': {},
        'localhost:5000': {},
        '127.0.0.1:5001': { auth: encodedCredential('local-ci') },
      },
      credHelpers: {
        'ops.azurecr.io': ABSENT_HELPER,
        'team.azurecr.io': ABSENT_HELPER,
        'build.azurecr.io': ABSENT_HELPER,
      },
    },
    null,
    2,
  );
}

export interface RegistryFixtureServer {
  /** Where the fixture interface is served, e.g. `http://localhost:3102`. */
  origin: string;
  stop(): Promise<void>;
}

export async function startRegistryFixtureServer(): Promise<RegistryFixtureServer> {
  const serverEntry = join(repositoryRoot, 'server', 'dist', 'index.js');
  if (!existsSync(serverEntry)) {
    throw new Error(`no built server at ${serverEntry}: the suite's web server builds it, so this ran too early`);
  }

  const workspace = mkdtempSync(join(tmpdir(), 'vexel-registry-fixture-'));
  const configDir = join(workspace, 'docker');
  const dataDir = join(workspace, 'data');
  mkdirSync(configDir, { recursive: true });
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(configDir, 'config.json'), fixtureConfig(), 'utf8');

  const server: ChildProcess = spawn(process.execPath, [serverEntry], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      PORT: String(FIXTURE_PORT),
      // The two directories this process is allowed to touch, and the whole
      // reason it exists as a process of its own.
      DOCKER_CONFIG: configDir,
      VEXEL_DATA_DIR: dataDir,
    },
    stdio: 'ignore',
  });

  const origin = `http://localhost:${FIXTURE_PORT}`;
  const stop = async () => {
    server.kill('SIGTERM');
    await new Promise((resolve) => {
      server.once('exit', resolve);
      setTimeout(resolve, 5_000);
    });
    rmSync(workspace, { recursive: true, force: true });
  };

  try {
    await waitForHealth(origin);
  } catch (error) {
    await stop();
    throw error;
  }

  return { origin, stop };
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
  throw new Error(`the registry fixture server never answered on ${origin}/health`);
}
