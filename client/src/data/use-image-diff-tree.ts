import { useCallback, useState } from 'react';
import { fetchImageDiffChildren, type ImageDiffEntry } from './image-diff-client';

export interface UseImageDiffTreeResult {
  childrenByPath: Map<string, ImageDiffEntry[]>;
  loadingPaths: Set<string>;
  errorsByPath: Map<string, string>;
  loadChildren: (path: string) => void;
  reset: () => void;
}

/**
 * Lazy per-directory queries over the last compared diff tree for a pair of
 * images (REQ-63): each `loadChildren(path)` call reads one directory level,
 * so a large diff is never fetched whole. `reset` clears every loaded level,
 * used when the diff view closes or a new comparison starts.
 */
export function useImageDiffTree(imageIdA: string | undefined, imageIdB: string | undefined): UseImageDiffTreeResult {
  const [childrenByPath, setChildrenByPath] = useState<Map<string, ImageDiffEntry[]>>(new Map());
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());
  const [errorsByPath, setErrorsByPath] = useState<Map<string, string>>(new Map());

  const reset = useCallback(() => {
    setChildrenByPath(new Map());
    setLoadingPaths(new Set());
    setErrorsByPath(new Map());
  }, []);

  const loadChildren = useCallback(
    (path: string) => {
      if (!imageIdA || !imageIdB) return;
      setLoadingPaths((prev) => new Set(prev).add(path));
      fetchImageDiffChildren(imageIdA, imageIdB, path || undefined)
        .then((entries) => {
          setChildrenByPath((prev) => new Map(prev).set(path, entries));
          setErrorsByPath((prev) => {
            if (!prev.has(path)) return prev;
            const next = new Map(prev);
            next.delete(path);
            return next;
          });
        })
        .catch((cause: Error) => {
          setErrorsByPath((prev) => new Map(prev).set(path, cause.message));
        })
        .finally(() => {
          setLoadingPaths((prev) => {
            const next = new Set(prev);
            next.delete(path);
            return next;
          });
        });
    },
    [imageIdA, imageIdB],
  );

  return { childrenByPath, loadingPaths, errorsByPath, loadChildren, reset };
}
