import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchDiskUsage, pruneScope } from '../../src/data/system-client';

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const emptyBreakdown = { categories: [], totalReclaimableBytes: 0 };

describe('fetchDiskUsage (system/specs/system-client.md)', () => {
  // system-client.md — "fetchDiskUsage(): GET /api/system/disk-usage"
  it('reads the breakdown from the disk-usage endpoint', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(emptyBreakdown) });

    const breakdown = await fetchDiskUsage();

    expect(String(fetchMock.mock.calls[0]![0])).toBe('/api/system/disk-usage');
    expect(breakdown).toEqual(emptyBreakdown);
  });

  // system-client.md — "Both reject with an Error carrying the server's own error message on a
  // non-2xx response"
  it("rejects with the server's own message", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502, json: () => Promise.resolve({ error: 'daemon unreachable' }) });

    await expect(fetchDiskUsage()).rejects.toThrow('daemon unreachable');
  });

  // system-client.md — "and `Request failed with HTTP <status>` when the body carries none"
  it('rejects with the status when the failing response carries no message', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: () => Promise.reject(new Error('no body')) });

    await expect(fetchDiskUsage()).rejects.toThrow('Request failed with HTTP 500');
  });
});

describe('pruneScope (system/specs/system-client.md)', () => {
  // system-client.md — "pruneScope(scope): POST /api/system/prune with { scope }; a scope of one is
  // the per-category prune"
  it('posts the scope to the prune endpoint', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ categories: [], reclaimedBytes: 0 }) });

    await pruneScope(['stopped-containers', 'unused-volumes']);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe('/api/system/prune');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ scope: ['stopped-containers', 'unused-volumes'] });
  });

  // system-client.md — the same rejection contract applies to the prune
  it("rejects with the server's own message on a refused request", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'scope must be a non-empty array of known prune categories' }),
    });

    await expect(pruneScope([])).rejects.toThrow('scope must be a non-empty array of known prune categories');
  });
});
