import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, memo } from 'react';
import { cleanup, render, renderHook } from '@testing-library/react';
import { FakeEventSource, deliverDiscard, deliverValue } from '../support/live-channel';

/**
 * Where the client keeps what the channel delivered
 * (`live-channel/specs/pushed-value-store.md`;
 * plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-10,
 * REQ-12).
 *
 * The store and the channel client behind it are module singletons, so each test
 * gets a fresh module registry and a fresh stand-in `EventSource`.
 */

let usePushedValue: typeof import('../../src/data/pushed-values').usePushedValue;

beforeEach(async () => {
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
  vi.resetModules();
  ({ usePushedValue } = await import('../../src/data/pushed-values'));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Redraws whatever it is handed, and counts each drawing. */
const Reader = memo(function Reader({ drawn }: { value: unknown; drawn: { count: number } }) {
  drawn.count += 1;
  return null;
});

describe('the pushed value store', () => {
  it('has delivered nothing until the channel delivers a value under that name', () => {
    const { result } = renderHook(() => usePushedValue<string[]>('containers'));

    expect(result.current).toBeUndefined();
  });

  // REQ-10 — what the channel delivered is what the screen reads.
  it('answers with what the channel delivered under the name asked for', () => {
    const { result } = renderHook(() => usePushedValue<{ id: string }[]>('containers'));

    act(() => deliverValue('containers', [{ id: 'c1' }]));

    expect(result.current).toEqual([{ id: 'c1' }]);
  });

  it('keeps the values of two names apart', () => {
    const { result: containers } = renderHook(() => usePushedValue<string[]>('containers'));
    const { result: images } = renderHook(() => usePushedValue<string[]>('images'));

    act(() => deliverValue('containers', ['web']));
    act(() => deliverValue('images', ['alpine']));

    expect(containers.current).toEqual(['web']);
    expect(images.current).toEqual(['alpine']);
  });

  // REQ-12 — "A value sent again unchanged replaces nothing on screen."
  it('keeps the very value in hand when the same content is delivered again', () => {
    const { result } = renderHook(() => usePushedValue<{ id: string }[]>('containers'));
    act(() => deliverValue('containers', [{ id: 'c1', state: 'running' }]));
    const held = result.current;

    act(() => deliverValue('containers', [{ id: 'c1', state: 'running' }]));

    expect(result.current).toBe(held);
  });

  // REQ-12 — the same claim from the reader's side: nothing under it is redrawn.
  it('redraws nothing for twenty deliveries of the value already in hand', () => {
    const drawn = { count: 0 };
    function Screen() {
      const containers = usePushedValue<unknown>('containers');
      return <Reader value={containers} drawn={drawn} />;
    }
    render(<Screen />);
    act(() => deliverValue('containers', [{ id: 'c1', state: 'running' }]));
    const drawnOnceDelivered = drawn.count;

    for (let delivery = 0; delivery < 20; delivery += 1) {
      act(() => deliverValue('containers', [{ id: 'c1', state: 'running' }]));
    }

    expect(drawn.count).toBe(drawnOnceDelivered);
  });

  it('replaces what it holds when the content delivered differs', () => {
    const { result } = renderHook(() => usePushedValue<{ id: string }[]>('containers'));
    act(() => deliverValue('containers', [{ id: 'c1', state: 'running' }]));
    const held = result.current;

    act(() => deliverValue('containers', [{ id: 'c1', state: 'exited' }]));

    expect(result.current).not.toBe(held);
    expect(result.current).toEqual([{ id: 'c1', state: 'exited' }]);
  });

  // REQ-10 — a reconnection writes every value again on a channel that has been sent none:
  // the screens must not flicker through it.
  it('keeps every value in hand when the whole set is delivered again after a reconnection', () => {
    const { result: containers } = renderHook(() => usePushedValue<unknown>('containers'));
    const { result: images } = renderHook(() => usePushedValue<unknown>('images'));
    act(() => {
      deliverValue('containers', [{ id: 'c1' }]);
      deliverValue('images', [{ id: 'i1' }]);
    });
    const heldContainers = containers.current;
    const heldImages = images.current;

    act(() => {
      deliverValue('containers', [{ id: 'c1' }]);
      deliverValue('images', [{ id: 'i1' }]);
    });

    expect(containers.current).toBe(heldContainers);
    expect(images.current).toBe(heldImages);
  });

  // The spec's discard rule: a reader is back to having been delivered nothing.
  it('drops every value and tells every reader when the channel says the held values are gone', () => {
    const { result: containers } = renderHook(() => usePushedValue<unknown>('containers'));
    const { result: images } = renderHook(() => usePushedValue<unknown>('images'));
    act(() => {
      deliverValue('containers', [{ id: 'c1' }]);
      deliverValue('images', [{ id: 'i1' }]);
    });

    act(() => deliverDiscard());

    expect(containers.current).toBeUndefined();
    expect(images.current).toBeUndefined();
  });

  // After a discard the same content is new: it was dropped, so it must reach the reader again.
  it('delivers the same content again after a discard', () => {
    const { result } = renderHook(() => usePushedValue<unknown>('containers'));
    act(() => deliverValue('containers', [{ id: 'c1' }]));
    act(() => deliverDiscard());

    act(() => deliverValue('containers', [{ id: 'c1' }]));

    expect(result.current).toEqual([{ id: 'c1' }]);
  });

  // "It subscribes to the channel on first use, and once."
  it('opens one channel however many readers there are', () => {
    renderHook(() => usePushedValue<unknown>('containers'));
    renderHook(() => usePushedValue<unknown>('images'));
    renderHook(() => usePushedValue<unknown>('volumes'));

    expect(FakeEventSource.instances).toHaveLength(1);
  });
});
