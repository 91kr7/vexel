import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, renderHook } from '@testing-library/react';
import { channelOpens, deliverValue } from '../support/live-channel';
import { arrangeLiveChannel, type ChannelHarness } from '../support/pushed-listing';

/**
 * What `useRegistries` does beyond reading the inventory off the channel
 * (`registries/specs/use-registries.md`): the log in and log out it drives, the
 * credential it holds nowhere, and a delivery that is not a list. The inventory
 * itself is covered for the whole set in `listings-arrive-by-push.test.tsx`.
 *
 * `fetch` is recorded rather than the client mocked, so no secret this file
 * passes in can reach anything but the recorder — and so the claim that an
 * action re-reads nothing is asserted on every request the hook made.
 */

let harness: ChannelHarness;
let useRegistries: typeof import('../../src/data/use-registries').useRegistries;

function registry(overrides: Record<string, unknown> = {}) {
  return { host: 'docker.io', serverUrl: 'https://index.docker.io/v1/', authenticated: false, secure: true, official: true, ...overrides };
}

const GHCR = registry({ host: 'ghcr.io', serverUrl: 'https://ghcr.io', official: false });

beforeEach(async () => {
  harness = arrangeLiveChannel();
  vi.resetModules();
  ({ useRegistries } = await import('../../src/data/use-registries'));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** The hook with the channel delivering, and the inventory already delivered. */
function mounted() {
  const rendered = renderHook(() => useRegistries());
  act(() => channelOpens());
  act(() => deliverValue('registries', [registry(), GHCR]));
  return rendered;
}

/** Everything the hook exposes, functions dropped: where a secret would have to show. */
function exposed(result: unknown): string {
  return JSON.stringify(result, (_key, value) => (typeof value === 'function' ? undefined : value));
}

describe('useRegistries (registries/specs/use-registries.md)', () => {
  // "logIn({ host, username, secret }): Promise<RegistrySummary>" — and REQ-25: no re-read follows.
  it('logs in without re-reading the inventory', async () => {
    harness.answers('/api/registries/login', { ...GHCR, authenticated: true, account: 'octocat' }, { method: 'POST' });
    const { result } = mounted();

    await act(async () => {
      await expect(result.current.logIn({ host: 'ghcr.io', username: 'octocat', secret: 'a-secret-value' })).resolves.toMatchObject({
        host: 'ghcr.io',
        authenticated: true,
      });
    });

    expect(harness.requests).toEqual([{ url: '/api/registries/login', method: 'POST' }]);
  });

  it('logs out without re-reading the inventory', async () => {
    harness.answers('/api/registries/logout', GHCR, { method: 'POST' });
    const { result } = mounted();

    await act(async () => {
      await expect(result.current.logOut('ghcr.io')).resolves.toMatchObject({ host: 'ghcr.io', authenticated: false });
    });

    expect(harness.requests).toEqual([{ url: '/api/registries/logout', method: 'POST' }]);
  });

  // REQ-25 — the log in reaches the screen as the push the server's own operation caused.
  it('shows the authenticated registry when the channel delivers the inventory again', async () => {
    harness.answers('/api/registries/login', { ...GHCR, authenticated: true, account: 'octocat' }, { method: 'POST' });
    const { result } = mounted();
    await act(async () => {
      await result.current.logIn({ host: 'ghcr.io', username: 'octocat', secret: 'a-secret-value' });
    });
    expect(result.current.registries[1]!.authenticated).toBe(false);

    act(() => deliverValue('registries', [registry(), { ...GHCR, authenticated: true, account: 'octocat' }]));

    expect(result.current.registries[1]!.authenticated).toBe(true);
  });

  // "The hook holds no credential state of any kind (REQ-87): the secret passed to logIn is
  // forwarded to the server and kept nowhere — not in state, not in a ref, not in a cache."
  it('keeps the secret nowhere in what it exposes, after a log in and after a refused one', async () => {
    const secret = 'a-secret-value-that-must-not-survive';
    harness.answers('/api/registries/login', { ...GHCR, authenticated: true, account: 'octocat' }, { method: 'POST' });
    const { result } = mounted();

    await act(async () => {
      await result.current.logIn({ host: 'ghcr.io', username: 'octocat', secret });
    });
    expect(exposed(result.current)).not.toContain(secret);

    harness.answers('/api/registries/login', { error: '401 Unauthorized' }, { method: 'POST', ok: false, status: 401 });
    await expect(result.current.logIn({ host: 'ghcr.io', username: 'octocat', secret })).rejects.toThrow('401 Unauthorized');

    expect(exposed(result.current)).not.toContain(secret);
  });

  // "logIn ... rejects with the server's message"
  it("rejects a refused log in with the server's own message", async () => {
    harness.answers(
      '/api/registries/login',
      { error: 'login attempt failed with status: 401 Unauthorized' },
      { method: 'POST', ok: false, status: 401 },
    );
    const { result } = mounted();

    await expect(result.current.logIn({ host: 'ghcr.io', username: 'octocat', secret: 'wrong' })).rejects.toThrow(
      'login attempt failed with status: 401 Unauthorized',
    );
  });

  // "A delivery that is not a list is treated as a failed read: it is reported, never shown, so no
  // consumer is ever handed a non-list."
  it('treats a delivery that is not a list as a failed read, keeping the registries iterable', () => {
    const { result } = renderHook(() => useRegistries());
    act(() => channelOpens());

    act(() => deliverValue('registries', { error: 'not a list at all' }));

    expect(Array.isArray(result.current.registries)).toBe(true);
    expect(result.current.registries).toEqual([]);
    expect(result.current.error).toBeTruthy();
  });

  it('recovers from a delivery that is not a list once a list is delivered', () => {
    const { result } = renderHook(() => useRegistries());
    act(() => channelOpens());
    act(() => deliverValue('registries', { error: 'not a list at all' }));

    act(() => deliverValue('registries', [registry()]));

    expect(result.current.error).toBeUndefined();
    expect(result.current.registries).toHaveLength(1);
  });
});
