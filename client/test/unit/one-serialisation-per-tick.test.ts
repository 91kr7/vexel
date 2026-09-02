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
 * The container list is here too, and no longer as a tick: it arrives on the live
 * channel now (…-multiplexed_sse/REQ-8), and the claim holds unchanged on the
 * store that keeps it.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { useKeptReading } from '../../src/data/use-kept-reading';
import { FakeEventSource, liveChannel } from '../support/live-channel';

const fetchContainerInspect = vi.fn();

vi.mock('../../src/data/containers-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/data/containers-client')>()),
  fetchContainerInspect: (id: string) => fetchContainerInspect(id),
}));

const { useContainerDetail } = await import('../../src/data/use-container-detail');
const { usePushedValue } = await import('../../src/data/pushed-values');

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
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
  fetchContainerInspect.mockReset();
  vi.useFakeTimers();
  stringify = vi.spyOn(JSON, 'stringify');
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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

describe('a delivery on the live channel serialises one value (REQ-49)', () => {
  // …/REQ-49 — the container list no longer ticks: it is pushed, and the store pays for
  // what the channel delivered and for nothing it holds
  // (…-multiplexed_sse/REQ-8, REQ-12).
  it('serialises the list that was delivered and never the list already held', async () => {
    const list = [{ id: 'c1', name: 'database', state: 'running' }];
    // Built before the spy is cleared: a message is a string on the wire, and
    // serialising it here is the server's cost, not the store's.
    const message = JSON.stringify({ name: 'containers', value: list });
    const { result, unmount } = renderHook(() => usePushedValue<unknown>('containers'));
    act(() => liveChannel().emit('value', message));
    const held = result.current;
    expect(held).toEqual(list);

    stringify.mockClear();
    act(() => liveChannel().emit('value', message));

    expect(result.current, 'an unchanged delivery replaced the list in hand').toBe(held);
    expect(serialisations(held), 'the list already held was serialised again').toBe(0);
    expect(stringify.mock.calls.length, 'the delivery serialised something beyond the value that arrived').toBe(1);
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
