import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, renderHook } from '@testing-library/react';
import { FakeEventSource, channelOpens, deliverDiscard, deliverValue, dropChannel, liveChannel } from '../support/live-channel';

/**
 * The container list arrives on the live channel: no request of this hook's own
 * and no clock (`containers/specs/use-containers.md`;
 * plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-8,
 * REQ-12, REQ-17, REQ-39).
 *
 * `fetch` is stubbed to fail the test rather than mocked to answer: the claim
 * asserted here is that nothing is requested at all, and a mock that answers
 * would hide a request instead of catching it. The channel behind the hook is a
 * module singleton, so each test gets a fresh module registry.
 */

let useContainers: typeof import('../../src/data/use-containers').useContainers;
let requested: string[];

beforeEach(async () => {
  FakeEventSource.instances = [];
  requested = [];
  vi.stubGlobal('EventSource', FakeEventSource);
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) => {
      requested.push(String(input));
      return Promise.reject(new Error('no request was expected'));
    }),
  );
  vi.resetModules();
  ({ useContainers } = await import('../../src/data/use-containers'));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const RUNNING = [{ id: 'c1', shortId: 'c1', name: 'database', image: 'alpine:3.20', state: 'running', status: 'Up 3 seconds', ports: [] }];

describe('useContainers', () => {
  // use-containers.md, contract line — the shape its screen uses.
  it('answers exactly the shape its screen uses, with a refresh that returns nothing', () => {
    const { result } = renderHook(() => useContainers());

    expect(Object.keys(result.current).sort()).toEqual(['containers', 'error', 'loaded', 'refresh'].sort());
    expect(result.current.refresh()).toBeUndefined();
  });

  // REQ-40 — an open channel that has delivered no value leaves the screen loading, not empty-and-done.
  it('is not loaded, with an empty list, while the channel has delivered nothing', () => {
    const { result } = renderHook(() => useContainers());
    act(() => channelOpens());

    expect(result.current.containers).toEqual([]);
    expect(result.current.loaded).toBe(false);
    expect(result.current.error).toBeUndefined();
  });

  // REQ-8 — the value the channel delivers is what the screen shows.
  it('shows the list the channel delivered, and is loaded from it', () => {
    const { result } = renderHook(() => useContainers());
    act(() => channelOpens());

    act(() => deliverValue('containers', RUNNING));

    expect(result.current.containers).toEqual(RUNNING);
    expect(result.current.loaded).toBe(true);
  });

  // REQ-17, REQ-39 — no clock and no request: the hook asks the server for nothing, ever.
  it('makes no request of its own, on mount or on any stretch of time', async () => {
    vi.useFakeTimers();
    renderHook(() => useContainers());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(requested).toEqual([]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600_000);
    });

    expect(requested, 'the hook asked the server for the list on a clock').toEqual([]);
    expect(FakeEventSource.instances.map((channel) => channel.url)).toEqual(['/api/live']);
  });

  // REQ-8 — a container started outside the application arrives with the operator doing nothing.
  it('follows the host on the channel, with nothing operated and no request made', () => {
    const { result } = renderHook(() => useContainers());
    act(() => channelOpens());
    act(() => deliverValue('containers', RUNNING));

    act(() => deliverValue('containers', [...RUNNING, { ...RUNNING[0], id: 'c2', shortId: 'c2', name: 'web' }]));

    expect(result.current.containers).toHaveLength(2);
    expect(requested).toEqual([]);
  });

  // REQ-12 — a list delivered again unchanged replaces nothing the operator has in hand.
  it('keeps the very list it holds when the same one is delivered again', () => {
    const { result } = renderHook(() => useContainers());
    act(() => channelOpens());
    act(() => deliverValue('containers', RUNNING));
    const held = result.current.containers;

    for (let delivery = 0; delivery < 5; delivery += 1) act(() => deliverValue('containers', RUNNING));

    expect(result.current.containers).toBe(held);
  });

  // use-containers.md — "goes back to `false` when the channel says the values held were discarded".
  it('is no longer loaded once the channel says the held values are gone', () => {
    const { result } = renderHook(() => useContainers());
    act(() => channelOpens());
    act(() => deliverValue('containers', RUNNING));

    act(() => deliverDiscard());

    expect(result.current.loaded).toBe(false);
    expect(result.current.containers).toEqual([]);
  });

  it('shows the new context list delivered after a discard', () => {
    const { result } = renderHook(() => useContainers());
    act(() => channelOpens());
    act(() => deliverValue('containers', RUNNING));
    act(() => deliverDiscard());

    act(() => deliverValue('containers', []));

    expect(result.current.loaded).toBe(true);
    expect(result.current.containers).toEqual([]);
  });

  // REQ-11 — a channel that is not delivering is reported through the state this hook already has.
  it('reports a failure while the channel is not delivering, and clears it when it delivers again', () => {
    const { result } = renderHook(() => useContainers());
    act(() => channelOpens());
    expect(result.current.error).toBeUndefined();

    act(() => dropChannel());
    expect(result.current.error).toBeTruthy();

    act(() => channelOpens());
    expect(result.current.error).toBeUndefined();
  });

  // REQ-12 — "nothing new appears on the screen": a drop does not blank the list.
  it('keeps the list it holds when the channel drops', () => {
    const { result } = renderHook(() => useContainers());
    act(() => channelOpens());
    act(() => deliverValue('containers', RUNNING));

    act(() => dropChannel());

    expect(result.current.containers).toEqual(RUNNING);
  });

  // REQ-18 — what the retry the screen offers does: it asks for the channel again, nothing else.
  it('asks for the channel again when refreshed while it is not delivering', () => {
    const { result } = renderHook(() => useContainers());
    act(() => channelOpens());
    act(() => dropChannel());
    const dropped = liveChannel();

    act(() => result.current.refresh());

    expect(dropped.closed).toBe(true);
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(requested).toEqual([]);
  });

  it('does nothing when refreshed while the channel is delivering', () => {
    const { result } = renderHook(() => useContainers());
    act(() => channelOpens());
    const delivering = liveChannel();

    act(() => result.current.refresh());

    expect(delivering.closed).toBe(false);
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(requested).toEqual([]);
  });
});
