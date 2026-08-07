// Typed client for the container filesystem export/import transport (REQ-43):
// the export download URL, triggered with `triggerDownload`, and the import
// upload URL, consumed with the images module's `useFileUpload`.
export interface ContainerImportResult {
  id?: string;
  reference?: string;
}

/** Builds the browser-download URL for `id`'s current filesystem. */
export function exportContainerUrl(id: string, filename?: string): string {
  const params = filename ? `?${new URLSearchParams({ filename }).toString()}` : '';
  return `/api/containers/${encodeURIComponent(id)}/export${params}`;
}

/** Builds the upload URL for importing an image from a filesystem tarball, naming the resulting reference and applying `changes` (Dockerfile-style instructions), both optional. */
export function containerImportUploadUrl(targetReference?: string, changes?: string[]): string {
  const params = new URLSearchParams();
  if (targetReference && targetReference.trim() !== '') params.set('targetReference', targetReference.trim());
  for (const change of changes ?? []) {
    if (change.trim() !== '') params.append('changes', change.trim());
  }
  const query = params.toString();
  return `/api/containers/import${query ? `?${query}` : ''}`;
}
