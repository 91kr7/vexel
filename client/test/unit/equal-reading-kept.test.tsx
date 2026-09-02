/**
 * A reading that comes back equal to the one already in hand replaces nothing,
 * and one that differs replaces it on that same tick
 * (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-47,
 * REQ-48).
 *
 * `useContainers` left this set on
 * plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-8:
 * it stores nothing through the keeper any more, because it takes no reading —
 * the same claim for the list it shows is in `use-containers.test.tsx`, over the
 * channel that delivers it. The table below is held against the keeper's callers
 * by the last case of this file, so a hook rejoining the set cannot be forgotten.
 *
 * One file over the five polled list hooks left, because the claim is about the set:
 * a hook left storing its reading outright would show up here as one row of the
 * table, whichever row it was — and `useComposeProjects`, which has no check
 * file of its own, is covered by being in it.
 *
 * Every read returns a **freshly built** payload, which is what a newly parsed
 * answer is: a mock resolving with one long-lived object would keep its identity
 * on its own and this file would pass while testing nothing.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { act, memo } from 'react';
import { render, renderHook, type RenderHookResult } from '@testing-library/react';

const reads = {
  images: vi.fn(),
  volumes: vi.fn(),
  networks: vi.fn(),
  compose: vi.fn(),
  plugins: vi.fn(),
};

vi.mock('../../src/data/images-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/data/images-client')>()),
  fetchImages: () => reads.images(),
}));
vi.mock('../../src/data/volumes-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/data/volumes-client')>()),
  fetchVolumes: () => reads.volumes(),
}));
vi.mock('../../src/data/networks-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/data/networks-client')>()),
  fetchNetworks: () => reads.networks(),
}));
vi.mock('../../src/data/compose-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/data/compose-client')>()),
  fetchComposeProjects: () => reads.compose(),
}));
vi.mock('../../src/data/plugins-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/data/plugins-client')>()),
  fetchPlugins: () => reads.plugins(),
}));

const { useImages } = await import('../../src/data/use-images');
const { useVolumes } = await import('../../src/data/use-volumes');
const { useNetworks } = await import('../../src/data/use-networks');
const { useComposeProjects } = await import('../../src/data/use-compose-projects');
const { usePlugins } = await import('../../src/data/use-plugins');

type HookResult = Record<string, unknown>;

interface ListHookCase {
  name: string;
  /** The hook's own module, so the table can be held against the keeper's callers. */
  source: string;
  read: ReturnType<typeof vi.fn>;
  render: () => RenderHookResult<HookResult, unknown>;
  /** The keys of the result carrying what was read. */
  readings: string[];
  /** A reading of unchanging content, built afresh on every call. */
  reading: () => unknown;
  /** A reading of other content, built afresh on every call, `nth` telling two of them apart. */
  changed: (nth: number) => unknown;
  /** The period the hook's spec states, in ms; `undefined` where it states only a bounded poll. */
  statedPollMs?: number;
}

const LIST_HOOKS: ListHookCase[] = [
  {
    name: 'useImages',
    source: 'use-images.ts',
    read: reads.images,
    render: () => renderHook(() => useImages() as unknown as HookResult),
    readings: ['images'],
    reading: () => [{ id: 'img-1', shortId: 'img-1', tags: ['app:1'], platforms: [], sizeBytes: 1, createdAt: '2026-01-01T00:00:00Z' }],
    changed: (nth) => [{ id: 'img-1', shortId: 'img-1', tags: [`app:changed-${nth}`], platforms: [], sizeBytes: 1, createdAt: '2026-01-01T00:00:00Z' }],
    statedPollMs: 3000,
  },
  {
    name: 'useVolumes',
    source: 'use-volumes.ts',
    read: reads.volumes,
    render: () => renderHook(() => useVolumes() as unknown as HookResult),
    readings: ['volumes'],
    reading: () => [{ name: 'vol-1', driver: 'local', mountpoint: '/data/vol-1', scope: 'local', createdAt: '', labels: {}, options: {}, mountedBy: [] }],
    changed: (nth) => [{ name: `vol-changed-${nth}`, driver: 'local', mountpoint: `/data/vol-changed-${nth}`, scope: 'local', createdAt: '', labels: {}, options: {}, mountedBy: [] }],
    statedPollMs: 3000,
  },
  {
    name: 'useNetworks',
    source: 'use-networks.ts',
    read: reads.networks,
    render: () => renderHook(() => useNetworks() as unknown as HookResult),
    readings: ['networks'],
    reading: () => [{ id: 'net-1', name: 'app-net', driver: 'bridge', scope: 'local', labels: {}, options: {}, attachedContainers: [] }],
    changed: (nth) => [{ id: 'net-1', name: `app-net-changed-${nth}`, driver: 'bridge', scope: 'local', labels: {}, options: {}, attachedContainers: [] }],
    statedPollMs: 3000,
  },
  {
    name: 'useComposeProjects',
    source: 'use-compose-projects.ts',
    read: reads.compose,
    render: () => renderHook(() => useComposeProjects() as unknown as HookResult),
    readings: ['projects'],
    reading: () => [{ name: 'shop', status: 'running(2)', configFiles: ['/srv/shop/compose.yaml'], services: [] }],
    changed: (nth) => [{ name: 'shop', status: `running(changed-${nth})`, configFiles: ['/srv/shop/compose.yaml'], services: [] }],
  },
  {
    name: 'usePlugins',
    source: 'use-plugins.ts',
    read: reads.plugins,
    render: () => renderHook(() => usePlugins() as unknown as HookResult),
    readings: ['cli', 'daemon'],
    reading: () => ({
      cli: { items: [{ name: 'compose', command: 'docker compose', availability: 'enabled' }] },
      daemon: { items: [{ id: 'id-sshfs', name: 'vieux/sshfs:latest', enabled: false, interfaceTypes: [], type: 'volume driver' }] },
    }),
    changed: (nth) => ({
      cli: { items: [{ name: `compose-changed-${nth}`, command: 'docker compose', availability: 'enabled' }] },
      daemon: { items: [{ id: 'id-sshfs', name: `vieux/sshfs:changed-${nth}`, enabled: true, interfaceTypes: [], type: 'volume driver' }] },
    }),
  },
];

/** The two callers of the keeper covered by their own files rather than by this one. */
const DETAIL_HOOKS = ['use-container-detail.ts', 'use-container-processes.ts'];

/** Wide enough for the slowest poll any of these hooks is allowed to keep. */
const BOUNDED_POLL_CEILING_MS = 60_000;

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** One tick of the hook's own clock, or a bounded stretch of it where its spec states no figure. */
async function tick(listHook: ListHookCase): Promise<void> {
  await advance(listHook.statedPollMs ?? BOUNDED_POLL_CEILING_MS);
}

beforeEach(() => {
  for (const read of Object.values(reads)) read.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('a reading equal to the one in hand replaces nothing (REQ-47, REQ-48)', () => {
  for (const listHook of LIST_HOOKS) {
    describe(listHook.name, () => {
      // …/REQ-47 — an identical answer arriving on a tick leaves what the hook holds untouched.
      it('keeps the very reading it holds when a tick brings back the same content', async () => {
        listHook.read.mockImplementation(async () => listHook.reading());
        const { result, unmount } = listHook.render();
        await advance(0);
        const held = listHook.readings.map((key) => result.current[key]);
        expect(held.every((reading) => reading !== undefined), `${listHook.name} held nothing after its first read`).toBe(true);

        await tick(listHook);

        expect(listHook.read.mock.calls.length, `${listHook.name} took no second reading`).toBeGreaterThan(1);
        listHook.readings.forEach((key, index) => {
          expect(result.current[key], `${listHook.name} replaced ${key} with an equal reading`).toBe(held[index]);
        });
        unmount();
      });

      // …/REQ-48 — a reading that differs replaces it, on the tick it arrives on and every tick after.
      it('replaces what it holds on the tick a different reading arrives, each one of them', async () => {
        listHook.read.mockImplementation(async () => listHook.reading());
        const { result, unmount } = listHook.render();
        await advance(0);
        let held = listHook.readings.map((key) => result.current[key]);

        for (const nth of [1, 2, 3]) {
          listHook.read.mockImplementation(async () => listHook.changed(nth));
          await tick(listHook);

          const expected = listHook.changed(nth) as Record<string, unknown>;
          listHook.readings.forEach((key, index) => {
            expect(result.current[key], `${listHook.name} kept ${key} through a changed reading`).not.toBe(held[index]);
            expect(result.current[key]).toEqual(listHook.readings.length === 1 ? expected : expected[key]);
          });
          held = listHook.readings.map((key) => result.current[key]);
        }
        unmount();
      });
    });
  }

  // …/REQ-47 names six hooks, and this table is how they are covered: every list hook storing
  // through the keeper has a row here, the two detail hooks being covered by their own files.
  it('has a row for every list hook that stores its reading through the keeper', () => {
    const dataDirectory = join(process.cwd(), 'src', 'data');
    const callers = readdirSync(dataDirectory)
      .filter((file) => file.endsWith('.ts'))
      .filter((file) => readFileSync(join(dataDirectory, file), 'utf8').includes("from './use-kept-reading'"))
      .filter((file) => !DETAIL_HOOKS.includes(file));

    expect(callers.sort()).toEqual(LIST_HOOKS.map((listHook) => listHook.source).sort());
  });
});

/** Redraws the list it is handed, and counts each one. */
const RowsDrawn = memo(function RowsDrawn({ drawn }: { rows: unknown; drawn: { count: number } }) {
  drawn.count += 1;
  return null;
});

describe('a list that has not changed stops being redrawn (REQ-47)', () => {
  // …/REQ-47 — "nothing downstream is redrawn": the Images screen's table, with many ticks bringing
  // back the answer already on screen, is drawn once.
  it('draws the image table once across twenty ticks of an unchanged host', async () => {
    reads.images.mockImplementation(async () => [
      { id: 'img-1', shortId: 'img-1', tags: ['app:1'], platforms: [], sizeBytes: 1, createdAt: '2026-01-01T00:00:00Z' },
    ]);
    const drawn = { count: 0 };
    function ImagesScreen() {
      const { images } = useImages();
      return <RowsDrawn rows={images} drawn={drawn} />;
    }

    const { unmount } = render(<ImagesScreen />);
    await advance(0);
    const drawnOnceLoaded = drawn.count;

    await advance(3000 * 20);

    expect(reads.images.mock.calls.length).toBeGreaterThan(20);
    expect(drawn.count, 'the image table was redrawn by a tick that changed nothing').toBe(drawnOnceLoaded);
    unmount();
  });
});
