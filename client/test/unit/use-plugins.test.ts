import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import type { DaemonEvent } from '../../src/data/event-stream';
import type { CliPlugin, DaemonPlugin, PluginsReading } from '../../src/data/plugins-client';

// usePlugins reads both inventories as one round and drives the management of
// the daemon ones (plugins/specs/use-plugins.md). The data client, the daemon
// event bus and the active-context broadcast are mocked, so the hook's own
// decisions are the only things under test: what it stores, what it refuses to
// store, what makes it re-read, and what it never caches.
const fetchPlugins = vi.fn();
const fetchPluginPrivileges = vi.fn();
const fetchPluginInspect = vi.fn();
const installPlugin = vi.fn();
const enablePlugin = vi.fn();
const disablePlugin = vi.fn();
const removePlugin = vi.fn();

let daemonListener: ((event: DaemonEvent) => void) | undefined;
let contextListener: (() => void) | undefined;

vi.mock('../../src/data/plugins-client', () => ({
  fetchPlugins: () => fetchPlugins(),
  fetchPluginPrivileges: (remote: string) => fetchPluginPrivileges(remote),
  fetchPluginInspect: (name: string) => fetchPluginInspect(name),
  installPlugin: (input: unknown) => installPlugin(input),
  enablePlugin: (name: string) => enablePlugin(name),
  disablePlugin: (name: string) => disablePlugin(name),
  removePlugin: (name: string) => removePlugin(name),
}));
vi.mock('../../src/data/event-stream', () => ({
  subscribeToDaemonEvents: (listener: (event: DaemonEvent) => void) => {
    daemonListener = listener;
    return () => {
      daemonListener = undefined;
    };
  },
}));
vi.mock('../../src/data/active-context', () => ({
  subscribeToActiveContextChange: (listener: () => void) => {
    contextListener = listener;
    return () => {
      contextListener = undefined;
    };
  },
}));

const { usePlugins } = await import('../../src/data/use-plugins');

function cliPlugin(name: string): CliPlugin {
  return { name, command: `docker ${name}`, availability: 'enabled' };
}

function daemonPlugin(name: string, enabled = false): DaemonPlugin {
  return { id: `id-${name}`, name, enabled, interfaceTypes: ['docker.volumedriver/1.0'], type: 'volume driver' };
}

function reading(cli: CliPlugin[], daemon: DaemonPlugin[]): PluginsReading {
  return { cli: { items: cli }, daemon: { items: daemon } };
}

function daemonEvent(type: string): DaemonEvent {
  return { id: '1', timestamp: new Date().toISOString(), type, action: 'install' };
}

beforeEach(() => {
  for (const spy of [fetchPlugins, fetchPluginPrivileges, fetchPluginInspect, installPlugin, enablePlugin, disablePlugin, removePlugin]) {
    spy.mockReset();
  }
  daemonListener = undefined;
  contextListener = undefined;
  fetchPlugins.mockResolvedValue(reading([], []));
});

describe('usePlugins (plugins/specs/use-plugins.md)', () => {
  // use-plugins.md — "cli, daemon — read as one round, so the two panels never show two different
  // moments of the same installation"
  it('reads both inventories as one round on mount and marks itself loaded', async () => {
    fetchPlugins.mockResolvedValue(reading([cliPlugin('compose')], [daemonPlugin('vieux/sshfs:latest')]));

    const { result } = renderHook(() => usePlugins());

    expect(result.current.cli.items).toEqual([]);
    expect(result.current.daemon.items).toEqual([]);
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(fetchPlugins).toHaveBeenCalledTimes(1);
    expect(result.current.cli.items.map((plugin) => plugin.name)).toEqual(['compose']);
    expect(result.current.daemon.items.map((plugin) => plugin.name)).toEqual(['vieux/sshfs:latest']);
    expect(result.current.error).toBeUndefined();
  });

  // use-plugins.md — "An answer that is not two listings is treated exactly like a failed read —
  // reported through error, never stored — so no panel is ever handed something without an items
  // array. One malformed side fails the whole round rather than half-updating the screen."
  it('reports a malformed side as a failed read and stores neither side', async () => {
    fetchPlugins.mockResolvedValue({ cli: { items: [cliPlugin('compose')] }, daemon: { items: 'not a list' } } as unknown as PluginsReading);

    const { result } = renderHook(() => usePlugins());

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.error).toBeTruthy();
    expect(Array.isArray(result.current.cli.items)).toBe(true);
    expect(Array.isArray(result.current.daemon.items)).toBe(true);
    expect(result.current.cli.items).toEqual([]);
    expect(result.current.daemon.items).toEqual([]);
  });

  // use-plugins.md — a failed read is reported through `error`
  it('reports a failed read without leaving a panel without its items array', async () => {
    fetchPlugins.mockRejectedValue(new Error('the daemon is unreachable'));

    const { result } = renderHook(() => usePlugins());

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.error).toBe('the daemon is unreachable');
    expect(result.current.cli.items).toEqual([]);
    expect(result.current.daemon.items).toEqual([]);
  });

  // use-plugins.md — "re-read on ... every plugin daemon event"; the poll is deliberately slow
  // because every change this hook drives emits one.
  it('re-reads on a plugin daemon event, and on nothing else', async () => {
    const { result } = renderHook(() => usePlugins());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    fetchPlugins.mockClear();

    await act(async () => {
      daemonListener?.(daemonEvent('container'));
      daemonListener?.(daemonEvent('volume'));
    });
    expect(fetchPlugins).not.toHaveBeenCalled();

    await act(async () => {
      daemonListener?.(daemonEvent('plugin'));
    });
    await waitFor(() => expect(fetchPlugins).toHaveBeenCalledTimes(1));
  });

  // use-plugins.md — "Another context means another daemon: the reading is dropped and re-read on
  // the active-context broadcast (REQ-93)."
  it('re-reads on the active-context broadcast', async () => {
    const { result } = renderHook(() => usePlugins());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    fetchPlugins.mockClear();

    await act(async () => {
      contextListener?.();
    });

    await waitFor(() => expect(fetchPlugins).toHaveBeenCalledTimes(1));
  });

  // use-plugins.md — "refresh()"
  it('re-reads on demand', async () => {
    const { result } = renderHook(() => usePlugins());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    fetchPlugins.mockClear();

    await act(async () => {
      result.current.refresh();
    });

    await waitFor(() => expect(fetchPlugins).toHaveBeenCalledTimes(1));
  });

  // use-plugins.md — "readPrivileges(remote) — what the reference asks for; installs nothing and
  // stores nothing"; "The privileges a reference asks for are never cached: they are the subject of
  // a decision taken now, and a stale copy could be granted against a plugin that has since changed
  // what it asks for." (REQ-99)
  it('reads the privileges afresh every time, storing nothing and installing nothing', async () => {
    const first = [{ name: 'network', values: ['host'] }];
    const second = [{ name: 'network', values: ['host'] }, { name: 'mount', values: ['/'] }];
    fetchPluginPrivileges.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const { result } = renderHook(() => usePlugins());
    await waitFor(() => expect(result.current.loaded).toBe(true));

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
    expect(fetchPluginPrivileges).toHaveBeenCalledTimes(2);
    expect(installPlugin).not.toHaveBeenCalled();
    expect(result.current.daemon.items).toEqual([]);
  });

  // use-plugins.md — "install(input), enable(name), disable(name), remove(name) — each re-reads the
  // inventories on success"
  it('re-reads the inventories after every successful state change', async () => {
    installPlugin.mockResolvedValue(daemonPlugin('vieux/sshfs:latest'));
    enablePlugin.mockResolvedValue(daemonPlugin('vieux/sshfs:latest', true));
    disablePlugin.mockResolvedValue(daemonPlugin('vieux/sshfs:latest'));
    removePlugin.mockResolvedValue(undefined);
    const { result } = renderHook(() => usePlugins());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    for (const change of [
      () => result.current.install({ remote: 'vieux/sshfs:latest', grantedPrivileges: [] }),
      () => result.current.enable('vieux/sshfs:latest'),
      () => result.current.disable('vieux/sshfs:latest'),
      () => result.current.remove('vieux/sshfs:latest'),
    ]) {
      fetchPlugins.mockClear();
      await act(async () => {
        await change();
      });
      await waitFor(() => expect(fetchPlugins).toHaveBeenCalledTimes(1));
    }
  });

  // use-plugins.md — "failures propagate to the caller (never swallowed) so the screen can report them"
  it('lets every failure through to the caller', async () => {
    installPlugin.mockRejectedValue(new Error('nothing has been installed'));
    enablePlugin.mockRejectedValue(new Error('the plugin refused to come up'));
    disablePlugin.mockRejectedValue(new Error('the plugin is in use'));
    removePlugin.mockRejectedValue(new Error('the plugin is enabled'));
    fetchPluginInspect.mockRejectedValue(new Error('no such plugin'));
    const { result } = renderHook(() => usePlugins());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await expect(result.current.install({ remote: 'x', grantedPrivileges: [] })).rejects.toThrow('nothing has been installed');
    await expect(result.current.enable('x')).rejects.toThrow('the plugin refused to come up');
    await expect(result.current.disable('x')).rejects.toThrow('the plugin is in use');
    await expect(result.current.remove('x')).rejects.toThrow('the plugin is enabled');
    await expect(result.current.inspect('x')).rejects.toThrow('no such plugin');
  });

  // use-plugins.md — "inspect(name) — read on demand, not held"
  it('reads an inspection on demand without holding it', async () => {
    const inspection = { ...daemonPlugin('vieux/sshfs:latest'), mounts: [], devices: [], capabilities: [], env: [], raw: {} };
    fetchPluginInspect.mockResolvedValue(inspection);
    const { result } = renderHook(() => usePlugins());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await expect(result.current.inspect('vieux/sshfs:latest')).resolves.toEqual(inspection);
      await expect(result.current.inspect('vieux/sshfs:latest')).resolves.toEqual(inspection);
    });

    expect(fetchPluginInspect).toHaveBeenCalledTimes(2);
  });
});
