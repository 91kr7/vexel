import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';

/**
 * Which views read again on their own, and which do not.
 *
 * The Dashboard's overview gained a clock
 * (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-16)
 * and the container's inspect data and process listing gained one after it
 * (…/REQ-26, …/REQ-27). REQ-37 says no other view did: the disk-usage view of
 * System & prune and the image, image-layer, network and volume details stay as
 * the first batch left them, reading when they are opened, when the operator
 * asks and on a context switch.
 *
 * It is a claim about the set, so it is checked as one, on the hooks themselves:
 * each is mounted with nothing operated and no event delivered, and the clock is
 * given ten of the fastest periods the product declares to fire in.
 */

const fetchDiskUsage = vi.fn();
const fetchImageInspect = vi.fn();
const fetchImageLayerStack = vi.fn();
const fetchNetworkInspect = vi.fn();
const fetchVolumeInspect = vi.fn();
const fetchContainerInspect = vi.fn();
const fetchContainerProcesses = vi.fn();
const fetchSystemOverview = vi.fn();

vi.mock('../../src/data/system-client', () => ({
  fetchDiskUsage: () => fetchDiskUsage(),
  fetchSystemOverview: () => fetchSystemOverview(),
  pruneScope: vi.fn(),
}));
vi.mock('../../src/data/images-client', () => ({ fetchImageInspect: (id: string) => fetchImageInspect(id) }));
vi.mock('../../src/data/image-layers-client', () => ({ fetchImageLayerStack: (id: string) => fetchImageLayerStack(id) }));
vi.mock('../../src/data/networks-client', () => ({ fetchNetworkInspect: (id: string) => fetchNetworkInspect(id) }));
vi.mock('../../src/data/volumes-client', () => ({ fetchVolumeInspect: (name: string) => fetchVolumeInspect(name) }));
vi.mock('../../src/data/containers-client', () => ({ fetchContainerInspect: (id: string) => fetchContainerInspect(id) }));
vi.mock('../../src/data/container-stats-client', () => ({ fetchContainerProcesses: (id: string) => fetchContainerProcesses(id) }));

const { useDiskUsage } = await import('../../src/data/use-disk-usage');
const { useImageInspect } = await import('../../src/data/use-image-inspect');
const { useImageLayerStack } = await import('../../src/data/use-image-layers');
const { useNetworkInspect } = await import('../../src/data/use-network-inspect');
const { useVolumeInspect } = await import('../../src/data/use-volume-inspect');
const { useContainerDetail } = await import('../../src/data/use-container-detail');
const { useContainerProcesses } = await import('../../src/data/use-container-processes');
const { useSystemOverview } = await import('../../src/data/use-system-overview');

/** Ten times the shortest period the product declares, so a clock of any of its cadences would fire. */
const LONG_ENOUGH_FOR_ANY_CLOCK_MS = 30_000;

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

interface HookCase {
  /** How the hook is named in its own spec, and in a failure message. */
  name: string;
  read: ReturnType<typeof vi.fn>;
  render: () => void;
}

/** The five views REQ-37 keeps free of a clock. */
const HOLD_NO_CLOCK: HookCase[] = [
  { name: 'useDiskUsage', read: fetchDiskUsage, render: () => void renderHook(() => useDiskUsage()) },
  { name: 'useImageInspect', read: fetchImageInspect, render: () => void renderHook(() => useImageInspect('image-1')) },
  { name: 'useImageLayerStack', read: fetchImageLayerStack, render: () => void renderHook(() => useImageLayerStack('image-1')) },
  { name: 'useNetworkInspect', read: fetchNetworkInspect, render: () => void renderHook(() => useNetworkInspect('net-1')) },
  { name: 'useVolumeInspect', read: fetchVolumeInspect, render: () => void renderHook(() => useVolumeInspect('vol-1')) },
];

/** The three that do, each named by the requirement that gave it one. */
const HOLD_A_CLOCK: HookCase[] = [
  { name: 'useSystemOverview (REQ-16)', read: fetchSystemOverview, render: () => void renderHook(() => useSystemOverview()) },
  { name: 'useContainerDetail (REQ-26)', read: fetchContainerInspect, render: () => void renderHook(() => useContainerDetail('c1')) },
  {
    name: 'useContainerProcesses (REQ-27)',
    read: fetchContainerProcesses,
    render: () => void renderHook(() => useContainerProcesses('c1')),
  },
];

beforeEach(() => {
  for (const read of [
    fetchDiskUsage,
    fetchImageInspect,
    fetchImageLayerStack,
    fetchNetworkInspect,
    fetchVolumeInspect,
    fetchContainerInspect,
    fetchContainerProcesses,
    fetchSystemOverview,
  ]) {
    read.mockReset();
    read.mockResolvedValue({ categories: [], totalReclaimableBytes: 0, processes: [], titles: [] });
  }
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('REQ-37 — no view but the three named gained a clock', () => {
  for (const hookCase of HOLD_NO_CLOCK) {
    it(`${hookCase.name} reads once and never again on its own`, async () => {
      hookCase.render();
      await advance(0);
      expect(hookCase.read).toHaveBeenCalledTimes(1);

      await advance(LONG_ENOUGH_FOR_ANY_CLOCK_MS);

      expect(hookCase.read, `${hookCase.name} read again with nothing operated and no event delivered`).toHaveBeenCalledTimes(1);
    });
  }

  for (const hookCase of HOLD_A_CLOCK) {
    it(`${hookCase.name} does read again on its own`, async () => {
      hookCase.render();
      await advance(0);
      expect(hookCase.read).toHaveBeenCalledTimes(1);

      await advance(LONG_ENOUGH_FOR_ANY_CLOCK_MS);

      expect(hookCase.read.mock.calls.length, `${hookCase.name} lost the clock its requirement gives it`).toBeGreaterThan(1);
    });
  }
});
