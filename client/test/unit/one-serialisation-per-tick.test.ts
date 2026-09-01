/**
 * What a tick costs
 * (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-49):
 * it serialises the reading that has just arrived, and nothing else. The one in
 * hand was serialised by the tick that stored it, and that serialisation is kept
 * beside it — so no later tick pays for it again, however large it is.
 *
 * `JSON.stringify` itself is watched, by identity of what it was handed, so the
 * claim is about which reading was serialised and not only about how many times.
 * The container's inspect payload is here by name: its earlier form serialised
 * both readings on every tick, tens of kilobytes of them every three seconds.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { useKeptReading } from '../../src/data/use-kept-reading';

const fetchContainers = vi.fn();
const fetchContainerInspect = vi.fn();

vi.mock('../../src/data/containers-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/data/containers-client')>()),
  fetchContainers: () => fetchContainers(),
  fetchContainerInspect: (id: string) => fetchContainerInspect(id),
}));

const { useContainers } = await import('../../src/data/use-containers');
const { useContainerDetail } = await import('../../src/data/use-container-detail');

/** The period both hooks' specs state, unscaled: the timing scale is 1 in a unit run. */
const DECLARED_PERIOD_MS = 3_000;

let stringify: MockInstance<typeof JSON.stringify>;

/** How many times `JSON.stringify` was handed this very object. */
function serialisations(reading: unknown): number {
  return stringify.mock.calls.filter((call) => Object.is(call[0], reading)).length;
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  fetchContainers.mockReset();
  fetchContainerInspect.mockReset();
  vi.useFakeTimers();
  stringify = vi.spyOn(JSON, 'stringify');
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the keeper serialises what arrived, and only that (REQ-49)', () => {
  // …/REQ-49 — an arrival is serialised once; what is in hand carries its own serialisation.
  it('serialises each arrival once and never the reading it is compared against', () => {
    const first = [{ id: 'c1', state: 'running' }];
    const equal = [{ id: 'c1', state: 'running' }];
    const different = [{ id: 'c1', state: 'exited' }];
    const { result } = renderHook(() => useKeptReading<unknown>([]));

    for (const arrived of [first, equal, different]) {
      stringify.mockClear();
      act(() => result.current[1](arrived));

      expect(serialisations(arrived), 'the arrived reading was not serialised exactly once').toBe(1);
      expect(stringify.mock.calls.length, 'something other than the arrived reading was serialised').toBe(1);
    }

    expect(serialisations(first)).toBe(0);
    expect(serialisations(equal)).toBe(0);
  });
});

describe('a tick of a polled hook serialises one reading (REQ-49)', () => {
  // …/REQ-49 — the container list: the tick pays for the answer it received, and for nothing held.
  it('serialises the list that arrived and never the list already held', async () => {
    const held = [{ id: 'c1', name: 'database', state: 'running' }];
    const arrived = [{ id: 'c1', name: 'database', state: 'running' }];
    fetchContainers.mockResolvedValueOnce(held).mockResolvedValue(arrived);
    const { result, unmount } = renderHook(() => useContainers());
    await advance(0);
    expect(result.current.containers).toBe(held);

    stringify.mockClear();
    await advance(DECLARED_PERIOD_MS);

    expect(fetchContainers).toHaveBeenCalledTimes(2);
    expect(serialisations(arrived), 'the arrived list was not serialised exactly once').toBe(1);
    expect(serialisations(held), 'the list already held was serialised again').toBe(0);
    expect(stringify.mock.calls.length, 'the tick serialised something beyond the list that arrived').toBe(1);
    unmount();
  });

  // …/REQ-49, REQ-50 — the inspect payload, whose earlier form serialised both readings per tick.
  it('serialises the inspect payload that arrived and never the one already held', async () => {
    const held = { id: 'c1', name: 'database', raw: { State: { Status: 'running' } } };
    const arrived = { id: 'c1', name: 'database', raw: { State: { Status: 'running' } } };
    fetchContainerInspect.mockResolvedValueOnce(held).mockResolvedValue(arrived);
    const { result, unmount } = renderHook(() => useContainerDetail('c1'));
    await advance(0);
    expect(result.current.inspect).toBe(held);

    stringify.mockClear();
    await advance(DECLARED_PERIOD_MS);

    expect(fetchContainerInspect).toHaveBeenCalledTimes(2);
    expect(serialisations(arrived), 'the arrived payload was not serialised exactly once').toBe(1);
    expect(serialisations(held), 'the payload already held was serialised again').toBe(0);
    expect(stringify.mock.calls.length, 'the tick serialised something beyond the payload that arrived').toBe(1);
    unmount();
  });
});
