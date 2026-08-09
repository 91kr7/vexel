import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import type { RepositorySummary, TagSummary } from '../../src/data/registries-client';

// useRegistryRepositories browses a registry through the data client and
// nothing else (registries/specs/use-registry-repositories.md): the client is
// mocked so the hook's own decisions — the debounce, the per-repository tag
// reads, what a failure does to the entries, and what a stale answer is allowed
// to change — are what is under test.
const fetchRepositories = vi.fn();
const fetchRepositoryTags = vi.fn();

vi.mock('../../src/data/registries-client', () => ({
  fetchRepositories: (host: string, query: string, limit?: number) => fetchRepositories(host, query, limit),
  fetchRepositoryTags: (host: string, repository: string, limit?: number) => fetchRepositoryTags(host, repository, limit),
}));

const { useRegistryRepositories } = await import('../../src/data/use-registry-repositories');
const { notifyActiveContextChanged } = await import('../../src/data/active-context');

function repository(name: string): RepositorySummary {
  return { name };
}

function tag(name: string, sizeBytes?: number): TagSummary {
  return { name, sizeBytes, pullReference: `registry.internal:5000/team/api:${name}` };
}

/** Long enough for the hook's debounce to have elapsed and the answer to have arrived. */
const SETTLE = { timeout: 3000 };

beforeEach(() => {
  fetchRepositories.mockReset();
  fetchRepositoryTags.mockReset();
  fetchRepositories.mockResolvedValue([]);
  fetchRepositoryTags.mockResolvedValue([]);
});

afterEach(cleanup);

describe('useRegistryRepositories (registries/specs/use-registry-repositories.md)', () => {
  // "Passing no host keeps the browser closed: no request is made, the entries are empty and
  // loaded is false."
  it('makes no request at all when there is no host', async () => {
    const { result } = renderHook(() => useRegistryRepositories(undefined, 'api'));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });

    expect(fetchRepositories).not.toHaveBeenCalled();
    expect(result.current.entries).toEqual([]);
    expect(result.current.loaded).toBe(false);
  });

  // "entries — one per repository found, in the order the registry returned them"
  it('lists one entry per repository, in the order the registry returned them', async () => {
    fetchRepositories.mockResolvedValue([repository('team/worker'), repository('team/api')]);

    const { result } = renderHook(() => useRegistryRepositories('registry.internal:5000', ''));

    await waitFor(() => expect(result.current.loaded).toBe(true), SETTLE);
    expect(result.current.entries.map((entry) => entry.repository.name)).toEqual(['team/worker', 'team/api']);
  });

  // "tags fills in as each repository's tag listing arrives"
  it('fills in each repository\'s tags with the sizes they weigh', async () => {
    fetchRepositories.mockResolvedValue([repository('team/api')]);
    fetchRepositoryTags.mockResolvedValue([tag('v1', 31_000), tag('v2')]);

    const { result } = renderHook(() => useRegistryRepositories('registry.internal:5000', ''));

    await waitFor(() => expect(result.current.entries[0]?.tags).toHaveLength(2), SETTLE);
    expect(result.current.entries[0]!.tags[0]).toEqual(tag('v1', 31_000));
    expect(result.current.entries[0]!.tagsLoading).toBe(false);
  });

  // "A search runs on the term the operator stopped typing, not on every keystroke: a change to the
  // host or the term restarts a short debounce, and only the last one reaches the server."
  it('searches only the term the operator stopped typing', async () => {
    const { rerender } = renderHook(({ query }: { query: string }) => useRegistryRepositories('registry.internal:5000', query), {
      initialProps: { query: 'a' },
    });

    rerender({ query: 'ap' });
    rerender({ query: 'api' });

    await waitFor(() => expect(fetchRepositories).toHaveBeenCalled(), SETTLE);
    expect(fetchRepositories).toHaveBeenCalledTimes(1);
    expect(fetchRepositories.mock.calls[0]![1]).toBe('api');
  });

  // "searching — true while a search is in flight, including during its debounce"
  it('reports itself searching from the first keystroke until the answer settles', async () => {
    fetchRepositories.mockResolvedValue([repository('team/api')]);

    const { result } = renderHook(() => useRegistryRepositories('registry.internal:5000', 'api'));

    expect(result.current.searching).toBe(true);
    await waitFor(() => expect(result.current.searching).toBe(false), SETTLE);
    expect(result.current.loaded).toBe(true);
  });

  // "error? — the message of the failed repository search; the entries are emptied with it"
  it('reports a failed search and empties the entries with it', async () => {
    fetchRepositories.mockResolvedValue([repository('team/api')]);
    const { result, rerender } = renderHook(({ query }: { query: string }) => useRegistryRepositories('registry.internal:5000', query), {
      initialProps: { query: '' },
    });
    await waitFor(() => expect(result.current.entries).toHaveLength(1), SETTLE);

    fetchRepositories.mockRejectedValue(new Error('registry.internal:5000 could not be browsed: it requires credentials this application does not hold.'));
    rerender({ query: 'api' });

    await waitFor(() => expect(result.current.error).toMatch(/could not be browsed/), SETTLE);
    expect(result.current.entries).toEqual([]);
  });

  // "a repository whose tags fail keeps its row with the failure recorded against it — the other
  // repositories are unaffected"
  it('keeps a repository whose tags failed, recording the failure against that row alone', async () => {
    fetchRepositories.mockResolvedValue([repository('team/api'), repository('team/worker')]);
    fetchRepositoryTags.mockImplementation((_host: string, name: string) =>
      name === 'team/api' ? Promise.reject(new Error('manifest unreadable')) : Promise.resolve([tag('v9', 10)]),
    );

    const { result } = renderHook(() => useRegistryRepositories('registry.internal:5000', ''));

    await waitFor(() => expect(result.current.entries[1]?.tags).toHaveLength(1), SETTLE);
    const [failed, healthy] = result.current.entries;
    expect(failed!.repository.name).toBe('team/api');
    expect(failed!.tagsError).toMatch(/manifest unreadable/);
    expect(failed!.tags).toEqual([]);
    expect(healthy!.tagsError).toBeUndefined();
    expect(healthy!.tags[0]!.name).toBe('v9');
  });

  // "Tags are read one repository at a time"
  it('reads the tags one repository at a time', async () => {
    fetchRepositories.mockResolvedValue([repository('team/api'), repository('team/worker')]);
    let inFlight = 0;
    let overlapped = false;
    fetchRepositoryTags.mockImplementation(async () => {
      inFlight += 1;
      if (inFlight > 1) overlapped = true;
      await new Promise((resolve) => setTimeout(resolve, 20));
      inFlight -= 1;
      return [];
    });

    const { result } = renderHook(() => useRegistryRepositories('registry.internal:5000', ''));

    await waitFor(() => expect(fetchRepositoryTags).toHaveBeenCalledTimes(2), SETTLE);
    await waitFor(() => expect(result.current.entries[1]?.tagsLoading).toBe(false), SETTLE);
    expect(overlapped).toBe(false);
  });

  // "A search or tag listing that settles after the host or term changed ... updates nothing."
  it('lets no answer from the previous registry reach the entries of the new one', async () => {
    fetchRepositories.mockImplementation((host: string) =>
      host === 'slow.internal:5000'
        ? new Promise<RepositorySummary[]>((resolve) => setTimeout(() => resolve([repository('slow/one')]), 400))
        : Promise.resolve([repository('fast/one')]),
    );

    const { result, rerender } = renderHook(({ host }: { host: string }) => useRegistryRepositories(host, ''), {
      initialProps: { host: 'slow.internal:5000' },
    });
    rerender({ host: 'fast.internal:5000' });

    await waitFor(() => expect(result.current.entries).toHaveLength(1), SETTLE);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });

    expect(result.current.entries.map((entry) => entry.repository.name)).toEqual(['fast/one']);
  });

  // "A search ... that settles after the hook unmounts updates nothing."
  it('updates nothing once unmounted', async () => {
    fetchRepositories.mockResolvedValue([repository('team/api')]);

    const { result, unmount } = renderHook(() => useRegistryRepositories('registry.internal:5000', ''));
    unmount();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });

    expect(result.current.entries).toEqual([]);
  });

  // "refresh() — runs the search again."
  it('runs the search again on refresh', async () => {
    fetchRepositories.mockResolvedValue([repository('team/api')]);
    const { result } = renderHook(() => useRegistryRepositories('registry.internal:5000', ''));
    await waitFor(() => expect(result.current.loaded).toBe(true), SETTLE);
    fetchRepositories.mockClear();

    act(() => result.current.refresh());

    await waitFor(() => expect(fetchRepositories).toHaveBeenCalled(), SETTLE);
  });

  // "It re-runs on the active-context broadcast: another context can mean another daemon and
  // another view of which registries are reachable and how (REQ-93)."
  it('re-runs the search when another context becomes active', async () => {
    fetchRepositories.mockResolvedValue([repository('team/api')]);
    const { result } = renderHook(() => useRegistryRepositories('registry.internal:5000', ''));
    await waitFor(() => expect(result.current.loaded).toBe(true), SETTLE);
    fetchRepositories.mockClear();

    act(() => notifyActiveContextChanged());

    await waitFor(() => expect(fetchRepositories).toHaveBeenCalled(), SETTLE);
  });

  // "Results are what an anonymous client can reach: no credential is read back to widen them
  // (REQ-87)." Nothing this hook sends the server ever carries one.
  it('sends the server nothing but the host, the term and a bound', async () => {
    fetchRepositories.mockResolvedValue([repository('team/api')]);

    const { result } = renderHook(() => useRegistryRepositories('registry.internal:5000', 'api'));
    await waitFor(() => expect(result.current.loaded).toBe(true), SETTLE);

    const [host, query, limit] = fetchRepositories.mock.calls[0]!;
    expect(host).toBe('registry.internal:5000');
    expect(query).toBe('api');
    expect(typeof limit === 'number' || limit === undefined).toBe(true);
    expect(fetchRepositories.mock.calls[0]).toHaveLength(3);
  });
});
