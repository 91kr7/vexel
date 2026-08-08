import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useImageFilesystemTree } from '../../src/data/use-image-filesystem-tree';
import type { FilesystemEntry } from '../../src/data/image-filesystem-client';

let fetchMock: ReturnType<typeof vi.fn>;
let nextResult: { ok: boolean; status: number; body: unknown };
/** Resolves the pending read only when a test asks for it, so `loadingPaths` is observable. */
let pending: Array<() => void>;
let holdResponses: boolean;

function entries(names: string[]): FilesystemEntry[] {
  return names.map((name) => ({ path: name, name, kind: 'file' }));
}

beforeEach(() => {
  nextResult = { ok: true, status: 200, body: { path: '', entries: entries(['bin', 'etc']) } };
  pending = [];
  holdResponses = false;
  fetchMock = vi.fn(
    () =>
      new Promise((resolve) => {
        const deliver = () => resolve({ ok: nextResult.ok, status: nextResult.status, json: () => Promise.resolve(nextResult.body) });
        if (holdResponses) pending.push(deliver);
        else deliver();
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function releasePending() {
  const waiting = pending;
  pending = [];
  waiting.forEach((deliver) => deliver());
}

describe('useImageFilesystemTree (plan-docker_management_app/REQ-52)', () => {
  // use-image-filesystem-tree.md — loadChildren is a no-op while imageId is undefined
  it('does nothing when loadChildren is called without an image id', () => {
    const { result } = renderHook(() => useImageFilesystemTree(undefined));

    act(() => result.current.loadChildren(''));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.childrenByPath.size).toBe(0);
  });

  // use-image-filesystem-tree.md — loadChildren(path) reads path's direct children, keyed by parent path
  it('reads the root children and stores them keyed by the empty path', async () => {
    const { result } = renderHook(() => useImageFilesystemTree('img-1'));

    act(() => result.current.loadChildren(''));

    await waitFor(() => expect(result.current.childrenByPath.get('')).toEqual(entries(['bin', 'etc'])));
    expect(String(fetchMock.mock.calls[0]![0])).toBe('/api/images/img-1/filesystem/entries');
  });

  // use-image-filesystem-tree.md — a non-root path is carried through to fetchImageFilesystemChildren
  it('reads a nested directory level by its path', async () => {
    nextResult = { ok: true, status: 200, body: { path: 'bin', entries: entries(['bin/sh']) } };
    const { result } = renderHook(() => useImageFilesystemTree('img-1'));

    act(() => result.current.loadChildren('bin'));

    await waitFor(() => expect(result.current.childrenByPath.get('bin')).toEqual(entries(['bin/sh'])));
    expect(String(fetchMock.mock.calls[0]![0])).toBe('/api/images/img-1/filesystem/entries?path=bin');
  });

  // use-image-filesystem-tree.md — loadingPaths carries the paths currently being read
  it('reports a path as loading while its read is in flight', async () => {
    holdResponses = true;
    const { result } = renderHook(() => useImageFilesystemTree('img-1'));

    act(() => result.current.loadChildren('bin'));
    await waitFor(() => expect(result.current.loadingPaths.has('bin')).toBe(true));

    await act(async () => releasePending());
    expect(result.current.loadingPaths.has('bin')).toBe(false);
  });

  // use-image-filesystem-tree.md — the last read failure's message per path
  it('reports a read failure for the path, keeping no stale children for it', async () => {
    nextResult = { ok: false, status: 404, body: { error: "This image's filesystem has not been extracted yet." } };
    const { result } = renderHook(() => useImageFilesystemTree('img-1'));

    act(() => result.current.loadChildren('bin'));

    await waitFor(() => expect(result.current.errorsByPath.get('bin')).toBe("This image's filesystem has not been extracted yet."));
    expect(result.current.childrenByPath.has('bin')).toBe(false);
  });

  // use-image-filesystem-tree.md — a path's error is cleared on that path's next successful read
  it('clears the failure for a path on its next successful read', async () => {
    nextResult = { ok: false, status: 500, body: { error: 'daemon unreachable' } };
    const { result } = renderHook(() => useImageFilesystemTree('img-1'));
    act(() => result.current.loadChildren('bin'));
    await waitFor(() => expect(result.current.errorsByPath.get('bin')).toBe('daemon unreachable'));

    nextResult = { ok: true, status: 200, body: { path: 'bin', entries: entries(['bin/sh']) } };
    act(() => result.current.loadChildren('bin'));

    await waitFor(() => expect(result.current.childrenByPath.get('bin')).toEqual(entries(['bin/sh'])));
    expect(result.current.errorsByPath.has('bin')).toBe(false);
  });

  // use-image-filesystem-tree.md — reset clears every loaded level, loading path and error
  it('clears every loaded level, loading path and error on reset', async () => {
    const { result } = renderHook(() => useImageFilesystemTree('img-1'));
    act(() => result.current.loadChildren(''));
    await waitFor(() => expect(result.current.childrenByPath.get('')).toBeDefined());

    act(() => result.current.reset());

    expect(result.current.childrenByPath.size).toBe(0);
    expect(result.current.loadingPaths.size).toBe(0);
    expect(result.current.errorsByPath.size).toBe(0);
  });
});
