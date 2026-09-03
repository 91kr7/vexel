import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, renderHook } from '@testing-library/react';
import { channelOpens, deliverValue } from '../support/live-channel';
import { arrangeLiveChannel, type ChannelHarness } from '../support/pushed-listing';

/**
 * What `useBuildCache` does beyond reading the inventory off the channel
 * (`builders/specs/use-build-cache.md`): the prune it drives. The inventory
 * itself is covered for the whole set in `listings-arrive-by-push.test.tsx`.
 */

let harness: ChannelHarness;
let useBuildCache: typeof import('../../src/data/use-build-cache').useBuildCache;

const RECORD = { id: 'cache-1', type: 'regular', sizeBytes: 4096, usageState: 'reclaimable' };

beforeEach(async () => {
  harness = arrangeLiveChannel();
  vi.resetModules();
  ({ useBuildCache } = await import('../../src/data/use-build-cache'));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mounted() {
  const rendered = renderHook(() => useBuildCache());
  act(() => channelOpens());
  act(() => deliverValue('build-cache', [RECORD]));
  return rendered;
}

describe('useBuildCache (builders/specs/use-build-cache.md)', () => {
  // "prune(): Promise<BuildCachePruneResult>" — and REQ-25: a prune re-reads nothing here.
  it('prunes, returns the reclaimed figure, and re-reads nothing', async () => {
    harness.answers('/api/builders/cache/prune', { reclaimedBytes: 4096 }, { method: 'POST' });
    const { result } = mounted();

    await act(async () => {
      await expect(result.current.prune()).resolves.toEqual({ reclaimedBytes: 4096 });
    });

    expect(harness.requests).toEqual([{ url: '/api/builders/cache/prune', method: 'POST' }]);
    expect(result.current.records).toEqual([RECORD]);
  });

  // REQ-25 — what the prune reclaimed reaches the screen as the push the operation caused.
  it('empties the inventory when the channel delivers what the prune left', async () => {
    harness.answers('/api/builders/cache/prune', { reclaimedBytes: 4096 }, { method: 'POST' });
    const { result } = mounted();
    await act(async () => {
      await result.current.prune();
    });

    act(() => deliverValue('build-cache', []));

    expect(result.current.records).toEqual([]);
    expect(result.current.loaded).toBe(true);
  });

  // "a failure propagates to the caller"
  it('propagates a prune failure to the caller', async () => {
    harness.answers('/api/builders/cache/prune', { error: 'buildx is not available' }, { method: 'POST', ok: false, status: 500 });
    const { result } = mounted();

    await expect(result.current.prune()).rejects.toThrow('buildx is not available');
  });
});
