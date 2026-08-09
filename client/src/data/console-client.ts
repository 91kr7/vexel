// Typed client for the server's raw-console endpoints (REQ-100, REQ-101,
// REQ-102, REQ-112, REQ-114). The CLI channel streams newline-delimited JSON —
// `EventSource` cannot issue a POST, and a command's output is unbounded — read
// straight off the `fetch` response body; aborting that fetch cancels the
// command on the server.
export type ConsoleChannel = 'cli' | 'api';

export interface ConsoleCommandClassification {
  destructive: boolean;
  /** What makes it destructive, said to the operator in the confirmation. */
  reason?: string;
  /** The line could carry a credential, so the server will not keep it in the history. */
  carriesSecret: boolean;
}

export interface ConsoleOutputChunk {
  stream: 'stdout' | 'stderr';
  text: string;
}

export interface ConsoleCliRun {
  /** `null` when the command was killed rather than exiting on its own. */
  exitCode: number | null;
  cancelled: boolean;
}

export interface ConsoleApiResult {
  method: string;
  /** The path actually dialed, version prefix included. */
  path: string;
  status: number;
  body: string;
  contentType?: string;
}

export interface ConsoleHistoryEntry {
  id: string;
  channel: ConsoleChannel;
  command: string;
  timestamp: string;
  status?: string;
  succeeded?: boolean;
  output?: string;
}

export type NewConsoleHistoryEntry = Omit<ConsoleHistoryEntry, 'id' | 'timestamp'>;

type ConsoleCliEvent =
  | { type: 'output'; stream: 'stdout' | 'stderr'; text: string }
  | { type: 'exit'; exitCode: number | null }
  | { type: 'error'; message: string };

async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    if (typeof body.error === 'string') return body.error;
  } catch {
    // no JSON body; fall through to the generic message
  }
  return `Request failed with HTTP ${response.status}`;
}

function post(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(await extractErrorMessage(response));
  return (await response.json()) as T;
}

export async function classifyConsoleCommand(channel: ConsoleChannel, command: string): Promise<ConsoleCommandClassification> {
  return readJson<ConsoleCommandClassification>(await post('/api/console/classify', { channel, command }));
}

/**
 * Runs a CLI entry, handing every chunk over as it arrives. Aborting `signal`
 * closes the connection, which is what cancels the process on the server; the
 * run then answers `cancelled` instead of failing.
 */
export async function runConsoleCliCommand(
  command: string,
  onOutput: (chunk: ConsoleOutputChunk) => void,
  signal?: AbortSignal,
): Promise<ConsoleCliRun> {
  let response: Response;
  try {
    response = await post('/api/console/cli', { command }, signal);
  } catch (cause) {
    if (isAbort(cause, signal)) return { exitCode: null, cancelled: true };
    throw cause;
  }
  if (!response.ok || !response.body) throw new Error(await extractErrorMessage(response));

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let exitCode: number | null | undefined;
  let failure: string | undefined;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim() === '') continue;
        const event = JSON.parse(line) as ConsoleCliEvent;
        if (event.type === 'output') onOutput({ stream: event.stream, text: event.text });
        else if (event.type === 'exit') exitCode = event.exitCode;
        else failure = event.message;
      }
    }
  } catch (cause) {
    if (isAbort(cause, signal)) return { exitCode: null, cancelled: true };
    throw cause;
  }

  if (failure !== undefined) throw new Error(failure);
  if (exitCode === undefined) throw new Error('The command stream ended without an exit status.');
  return { exitCode, cancelled: false };
}

export async function callEngineApi(command: string): Promise<ConsoleApiResult> {
  return readJson<ConsoleApiResult>(await post('/api/console/api', { command }));
}

export interface ConsoleHistoryReading {
  entries: ConsoleHistoryEntry[];
}

export async function fetchConsoleHistory(): Promise<ConsoleHistoryReading> {
  return readJson<ConsoleHistoryReading>(await fetch('/api/console/history'));
}

export async function appendConsoleHistory(entry: NewConsoleHistoryEntry): Promise<ConsoleHistoryReading> {
  return readJson<ConsoleHistoryReading>(await post('/api/console/history', entry));
}

function isAbort(cause: unknown, signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true || (cause instanceof DOMException && cause.name === 'AbortError');
}
