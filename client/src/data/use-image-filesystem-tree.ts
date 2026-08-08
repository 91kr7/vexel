import { useCallback, useState } from 'react';
import { fetchImageFilesystemChildren, type FilesystemEntry } from './image-filesystem-client';

export interface UseImageFilesystemTreeResult {
  childrenByPath: Map<string, FilesystemEntry[]>;
  loadingPaths: Set<string>;
  errorsByPath: Map<string, string>;
  loadChildren: (path: string) => void;
  reset: () => void;
}

/**
 * Lazy per-directory queries over an already-extracted image filesystem
 * (REQ-52): each `loadChildren(path)` call reads one directory level, so a
 * large tree is never fetched whole. `reset` clears every loaded level,
 * used when the browser is closed or a re-extraction starts.
 */
export function useImageFilesystemTree(imageId: string | undefined): UseImageFilesystemTreeResult {
  const [childrenByPath, setChildrenByPath] = useState<Map<string, FilesystemEntry[]>>(new Map());
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());
  const [errorsByPath, setErrorsByPath] = useState<Map<string, string>>(new Map());

  const reset = useCallback(() => {
    setChildrenByPath(new Map());
    setLoadingPaths(new Set());
    setErrorsByPath(new Map());
  }, []);

  const loadChildren = useCallback(
    (path: string) => {
      if (!imageId) return;
      setLoadingPaths((prev) => new Set(prev).add(path));
      fetchImageFilesystemChildren(imageId, path || undefined)
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
    [imageId],
  );

  return { childrenByPath, loadingPaths, errorsByPath, loadChildren, reset };
}
