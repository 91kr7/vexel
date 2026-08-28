// Typed client for the manual reload endpoint (REQ-7, REQ-9).
export interface ServerReloadReport {
  /** False when at least one held value could not be read again. */
  ok: boolean;
  reloaded: string[];
  skipped: string[];
  failed: { key: string; error: string }[];
}

/** Asks the server to read again every value it currently holds; answers when it has. */
export async function requestServerReload(): Promise<ServerReloadReport> {
  const response = await fetch('/api/refresh', { method: 'POST' });
  if (!response.ok) throw new Error(`Refresh request failed with HTTP ${response.status}`);
  return (await response.json()) as ServerReloadReport;
}
