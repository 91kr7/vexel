import { useCallback, useEffect, useState } from 'react';
import { subscribeToActiveContextChange } from './active-context';
import { fetchRepositories, fetchRepositoryTags, type RepositorySummary, type TagSummary } from './registries-client';

const REPOSITORY_LIMIT = 10;
const TAG_LIMIT = 6;
/** A search runs on the term the operator stopped typing, not on every keystroke. */
const DEBOUNCE_MS = 350;

export interface RepositoryEntry {
  repository: RepositorySummary;
  tags: TagSummary[];
  tagsLoading: boolean;
  tagsError?: string;
}

export interface UseRegistryRepositoriesResult {
  entries: RepositoryEntry[];
  /** True once a search has settled for the current registry and term. */
  loaded: boolean;
  searching: boolean;
  error?: string;
  refresh: () => void;
}

/**
 * Browses the repositories of `host` matching `query`, then the tags of each
 * one with the size it weighs (REQ-86). Passing no host keeps the browser
 * closed. Results are those an anonymous client can reach: no credential is
 * read back to widen them (REQ-87).
 */
export function useRegistryRepositories(host: string | undefined, query: string): UseRegistryRepositoriesResult {
  const [entries, setEntries] = useState<RepositoryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  // Another context can mean another daemon, and with it another view of which
  // registries are reachable and how (REQ-93).
  useEffect(() => subscribeToActiveContextChange(refresh), [refresh]);

  useEffect(() => {
    if (!host) {
      setEntries([]);
      setLoaded(false);
      setSearching(false);
      setError(undefined);
      return;
    }

    let cancelled = false;
    setSearching(true);

    const timer = window.setTimeout(() => {
      fetchRepositories(host, query, REPOSITORY_LIMIT)
        .then(async (list) => {
          if (cancelled) return;
          setError(undefined);
          setEntries(list.map((repository) => ({ repository, tags: [], tagsLoading: true })));
          setSearching(false);
          setLoaded(true);
          // One repository's tags at a time: a registry answers a tag listing
          // per repository, and a burst of them is how a browse turns into a
          // rate-limited refusal.
          for (const repository of list) {
            try {
              const tags = await fetchRepositoryTags(host, repository.name, TAG_LIMIT);
              if (cancelled) return;
              setEntries((current) =>
                current.map((entry) => (entry.repository.name === repository.name ? { ...entry, tags, tagsLoading: false } : entry)),
              );
            } catch (cause) {
              if (cancelled) return;
              setEntries((current) =>
                current.map((entry) =>
                  entry.repository.name === repository.name ? { ...entry, tagsLoading: false, tagsError: (cause as Error).message } : entry,
                ),
              );
            }
          }
        })
        .catch((cause: Error) => {
          if (cancelled) return;
          setEntries([]);
          setError(cause.message);
          setSearching(false);
          setLoaded(true);
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [host, query, reloadToken]);

  return { entries, loaded, searching, error, refresh };
}
