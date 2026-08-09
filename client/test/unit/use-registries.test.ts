import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import type { RegistrySummary } from '../../src/data/registries-client';

// useRegistries reads the registry inventory and drives log in / log out
// (registries/specs/use-registries.md). The data client is mocked so the hook's
// own decisions are the only thing under test — and so that no secret this file
// passes in can reach anything but the mock. The active-context broadcast is
// the real one, subscribed to as any cached view would.
const fetchRegistries = vi.fn();
const loginToRegistry = vi.fn();
const logoutFromRegistry = vi.fn();

vi.mock('../../src/data/registries-client', () => ({
  fetchRegistries: () => fetchRegistries(),
  loginToRegistry: (input: unknown) => loginToRegistry(input),
  logoutFromRegistry: (host: string) => logoutFromRegistry(host),
}));

const { useRegistries } = await import('../../src/data/use-registries');
const { notifyActiveContextChanged } = await import('../../src/data/active-context');

function registry(overrides: Partial<RegistrySummary> = {}): RegistrySummary {
  return { host: 'docker.io', serverUrl: 'https://index.docker.io/v1/', authenticated: false, secure: true, official: true, ...overrides };
}

beforeEach(() => {
  fetchRegistries.mockReset();
  loginToRegistry.mockReset();
  logoutFromRegistry.mockReset();
});

afterEach(cleanup);

describe('useRegistries (registries/specs/use-registries.md)', () => {
  // "registries: RegistrySummary[] — empty until the first read settles"; "loaded — true once the
  // first read has settled"
  it('reads the inventory on mount and marks itself loaded', async () => {
    fetchRegistries.mockResolvedValue([registry(), registry({ host: 'ghcr.io', official: false })]);

    const { result } = renderHook(() => useRegistries());

    expect(result.current.registries).toEqual([]);
    expect(result.current.loaded).toBe(false);
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.registries).toHaveLength(2);
  });

  // "loaded — true once the first read has settled, whether it succeeded or not"; "error? — the
  // message of the last failed read; cleared by the next successful one"
  it('reports a failed read, stays loaded, and clears the failure on the next successful read', async () => {
    fetchRegistries.mockRejectedValueOnce(new Error('docker is not available'));

    const { result } = renderHook(() => useRegistries());

    await waitFor(() => expect(result.current.error).toBe('docker is not available'));
    expect(result.current.loaded).toBe(true);
    expect(result.current.registries).toEqual([]);

    fetchRegistries.mockResolvedValue([registry()]);
    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.error).toBeUndefined());
    expect(result.current.registries).toHaveLength(1);
  });

  // "An answer that is not a list is treated as a failed read: it is reported, never stored, so no
  // consumer is ever handed a non-list."
  it('treats an answer that is not a list as a failed read, keeping the registries iterable', async () => {
    fetchRegistries.mockResolvedValue({ error: 'not a list at all' } as unknown as RegistrySummary[]);

    const { result } = renderHook(() => useRegistries());

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(Array.isArray(result.current.registries)).toBe(true);
    expect(result.current.registries).toEqual([]);
    expect(result.current.error).toBeTruthy();
  });

  // "logIn({ host, username, secret }) — logs in, then re-reads the inventory"
  it('logs in and re-reads the inventory afterwards', async () => {
    fetchRegistries.mockResolvedValue([registry({ host: 'ghcr.io', official: false })]);
    loginToRegistry.mockResolvedValue(registry({ host: 'ghcr.io', official: false, authenticated: true, account: 'octocat' }));
    const { result } = renderHook(() => useRegistries());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    fetchRegistries.mockClear();
    fetchRegistries.mockResolvedValue([registry({ host: 'ghcr.io', official: false, authenticated: true, account: 'octocat' })]);

    await act(async () => {
      await result.current.logIn({ host: 'ghcr.io', username: 'octocat', secret: 'a-secret-value' });
    });

    expect(loginToRegistry).toHaveBeenCalledWith({ host: 'ghcr.io', username: 'octocat', secret: 'a-secret-value' });
    await waitFor(() => expect(fetchRegistries).toHaveBeenCalled());
    await waitFor(() => expect(result.current.registries[0]!.authenticated).toBe(true));
  });

  // "The hook holds no credential state of any kind (REQ-87): the secret passed to logIn is
  // forwarded to the server and kept nowhere — not in state, not in a ref, not in a cache."
  it('keeps the secret nowhere in what it exposes, before or after a log in', async () => {
    const secret = 'a-secret-value-that-must-not-survive';
    fetchRegistries.mockResolvedValue([registry({ host: 'ghcr.io', official: false })]);
    loginToRegistry.mockResolvedValue(registry({ host: 'ghcr.io', official: false, authenticated: true, account: 'octocat' }));
    const { result } = renderHook(() => useRegistries());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.logIn({ host: 'ghcr.io', username: 'octocat', secret });
    });

    const exposed = JSON.stringify(result.current, (_key, value) => (typeof value === 'function' ? undefined : value));
    expect(exposed).not.toContain(secret);
  });

  it('keeps the secret nowhere after a refused log in either', async () => {
    const secret = 'a-secret-value-that-must-not-survive';
    fetchRegistries.mockResolvedValue([registry({ host: 'ghcr.io', official: false })]);
    loginToRegistry.mockRejectedValue(new Error('401 Unauthorized'));
    const { result } = renderHook(() => useRegistries());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await expect(result.current.logIn({ host: 'ghcr.io', username: 'octocat', secret })).rejects.toThrow('401 Unauthorized');

    const exposed = JSON.stringify(result.current, (_key, value) => (typeof value === 'function' ? undefined : value));
    expect(exposed).not.toContain(secret);
  });

  // "logIn ... rejects with the server's message"
  it('rejects a refused log in with the server\'s own message', async () => {
    fetchRegistries.mockResolvedValue([registry({ host: 'ghcr.io', official: false })]);
    loginToRegistry.mockRejectedValue(new Error('login attempt failed with status: 401 Unauthorized'));
    const { result } = renderHook(() => useRegistries());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await expect(result.current.logIn({ host: 'ghcr.io', username: 'octocat', secret: 'wrong' })).rejects.toThrow(
      'login attempt failed with status: 401 Unauthorized',
    );
  });

  // "logOut(host) — logs out, then re-reads the inventory"
  it('logs out and re-reads the inventory afterwards', async () => {
    fetchRegistries.mockResolvedValue([registry({ host: 'ghcr.io', official: false, authenticated: true, account: 'octocat' })]);
    logoutFromRegistry.mockResolvedValue(registry({ host: 'ghcr.io', official: false }));
    const { result } = renderHook(() => useRegistries());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    fetchRegistries.mockClear();
    fetchRegistries.mockResolvedValue([registry({ host: 'ghcr.io', official: false })]);

    await act(async () => {
      await result.current.logOut('ghcr.io');
    });

    expect(logoutFromRegistry).toHaveBeenCalledWith('ghcr.io');
    await waitFor(() => expect(result.current.registries[0]!.authenticated).toBe(false));
  });

  // "It re-reads on the active-context broadcast: another context can mean another daemon, and with
  // it another view of which registries are insecure (REQ-93)."
  it('re-reads the inventory when another context becomes active', async () => {
    fetchRegistries.mockResolvedValue([registry()]);
    const { result } = renderHook(() => useRegistries());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    fetchRegistries.mockClear();

    act(() => notifyActiveContextChanged());

    await waitFor(() => expect(fetchRegistries).toHaveBeenCalled());
  });

  // "A read that settles after the hook unmounts updates nothing."
  it('updates nothing once unmounted', async () => {
    let settle: (value: RegistrySummary[]) => void = () => undefined;
    fetchRegistries.mockReturnValue(new Promise<RegistrySummary[]>((resolve) => (settle = resolve)));
    const { result, unmount } = renderHook(() => useRegistries());

    unmount();
    await act(async () => {
      settle([registry()]);
      await Promise.resolve();
    });

    expect(result.current.registries).toEqual([]);
  });
});
