/**
 * Triggers a native browser download of `url` via a transient, invisible
 * anchor (the same mechanism `LogStream`'s own download action uses): the
 * browser owns the transfer end to end, so this never reads or buffers the
 * response body (REQ-42, REQ-43).
 */
export function triggerDownload(url: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
