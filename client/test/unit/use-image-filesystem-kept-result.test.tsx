import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useImageFilesystemKeptResult } from '../../src/data/use-image-filesystem-kept-result';
import type { FilesystemExtractionResult } from '../../src/data/image-filesystem-client';

// use-image-filesystem-kept-result.md — the free read the filesystem browser's two shapes are
// decided by, before anything is raised
// (plan-docker_management_app-filesystem_browse_direct/REQ-4, REQ-6, REQ-14, REQ-16).

let fetchMock: ReturnType<typeof vi.fn>;
/** The answer each image id is given, and whether its response is held back so the wait is observable. */
let answersById: Record<string, { ok: boolean; status: number; body: unknown }>;
let pending: Array<() => void>;
let holdResponses: boolean;

function summaryOf(imageId: string, entryCount = 3): FilesystemExtractionResult {
  return { imageId, entryCount, fromCache: true, refusedCount: 0 };
}

beforeEach(() => {
  answersById = {};
  pending = [];
  holdResponses = false;
  fetchMock = vi.fn((input: string) => {
    const url = String(input);
    const id = decodeURIComponent(url.replace('/api/images/', '').replace('/filesystem/kept', ''));
    const answer = answersById[id] ?? { ok: true, status: 200, body: { kept: false } };
    return new Promise((resolve) => {
      const deliver = () => resolve({ ok: answer.ok, status: answer.status, json: () => Promise.resolve(answer.body) });
      if (holdResponses) pending.push(deliver);
      else deliver();
    });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function releasePending() {
  const waiting = pending;
  pending = [];
  await act(async () => {
    waiting.forEach((deliver) => deliver());
  });
}

describe('useImageFilesystemKeptResult (images/specs/use-image-filesystem-kept-result.md)', () => {
  // use-image-filesystem-kept-result.md — passing `undefined` reads nothing at all.
  it('reads nothing at all without an image id', () => {
    const { result } = renderHook(() => useImageFilesystemKeptResult(undefined));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.answered).toBe(false);
    expect(result.current.summary).toBeUndefined();
  });

  // REQ-6 — while the answer is in flight the caller has an in-flight state to show an actionless
  // indication from, and no answer yet to act on.
  it('reports the read as in flight, with no answer yet, until it comes back', async () => {
    holdResponses = true;
    answersById['img-1'] = { ok: true, status: 200, body: { kept: true, summary: summaryOf('img-1') } };
    const { result } = renderHook(() => useImageFilesystemKeptResult('img-1'));

    await waitFor(() => expect(result.current.loading).toBe(true));
    expect(result.current.answered).toBe(false);
    expect(result.current.summary).toBeUndefined();

    await releasePending();

    await waitFor(() => expect(result.current.answered).toBe(true));
    expect(result.current.loading).toBe(false);
  });

  // REQ-4, REQ-20 — the kept result's own figures, which is why the read answers with a summary
  // rather than a boolean.
  it('answers with the kept result and its figures', async () => {
    answersById['img-1'] = { ok: true, status: 200, body: { kept: true, summary: summaryOf('img-1', 42) } };
    const { result } = renderHook(() => useImageFilesystemKeptResult('img-1'));

    await waitFor(() => expect(result.current.answered).toBe(true));
    expect(result.current.summary).toEqual(summaryOf('img-1', 42));
    expect(String(fetchMock.mock.calls[0]![0])).toBe('/api/images/img-1/filesystem/kept');
  });

  // `answered && summary === undefined` is the "nothing kept" answer, and is what tells the caller
  // to raise the cost warning (REQ-2).
  it('answers "nothing kept" for an image whose content was never extracted', async () => {
    answersById['img-1'] = { ok: true, status: 200, body: { kept: false } };
    const { result } = renderHook(() => useImageFilesystemKeptResult('img-1'));

    await waitFor(() => expect(result.current.answered).toBe(true));
    expect(result.current.summary).toBeUndefined();
  });

  // REQ-14 — a read that cannot be answered is not a kept result: it answers exactly like "nothing
  // kept", so the flow degrades to the cost warning rather than to a dead end.
  it('answers a failed read exactly like "nothing kept"', async () => {
    answersById['img-1'] = { ok: false, status: 502, body: { error: 'the daemon is unreachable' } };
    const { result } = renderHook(() => useImageFilesystemKeptResult('img-1'));

    await waitFor(() => expect(result.current.answered).toBe(true));
    expect(result.current.summary).toBeUndefined();
    expect(result.current.loading).toBe(false);
  });

  // REQ-14 — `discard` reports the kept result as no longer usable: the summary goes, the answer
  // stays answered, so the caller lands on the cost warning and not back on a wait.
  it('drops the summary on discard while staying answered', async () => {
    answersById['img-1'] = { ok: true, status: 200, body: { kept: true, summary: summaryOf('img-1') } };
    const { result } = renderHook(() => useImageFilesystemKeptResult('img-1'));
    await waitFor(() => expect(result.current.summary).toBeDefined());

    act(() => result.current.discard());

    expect(result.current.summary).toBeUndefined();
    expect(result.current.answered).toBe(true);
  });

  // use-image-filesystem-kept-result.md — a change of image id re-reads, discarding the previous
  // image's answer: REQ-13's content keying is worth nothing if the previous image's answer stays.
  it('re-reads on a change of image id, discarding the previous image answer', async () => {
    answersById['img-1'] = { ok: true, status: 200, body: { kept: true, summary: summaryOf('img-1') } };
    answersById['img-2'] = { ok: true, status: 200, body: { kept: false } };
    const { result, rerender } = renderHook((imageId: string) => useImageFilesystemKeptResult(imageId), {
      initialProps: 'img-1',
    });
    await waitFor(() => expect(result.current.summary).toEqual(summaryOf('img-1')));

    rerender('img-2');

    expect(result.current.summary).toBeUndefined();
    await waitFor(() => expect(result.current.answered).toBe(true));
    expect(result.current.summary).toBeUndefined();
    expect(String(fetchMock.mock.calls[1]![0])).toBe('/api/images/img-2/filesystem/kept');
  });

  // use-image-filesystem-kept-result.md — a superseded read never overwrites a fresher one: the
  // answer of an image that is no longer the hook's own is dropped, however late it arrives.
  it('drops the answer of an image that is no longer its own', async () => {
    holdResponses = true;
    answersById['img-1'] = { ok: true, status: 200, body: { kept: true, summary: summaryOf('img-1', 11) } };
    answersById['img-2'] = { ok: true, status: 200, body: { kept: true, summary: summaryOf('img-2', 22) } };
    const { result, rerender } = renderHook((imageId: string) => useImageFilesystemKeptResult(imageId), {
      initialProps: 'img-1',
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    rerender('img-2');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    // Both answers arrive now, the superseded one among them.
    await releasePending();

    await waitFor(() => expect(result.current.summary).toEqual(summaryOf('img-2', 22)));
  });
});
