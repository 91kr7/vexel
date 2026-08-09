import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import type { DaemonInfo } from '../../src/data/contexts-client';

// useDaemonInfo reads the daemon information of the active context and re-reads
// it on every switch (contexts/specs/use-daemon-info.md). The data client is
// mocked; the active-context broadcast is the real one, announced as the
// contexts hook would once the server confirms a switch.
const fetchDaemonInfo = vi.fn();

vi.mock('../../src/data/contexts-client', () => ({
  fetchDaemonInfo: () => fetchDaemonInfo(),
}));

const { useDaemonInfo } = await import('../../src/data/use-daemon-info');
const { notifyActiveContextChanged } = await import('../../src/data/active-context');

function daemonInfo(overrides: Partial<DaemonInfo> = {}): DaemonInfo {
  return {
    version: '29.2.1',
    apiVersion: '1.53',
    storageDriver: 'overlayfs',
    cgroupDriver: 'cgroupfs',
    operatingSystem: 'Docker Desktop',
    osType: 'linux',
    kernelVersion: '6.12.69-linuxkit',
    architecture: 'aarch64',
    rootDirectory: '/var/lib/docker',
    containers: { total: 3, running: 1, paused: 0, stopped: 2 },
    ...overrides,
  };
}

beforeEach(() => {
  fetchDaemonInfo.mockReset();
});

// Every mounted instance subscribes to the active-context broadcast, so an instance
// left behind by an earlier test would re-read for it too: nothing outlives its test.
afterEach(cleanup);

describe('useDaemonInfo (contexts/specs/use-daemon-info.md)', () => {
  // "info: read once on mount"; "loaded turns true once the first attempt has settled"
  it('reads the daemon information on mount and marks itself loaded', async () => {
    fetchDaemonInfo.mockResolvedValue(daemonInfo());

    const { result } = renderHook(() => useDaemonInfo());

    expect(result.current.info).toBeUndefined();
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.info?.version).toBe('29.2.1');
  });

  // "again on refresh()"
  it('reads the daemon information again on refresh', async () => {
    fetchDaemonInfo.mockResolvedValue(daemonInfo());
    const { result } = renderHook(() => useDaemonInfo());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    fetchDaemonInfo.mockResolvedValue(daemonInfo({ version: '30.0.0' }));

    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.info?.version).toBe('30.0.0'));
  });

  // "and again on every active-context switch" (REQ-93)
  it('re-reads the daemon information when another context becomes the active one', async () => {
    fetchDaemonInfo.mockResolvedValue(daemonInfo({ version: '29.2.1' }));
    const { result } = renderHook(() => useDaemonInfo());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    fetchDaemonInfo.mockResolvedValue(daemonInfo({ version: '25.0.3' }));

    act(() => notifyActiveContextChanged());

    await waitFor(() => expect(result.current.info?.version).toBe('25.0.3'));
  });

  // "loaded turns true once the first attempt has settled, whether it succeeded or not"
  it('settles loaded even when the first reading fails', async () => {
    fetchDaemonInfo.mockRejectedValue(new Error('daemon unreachable'));

    const { result } = renderHook(() => useDaemonInfo());

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.error).toBe('daemon unreachable');
  });

  // "error carries the server's own message when the reading fails; info is cleared in that case,
  // so a failed reading never leaves the previous daemon's numbers on screen"
  it('clears the previous readings when a later reading fails', async () => {
    fetchDaemonInfo.mockResolvedValue(daemonInfo());
    const { result } = renderHook(() => useDaemonInfo());
    await waitFor(() => expect(result.current.info?.version).toBe('29.2.1'));

    fetchDaemonInfo.mockRejectedValue(new Error('daemon unreachable'));
    act(() => notifyActiveContextChanged());

    await waitFor(() => expect(result.current.error).toBe('daemon unreachable'));
    expect(result.current.info).toBeUndefined();
  });
});
