import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchImageFilesystemChildren, imageFilesystemStreamUrl } from '../../src/data/image-filesystem-client';

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('imageFilesystemStreamUrl (images/specs/image-filesystem-client.md)', () => {
  // image-filesystem-client.md — the bare stream URL, no query, when force is not requested
  it('builds the bare stream URL when force is omitted', () => {
    expect(imageFilesystemStreamUrl('sha256:abc')).toBe('/api/images/sha256%3Aabc/filesystem/stream');
  });

  // image-filesystem-client.md — force=true bypasses the cache and re-extracts
  it('carries force=true when a re-extraction is requested', () => {
    expect(imageFilesystemStreamUrl('sha256:abc', true)).toBe('/api/images/sha256%3Aabc/filesystem/stream?force=true');
  });

  // image-filesystem-client.md — a falsy force still omits the query
  it('omits the query when force is explicitly false', () => {
    expect(imageFilesystemStreamUrl('sha256:abc', false)).toBe('/api/images/sha256%3Aabc/filesystem/stream');
  });
});

describe('fetchImageFilesystemChildren (images/specs/image-filesystem-client.md)', () => {
  // image-filesystem-client.md — direct children of path (root when omitted) from listImageFilesystemChildren
  it('reads the root children when no path is given', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ path: '', entries: [{ path: 'bin', name: 'bin', kind: 'directory' }] }),
    });

    const entries = await fetchImageFilesystemChildren('sha256:abc');

    expect(String(fetchMock.mock.calls[0]![0])).toBe('/api/images/sha256%3Aabc/filesystem/entries');
    expect(entries).toEqual([{ path: 'bin', name: 'bin', kind: 'directory' }]);
  });

  // image-filesystem-client.md — a given path is carried as a query parameter
  it('reads a directory level by its path', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ path: 'bin', entries: [{ path: 'bin/sh', name: 'sh', kind: 'file', sizeBytes: 512 }] }),
    });

    const entries = await fetchImageFilesystemChildren('sha256:abc', 'bin');

    expect(String(fetchMock.mock.calls[0]![0])).toBe('/api/images/sha256%3Aabc/filesystem/entries?path=bin');
    expect(entries).toEqual([{ path: 'bin/sh', name: 'sh', kind: 'file', sizeBytes: 512 }]);
  });

  // image-filesystem-client.md — throws (including on a 404, meaning not extracted yet) rather than returning an empty list
  it('throws with the server error message on a 404 (not extracted yet)', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: "This image's filesystem has not been extracted yet." }),
    });

    await expect(fetchImageFilesystemChildren('sha256:abc')).rejects.toThrow("This image's filesystem has not been extracted yet.");
  });

  // image-filesystem-client.md — without a usable error body, the HTTP status is reported instead
  it('throws with the HTTP status when the failed response carries no error message', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: () => Promise.reject(new Error('no body')) });

    await expect(fetchImageFilesystemChildren('sha256:abc')).rejects.toThrow('Request failed with HTTP 500');
  });
});
