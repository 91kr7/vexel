// Typed description of the server's container log stream (REQ-30, REQ-31).
export type LogStreamName = 'stdout' | 'stderr';

export interface ContainerLogLine {
  seq: number;
  stream: LogStreamName;
  timestamp?: string;
  text: string;
}

export interface ContainerLogOptions {
  stdout?: boolean;
  stderr?: boolean;
  follow?: boolean;
  timestamps?: boolean;
  tail?: number | 'all';
  since?: string;
  until?: string;
}

/** Builds the stream URL, carrying only the options that differ from the endpoint's defaults. */
export function containerLogStreamUrl(id: string, options: ContainerLogOptions = {}): string {
  const params = new URLSearchParams();
  if (options.stdout === false) params.set('stdout', 'false');
  if (options.stderr === false) params.set('stderr', 'false');
  if (options.follow === false) params.set('follow', 'false');
  if (options.timestamps === true) params.set('timestamps', 'true');
  if (options.tail !== undefined && options.tail !== 'all') params.set('tail', String(options.tail));
  if (options.since && options.since.trim() !== '') params.set('since', options.since.trim());
  if (options.until && options.until.trim() !== '') params.set('until', options.until.trim());
  const query = params.toString();
  return `/api/containers/${encodeURIComponent(id)}/logs/stream${query ? `?${query}` : ''}`;
}
