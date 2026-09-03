import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ConsoleHistoryEntry, ConsoleOutputChunk } from '../../src/data/console-client';

// raw-console/specs/use-console.md — the console's own state: the history recalled at startup, the
// entries this session adds, and the execution of a command over either channel with its output
// arriving as it is produced (REQ-100, REQ-101, REQ-102, REQ-114). The data client is mocked: what
// is under test is what the hook derives from what the server answered.

const client = {
  classifyConsoleCommand: vi.fn(),
  runConsoleCliCommand: vi.fn(),
  callEngineApi: vi.fn(),
  fetchConsoleHistory: vi.fn(),
  appendConsoleHistory: vi.fn(),
};

vi.mock('../../src/data/console-client', () => client);

const { useConsole } = await import('../../src/data/use-console');
const { requestReload } = await import('../../src/data/reload-signal');

/** A CLI run the test drives: it captures the chunk sink and ends when the test says so. */
function pendingCliRun() {
  let emit: (chunk: ConsoleOutputChunk) => void = () => undefined;
  let finish: (result: { exitCode: number | null; cancelled: boolean }) => void = () => undefined;
  client.runConsoleCliCommand.mockImplementation((_command: string, onOutput: (chunk: ConsoleOutputChunk) => void) => {
    emit = onOutput;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  return {
    emit: (chunk: ConsoleOutputChunk) => act(() => emit(chunk)),
    end: async (result: { exitCode: number | null; cancelled: boolean }) => {
      await act(async () => {
        finish(result);
        await Promise.resolve();
      });
    },
  };
}

function historyEntry(overrides: Partial<ConsoleHistoryEntry> = {}): ConsoleHistoryEntry {
  return {
    id: 'h1',
    channel: 'cli',
    command: 'docker ps',
    timestamp: '2026-08-09T09:00:00.000Z',
    status: 'exit 0',
    succeeded: true,
    ...overrides,
  };
}

/** Renders the hook and waits for the startup history read to settle. */
async function renderConsole() {
  const view = renderHook(() => useConsole());
  await waitFor(() => expect(view.result.current.loaded).toBe(true));
  return view;
}

beforeEach(() => {
  for (const spy of Object.values(client)) spy.mockReset();
  client.fetchConsoleHistory.mockResolvedValue({ entries: [] });
  client.appendConsoleHistory.mockResolvedValue({ entries: [] });
  client.classifyConsoleCommand.mockResolvedValue({ destructive: false, carriesSecret: false });
});

afterEach(cleanup);

describe('useConsole — the history recalled at startup (REQ-114)', () => {
  // use-console.md — "entries ... oldest first — the persisted history first, then what this session
  // ran"; "restored is true for an entry read back from the history"
  it('shows the persisted history first, marked as restored', async () => {
    client.fetchConsoleHistory.mockResolvedValue({
      entries: [historyEntry({ id: 'h1', command: 'docker version' }), historyEntry({ id: 'h2', command: 'docker info' })],
    });

    const { result } = await renderConsole();

    expect(result.current.entries.map((entry) => entry.command)).toEqual(['docker version', 'docker info']);
    expect(result.current.entries.every((entry) => entry.restored)).toBe(true);
    expect(result.current.entries.every((entry) => !entry.running)).toBe(true);
    expect(result.current.error).toBeUndefined();
  });

  it('carries the status and the output a restored entry was stored with', async () => {
    client.fetchConsoleHistory.mockResolvedValue({
      entries: [historyEntry({ status: 'HTTP 404', succeeded: false, channel: 'api', command: 'GET /x', output: 'first\nsecond' })],
    });

    const { result } = await renderConsole();

    const [entry] = result.current.entries;
    expect(entry!.status).toBe('HTTP 404');
    expect(entry!.succeeded).toBe(false);
    expect(entry!.lines.map((line) => line.text)).toEqual(['first', 'second']);
  });

  // use-console.md — "error — the message of the last failed history read"
  it('reports a failed history read and still settles as loaded', async () => {
    client.fetchConsoleHistory.mockRejectedValue(new Error('history unreachable'));

    const { result } = await renderConsole();

    expect(result.current.error).toBe('history unreachable');
    expect(result.current.entries).toEqual([]);
  });

  // use-console.md — "A payload that is not { entries: [...] }, or that holds an element without an
  // id, a command and a known channel, is a failed read: the message is reported and nothing is
  // stored"
  it('treats a malformed history payload as a failed read, storing nothing', async () => {
    for (const payload of [
      {},
      { entries: 'nope' },
      { entries: [{ channel: 'cli', command: 'docker ps' }] },
      { entries: [{ id: 'x', channel: 'cli' }] },
      { entries: [{ id: 'x', channel: 'ftp', command: 'docker ps' }] },
    ]) {
      client.fetchConsoleHistory.mockResolvedValue(payload);
      const { result, unmount } = await renderConsole();

      expect(result.current.entries, JSON.stringify(payload)).toEqual([]);
      expect(result.current.error, JSON.stringify(payload)).toBeTruthy();
      unmount();
    }
  });
});

describe('useConsole — a command run while the startup read is still in flight', () => {
  // use-console.md — "entries ... oldest first — the persisted history first, then what this
  // session ran"; REQ-100 — the command's output and exit code come back into the console. The
  // history read is answered only after the entry has been added, which is what happens whenever
  // the operator types as soon as the screen appears.
  it('keeps the entry it is running when the history read settles afterwards', async () => {
    let settleHistory!: (reading: { entries: ConsoleHistoryEntry[] }) => void;
    client.fetchConsoleHistory.mockReturnValue(
      new Promise((resolve) => {
        settleHistory = resolve;
      }),
    );
    const run = pendingCliRun();
    const { result } = renderHook(() => useConsole());

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.run('cli', 'docker ps -a');
    });
    expect(result.current.entries.map((entry) => entry.command)).toEqual(['docker ps -a']);

    await act(async () => {
      settleHistory({ entries: [historyEntry({ id: 'h1', command: 'docker version' })] });
      await Promise.resolve();
    });
    await run.end({ exitCode: 0, cancelled: false });
    await act(async () => {
      await pending;
    });

    expect(result.current.entries.map((entry) => entry.command)).toEqual(['docker version', 'docker ps -a']);
    expect(result.current.entries.at(-1)!.status).toBe('exit 0');
    expect(result.current.entries.at(-1)!.restored).toBe(false);
    expect(result.current.entries[0]!.restored).toBe(true);
    expect(result.current.running).toBe(false);
  });

  // use-console.md — "An entry this session already appended to the history file is left out of the
  // merge, so a read that lands after that append does not show it twice."
  it('shows an entry it already appended only once when the read lands after the append', async () => {
    let settleHistory!: (reading: { entries: ConsoleHistoryEntry[] }) => void;
    client.fetchConsoleHistory.mockReturnValue(
      new Promise((resolve) => {
        settleHistory = resolve;
      }),
    );
    // What the server answered the append with: the entry it stored, under the id it assigned.
    const stored = historyEntry({ id: 'server-assigned', command: 'docker ps -a', status: 'exit 0' });
    client.appendConsoleHistory.mockResolvedValue({ entries: [stored] });
    const run = pendingCliRun();
    const { result } = renderHook(() => useConsole());

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.run('cli', 'docker ps -a');
    });
    await run.end({ exitCode: 0, cancelled: false });
    await act(async () => {
      await pending;
    });

    // The read finally lands, carrying the entry that was just appended.
    await act(async () => {
      settleHistory({ entries: [historyEntry({ id: 'h1', command: 'docker version' }), stored] });
      await Promise.resolve();
    });

    expect(result.current.entries.map((entry) => entry.command)).toEqual(['docker version', 'docker ps -a']);
    // The one that is kept is this session's own, with the output it collected.
    expect(result.current.entries.at(-1)!.restored).toBe(false);
    expect(result.current.entries.at(-1)!.status).toBe('exit 0');
    // No two entries may collide on the key the transcript renders them under.
    expect(new Set(result.current.entries.map((entry) => entry.id)).size).toBe(result.current.entries.length);
  });

  // use-console.md — the same merge, with several entries on each side: restored first, this
  // session's after, each in its own order
  it('merges the restored history under this session\'s entries, keeping both orders', async () => {
    let settleHistory!: (reading: { entries: ConsoleHistoryEntry[] }) => void;
    client.fetchConsoleHistory.mockReturnValue(
      new Promise((resolve) => {
        settleHistory = resolve;
      }),
    );
    client.callEngineApi.mockResolvedValue({ method: 'GET', path: '/v1.43/info', status: 200, body: 'ok' });
    const { result } = renderHook(() => useConsole());

    await act(async () => {
      await result.current.run('api', 'GET /info');
    });
    await act(async () => {
      await result.current.run('api', 'GET /version');
    });
    await act(async () => {
      settleHistory({
        entries: [historyEntry({ id: 'h1', command: 'docker version' }), historyEntry({ id: 'h2', command: 'docker info' })],
      });
      await Promise.resolve();
    });

    expect(result.current.entries.map((entry) => entry.command)).toEqual([
      'docker version',
      'docker info',
      'GET /info',
      'GET /version',
    ]);
    expect(result.current.recallable).toEqual(['docker version', 'docker info', 'GET /info', 'GET /version']);
    expect(new Set(result.current.entries.map((entry) => entry.id)).size).toBe(4);
  });

  // use-console.md — "the persisted history first, then what this session ran"; raw-console-screen.md
  // — "The history is read once when the screen opens". The application mounts under
  // `<StrictMode>` (client/src/main.tsx), which runs an effect's setup twice on mount, so the merge
  // has to be idempotent: reading the history again may not show the same entries a second time.
  it('shows each restored entry once when the screen mounts under StrictMode', async () => {
    client.fetchConsoleHistory.mockResolvedValue({
      entries: [historyEntry({ id: 'h1', command: 'docker version' }), historyEntry({ id: 'h2', command: 'docker info' })],
    });

    const { result } = renderHook(() => useConsole(), { wrapper: React.StrictMode });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.entries.map((entry) => entry.command)).toEqual(['docker version', 'docker info']);
    expect(new Set(result.current.entries.map((entry) => entry.id)).size).toBe(result.current.entries.length);
  });

  // use-console.md / raw-console-screen.md — "The history is read once when the screen opens", not
  // once per effect setup: under StrictMode the setup runs twice on a single mount.
  it('issues exactly one history read for one mount, StrictMode included', async () => {
    client.fetchConsoleHistory.mockResolvedValue({ entries: [historyEntry({ id: 'h1', command: 'docker version' })] });

    const { result } = renderHook(() => useConsole(), { wrapper: React.StrictMode });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(client.fetchConsoleHistory).toHaveBeenCalledTimes(1);
  });

  // The guard belongs to the mount, not to the module: leaving the screen and opening it again is a
  // new screen, which reads the history again (REQ-114) and shows each entry once.
  it('reads the history again when the screen is opened a second time', async () => {
    client.fetchConsoleHistory.mockResolvedValue({
      entries: [historyEntry({ id: 'h1', command: 'docker version' }), historyEntry({ id: 'h2', command: 'docker info' })],
    });

    const first = renderHook(() => useConsole(), { wrapper: React.StrictMode });
    await waitFor(() => expect(first.result.current.loaded).toBe(true));
    first.unmount();

    const second = renderHook(() => useConsole(), { wrapper: React.StrictMode });
    await waitFor(() => expect(second.result.current.loaded).toBe(true));

    expect(client.fetchConsoleHistory).toHaveBeenCalledTimes(2);
    expect(second.result.current.entries.map((entry) => entry.command)).toEqual(['docker version', 'docker info']);
    expect(new Set(second.result.current.entries.map((entry) => entry.id)).size).toBe(2);
  });

  // use-console.md — the id lookup "is defensive about a malformed append payload": an append that
  // answers with something else must not cost the session its entry
  it('keeps the session entry when the append answers with a payload of another shape', async () => {
    let settleHistory!: (reading: { entries: ConsoleHistoryEntry[] }) => void;
    client.fetchConsoleHistory.mockReturnValue(
      new Promise((resolve) => {
        settleHistory = resolve;
      }),
    );
    client.appendConsoleHistory.mockResolvedValue({ entries: 'not-a-list' });
    client.callEngineApi.mockResolvedValue({ method: 'GET', path: '/v1.43/info', status: 200, body: 'ok' });
    const { result } = renderHook(() => useConsole());

    await act(async () => {
      await result.current.run('api', 'GET /info');
    });
    await act(async () => {
      settleHistory({ entries: [historyEntry({ id: 'h1', command: 'docker version' })] });
      await Promise.resolve();
    });

    const session = result.current.entries.filter((entry) => !entry.restored);
    expect(session.map((entry) => entry.command)).toEqual(['GET /info']);
    expect(session[0]!.status).toBe('HTTP 200');
  });
});

describe('useConsole — running a CLI entry (REQ-100)', () => {
  // use-console.md — "run(channel, command, { persist? }) → adds an entry and resolves when it has
  // ended"; "running — an entry is still producing output"
  it('adds the entry as running and ends it with the channel\'s own status', async () => {
    const run = pendingCliRun();
    const { result } = await renderConsole();

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.run('cli', 'docker ps -a');
    });

    expect(result.current.running).toBe(true);
    const started = result.current.entries.at(-1)!;
    expect(started.command).toBe('docker ps -a');
    expect(started.channel).toBe('cli');
    expect(started.running).toBe(true);
    expect(started.restored).toBe(false);

    await run.end({ exitCode: 0, cancelled: false });
    await act(async () => {
      await pending;
    });

    const ended = result.current.entries.at(-1)!;
    expect(ended.status).toBe('exit 0');
    expect(ended.succeeded).toBe(true);
    expect(ended.running).toBe(false);
    expect(result.current.running).toBe(false);
  });

  // use-console.md — "succeeded is true only for exit 0"
  it('ends a non-zero run as a failure, naming the exit code', async () => {
    const run = pendingCliRun();
    const { result } = await renderConsole();

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.run('cli', 'docker ps -a');
    });
    await run.end({ exitCode: 125, cancelled: false });
    await act(async () => {
      await pending;
    });

    expect(result.current.entries.at(-1)!.status).toBe('exit 125');
    expect(result.current.entries.at(-1)!.succeeded).toBe(false);
  });

  // use-console.md — "Output arrives as chunks, not lines: a chunk that does not end in a newline
  // leaves the last line open, and the next chunk of the same stream continues it"
  it('continues an open line with the next chunk of the same stream', async () => {
    const run = pendingCliRun();
    const { result } = await renderConsole();

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.run('cli', 'docker ps');
    });
    run.emit({ stream: 'stdout', text: 'CONTAINER ' });
    run.emit({ stream: 'stdout', text: 'ID\nsecond line\n' });
    await run.end({ exitCode: 0, cancelled: false });
    await act(async () => {
      await pending;
    });

    expect(result.current.entries.at(-1)!.lines.map((line) => line.text)).toEqual(['CONTAINER ID', 'second line']);
  });

  // use-console.md — "A trailing carriage return is dropped."
  it('drops a trailing carriage return', async () => {
    const run = pendingCliRun();
    const { result } = await renderConsole();

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.run('cli', 'docker ps');
    });
    run.emit({ stream: 'stdout', text: 'progress\r\ndone\r\n' });
    await run.end({ exitCode: 0, cancelled: false });
    await act(async () => {
      await pending;
    });

    expect(result.current.entries.at(-1)!.lines.map((line) => line.text)).toEqual(['progress', 'done']);
  });

  it('keeps the stream each line came from', async () => {
    const run = pendingCliRun();
    const { result } = await renderConsole();

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.run('cli', 'docker ps');
    });
    run.emit({ stream: 'stdout', text: 'out\n' });
    run.emit({ stream: 'stderr', text: 'err\n' });
    await run.end({ exitCode: 1, cancelled: false });
    await act(async () => {
      await pending;
    });

    expect(result.current.entries.at(-1)!.lines.map((line) => [line.text, line.stream])).toEqual([
      ['out', 'stdout'],
      ['err', 'stderr'],
    ]);
  });

  // use-console.md — "Cancelling is a normal end, not a failure: the entry keeps the output it had
  // produced."
  it('ends a cancelled run as cancelled, keeping the output it had produced', async () => {
    const run = pendingCliRun();
    const { result } = await renderConsole();

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.run('cli', 'docker events');
    });
    run.emit({ stream: 'stdout', text: 'one event\n' });
    act(() => result.current.cancel());
    await run.end({ exitCode: null, cancelled: true });
    await act(async () => {
      await pending;
    });

    const entry = result.current.entries.at(-1)!;
    expect(entry.status).toBe('cancelled');
    expect(entry.succeeded).toBe(false);
    expect(entry.lines.map((line) => line.text)).toEqual(['one event']);
  });

  // use-console.md — "a failure of the call itself ends the entry as failed with the message on its
  // stderr side"
  it('ends a call that failed as failed, with the message on the stderr side', async () => {
    client.runConsoleCliCommand.mockRejectedValue(new Error('A CLI entry must start with docker'));
    const { result } = await renderConsole();

    await act(async () => {
      await result.current.run('cli', 'rm -rf /');
    });

    const entry = result.current.entries.at(-1)!;
    expect(entry.status).toBe('failed');
    expect(entry.succeeded).toBe(false);
    expect(entry.lines.map((line) => [line.text, line.stream])).toEqual([
      ['A CLI entry must start with docker', 'stderr'],
    ]);
  });
});

describe('useConsole — running an API entry (REQ-101)', () => {
  // use-console.md — "HTTP <status> for the API one"; "succeeded is true only ... for an API status
  // below 400"
  it('ends an API entry with its HTTP status and shows the body as output', async () => {
    client.callEngineApi.mockResolvedValue({ method: 'GET', path: '/v1.43/info', status: 200, body: '{"ID":"abc"}' });
    const { result } = await renderConsole();

    await act(async () => {
      await result.current.run('api', 'GET /info');
    });

    const entry = result.current.entries.at(-1)!;
    expect(entry.status).toBe('HTTP 200');
    expect(entry.succeeded).toBe(true);
    expect(entry.lines.map((line) => line.text)).toEqual(['{"ID":"abc"}']);
    expect(client.callEngineApi).toHaveBeenCalledWith('GET /info');
  });

  it('treats a daemon error status as a result, not a failure', async () => {
    client.callEngineApi.mockResolvedValue({ method: 'GET', path: '/v1.43/containers/x/json', status: 404, body: '{"message":"no such container"}' });
    const { result } = await renderConsole();

    await act(async () => {
      await result.current.run('api', 'GET /containers/x/json');
    });

    const entry = result.current.entries.at(-1)!;
    expect(entry.status).toBe('HTTP 404');
    expect(entry.succeeded).toBe(false);
    expect(entry.lines.map((line) => line.text)).toEqual(['{"message":"no such container"}']);
  });
});

describe('useConsole — the history it appends (REQ-102, REQ-104, REQ-114)', () => {
  // use-console.md — "An entry is appended to the history once it has ended"
  it('appends the ended entry with its command, status and output', async () => {
    client.callEngineApi.mockResolvedValue({ method: 'GET', path: '/v1.43/info', status: 200, body: 'body-text' });
    const { result } = await renderConsole();

    await act(async () => {
      await result.current.run('api', 'GET /info');
    });

    expect(client.appendConsoleHistory).toHaveBeenCalledWith({
      channel: 'api',
      command: 'GET /info',
      status: 'HTTP 200',
      succeeded: true,
      output: 'body-text',
    });
  });

  // use-console.md — "only when persist is not false"; "persisted is false for a command that could
  // carry a credential: it stays in this session and never reaches the history file"
  it('never hands the history a command that must not be persisted, and marks the entry', async () => {
    client.callEngineApi.mockResolvedValue({ method: 'GET', path: '/v1.43/info', status: 200, body: 'ok' });
    const { result } = await renderConsole();

    await act(async () => {
      await result.current.run('api', 'POST /auth', { persist: false });
    });

    expect(client.appendConsoleHistory).not.toHaveBeenCalled();
    const entry = result.current.entries.at(-1)!;
    expect(entry.persisted).toBe(false);
    expect(entry.command).toBe('POST /auth');
  });

  it('marks an ordinary entry as persisted', async () => {
    client.callEngineApi.mockResolvedValue({ method: 'GET', path: '/v1.43/info', status: 200, body: 'ok' });
    const { result } = await renderConsole();

    await act(async () => {
      await result.current.run('api', 'GET /info');
    });

    expect(result.current.entries.at(-1)!.persisted).toBe(true);
  });

  // use-console.md — "a failed append is reported but never loses the entry from the session"
  it('reports a failed append without losing the entry', async () => {
    client.callEngineApi.mockResolvedValue({ method: 'GET', path: '/v1.43/info', status: 200, body: 'ok' });
    client.appendConsoleHistory.mockRejectedValue(new Error('history is read-only'));
    const { result } = await renderConsole();

    await act(async () => {
      await result.current.run('api', 'GET /info');
    });

    expect(result.current.error).toBe('history is read-only');
    expect(result.current.entries.at(-1)!.command).toBe('GET /info');
    expect(result.current.entries.at(-1)!.status).toBe('HTTP 200');
  });
});

describe('useConsole — recall and classification', () => {
  // use-console.md — "recallable: string[] — the commands of every entry, oldest first"
  it('offers the commands of every entry for recall, oldest first', async () => {
    client.fetchConsoleHistory.mockResolvedValue({ entries: [historyEntry({ id: 'h1', command: 'docker version' })] });
    client.callEngineApi.mockResolvedValue({ method: 'GET', path: '/v1.43/info', status: 200, body: 'ok' });
    const { result } = await renderConsole();

    await act(async () => {
      await result.current.run('api', 'GET /info');
    });

    expect(result.current.recallable).toEqual(['docker version', 'GET /info']);
  });

  // use-console.md — "classify(channel, command) → the server's classification, running nothing"
  it('asks the server for a classification and runs nothing', async () => {
    client.classifyConsoleCommand.mockResolvedValue({ destructive: true, reason: 'it removes', carriesSecret: false });
    const { result } = await renderConsole();

    let judgement: unknown;
    await act(async () => {
      judgement = await result.current.classify('cli', 'docker rm x');
    });

    expect(client.classifyConsoleCommand).toHaveBeenCalledWith('cli', 'docker rm x');
    expect(judgement).toEqual({ destructive: true, reason: 'it removes', carriesSecret: false });
    expect(client.runConsoleCliCommand).not.toHaveBeenCalled();
    expect(result.current.entries).toEqual([]);
  });

  // use-console.md — "Leaving the screen cancels a running command rather than leaving a process
  // behind on the server; such an entry ... is not appended to the history."
  it('cancels the running command when the screen goes away, appending nothing', async () => {
    const run = pendingCliRun();
    const { result, unmount } = await renderConsole();

    act(() => {
      void result.current.run('cli', 'docker events');
    });
    unmount();
    await run.end({ exitCode: null, cancelled: true });

    expect(client.appendConsoleHistory).not.toHaveBeenCalled();
  });
});

/**
 * use-console.md — the history "is read again on the reload signal, so the header's manual refresh
 * and a connection that comes back both refill the transcript with the operator staying on the
 * screen" (plan-docker_management_app-inline_error_panels/REQ-12).
 */
describe('useConsole — the history read again on the reload signal (…-inline_error_panels/REQ-12)', () => {
  // The order is the contract's own: "entries ... oldest first — the persisted history first, then
  // what this session ran" (use-console.md).
  it('reads the history again and adds what was written meanwhile, oldest first', async () => {
    client.fetchConsoleHistory.mockResolvedValue({ entries: [historyEntry({ id: 'h1', command: 'docker version' })] });
    const { result } = await renderConsole();
    expect(result.current.entries.map((entry) => entry.command)).toEqual(['docker version']);

    client.fetchConsoleHistory.mockResolvedValue({
      entries: [historyEntry({ id: 'h1', command: 'docker version' }), historyEntry({ id: 'h2', command: 'docker info' })],
    });
    await act(async () => {
      await requestReload();
    });

    expect(client.fetchConsoleHistory).toHaveBeenCalledTimes(2);
    expect(result.current.entries.map((entry) => entry.command)).toEqual(['docker version', 'docker info']);
  });

  // "a re-read adds what is missing and can neither drop an entry nor repeat one"
  it('repeats no entry and drops none of this session\'s across the re-read', async () => {
    client.fetchConsoleHistory.mockResolvedValue({ entries: [historyEntry({ id: 'h1', command: 'docker version' })] });
    client.callEngineApi.mockResolvedValue({ method: 'GET', path: '/v1.43/info', status: 200, body: 'ok' });
    const { result } = await renderConsole();
    await act(async () => {
      await result.current.run('api', 'GET /info');
    });

    await act(async () => {
      await requestReload();
    });

    expect(result.current.entries.map((entry) => entry.command)).toEqual(['docker version', 'GET /info']);
    expect(new Set(result.current.entries.map((entry) => entry.id)).size).toBe(result.current.entries.length);
  });

  // use-console.md — "An entry that has rolled out of the file — it holds the last 200 — stays in
  // the transcript ahead of the entries the file still names, being older than all of them."
  it('keeps an entry the capped history no longer names, ahead of the ones it still does', async () => {
    client.fetchConsoleHistory.mockResolvedValue({
      entries: [historyEntry({ id: 'h1', command: 'docker version' }), historyEntry({ id: 'h2', command: 'docker info' })],
    });
    const { result } = await renderConsole();
    expect(result.current.entries.map((entry) => entry.command)).toEqual(['docker version', 'docker info']);

    // The file has since rolled its oldest entry off the front and gained a newer one.
    client.fetchConsoleHistory.mockResolvedValue({
      entries: [historyEntry({ id: 'h2', command: 'docker info' }), historyEntry({ id: 'h3', command: 'docker ps' })],
    });
    await act(async () => {
      await requestReload();
    });

    expect(result.current.entries.map((entry) => entry.command)).toEqual(['docker version', 'docker info', 'docker ps']);
    expect(new Set(result.current.entries.map((entry) => entry.id)).size).toBe(3);
  });

  // The subscription belongs to the mounted screen: a console the operator has left reads nothing.
  it('reads nothing once the screen is gone', async () => {
    client.fetchConsoleHistory.mockResolvedValue({ entries: [] });
    const view = await renderConsole();
    view.unmount();

    await act(async () => {
      await requestReload();
    });

    expect(client.fetchConsoleHistory).toHaveBeenCalledTimes(1);
  });
});
