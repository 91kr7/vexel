/**
 * **The swarm cluster, answered in the browser.**
 *
 * Swarm mode is a property of the whole daemon, which no label can scope, and the
 * daemon these specs run against is the operator's own: `docker swarm init`
 * reconfigures it and leaves an ingress network behind. So the reading is served
 * from the page — the precedent batches 8, 10 and 11 set for the same problem —
 * and the daemon is not touched at all.
 *
 * It lives here rather than in one spec because **three files need the same
 * cluster**: `swarm-row-geometry.spec.ts` measures the rows and the panel,
 * `property-columns-ordinary-widths.spec.ts` measures the property section inside
 * that panel, and each must pass on its own.
 *
 * What it costs is stated rather than hidden: nothing here exercises the server's
 * own reading of a real cluster. That half is `e2e/exclusive/swarm-cluster.spec.ts`,
 * which puts the daemon back the way it found it and skips outright where it
 * cannot prove it may.
 */
import type { Page } from '@playwright/test';

/** The daemon's own sentence for a daemon that is in no swarm at all. */
export const INACTIVE_REASON =
  'This daemon is not part of a swarm. Initialise a swarm or join an existing one to see its nodes, services, stacks, secrets and configs.';

/** …and for a daemon that is in one but is not a manager of it. */
export const WORKER_REASON = 'This daemon is a swarm worker: only a manager can read the cluster.';

/** The join tokens the stubbed manager issues, which nothing but the dialog may ever show. */
export const WORKER_TOKEN = 'SWMTKN-1-e2e-worker-token-never-displayed-without-a-reveal';
export const MANAGER_TOKEN = 'SWMTKN-1-e2e-manager-token-never-displayed-without-a-reveal';

export interface SwarmFixture {
  state: Record<string, unknown>;
  nodes: Record<string, unknown>[];
  services: Record<string, unknown>[];
  stacks: Record<string, unknown>[];
  secrets: Record<string, unknown>[];
  configs: Record<string, unknown>[];
  /** The reason every manager-only listing carries where this daemon is not one. */
  unavailableReason?: string;
}

export function inactiveSwarmFixture(): SwarmFixture {
  return {
    state: {
      role: 'inactive',
      localNodeState: 'inactive',
      manager: false,
      raft: { status: 'unknown', detail: 'Raft health is only visible from a swarm manager.' },
      unavailableReason: INACTIVE_REASON,
    },
    nodes: [],
    services: [],
    stacks: [],
    secrets: [],
    configs: [],
    unavailableReason: INACTIVE_REASON,
  };
}

export function workerSwarmFixture(): SwarmFixture {
  return {
    state: {
      role: 'worker',
      localNodeState: 'active',
      manager: false,
      raft: { status: 'unknown', detail: 'Raft health is only visible from a swarm manager.' },
      unavailableReason: WORKER_REASON,
    },
    nodes: [],
    services: [],
    stacks: [],
    secrets: [],
    configs: [],
    unavailableReason: WORKER_REASON,
  };
}

const AGE_18_DAYS = new Date(Date.now() - 18 * 24 * 60 * 60 * 1000).toISOString();
const AGE_3_DAYS = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

/**
 * A cluster whose objects differ in **every value whose presence used to decide a
 * row's height** — the daemon's message about a node, the stack a service or a
 * secret belongs to, the ports a service publishes — so that "one height" is a
 * guarantee and not a coincidence. A row carrying none of them must cost its row
 * no height, which is only measurable against one carrying all of them.
 *
 * The **lengths** are the fixture's second job. A swarm panel's property bands
 * hold ids, image references, environment lines and addresses, and the class the
 * caller states for them (`long-single-line`) is derived from that content — so
 * the fixture carries values of the length the class was sized for rather than
 * short ones that would make any class look adequate.
 */
export function managerSwarmFixture(): SwarmFixture {
  return {
    state: {
      role: 'manager',
      localNodeState: 'active',
      manager: true,
      clusterId: 'e2ecluster0000000000000000000',
      nodeId: 'e2enode1',
      nodeCount: 3,
      managerCount: 1,
      raft: { status: 'healthy', detail: '1 manager, quorum held' },
    },
    nodes: [
      {
        id: 'e2enode1',
        hostname: 'vexel-e2e-manager',
        role: 'manager',
        availability: 'active',
        status: 'ready',
        address: '10.7.0.1',
        leader: true,
        reachability: 'reachable',
        engineVersion: '27.0.3',
        platform: 'linux/arm64',
        self: true,
        version: 12,
        labels: { tier: 'control' },
      },
      {
        // The node carrying the daemon's own message about it: the value that
        // used to share a line with the status, and is a column of its own here.
        id: 'e2enode2',
        hostname: 'vexel-e2e-worker-down',
        role: 'worker',
        availability: 'drain',
        status: 'down',
        statusMessage: 'heartbeat failure for node in awaiting state',
        address: '10.7.0.2',
        leader: false,
        reachability: 'unknown',
        engineVersion: '27.0.3',
        platform: 'linux/arm64',
        self: false,
        version: 9,
        labels: {},
      },
      {
        id: 'e2enode3',
        hostname: 'vexel-e2e-worker-plain',
        role: 'worker',
        availability: 'active',
        status: 'ready',
        leader: false,
        self: false,
        version: 4,
        labels: {},
      },
    ],
    services: [
      {
        id: 'e2esvc1',
        name: 'vexel-e2e-api',
        image: 'alpine:3.20',
        mode: 'replicated',
        replicasRunning: 2,
        replicasDesired: 3,
        ports: [{ published: 8080, target: 80, protocol: 'tcp' }],
        stack: 'vexel-e2e-stack',
        version: 5,
        updatedAt: AGE_3_DAYS,
      },
      {
        // Neither a published port nor a stack: the two values that shared one
        // subtitle line, both absent.
        id: 'e2esvc2',
        name: 'vexel-e2e-agent',
        image: 'alpine:3.20',
        mode: 'global',
        replicasRunning: 3,
        replicasDesired: 3,
        ports: [],
        version: 2,
        updatedAt: AGE_18_DAYS,
      },
    ],
    stacks: [
      {
        name: 'vexel-e2e-stack',
        serviceCount: 2,
        services: [
          { id: 'e2esvc1', name: 'vexel-e2e-api', image: 'alpine:3.20', mode: 'replicated', replicasRunning: 2, replicasDesired: 3 },
          { id: 'e2esvc3', name: 'vexel-e2e-web', image: 'alpine:3.20', mode: 'replicated', replicasRunning: 1, replicasDesired: 1 },
        ],
        secretCount: 1,
        configCount: 1,
        networkCount: 2,
      },
      {
        name: 'vexel-e2e-lonely',
        serviceCount: 1,
        services: [{ id: 'e2esvc4', name: 'vexel-e2e-solo', image: 'alpine:3.20', mode: 'global', replicasRunning: 1, replicasDesired: 1 }],
        secretCount: 0,
        configCount: 0,
        networkCount: 1,
      },
    ],
    secrets: [
      { kind: 'secret', id: 'e2esec1', name: 'vexel-e2e-db-password', createdAt: AGE_18_DAYS, updatedAt: AGE_18_DAYS, version: 3, labels: {}, stack: 'vexel-e2e-stack' },
      { kind: 'secret', id: 'e2esec2', name: 'vexel-e2e-api-key', createdAt: AGE_3_DAYS, version: 1, labels: {} },
    ],
    configs: [
      { kind: 'config', id: 'e2ecfg1', name: 'vexel-e2e-nginx-conf', createdAt: AGE_18_DAYS, updatedAt: AGE_3_DAYS, version: 2, labels: {}, stack: 'vexel-e2e-stack' },
      { kind: 'config', id: 'e2ecfg2', name: 'vexel-e2e-motd', createdAt: AGE_3_DAYS, version: 1, labels: {} },
    ],
  };
}

export interface SwarmStub {
  /** Every mutating call the page issued, which must stay empty: nothing here changes a cluster. */
  mutations: () => string[];
  /** How many times the join tokens were read. */
  tokenReads: () => number;
}

/**
 * Answers the swarm endpoints in the page, leaving the daemon untouched.
 *
 * Every **mutation** is recorded and refused rather than answered: no assertion
 * needs one, and a refused request cannot be mistaken for a command that reached
 * the operator's own daemon. `init`, `join` and `leave` are the three that would
 * reconfigure it, and they are aborted outright.
 */
export async function stubSwarmReading(page: Page, fixture: SwarmFixture): Promise<SwarmStub> {
  const mutations: string[] = [];
  let tokenReads = 0;

  const listing = (items: Record<string, unknown>[]) =>
    fixture.unavailableReason === undefined ? { items } : { items, unavailableReason: fixture.unavailableReason };

  // The three that would reconfigure the daemon: never answered, never reached.
  for (const command of ['init', 'join', 'leave']) {
    await page.route(`**/api/swarm/${command}`, (route) => {
      mutations.push(command);
      return route.abort();
    });
  }

  await page.route('**/api/swarm/tokens', async (route) => {
    tokenReads += 1;
    await route.fulfill({ json: { tokens: { worker: WORKER_TOKEN, manager: MANAGER_TOKEN } } });
  });
  await page.route('**/api/swarm/tokens/rotate', (route) => {
    mutations.push('tokens/rotate');
    return route.abort();
  });

  await page.route('**/api/swarm/services/*', async (route) => {
    const method = route.request().method();
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-1)!);
    if (method !== 'GET') {
      mutations.push(`${method} services/${id}`);
      return route.abort();
    }
    const service = fixture.services.find((candidate) => candidate.id === id);
    await route.fulfill({
      json: {
        service,
        env: ['MODE=production', 'LOG_LEVEL=info'],
        labels: {},
        tasks: [
          { id: 'e2etask1', slot: 1, nodeId: 'e2enode1', nodeHostname: 'vexel-e2e-manager', state: 'running', desiredState: 'running' },
          {
            id: 'e2etask2',
            slot: 2,
            nodeId: 'e2enode2',
            nodeHostname: 'vexel-e2e-worker-down',
            state: 'rejected',
            desiredState: 'shutdown',
            message: 'no suitable node (insufficient resources on 2 nodes)',
          },
        ],
        raw: {},
      },
    });
  });

  const collections: [string, Record<string, unknown>[]][] = [
    ['nodes', fixture.nodes],
    ['services', fixture.services],
    ['stacks', fixture.stacks],
    ['secrets', fixture.secrets],
    ['configs', fixture.configs],
  ];
  for (const [name, items] of collections) {
    await page.route(`**/api/swarm/${name}`, async (route) => {
      if (route.request().method() !== 'GET') {
        mutations.push(`${route.request().method()} ${name}`);
        return route.abort();
      }
      await route.fulfill({ json: listing(items) });
    });
  }
  // Everything else under a collection — an id, an update, a removal.
  await page.route('**/api/swarm/{nodes,stacks,secrets,configs}/**', (route) => {
    mutations.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
    return route.abort();
  });

  await page.route('**/api/swarm', async (route) => {
    if (route.request().method() !== 'GET') {
      mutations.push(route.request().method());
      return route.abort();
    }
    await route.fulfill({ json: fixture.state });
  });

  return { mutations: () => [...mutations], tokenReads: () => tokenReads };
}
