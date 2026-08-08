import { useEffect, useState } from 'react';
import {
  fetchImageFilesystemEntryContent,
  fetchImageFilesystemEntryMetadata,
  type FilesystemContentMode,
  type FilesystemContentResult,
  type FilesystemEntryMetadata,
} from './image-filesystem-client';

export interface UseImageFilesystemEntryMetadataResult {
  metadata: FilesystemEntryMetadata | undefined;
  loading: boolean;
  error: string | undefined;
}

/** Reads one entry's metadata (REQ-58), re-reading whenever `imageId`/`path` changes. */
export function useImageFilesystemEntryMetadata(imageId: string | undefined, path: string | undefined): UseImageFilesystemEntryMetadataResult {
  const [metadata, setMetadata] = useState<FilesystemEntryMetadata>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    setMetadata(undefined);
    setError(undefined);
    if (!imageId || path === undefined) return;
    let cancelled = false;
    setLoading(true);
    fetchImageFilesystemEntryMetadata(imageId, path)
      .then((result) => {
        if (!cancelled) setMetadata(result);
      })
      .catch((cause: Error) => {
        if (!cancelled) setError(cause.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [imageId, path]);

  return { metadata, loading, error };
}

export interface UseImageFilesystemEntryContentResult {
  content: FilesystemContentResult | undefined;
  loading: boolean;
  /** The refusal or failure message (REQ-59, REQ-62), e.g. a directory or symlink with nothing to preview. */
  error: string | undefined;
}

/**
 * Reads a file's preview content (REQ-59), re-reading whenever
 * `imageId`/`path`/`mode` changes; `mode` overrides auto-detection when set.
 * `undefined` `path` fetches nothing.
 */
export function useImageFilesystemEntryContent(
  imageId: string | undefined,
  path: string | undefined,
  mode: FilesystemContentMode | undefined,
): UseImageFilesystemEntryContentResult {
  const [content, setContent] = useState<FilesystemContentResult>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    setContent(undefined);
    setError(undefined);
    if (!imageId || path === undefined) return;
    let cancelled = false;
    setLoading(true);
    fetchImageFilesystemEntryContent(imageId, path, mode)
      .then((result) => {
        if (!cancelled) setContent(result);
      })
      .catch((cause: Error) => {
        if (!cancelled) setError(cause.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [imageId, path, mode]);

  return { content, loading, error };
}
