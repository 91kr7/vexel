import { StrictMode, act, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { usePreferences } from '../../src/data/use-preferences';
import { DEFAULT_PREFERENCES, type OperatorPreferences } from '../../src/data/preferences-client';

/**
 * Stubs the two preferences endpoints the hook talks to through its data
 * client. `getPreferences` is called once per GET (so a StrictMode double mount
 * gets two independent answers) and every PUT body is appended to `putCalls`,
 * which is what the "exactly once, as one call" invariant is asserted on.
 */
function stubFetch(getPreferences: () => Promise<OperatorPreferences>, putCalls: Partial<OperatorPreferences>[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/persistence/preferences') && init?.method === 'PUT') {
        const patch = JSON.parse(init.body as string) as Partial<OperatorPreferences>;
        putCalls.push(patch);
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ...DEFAULT_PREFERENCES, ...patch }) });
      }
      if (url.endsWith('/api/persistence/preferences')) {
        return getPreferences().then((stored) => ({ ok: true, json: () => Promise.resolve(stored) }));
      }
      return Promise.reject(new Error(`unexpected fetch call: ${url}`));
    }),
  );
}

/** A read the test releases by hand, so "before the read settles" is a state and not a race. */
function deferredRead() {
  let resolveGet!: (value: OperatorPreferences) => void;
  let rejectGet!: (reason: Error) => void;
  const promise = new Promise<OperatorPreferences>((resolve, reject) => {
    resolveGet = resolve;
    rejectGet = reject;
  });
  return { read: () => promise, resolveGet, rejectGet };
}

function strictWrapper({ children }: { children: ReactNode }) {
  return <StrictMode>{children}</StrictMode>;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('usePreferences', () => {
  // local-persistence/specs/use-preferences.md — preferences start as defaults and are replaced once the initial fetch settles
  it('starts with the default preferences, unloaded, then replaces them with the server-stored value', async () => {
    const stored: OperatorPreferences = { ...DEFAULT_PREFERENCES, lastScreenId: 'containers' };
    stubFetch(() => Promise.resolve(stored), []);

    const { result } = renderHook(() => usePreferences());

    expect(result.current.preferences).toEqual(DEFAULT_PREFERENCES);
    expect(result.current.loaded).toBe(false);

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.preferences).toEqual(stored);
  });

  // local-persistence/specs/use-preferences.md — an update before the initial load has settled merges locally but does not persist yet
  it('merges an update issued before the initial load has settled without overwriting the stored preferences', async () => {
    const { read, resolveGet } = deferredRead();
    const putCalls: Partial<OperatorPreferences>[] = [];
    stubFetch(read, putCalls);

    const { result } = renderHook(() => usePreferences());

    act(() => {
      result.current.updatePreferences({ lastScreenId: 'containers' });
    });
    await waitFor(() => expect(result.current.preferences.lastScreenId).toBe('containers'));
    expect(putCalls).toHaveLength(0);

    resolveGet({ ...DEFAULT_PREFERENCES, selectedContext: 'staging' });
    await waitFor(() => expect(result.current.loaded).toBe(true));
  });

  // local-persistence/specs/use-preferences.md — "deferred, never dropped": the pending update is
  // flushed as a single savePreferences call the moment the read settles (REQ-115)
  it('flushes an update issued before the read settles, exactly once, as one call', async () => {
    const { read, resolveGet } = deferredRead();
    const putCalls: Partial<OperatorPreferences>[] = [];
    stubFetch(read, putCalls);

    const { result } = renderHook(() => usePreferences());
    act(() => {
      result.current.updatePreferences({ lastScreenId: 'containers' });
    });
    expect(putCalls).toHaveLength(0);

    await act(async () => {
      resolveGet({ ...DEFAULT_PREFERENCES, lastScreenId: 'dashboard' });
    });

    await waitFor(() => expect(putCalls).toHaveLength(1));
    expect(putCalls[0]).toEqual({ lastScreenId: 'containers' });
  });

  // local-persistence/specs/use-preferences.md — several updates issued before the read settles are
  // merged, last write per key winning, and persisted as one call
  it('merges several updates issued before the read settles into one call, the later key winning', async () => {
    const { read, resolveGet } = deferredRead();
    const putCalls: Partial<OperatorPreferences>[] = [];
    stubFetch(read, putCalls);

    const { result } = renderHook(() => usePreferences());
    act(() => {
      result.current.updatePreferences({ lastScreenId: 'containers' });
    });
    act(() => {
      result.current.updatePreferences({ logTimestamps: true });
    });
    act(() => {
      result.current.updatePreferences({ lastScreenId: 'volumes' });
    });

    await act(async () => {
      resolveGet(DEFAULT_PREFERENCES);
    });

    await waitFor(() => expect(putCalls).toHaveLength(1));
    expect(putCalls[0]).toEqual({ lastScreenId: 'volumes', logTimestamps: true });
    expect(result.current.preferences.lastScreenId).toBe('volumes');
    expect(result.current.preferences.logTimestamps).toBe(true);
  });

  // local-persistence/specs/use-preferences.md, invariant — "the initial read's response never
  // overwrites a key the operator has already changed in this session": the stored value is applied
  // underneath the pending keys. Asserted on the hook alone, with no shell involved.
  it('applies the read underneath the keys the operator already changed, and rolls neither state nor record back', async () => {
    const { read, resolveGet } = deferredRead();
    const putCalls: Partial<OperatorPreferences>[] = [];
    stubFetch(read, putCalls);

    const { result } = renderHook(() => usePreferences());
    act(() => {
      result.current.updatePreferences({ lastScreenId: 'containers' });
    });

    await act(async () => {
      resolveGet({ ...DEFAULT_PREFERENCES, lastScreenId: 'dashboard', selectedContext: 'staging', logFollow: false });
    });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    // The key the operator changed keeps the operator's value...
    expect(result.current.preferences.lastScreenId).toBe('containers');
    // ...while every key they did not change takes the stored one.
    expect(result.current.preferences.selectedContext).toBe('staging');
    expect(result.current.preferences.logFollow).toBe(false);
    // And nothing persisted the value the read returned for the changed key.
    expect(putCalls).toEqual([{ lastScreenId: 'containers' }]);
  });

  // local-persistence/specs/use-preferences.md — the pending update is flushed "whether the read
  // succeeded or failed"; a failed read is swallowed and still settles `loaded`
  it('still flushes the pending update when the initial read fails', async () => {
    const { read, rejectGet } = deferredRead();
    const putCalls: Partial<OperatorPreferences>[] = [];
    stubFetch(read, putCalls);

    const { result } = renderHook(() => usePreferences());
    act(() => {
      result.current.updatePreferences({ lastScreenId: 'networks' });
    });
    expect(putCalls).toHaveLength(0);

    await act(async () => {
      rejectGet(new Error('preferences unreachable'));
    });

    await waitFor(() => expect(putCalls).toEqual([{ lastScreenId: 'networks' }]));
    expect(result.current.loaded).toBe(true);
    expect(result.current.preferences.lastScreenId).toBe('networks');
  });

  // local-persistence/specs/use-preferences.md — an update issued once loaded persists the patch
  it('persists an update issued once the initial load has settled', async () => {
    const putCalls: Partial<OperatorPreferences>[] = [];
    stubFetch(() => Promise.resolve(DEFAULT_PREFERENCES), putCalls);

    const { result } = renderHook(() => usePreferences());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => {
      result.current.updatePreferences({ lastScreenId: 'images' });
    });

    await waitFor(() => expect(putCalls).toContainEqual({ lastScreenId: 'images' }));
    expect(result.current.preferences.lastScreenId).toBe('images');
  });

  // local-persistence/specs/use-preferences.md, invariant — every call reaches the server exactly
  // once, in call order: after the load has settled each update is its own immediate call
  it('sends one call per update, in call order, once the load has settled', async () => {
    const putCalls: Partial<OperatorPreferences>[] = [];
    stubFetch(() => Promise.resolve(DEFAULT_PREFERENCES), putCalls);

    const { result } = renderHook(() => usePreferences());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => {
      result.current.updatePreferences({ lastScreenId: 'images' });
    });
    act(() => {
      result.current.updatePreferences({ logFollow: false });
    });

    await waitFor(() => expect(putCalls).toHaveLength(2));
    expect(putCalls).toEqual([{ lastScreenId: 'images' }, { logFollow: false }]);
  });

  // local-persistence/specs/use-preferences.md, invariant — "exactly once": React StrictMode mounts,
  // unmounts and remounts the hook, and the discarded first mount must not flush a second time
  it('flushes the pending update only once under a StrictMode double mount', async () => {
    const { read, resolveGet } = deferredRead();
    const putCalls: Partial<OperatorPreferences>[] = [];
    stubFetch(read, putCalls);

    const { result } = renderHook(() => usePreferences(), { wrapper: strictWrapper });
    act(() => {
      result.current.updatePreferences({ lastScreenId: 'compose' });
    });

    await act(async () => {
      resolveGet(DEFAULT_PREFERENCES);
    });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(putCalls).toEqual([{ lastScreenId: 'compose' }]);
  });

  // local-persistence/specs/use-preferences.md — "a failed savePreferences is swallowed: preferences
  // are a convenience, never a reason to break the operator's action"
  it('swallows a failed save and keeps the merged value in memory', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/api/persistence/preferences') && init?.method === 'PUT') {
          return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
        }
        if (url.endsWith('/api/persistence/preferences')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(DEFAULT_PREFERENCES) });
        }
        return Promise.reject(new Error(`unexpected fetch call: ${url}`));
      }),
    );
    const rejections: unknown[] = [];
    const onRejection = (event: PromiseRejectionEvent) => rejections.push(event.reason);
    window.addEventListener('unhandledrejection', onRejection);

    try {
      const { result } = renderHook(() => usePreferences());
      await waitFor(() => expect(result.current.loaded).toBe(true));

      expect(() =>
        act(() => {
          result.current.updatePreferences({ lastScreenId: 'swarm' });
        }),
      ).not.toThrow();

      await waitFor(() => expect(result.current.preferences.lastScreenId).toBe('swarm'));
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(rejections).toEqual([]);
    } finally {
      window.removeEventListener('unhandledrejection', onRejection);
    }
  });
});
