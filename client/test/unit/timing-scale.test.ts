import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The client's own factor and the read that fetches it
 * (`timing-scale/specs/client-timing-scale.md`,
 * `timing-scale/specs/timing-scale-reader.md`;
 * plan-docker_management_app-timing_scale/REQ-3, REQ-9, REQ-10, REQ-12, REQ-21).
 *
 * The factor is module state adopted once per page, so every case that depends on
 * "before it is set" loads the module fresh — importing it a second time inside
 * one file would otherwise inherit whatever the previous case adopted, which is
 * the state a real page never has.
 */

type TimingScaleModule = typeof import('../../src/timing/timing-scale');

async function loadTimingScale(): Promise<TimingScaleModule> {
  vi.resetModules();
  return await import('../../src/timing/timing-scale');
}

describe('Client timing scale (timing-scale/specs/client-timing-scale.md)', () => {
  // REQ-9 — a page that never learns a factor runs at the shipped rhythm, so
  // every declared cadence is handed back untouched until the entry point speaks.
  it('leaves a declared cadence unchanged before the factor is set', async () => {
    const { cadence } = await loadTimingScale();
    expect(cadence(3000)).toBe(3000);
    expect(cadence(5000)).toBe(5000);
    expect(cadence(15000)).toBe(15000);
  });

  // REQ-10 — the declared value multiplied by the factor the client obtained,
  // for the three intervals the eleven client cadences are declared at.
  it('multiplies a declared cadence by the factor', async () => {
    const { cadence, setTimingScale } = await loadTimingScale();
    setTimingScale(0.2);
    expect(cadence(3000)).toBe(600);
    expect(cadence(5000)).toBe(1000);
    expect(cadence(15000)).toBe(3000);
  });

  // client-timing-scale.md — the result is a whole number of milliseconds.
  it('rounds a scaled cadence to a whole millisecond', async () => {
    const { cadence, setTimingScale } = await loadTimingScale();
    setTimingScale(0.2);
    expect(cadence(3333)).toBe(667);
    expect(Number.isInteger(cadence(1111))).toBe(true);
  });

  // REQ-3 — no cadence is ever shorter than a millisecond, whatever the factor.
  it('never returns a cadence below one millisecond', async () => {
    const { cadence, setTimingScale } = await loadTimingScale();
    setTimingScale(0.1);
    expect(cadence(2)).toBe(1);
    expect(cadence(0)).toBe(1);
  });

  // client-timing-scale.md — anything that is not a finite number above zero is
  // no factor at all, and the page falls back to its shipped rhythm rather than
  // to a cadence of zero or a NaN.
  it('falls back to 1 when the value offered is not a usable factor', async () => {
    for (const offered of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, undefined as unknown as number, 'fast' as unknown as number]) {
      const { cadence, setTimingScale } = await loadTimingScale();
      setTimingScale(offered);
      expect(cadence(3000), `setTimingScale(${String(offered)})`).toBe(3000);
    }
  });
});

describe('Timing-scale reader (timing-scale/specs/timing-scale-reader.md)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function answering(response: unknown): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn().mockResolvedValue(response as Response);
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  function jsonResponse(body: unknown, ok = true, status = 200): Response {
    return { ok, status, json: () => Promise.resolve(body) } as unknown as Response;
  }

  // REQ-8 — the factor the serving process reports is the one the page adopts,
  // read from the endpoint the browser's only source for it.
  it('reads the factor the endpoint answers', async () => {
    const fetchMock = answering(jsonResponse({ scale: 0.2 }));
    const { readTimingScale } = await import('../../src/timing/timing-scale-client');

    await expect(readTimingScale()).resolves.toBe(0.2);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/timing-scale');
  });

  // REQ-9 — a refusal leaves the page at 1 rather than in an error.
  it('gives 1 when the endpoint refuses', async () => {
    answering(jsonResponse({ scale: 0.2 }, false, 500));
    const { readTimingScale } = await import('../../src/timing/timing-scale-client');

    await expect(readTimingScale()).resolves.toBe(1);
  });

  // REQ-9 — a request that fails outright gives 1, and never rejects.
  it('gives 1 when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const { readTimingScale } = await import('../../src/timing/timing-scale-client');

    await expect(readTimingScale()).resolves.toBe(1);
  });

  // REQ-9 — a body carrying no usable number is no factor either.
  it('gives 1 when the body carries no usable number', async () => {
    const { readTimingScale } = await import('../../src/timing/timing-scale-client');
    for (const body of [{}, { scale: '0.2' }, { scale: 0 }, { scale: -1 }, { scale: Number.NaN }, { scale: null }, 'not json at all']) {
      answering(jsonResponse(body));
      await expect(readTimingScale(), JSON.stringify(body)).resolves.toBe(1);
    }
  });

  // REQ-21 — the wait is bounded and absolute: a server that accepts the request
  // and never answers leaves the page at 1 after 2 s, and the request is dropped.
  it('abandons a request that never answers after 2 s and gives 1', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        signal = init.signal ?? undefined;
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        });
      }),
    );
    const { readTimingScale } = await import('../../src/timing/timing-scale-client');

    const pending = readTimingScale();
    await vi.advanceTimersByTimeAsync(1999);
    expect(signal?.aborted, 'the request was abandoned before its 2 s were up').toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signal?.aborted, 'the request was still open after 2 s').toBe(true);
    await expect(pending).resolves.toBe(1);
  });
});
