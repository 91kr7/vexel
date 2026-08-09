import { afterEach, describe, expect, it, vi } from 'vitest';
import { containerStatsStreamUrl, fetchContainerProcesses } from '../../src/data/container-stats-client';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('containerStatsStreamUrl (REQ-32)', () => {
  // container-stats-client.md — the stats stream URL of a container
  it('builds the stats stream URL of the container', () => {
    expect(containerStatsStreamUrl('container-1')).toBe('/api/containers/container-1/stats/stream');
  });
});

describe('fetchContainerProcesses (REQ-33)', () => {
  // container-stats-client.md — the process listing is read from the container's processes endpoint
  it('reads the listing from the container processes endpoint', async () => {
    const payload = { titles: ['PID', 'USER', 'CMD'], processes: [{ pid: 1, user: 'root', command: 'postgres' }] };
    // The parameter is declared so the recorded call keeps the requested URL:
    // a zero-argument implementation types `mock.calls` as empty tuples.
    const fetchMock = vi.fn((_input: RequestInfo | URL) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(payload) }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchContainerProcesses('container-1')).resolves.toEqual(payload);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/containers/container-1/processes');
  });

  // container-stats-client.md — a failure carrying the server's message rejects with that message
  it('rejects with the server-reported message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 409, json: () => Promise.resolve({ error: 'Container container-1 is not running' }) })),
    );

    await expect(fetchContainerProcesses('container-1')).rejects.toThrow('Container container-1 is not running');
  });

  // container-stats-client.md — a failure with no message rejects with the HTTP status
  it('rejects with the HTTP status when the failure carries no message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 503, json: () => Promise.reject(new Error('no body')) })),
    );

    await expect(fetchContainerProcesses('container-1')).rejects.toThrow(/503/);
  });
});
