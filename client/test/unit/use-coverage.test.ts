import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { BaselineReport } from '../../src/data/system-client';

// useCoverage joins the coverage map — local data that never travels — with the
// baseline read from the server (use-coverage.md). The data client and the
// active-context broadcast are mocked, so what is under test is only the hook's
// own decisions: what it stores, what it refuses to store, what a failed read
// leaves behind, and when it reads again.
const fetchCoverageBaseline = vi.fn();
let contextListener: (() => void) | undefined;

vi.mock('../../src/data/system-client', () => ({
  fetchCoverageBaseline: () => fetchCoverageBaseline(),
}));
vi.mock('../../src/data/active-context', () => ({
  subscribeToActiveContextChange: (listener: () => void) => {
    contextListener = listener;
    return () => {
      contextListener = undefined;
    };
  },
}));

const { useCoverage } = await import('../../src/data/use-coverage');
const { coverageAreas, countCoverage } = await import('../../src/coverage/coverage-map');

function report(overrides: Partial<BaselineReport> = {}): BaselineReport {
  return {
    declared: { engineApiVersion: '1.43', cliVersion: '24.0' },
    daemon: { version: '24.0.7', apiVersion: '1.43', minApiVersion: '1.24' },
    comparison: 'match',
    ...overrides,
  };
}

beforeEach(() => {
  fetchCoverageBaseline.mockReset();
  fetchCoverageBaseline.mockResolvedValue(report());
  contextListener = undefined;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useCoverage (coverage/specs/use-coverage.md)', () => {
  // use-coverage.md — "areas — the declared coverage map, always the full declaration"; "The map
  // never fails and never waits"
  it('offers the whole map and its counts before any read has settled', () => {
    fetchCoverageBaseline.mockReturnValue(new Promise<BaselineReport>(() => undefined));

    const { result } = renderHook(() => useCoverage());

    expect(result.current.loaded).toBe(false);
    expect(result.current.areas).toEqual(coverageAreas);
    expect(result.current.counts).toEqual(countCoverage(coverageAreas));
  });

  // use-coverage.md — "baseline — the last successfully read BaselineReport; undefined until the
  // first read succeeds"; "loaded — true once a baseline read has settled"
  it('reads the baseline on mount and marks itself loaded', async () => {
    const { result } = renderHook(() => useCoverage());

    expect(result.current.baseline).toBeUndefined();
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(fetchCoverageBaseline).toHaveBeenCalledTimes(1);
    expect(result.current.baseline).toEqual(report());
    expect(result.current.error).toBeUndefined();
  });

  // use-coverage.md — "A daemon that cannot be reached is not a failed read: the server answers with
  // the declared baseline and the reason the daemon half is missing, and that answer is stored like
  // any other"
  it('stores an answer whose daemon half is missing, without calling it a failure', async () => {
    const unreachable = report({
      daemon: undefined,
      daemonUnavailableDetail: 'Connection refused by the Docker endpoint',
      comparison: 'unknown',
    });
    fetchCoverageBaseline.mockResolvedValue(unreachable);

    const { result } = renderHook(() => useCoverage());

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.baseline).toEqual(unreachable);
    expect(result.current.error).toBeUndefined();
  });

  // use-coverage.md — "error — the failure message of the last read"
  it('settles with the failure message when the read fails', async () => {
    fetchCoverageBaseline.mockRejectedValue(new Error('Request failed with HTTP 500'));

    const { result } = renderHook(() => useCoverage());

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.error).toBe('Request failed with HTTP 500');
    expect(result.current.baseline).toBeUndefined();
    // The map is readable regardless of what the server did.
    expect(result.current.areas).toEqual(coverageAreas);
  });

  // use-coverage.md — "A payload that is not the shape the baseline endpoint promises (no declared,
  // a non-string version, an unknown comparison) is treated as a failed read: it is reported
  // through error and never stored"
  it.each<[string, unknown]>([
    ['nothing at all', undefined],
    ['no declared half', { comparison: 'match' }],
    ['a declared half that is not an object', { declared: 'v1.43', comparison: 'match' }],
    ['a non-string declared Engine API version', { declared: { engineApiVersion: 1.43, cliVersion: '24.0' }, comparison: 'match' }],
    ['a missing declared CLI version', { declared: { engineApiVersion: '1.43' }, comparison: 'match' }],
    ['no comparison', { declared: { engineApiVersion: '1.43', cliVersion: '24.0' } }],
    ['an unknown comparison', { declared: { engineApiVersion: '1.43', cliVersion: '24.0' }, comparison: 'daemon-different' }],
    [
      'a daemon half with a non-string version',
      { declared: { engineApiVersion: '1.43', cliVersion: '24.0' }, daemon: { version: 24, apiVersion: '1.43' }, comparison: 'match' },
    ],
    [
      'a daemon half with no Engine API version',
      { declared: { engineApiVersion: '1.43', cliVersion: '24.0' }, daemon: { version: '24.0.7' }, comparison: 'match' },
    ],
  ])('refuses to store a payload with %s, reporting it as a failed read', async (_description, payload) => {
    fetchCoverageBaseline.mockResolvedValue(payload);

    const { result } = renderHook(() => useCoverage());

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.baseline).toBeUndefined();
    expect(result.current.error?.length ?? 0).toBeGreaterThan(0);
  });

  // use-coverage.md — "A failed read leaves the last successfully read baseline in place rather than
  // blanking it"
  it('keeps the last good baseline beside the error when a later read fails', async () => {
    const { result } = renderHook(() => useCoverage());
    await waitFor(() => expect(result.current.baseline).toEqual(report()));

    fetchCoverageBaseline.mockRejectedValue(new Error('daemon unreachable'));
    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.error).toBe('daemon unreachable'));
    expect(result.current.baseline).toEqual(report());
  });

  // use-coverage.md — "error ... cleared by the next successful one"
  it('clears the error and replaces the baseline on the next successful read', async () => {
    fetchCoverageBaseline.mockRejectedValueOnce(new Error('daemon unreachable'));
    const { result } = renderHook(() => useCoverage());
    await waitFor(() => expect(result.current.error).toBe('daemon unreachable'));

    const newer = report({ daemon: { version: '27.0.0', apiVersion: '1.48' }, comparison: 'daemon-newer' });
    fetchCoverageBaseline.mockResolvedValue(newer);
    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.baseline).toEqual(newer));
    expect(result.current.error).toBeUndefined();
  });

  // use-coverage.md — "refresh() — re-reads the baseline"
  it('re-reads the baseline when asked to refresh', async () => {
    const { result } = renderHook(() => useCoverage());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => result.current.refresh());

    await waitFor(() => expect(fetchCoverageBaseline).toHaveBeenCalledTimes(2));
  });

  // use-coverage.md — "The baseline is re-read on every active-context switch: the daemon half
  // belongs to a daemon, not to the screen (REQ-93)"
  it('re-reads when the active context changes', async () => {
    const { result } = renderHook(() => useCoverage());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    const otherDaemon = report({ daemon: { version: '20.10.24', apiVersion: '1.41' }, comparison: 'daemon-older' });
    fetchCoverageBaseline.mockResolvedValue(otherDaemon);
    act(() => contextListener?.());

    await waitFor(() => expect(result.current.baseline).toEqual(otherDaemon));
  });

  // use-coverage.md — "It does not poll — neither the declared baseline nor a daemon's version
  // changes while a screen is open"
  it('never re-reads on its own while nothing happens', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCoverage());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.loaded).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300_000);
    });

    expect(fetchCoverageBaseline).toHaveBeenCalledTimes(1);
  });

  // use-coverage.md — "a read that settles after the hook is unmounted updates nothing"
  it('applies nothing from a read that settles after the hook is unmounted', async () => {
    let settle: (value: BaselineReport) => void = () => undefined;
    fetchCoverageBaseline.mockReturnValue(new Promise<BaselineReport>((resolve) => (settle = resolve)));
    const { result, unmount } = renderHook(() => useCoverage());

    unmount();
    await act(async () => {
      settle(report());
    });

    expect(result.current.baseline).toBeUndefined();
    expect(result.current.loaded).toBe(false);
  });
});
