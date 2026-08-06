import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { usePreferences } from '../../src/data/use-preferences';
import { DEFAULT_PREFERENCES, type OperatorPreferences } from '../../src/data/preferences-client';

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
    let resolveGet!: (value: OperatorPreferences) => void;
    const getPromise = new Promise<OperatorPreferences>((resolve) => {
      resolveGet = resolve;
    });
    const putCalls: Partial<OperatorPreferences>[] = [];
    stubFetch(() => getPromise, putCalls);

    const { result } = renderHook(() => usePreferences());

    act(() => {
      result.current.updatePreferences({ lastScreenId: 'containers' });
    });
    await waitFor(() => expect(result.current.preferences.lastScreenId).toBe('containers'));
    expect(putCalls).toHaveLength(0);

    resolveGet({ ...DEFAULT_PREFERENCES, selectedContext: 'staging' });
    await waitFor(() => expect(result.current.loaded).toBe(true));
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
});
