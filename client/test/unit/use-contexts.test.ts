import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, renderHook } from '@testing-library/react';
import { channelOpens, deliverDiscard, deliverValue } from '../support/live-channel';
import { arrangeLiveChannel, type ChannelHarness } from '../support/pushed-listing';

/**
 * What `useContexts` does beyond reading the inventory off the channel
 * (`contexts/specs/use-contexts.md`): which context it names active, the
 * create/remove/select-active it drives, the announcement a switch raises, and a
 * delivery that is not a list. The inventory itself is covered for the whole set
 * in `listings-arrive-by-push.test.tsx`.
 */

let harness: ChannelHarness;
let useContexts: typeof import('../../src/data/use-contexts').useContexts;
let subscribeToActiveContextChange: typeof import('../../src/data/active-context').subscribeToActiveContextChange;

function context(name: string, overrides: Record<string, unknown> = {}) {
  return { name, endpoint: 'unix:///var/run/docker.sock', kind: 'local', tls: false, active: false, ...overrides };
}

const FIRST = context('first', { active: true });
const SECOND = context('second', { endpoint: 'ssh://operator@build-host', kind: 'ssh' });

beforeEach(async () => {
  harness = arrangeLiveChannel();
  vi.resetModules();
  ({ useContexts } = await import('../../src/data/use-contexts'));
  ({ subscribeToActiveContextChange } = await import('../../src/data/active-context'));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** The hook with the channel delivering, and the two contexts listed. */
function mounted() {
  const rendered = renderHook(() => useContexts());
  act(() => channelOpens());
  act(() => deliverValue('contexts', [FIRST, SECOND]));
  return rendered;
}

/** Records every announcement the active-context broadcast makes. */
function announcements(): { count: () => number } {
  let count = 0;
  subscribeToActiveContextChange(() => {
    count += 1;
  });
  return { count: () => count };
}

describe('useContexts (contexts/specs/use-contexts.md)', () => {
  // "active is the context marked active in that inventory"
  it('names as active the context the delivered inventory marks active', () => {
    const { result } = mounted();

    expect(result.current.active?.name).toBe('first');
  });

  // "undefined until one has been delivered, or when none is marked"
  it('names no active context before a delivery, and none when the inventory marks none', () => {
    const { result } = renderHook(() => useContexts());
    act(() => channelOpens());
    expect(result.current.active).toBeUndefined();

    act(() => deliverValue('contexts', [context('first'), context('second')]));

    expect(result.current.active).toBeUndefined();
  });

  // "create(input): Promise<ContextSummary>" — and REQ-25: the operation is asked for, nothing else.
  it('creates a context without re-reading the inventory', async () => {
    harness.answers('/api/contexts', SECOND, { method: 'POST' });
    const { result } = mounted();

    await act(async () => {
      await expect(result.current.create({ name: 'second', kind: 'ssh', host: 'operator@build-host' })).resolves.toEqual(SECOND);
    });

    expect(harness.requests).toEqual([{ url: '/api/contexts', method: 'POST' }]);
  });

  it('removes a context without re-reading the inventory', async () => {
    harness.answers('/api/contexts/second', {}, { method: 'DELETE' });
    const { result } = mounted();

    await act(async () => {
      await result.current.remove('second');
    });

    expect(harness.requests).toEqual([{ url: '/api/contexts/second', method: 'DELETE' }]);
  });

  it('switches the active context without re-reading the inventory', async () => {
    harness.answers('/api/contexts/second/use', { ...SECOND, active: true }, { method: 'POST' });
    const { result } = mounted();

    await act(async () => {
      await expect(result.current.use('second')).resolves.toMatchObject({ name: 'second', active: true });
    });

    expect(harness.requests).toEqual([{ url: '/api/contexts/second/use', method: 'POST' }]);
  });

  // REQ-24 — the switch shows the new daemon: the server discards what it holds, says so, and the
  // inventory arrives again naming the context now active.
  it('names the new active context once the channel has delivered the inventory again', async () => {
    harness.answers('/api/contexts/second/use', { ...SECOND, active: true }, { method: 'POST' });
    const { result } = mounted();
    await act(async () => {
      await result.current.use('second');
    });

    act(() => deliverDiscard());
    expect(result.current.loaded).toBe(false);
    act(() => deliverValue('contexts', [context('first'), { ...SECOND, active: true }]));

    expect(result.current.active?.name).toBe('second');
  });

  // "use(name) announces the switch on the active-context broadcast, once the server confirms it —
  // never before, and never on failure."
  it('announces the switch on the broadcast once the server has confirmed it', async () => {
    harness.answers('/api/contexts/second/use', { ...SECOND, active: true }, { method: 'POST' });
    const { result } = mounted();
    const announced = announcements();

    expect(announced.count()).toBe(0);
    await act(async () => {
      await result.current.use('second');
    });

    expect(announced.count()).toBe(1);
  });

  it('announces nothing when the switch fails', async () => {
    harness.answers('/api/contexts/second/use', { error: 'no context named second' }, { method: 'POST', ok: false, status: 404 });
    const { result } = mounted();
    const announced = announcements();

    await expect(result.current.use('second')).rejects.toThrow('no context named second');

    expect(announced.count()).toBe(0);
  });

  // "Every mounted instance reads the same delivery, so the Contexts screen and the shell always
  // name the same active context and count the same contexts, with no interval of disagreement."
  it('hands every mounted instance the same delivery, with nothing announced between them', () => {
    const screen = renderHook(() => useContexts());
    const shell = renderHook(() => useContexts());
    act(() => channelOpens());

    act(() => deliverValue('contexts', [context('first'), { ...SECOND, active: true }]));

    expect(screen.result.current.active?.name).toBe('second');
    expect(shell.result.current.active?.name).toBe('second');
    expect(screen.result.current.contexts).toBe(shell.result.current.contexts);
  });

  // "A delivery that is not a list of contexts is treated exactly like a failed read — reported
  // through error, never shown — so no consumer is ever handed something it cannot iterate."
  it('treats a delivery that is not a list as a failed read, keeping contexts iterable', () => {
    const { result } = renderHook(() => useContexts());
    act(() => channelOpens());

    act(() => deliverValue('contexts', { error: 'not a list at all' }));

    expect(Array.isArray(result.current.contexts)).toBe(true);
    expect(result.current.contexts).toEqual([]);
    expect(result.current.active).toBeUndefined();
    expect(result.current.error).toBeTruthy();
  });

  it('recovers from a delivery that is not a list once a list is delivered', () => {
    const { result } = renderHook(() => useContexts());
    act(() => channelOpens());
    act(() => deliverValue('contexts', { error: 'not a list at all' }));

    act(() => deliverValue('contexts', [FIRST, SECOND]));

    expect(result.current.error).toBeUndefined();
    expect(result.current.contexts).toHaveLength(2);
  });

  // "failures propagate to the caller (never swallowed) so the screen can report them"
  it('propagates a create failure to the caller', async () => {
    harness.answers('/api/contexts', { error: 'context second already exists' }, { method: 'POST', ok: false, status: 409 });
    const { result } = mounted();

    await expect(result.current.create({ name: 'second', kind: 'ssh', host: 'operator@build-host' })).rejects.toThrow(
      'context second already exists',
    );
  });

  it('propagates a remove failure to the caller', async () => {
    harness.answers('/api/contexts/second', { error: 'context second is in use' }, { method: 'DELETE', ok: false, status: 409 });
    const { result } = mounted();

    await expect(result.current.remove('second')).rejects.toThrow('context second is in use');
  });
});
