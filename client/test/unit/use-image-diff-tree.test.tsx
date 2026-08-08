import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useImageDiffTree } from '../../src/data/use-image-diff-tree';
import type { ImageDiffEntry } from '../../src/data/image-diff-client';

let fetchMock: ReturnType<typeof vi.fn>;
let nextResult: { ok: boolean; status: number; body: unknown };
/** Resolves the pending read only when a test asks for it, so `loadingPaths` is observable. */
let pending: Array<() => void>;
let holdResponses: boolean;

function entries(names: string[]): ImageDiffEntry[] {
  return names.map((name) => ({ path: name, name, kind: 'file', status: 'changed' }));
}

beforeEach(() => {
  nextResult = { ok: true, status: 200, body: { path: '', entries: entries(['a.txt', 'b.txt']) } };
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

describe('useImageDiffTree (plan-docker_management_app/REQ-63)', () => {
  // use-image-diff-tree.md — loadChildren is a no-op while imageIdA or imageIdB is undefined
  it('does nothing when loadChildren is called without both image ids', () => {
    const { result: onlyA } = renderHook(() => useImageDiffTree('img-a', undefined));
    act(() => onlyA.current.loadChildren(''));

    const { result: neither } = renderHook(() => useImageDiffTree(undefined, undefined));
    act(() => neither.current.loadChildren(''));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  // use-image-diff-tree.md — loadChildren(path) reads path's direct children, keyed by parent path
  it('reads the root children and stores them keyed by the empty path', async () => {
    const { result } = renderHook(() => useImageDiffTree('img-a', 'img-b'));

    act(() => result.current.loadChildren(''));

    await waitFor(() => expect(result.current.childrenByPath.get('')).toEqual(entries(['a.txt', 'b.txt'])));
    expect(String(fetchMock.mock.calls[0]![0])).toBe('/api/images/diff/entries?a=img-a&b=img-b');
  });

  // use-image-diff-tree.md — a non-root path is carried through to fetchImageDiffChildren
  it('reads a nested directory level by its path', async () => {
    nextResult = { ok: true, status: 200, body: { path: 'nested', entries: entries(['nested/c.txt']) } };
    const { result } = renderHook(() => useImageDiffTree('img-a', 'img-b'));

    act(() => result.current.loadChildren('nested'));

    await waitFor(() => expect(result.current.childrenByPath.get('nested')).toEqual(entries(['nested/c.txt'])));
    expect(String(fetchMock.mock.calls[0]![0])).toBe('/api/images/diff/entries?a=img-a&b=img-b&path=nested');
  });

  // use-image-diff-tree.md — loadingPaths carries the paths currently being read
  it('reports a path as loading while its read is in flight', async () => {
    holdResponses = true;
    const { result } = renderHook(() => useImageDiffTree('img-a', 'img-b'));

    act(() => result.current.loadChildren('nested'));
    await waitFor(() => expect(result.current.loadingPaths.has('nested')).toBe(true));

    await act(async () => releasePending());
    expect(result.current.loadingPaths.has('nested')).toBe(false);
  });

  // use-image-diff-tree.md — the last read failure's message per path, cleared on that path's next successful read
  it('reports a read failure for the path, then clears it on the next successful read', async () => {
    nextResult = { ok: false, status: 404, body: { error: 'These two images have not been compared yet.' } };
    const { result } = renderHook(() => useImageDiffTree('img-a', 'img-b'));
    act(() => result.current.loadChildren(''));
    await waitFor(() => expect(result.current.errorsByPath.get('')).toBe('These two images have not been compared yet.'));
    expect(result.current.childrenByPath.has('')).toBe(false);

    nextResult = { ok: true, status: 200, body: { path: '', entries: entries(['a.txt']) } };
    act(() => result.current.loadChildren(''));

    await waitFor(() => expect(result.current.childrenByPath.get('')).toEqual(entries(['a.txt'])));
    expect(result.current.errorsByPath.has('')).toBe(false);
  });

  // use-image-diff-tree.md — reset clears every loaded level, loading path and error
  it('clears every loaded level, loading path and error on reset', async () => {
    const { result } = renderHook(() => useImageDiffTree('img-a', 'img-b'));
    act(() => result.current.loadChildren(''));
    await waitFor(() => expect(result.current.childrenByPath.get('')).toBeDefined());

    act(() => result.current.reset());

    expect(result.current.childrenByPath.size).toBe(0);
    expect(result.current.loadingPaths.size).toBe(0);
    expect(result.current.errorsByPath.size).toBe(0);
  });
});
