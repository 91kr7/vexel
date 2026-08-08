import { useEffect, useRef, useState } from 'react';
import { searchImageFilesystem, type FilesystemSearchMatch } from './image-filesystem-client';

export interface UseImageFilesystemSearchResult {
  query: string;
  setQuery: (query: string) => void;
  matches: FilesystemSearchMatch[];
  totalMatches: number;
  truncated: boolean;
  activeMatchIndex: number;
  next: () => void;
  previous: () => void;
}

const DEBOUNCE_MS = 200;

/**
 * Name/path fragment search across an extracted tree (REQ-60): debounces
 * typing and cancels a still-in-flight search as soon as a fresher one is
 * requested, so a superseded response can never overwrite newer results.
 */
export function useImageFilesystemSearch(imageId: string | undefined): UseImageFilesystemSearchResult {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<FilesystemSearchMatch[]>([]);
  const [totalMatches, setTotalMatches] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const abortRef = useRef<AbortController | undefined>(undefined);

  useEffect(() => {
    setActiveMatchIndex(0);
    abortRef.current?.abort();
    if (!imageId || query.trim() === '') {
      setMatches([]);
      setTotalMatches(0);
      setTruncated(false);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    const timer = window.setTimeout(() => {
      searchImageFilesystem(imageId, query, controller.signal)
        .then((result) => {
          setMatches(result.matches);
          setTotalMatches(result.totalMatches);
          setTruncated(result.truncated);
        })
        .catch(() => {
          // an aborted (superseded) search is expected and silently discarded
        });
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [imageId, query]);

  function next() {
    if (matches.length === 0) return;
    setActiveMatchIndex((index) => (index + 1) % matches.length);
  }

  function previous() {
    if (matches.length === 0) return;
    setActiveMatchIndex((index) => (index - 1 + matches.length) % matches.length);
  }

  return { query, setQuery, matches, totalMatches, truncated, activeMatchIndex, next, previous };
}
