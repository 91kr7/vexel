import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import type { ContextSummary } from '../../src/data/contexts-client';

// useContexts reads the context inventory and drives create/remove/select-active
// (contexts/specs/use-contexts.md): the data client is mocked so the hook's own
// re-read, error-propagation and broadcast decisions are the only things under
// test. The broadcast itself is the real one, subscribed to as any cached view
// would (contexts/specs/active-context-broadcast.md).
const fetchContexts = vi.fn();
const createContext = vi.fn();
const removeContext = vi.fn();
const activateContext = vi.fn();

vi.mock('../../src/data/contexts-client', () => ({
  fetchContexts: () => fetchContexts(),
  createContext: (input: unknown) => createContext(input),
  removeContext: (name: string) => removeContext(name),
  activateContext: (name: string) => activateContext(name),
}));

const { useContexts } = await import('../../src/data/use-contexts');
const { subscribeToActiveContextChange } = await import('../../src/data/active-context');

function context(overrides: Partial<ContextSummary> = {}): ContextSummary {
  return { name: 'default', endpoint: 'unix:///var/run/docker.sock', kind: 'local', tls: false, active: false, ...overrides };
}

beforeEach(() => {
  fetchContexts.mockReset();
  createContext.mockReset();
  removeContext.mockReset();
  activateContext.mockReset();
});

// Every mounted instance subscribes to the active-context broadcast, so an instance
// left behind by an earlier test would re-read for it too: nothing outlives its test.
afterEach(cleanup);

describe('useContexts (contexts/specs/use-contexts.md)', () => {
  // "contexts: ContextSummary[], re-read on a bounded poll and via refresh()"
  it('reads the context inventory on mount and marks itself loaded', async () => {
    fetchContexts.mockResolvedValue([context()]);

    const { result } = renderHook(() => useContexts());

    expect(result.current.contexts).toEqual([]);
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.contexts).toHaveLength(1);
  });

  // "active is the context marked active in the inventory"
  it('names as active the context the inventory marks active', async () => {
    fetchContexts.mockResolvedValue([context({ name: 'one' }), context({ name: 'two', active: true })]);

    const { result } = renderHook(() => useContexts());

    await waitFor(() => expect(result.current.active?.name).toBe('two'));
  });

  // "undefined until the list has been read or when none is"
  it('leaves active undefined when no context is marked active', async () => {
    fetchContexts.mockResolvedValue([context({ name: 'one' })]);

    const { result } = renderHook(() => useContexts());

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.active).toBeUndefined();
  });

  // "create(input) ... re-reads the inventory on success"
  it('re-reads the inventory after a successful create', async () => {
    fetchContexts.mockResolvedValue([]);
    createContext.mockResolvedValue(context({ name: 'fresh' }));
    const { result } = renderHook(() => useContexts());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    fetchContexts.mockClear();

    await act(async () => {
      await result.current.create({ name: 'fresh', kind: 'local' });
    });

    await waitFor(() => expect(fetchContexts).toHaveBeenCalled());
  });

  // "remove(name) ... re-reads the inventory on success"
  it('re-reads the inventory after a successful remove', async () => {
    fetchContexts.mockResolvedValue([context()]);
    removeContext.mockResolvedValue(undefined);
    const { result } = renderHook(() => useContexts());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    fetchContexts.mockClear();

    await act(async () => {
      await result.current.remove('default');
    });

    await waitFor(() => expect(fetchContexts).toHaveBeenCalled());
  });

  // "use(name) ... re-reads the inventory on success"
  it('re-reads the inventory after a successful switch, so the newly active context shows', async () => {
    fetchContexts.mockResolvedValueOnce([context({ name: 'two' })]);
    activateContext.mockResolvedValue(context({ name: 'two', active: true }));
    const { result } = renderHook(() => useContexts());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    fetchContexts.mockResolvedValue([context({ name: 'two', active: true })]);

    await act(async () => {
      await result.current.use('two');
    });

    await waitFor(() => expect(result.current.active?.name).toBe('two'));
  });

  // "use(name) additionally announces the switch on the active-context broadcast, once the server
  // confirms it — never before, and never on failure" (REQ-93)
  it('announces the switch on the broadcast once the server has confirmed it', async () => {
    fetchContexts.mockResolvedValue([context({ name: 'two' })]);
    activateContext.mockResolvedValue(context({ name: 'two', active: true }));
    const announced = vi.fn();
    const unsubscribe = subscribeToActiveContextChange(announced);
    try {
      const { result } = renderHook(() => useContexts());
      await waitFor(() => expect(result.current.loaded).toBe(true));
      expect(announced).not.toHaveBeenCalled();

      await act(async () => {
        await result.current.use('two');
      });

      expect(announced).toHaveBeenCalled();
    } finally {
      unsubscribe();
    }
  });

  it('announces nothing when the switch fails', async () => {
    fetchContexts.mockResolvedValue([context({ name: 'two' })]);
    activateContext.mockRejectedValue(new Error('context not found'));
    const announced = vi.fn();
    const unsubscribe = subscribeToActiveContextChange(announced);
    try {
      const { result } = renderHook(() => useContexts());
      await waitFor(() => expect(result.current.loaded).toBe(true));

      await expect(result.current.use('two')).rejects.toThrow('context not found');

      expect(announced).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
    }
  });

  // "failures propagate to the caller (never swallowed) so the screen can report them"
  it('propagates a create failure to the caller', async () => {
    fetchContexts.mockResolvedValue([]);
    createContext.mockRejectedValue(new Error('context "dup" already exists'));
    const { result } = renderHook(() => useContexts());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await expect(result.current.create({ name: 'dup', kind: 'local' })).rejects.toThrow('context "dup" already exists');
  });

  it('propagates a remove failure to the caller', async () => {
    fetchContexts.mockResolvedValue([context()]);
    removeContext.mockRejectedValue(new Error('cannot remove the current context'));
    const { result } = renderHook(() => useContexts());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await expect(result.current.remove('default')).rejects.toThrow('cannot remove the current context');
  });

  // "The re-read after a change reaches every mounted instance of the hook, not only the one that
  // acted: the Contexts screen and the shell always name the same active context and count the same
  // contexts, with no interval of disagreement between them."
  it('makes every mounted instance re-read after a switch, not only the one that acted', async () => {
    fetchContexts.mockResolvedValue([context({ name: 'one', active: true }), context({ name: 'two' })]);
    activateContext.mockResolvedValue(context({ name: 'two', active: true }));
    const acting = renderHook(() => useContexts());
    const observing = renderHook(() => useContexts());
    await waitFor(() => expect(acting.result.current.loaded).toBe(true));
    await waitFor(() => expect(observing.result.current.loaded).toBe(true));
    fetchContexts.mockResolvedValue([context({ name: 'one' }), context({ name: 'two', active: true })]);

    await act(async () => {
      await acting.result.current.use('two');
    });

    await waitFor(() => expect(acting.result.current.active?.name).toBe('two'));
    await waitFor(() => expect(observing.result.current.active?.name).toBe('two'));
  });

  it('makes every mounted instance re-read after a create', async () => {
    fetchContexts.mockResolvedValue([context({ name: 'one' })]);
    createContext.mockResolvedValue(context({ name: 'fresh' }));
    const acting = renderHook(() => useContexts());
    const observing = renderHook(() => useContexts());
    await waitFor(() => expect(observing.result.current.loaded).toBe(true));
    fetchContexts.mockResolvedValue([context({ name: 'one' }), context({ name: 'fresh' })]);

    await act(async () => {
      await acting.result.current.create({ name: 'fresh', kind: 'local' });
    });

    await waitFor(() => expect(observing.result.current.contexts).toHaveLength(2));
  });

  it('makes every mounted instance re-read after a remove', async () => {
    fetchContexts.mockResolvedValue([context({ name: 'one' }), context({ name: 'two' })]);
    removeContext.mockResolvedValue(undefined);
    const acting = renderHook(() => useContexts());
    const observing = renderHook(() => useContexts());
    await waitFor(() => expect(observing.result.current.contexts).toHaveLength(2));
    fetchContexts.mockResolvedValue([context({ name: 'one' })]);

    await act(async () => {
      await acting.result.current.remove('two');
    });

    await waitFor(() => expect(observing.result.current.contexts).toHaveLength(1));
  });

  // The re-read is the announcement's, not the acting instance's own as well: one instance re-reads
  // once per change, and a re-read announces nothing further, so nothing loops.
  it('re-reads exactly once per instance per change, without looping', async () => {
    fetchContexts.mockResolvedValue([context({ name: 'one', active: true }), context({ name: 'two' })]);
    activateContext.mockResolvedValue(context({ name: 'two', active: true }));
    const first = renderHook(() => useContexts());
    const second = renderHook(() => useContexts());
    await waitFor(() => expect(first.result.current.loaded).toBe(true));
    await waitFor(() => expect(second.result.current.loaded).toBe(true));
    fetchContexts.mockClear();

    await act(async () => {
      await first.result.current.use('two');
    });
    // Long enough for a re-entrant announcement to have produced a further round of reads.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    expect(fetchContexts).toHaveBeenCalledTimes(2);
  });

  // "An answer that is not a list of contexts is treated exactly like a failed read — reported
  // through error, never stored — so no consumer is ever handed something it cannot iterate."
  it('treats an answer that is not a list as a failed read, keeping contexts iterable', async () => {
    fetchContexts.mockResolvedValue({ error: 'not a list at all' } as unknown as ContextSummary[]);

    const { result } = renderHook(() => useContexts());

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(Array.isArray(result.current.contexts)).toBe(true);
    expect(result.current.contexts).toEqual([]);
    expect(result.current.error).toBeTruthy();
    expect(result.current.active).toBeUndefined();
  });

  it('recovers from a non-list answer once a later read returns a list', async () => {
    fetchContexts.mockResolvedValueOnce({} as unknown as ContextSummary[]);
    const { result } = renderHook(() => useContexts());
    await waitFor(() => expect(result.current.error).toBeTruthy());

    fetchContexts.mockResolvedValue([context({ name: 'one', active: true })]);
    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.error).toBeUndefined());
    expect(result.current.active?.name).toBe('one');
  });

  // The inventory read failing is reported rather than thrown, with retry through refresh()
  it('surfaces a read failure and clears it once a later read succeeds', async () => {
    fetchContexts.mockRejectedValueOnce(new Error('docker not available'));
    const { result } = renderHook(() => useContexts());
    await waitFor(() => expect(result.current.error).toBe('docker not available'));

    fetchContexts.mockResolvedValue([context()]);
    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.error).toBeUndefined());
  });
});
