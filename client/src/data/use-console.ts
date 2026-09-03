import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeToReload } from './reload-signal';
import {
  appendConsoleHistory,
  callEngineApi,
  classifyConsoleCommand,
  fetchConsoleHistory,
  runConsoleCliCommand,
  type ConsoleChannel,
  type ConsoleCommandClassification,
  type ConsoleHistoryEntry,
  type ConsoleHistoryReading,
  type ConsoleOutputChunk,
} from './console-client';

export interface ConsoleLine {
  id: string;
  text: string;
  stream: 'stdout' | 'stderr';
}

export interface ConsoleRunEntry {
  id: string;
  channel: ConsoleChannel;
  /** Exactly what was typed. */
  command: string;
  lines: ConsoleLine[];
  /** How it ended, in the channel's own terms: "exit 0", "HTTP 404", "cancelled". */
  status?: string;
  succeeded?: boolean;
  running: boolean;
  /** False when the command could carry a credential: it stays in this session and never reaches the history file. */
  persisted: boolean;
  /** Recalled from the history file rather than run in this session. */
  restored: boolean;
}

export interface ConsoleRunOptions {
  /** Set from the classification: a command that could carry a credential is never handed to the history. */
  persist?: boolean;
}

export interface UseConsoleResult {
  entries: ConsoleRunEntry[];
  loaded: boolean;
  error?: string;
  running: boolean;
  /** Commands of every entry, oldest first — what the prompt's recall walks. */
  recallable: string[];
  classify: (channel: ConsoleChannel, command: string) => Promise<ConsoleCommandClassification>;
  run: (channel: ConsoleChannel, command: string, options?: ConsoleRunOptions) => Promise<void>;
  cancel: () => void;
}

interface LineBuffer {
  entryId: string;
  seq: number;
  lines: ConsoleLine[];
  /** The last line has no newline yet: the next chunk of the same stream continues it. */
  open: boolean;
}

/**
 * A history payload that is not the promised shape is a failed read like any
 * other: it is reported, never stored, so the transcript is never handed an
 * entry without a command to show.
 */
function requireHistory(reading: ConsoleHistoryReading | undefined): ConsoleHistoryEntry[] {
  if (!reading || !Array.isArray(reading.entries)) throw new Error('The server did not answer with the console history.');
  for (const entry of reading.entries) {
    const shaped =
      typeof entry === 'object' &&
      entry !== null &&
      typeof entry.id === 'string' &&
      typeof entry.command === 'string' &&
      (entry.channel === 'cli' || entry.channel === 'api');
    if (!shaped) throw new Error('The server did not answer with the console history.');
  }
  return reading.entries;
}

function restoredEntry(entry: ConsoleHistoryEntry): ConsoleRunEntry {
  const lines = (entry.output ?? '')
    .split('\n')
    .filter((text, index, all) => !(text === '' && index === all.length - 1))
    .map((text, index) => ({ id: `${entry.id}-${index}`, text, stream: 'stdout' as const }));
  return {
    id: entry.id,
    channel: entry.channel,
    command: entry.command,
    lines,
    ...(entry.status ? { status: entry.status } : {}),
    ...(entry.succeeded === undefined ? {} : { succeeded: entry.succeeded }),
    running: false,
    persisted: true,
    restored: true,
  };
}

function appendChunk(buffer: LineBuffer, chunk: ConsoleOutputChunk): void {
  if (chunk.text === '') return;
  const parts = chunk.text.split('\n');
  if (parts.length > 1 && parts[parts.length - 1] === '') parts.pop();
  parts.forEach((part, index) => {
    const text = part.endsWith('\r') ? part.slice(0, -1) : part;
    const last = buffer.lines[buffer.lines.length - 1];
    if (index === 0 && buffer.open && last && last.stream === chunk.stream) {
      buffer.lines[buffer.lines.length - 1] = { ...last, text: `${last.text}${text}` };
      return;
    }
    buffer.seq += 1;
    buffer.lines.push({ id: `${buffer.entryId}-${buffer.seq}`, text, stream: chunk.stream });
  });
  buffer.open = !chunk.text.endsWith('\n');
}

/**
 * The console's own state: the history recalled at startup, the entries this
 * session added, and the execution of a command over either channel with its
 * output arriving as it is produced (REQ-100, REQ-101, REQ-102, REQ-114).
 */
export function useConsole(): UseConsoleResult {
  const [entries, setEntries] = useState<ConsoleRunEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [running, setRunning] = useState(false);
  const cancelledRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  // Ids the server gave the entries this session appended, so a history read
  // that lands after one of them does not show it a second time.
  const appendedIdsRef = useRef(new Set<string>());
  const historyReadRef = useRef(false);

  // Returns its promise, which is what the reload signal waits on (plan-docker_management_app-refresh_cache/REQ-21).
  const readHistory = useCallback(() => {
    return fetchConsoleHistory()
      .then((reading) => {
        if (cancelledRef.current) return;
        // Validated before anything is stored: a malformed answer fails the read instead of
        // reaching the transcript.
        const history = requireHistory(reading);
        // The restored half is rebuilt in the history's own order, this session's entries keeping
        // their place after it; nothing already shown is dropped or repeated.
        setEntries((current) => {
          const session = current.filter((entry) => !entry.restored);
          const shownElsewhere = new Set([...session.map((entry) => entry.id), ...appendedIdsRef.current]);
          const shownRestored = new Map(current.filter((entry) => entry.restored).map((entry) => [entry.id, entry]));
          const restored = history
            .filter((entry) => !shownElsewhere.has(entry.id))
            .map((entry) => shownRestored.get(entry.id) ?? restoredEntry(entry));
          const restoredIds = new Set(restored.map((entry) => entry.id));
          const rolledOff = current.filter((entry) => entry.restored && !restoredIds.has(entry.id));
          return [...rolledOff, ...restored, ...session];
        });
        setError(undefined);
      })
      .catch((cause: Error) => {
        if (cancelledRef.current) return;
        setError(cause.message);
      })
      .finally(() => {
        if (cancelledRef.current) return;
        setLoaded(true);
      });
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    // Once per mount, not once per effect setup: StrictMode runs setup twice in development.
    if (!historyReadRef.current) {
      historyReadRef.current = true;
      void readHistory();
    }
    return () => {
      cancelledRef.current = true;
      abortRef.current?.abort();
    };
  }, [readHistory]);

  // The reload signal, and with it a returning connection, reads the history again
  // (plan-docker_management_app-inline_error_panels/REQ-12).
  useEffect(() => subscribeToReload(readHistory), [readHistory]);

  const patchEntry = useCallback((id: string, patch: Partial<ConsoleRunEntry>) => {
    setEntries((current) => current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  }, []);

  const classify = useCallback((channel: ConsoleChannel, command: string) => classifyConsoleCommand(channel, command), []);

  const run = useCallback(
    async (channel: ConsoleChannel, command: string, options: ConsoleRunOptions = {}) => {
      const persist = options.persist !== false;
      const id = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const buffer: LineBuffer = { entryId: id, seq: 0, lines: [], open: false };
      setEntries((current) => [
        ...current,
        { id, channel, command, lines: [], running: true, persisted: persist, restored: false },
      ]);
      setRunning(true);

      let status = 'failed';
      let succeeded = false;
      try {
        if (channel === 'cli') {
          const controller = new AbortController();
          abortRef.current = controller;
          const result = await runConsoleCliCommand(
            command,
            (chunk) => {
              appendChunk(buffer, chunk);
              patchEntry(id, { lines: [...buffer.lines] });
            },
            controller.signal,
          );
          status = result.cancelled ? 'cancelled' : `exit ${result.exitCode ?? '—'}`;
          succeeded = !result.cancelled && result.exitCode === 0;
        } else {
          const result = await callEngineApi(command);
          appendChunk(buffer, { stream: 'stdout', text: result.body });
          status = `HTTP ${result.status}`;
          succeeded = result.status < 400;
        }
      } catch (cause) {
        appendChunk(buffer, { stream: 'stderr', text: (cause as Error).message });
      } finally {
        abortRef.current = null;
        if (!cancelledRef.current) {
          patchEntry(id, { lines: [...buffer.lines], running: false, status, succeeded });
          setRunning(false);
        }
      }

      // Nothing is appended for a run the screen was left in the middle of: it
      // never ended on its own, and the entry it belonged to is gone with it.
      if (!persist || cancelledRef.current) return;
      try {
        const reading = await appendConsoleHistory({
          channel,
          command,
          status,
          succeeded,
          output: buffer.lines.map((line) => line.text).join('\n'),
        });
        const stored = Array.isArray(reading?.entries) ? reading.entries[reading.entries.length - 1] : undefined;
        if (stored && typeof stored.id === 'string' && stored.command === command) appendedIdsRef.current.add(stored.id);
      } catch (cause) {
        if (!cancelledRef.current) setError((cause as Error).message);
      }
    },
    [patchEntry],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { entries, loaded, error, running, recallable: entries.map((entry) => entry.command), classify, run, cancel };
}
