import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, renderHook } from '@testing-library/react';
import { channelOpens, deliverValue } from '../support/live-channel';
import { arrangeLiveChannel, type ChannelHarness } from '../support/pushed-listing';

/**
 * What `usePlugins` does beyond reading the round off the channel
 * (`plugins/specs/use-plugins.md`): a delivery that is not two listings, the
 * management of the daemon plugins, the privileges read for a decision and the
 * inspection read on demand. The round itself is covered for the whole set in
 * `listings-arrive-by-push.test.tsx`.
 */

let harness: ChannelHarness;
let usePlugins: typeof import('../../src/data/use-plugins').usePlugins;

function daemonPlugin(name: string, enabled = false) {
  return { id: `id-${name}`, name, enabled, interfaceTypes: [], type: 'volume driver' };
}

const ROUND = {
  cli: { items: [{ name: 'compose', command: 'docker compose', availability: 'enabled' }] },
  daemon: { items: [daemonPlugin('vieux/sshfs:latest')] },
};

beforeEach(async () => {
  harness = arrangeLiveChannel();
  vi.resetModules();
  ({ usePlugins } = await import('../../src/data/use-plugins'));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** The hook with the channel delivering, and one round already delivered. */
function mounted() {
  const rendered = renderHook(() => usePlugins());
  act(() => channelOpens());
  act(() => deliverValue('plugins', ROUND));
  return rendered;
}

describe('usePlugins (plugins/specs/use-plugins.md)', () => {
  // "cli, daemon — the two halves of the one round the channel last delivered"
  it('shows both halves of the round the channel delivered', () => {
    const { result } = mounted();

    expect(result.current.cli.items).toHaveLength(1);
    expect(result.current.daemon.items).toHaveLength(1);
    expect(result.current.loaded).toBe(true);
  });

  // "A delivery that is not two listings is treated exactly like a failed read — reported through
  // error, never shown ... One malformed side fails the whole round rather than half-updating the
  // screen."
  it('reports a malformed side as a failed read and shows neither side', () => {
    const { result } = renderHook(() => usePlugins());
    act(() => channelOpens());

    act(() => deliverValue('plugins', { cli: { items: [{ name: 'compose', command: 'docker compose', availability: 'enabled' }] }, daemon: {} }));

    expect(result.current.error).toBeTruthy();
    expect(result.current.cli.items).toEqual([]);
    expect(result.current.daemon.items).toEqual([]);
  });

  it('leaves both panels with an items array when the delivery is not a round at all', () => {
    const { result } = renderHook(() => usePlugins());
    act(() => channelOpens());

    act(() => deliverValue('plugins', [{ name: 'compose' }]));

    expect(result.current.error).toBeTruthy();
    expect(Array.isArray(result.current.cli.items)).toBe(true);
    expect(Array.isArray(result.current.daemon.items)).toBe(true);
  });

  it('recovers from a malformed delivery once a round is delivered', () => {
    const { result } = renderHook(() => usePlugins());
    act(() => channelOpens());
    act(() => deliverValue('plugins', { cli: {}, daemon: {} }));

    act(() => deliverValue('plugins', ROUND));

    expect(result.current.error).toBeUndefined();
    expect(result.current.daemon.items).toHaveLength(1);
  });

  // "readPrivileges(remote) — what the reference asks for; installs nothing and stores nothing";
  // "The privileges a reference asks for are never cached" (REQ-99).
  it('reads the privileges afresh every time, storing nothing and installing nothing', async () => {
    const first = [{ name: 'network', values: ['host'] }];
    const second = [{ name: 'network', values: ['host'] }, { name: 'mount', values: ['/'] }];
    const url = '/api/plugins/privileges?remote=vieux%2Fsshfs%3Alatest';
    harness.answers(url, first);
    harness.answers(url, second);
    const { result } = mounted();

    let read: unknown;
    await act(async () => {
      read = await result.current.readPrivileges('vieux/sshfs:latest');
    });
    expect(read).toEqual(first);

    await act(async () => {
      read = await result.current.readPrivileges('vieux/sshfs:latest');
    });

    // The second reading is a second question to the server, not a replay of the first.
    expect(read).toEqual(second);
    expect(harness.requests.filter((request) => request.url === url)).toHaveLength(2);
    expect(harness.requests.some((request) => request.url === '/api/plugins/install')).toBe(false);
  });

  // REQ-25 — an action re-reads nothing: the result reaches the panels as the push it caused.
  it('installs, enables, disables and removes without re-reading the round', async () => {
    harness.answers('/api/plugins/install', daemonPlugin('vieux/sshfs:latest'), { method: 'POST' });
    harness.answers('/api/plugins/enable', daemonPlugin('vieux/sshfs:latest', true), { method: 'POST' });
    harness.answers('/api/plugins/disable', daemonPlugin('vieux/sshfs:latest'), { method: 'POST' });
    harness.answers('/api/plugins?name=vieux%2Fsshfs%3Alatest', {}, { method: 'DELETE' });
    const { result } = mounted();

    await act(async () => {
      await result.current.install({ remote: 'vieux/sshfs:latest', grantedPrivileges: [] });
      await result.current.enable('vieux/sshfs:latest');
      await result.current.disable('vieux/sshfs:latest');
      await result.current.remove('vieux/sshfs:latest');
    });

    expect(harness.requests.map((request) => request.url)).toEqual([
      '/api/plugins/install',
      '/api/plugins/enable',
      '/api/plugins/disable',
      '/api/plugins?name=vieux%2Fsshfs%3Alatest',
    ]);
  });

  it('shows what an action changed when the channel delivers the new round', async () => {
    harness.answers('/api/plugins/enable', daemonPlugin('vieux/sshfs:latest', true), { method: 'POST' });
    const { result } = mounted();
    await act(async () => {
      await result.current.enable('vieux/sshfs:latest');
    });
    expect(result.current.daemon.items[0]!.enabled).toBe(false);

    act(() => deliverValue('plugins', { ...ROUND, daemon: { items: [daemonPlugin('vieux/sshfs:latest', true)] } }));

    expect(result.current.daemon.items[0]!.enabled).toBe(true);
  });

  // "failures propagate to the caller (never swallowed) so the screen can report them"
  it('lets every failure through to the caller', async () => {
    harness.answers('/api/plugins/install', { error: 'nothing has been installed' }, { method: 'POST', ok: false, status: 500 });
    harness.answers('/api/plugins/enable', { error: 'the plugin refused to come up' }, { method: 'POST', ok: false, status: 500 });
    harness.answers('/api/plugins/disable', { error: 'the plugin is in use' }, { method: 'POST', ok: false, status: 409 });
    harness.answers('/api/plugins?name=x', { error: 'the plugin is enabled' }, { method: 'DELETE', ok: false, status: 409 });
    harness.answers('/api/plugins/inspect?name=x', { error: 'no such plugin' }, { ok: false, status: 404 });
    const { result } = mounted();

    await expect(result.current.install({ remote: 'x', grantedPrivileges: [] })).rejects.toThrow('nothing has been installed');
    await expect(result.current.enable('x')).rejects.toThrow('the plugin refused to come up');
    await expect(result.current.disable('x')).rejects.toThrow('the plugin is in use');
    await expect(result.current.remove('x')).rejects.toThrow('the plugin is enabled');
    await expect(result.current.inspect('x')).rejects.toThrow('no such plugin');
  });

  // "inspect(name) — read on demand, not held"
  it('reads an inspection on demand without holding it', async () => {
    const inspection = { ...daemonPlugin('vieux/sshfs:latest'), mounts: [], devices: [], capabilities: [], env: [], raw: {} };
    const url = '/api/plugins/inspect?name=vieux%2Fsshfs%3Alatest';
    harness.answers(url, inspection);
    harness.answers(url, inspection);
    const { result } = mounted();

    await act(async () => {
      await expect(result.current.inspect('vieux/sshfs:latest')).resolves.toEqual(inspection);
      await expect(result.current.inspect('vieux/sshfs:latest')).resolves.toEqual(inspection);
    });

    expect(harness.requests.filter((request) => request.url === url)).toHaveLength(2);
  });
});
