import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useContainerSession } from '../../src/data/use-container-session';

// Stands in for the browser's WebSocket: the hook's only channel to the
// server, so the tests drive the session by dispatching events on the
// instances it opened and inspecting what was sent.
class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  binaryType = '';
  sent: unknown[] = [];
  private listeners = new Map<string, Array<(event: unknown) => void>>();

  url: string;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: unknown) => void) {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  send(data: unknown) {
    this.sent.push(data);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.dispatch('close', {});
  }

  emitOpen() {
    this.readyState = FakeWebSocket.OPEN;
    this.dispatch('open', {});
  }

  emitBinaryChunk(text: string) {
    this.dispatch('message', { data: new TextEncoder().encode(text).buffer });
  }

  emitControl(message: unknown) {
    this.dispatch('message', { data: JSON.stringify(message) });
  }

  emitConnectionError() {
    this.dispatch('error', {});
  }

  private dispatch(type: string, event: unknown) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

function latest(): FakeWebSocket {
  return FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
}

function lastSentText(socket: FakeWebSocket): string {
  const payload = socket.sent[socket.sent.length - 1];
  // Encoded input arrives as a typed array; control messages are sent as plain strings.
  return typeof payload === 'string' ? payload : new TextDecoder().decode(payload as ArrayBufferView);
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useContainerSession (REQ-34, REQ-35, REQ-36)', () => {
  // use-container-session.md — no channel is opened while containerId is undefined
  it('opens no channel while the container id is undefined', () => {
    renderHook(() => useContainerSession(undefined, 'exec', { cmd: ['/bin/sh'] }, true));

    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  // use-container-session.md — no channel is opened while active is false
  it('opens no channel while inactive', () => {
    renderHook(() => useContainerSession('container-1', 'exec', { cmd: ['/bin/sh'] }, false));

    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  // use-container-session.md — opens the exec/attach channel and reports it connecting, then open
  it('opens the session channel to the expected endpoint and reports its status', async () => {
    const { result } = renderHook(() => useContainerSession('container-1', 'attach', undefined, true));

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(latest().url).toContain('/api/containers/container-1/attach');
    expect(result.current.status).toBe('connecting');

    await act(async () => latest().emitOpen());
    expect(result.current.status).toBe('open');
  });

  // use-container-session.md — subscribe delivers decoded terminal output chunks, not control frames
  it('delivers binary chunks to subscribers, and does not deliver control frames as output', async () => {
    const { result } = renderHook(() => useContainerSession('container-1', 'exec', { cmd: ['/bin/sh'] }, true));
    await act(async () => latest().emitOpen());

    const received: string[] = [];
    act(() => {
      result.current.subscribe((chunk) => received.push(chunk));
    });

    await act(async () => latest().emitBinaryChunk('output from the session'));
    await act(async () => latest().emitControl({ type: 'exit', code: 0 }));

    expect(received).toEqual(['output from the session']);
  });

  // use-container-session.md — send(data) forwards operator input once the channel is open
  it('send() forwards input once the channel is open', async () => {
    const { result } = renderHook(() => useContainerSession('container-1', 'exec', { cmd: ['/bin/sh'] }, true));
    await act(async () => latest().emitOpen());

    act(() => result.current.send('ls -la\n'));

    expect(lastSentText(latest())).toBe('ls -la\n');
  });

  // use-container-session.md — send(data) is a no-op while the channel is not open
  it('send() is a no-op while the channel is not open', () => {
    const { result } = renderHook(() => useContainerSession('container-1', 'exec', { cmd: ['/bin/sh'] }, true));

    act(() => result.current.send('too early\n'));

    expect(latest().sent).toHaveLength(0);
  });

  // use-container-session.md — resize(cols, rows) sends a resize control message once open
  it('resize() sends a resize control message once the channel is open', async () => {
    const { result } = renderHook(() => useContainerSession('container-1', 'exec', { cmd: ['/bin/sh'] }, true));
    await act(async () => latest().emitOpen());

    act(() => result.current.resize(120, 40));

    expect(JSON.parse(lastSentText(latest()))).toEqual({ type: 'resize', cols: 120, rows: 40 });
  });

  // use-container-session.md — resize(cols, rows) is a no-op while the channel is not open
  it('resize() is a no-op while the channel is not open', () => {
    const { result } = renderHook(() => useContainerSession('container-1', 'exec', { cmd: ['/bin/sh'] }, true));

    act(() => result.current.resize(80, 24));

    expect(latest().sent).toHaveLength(0);
  });

  // use-container-session.md — error is set from a server error control message
  it('surfaces a server-reported error and sets status to error', async () => {
    const { result } = renderHook(() => useContainerSession('container-1', 'exec', { cmd: ['/bin/sh'] }, true));
    await act(async () => latest().emitOpen());

    await act(async () => latest().emitControl({ type: 'error', message: 'No such container: container-1' }));

    expect(result.current.error).toBe('No such container: container-1');
    expect(result.current.status).toBe('error');
  });

  // use-container-session.md — exitCode is set from a server exit control message
  it('surfaces the exit code from a server exit control message and reports the session closed', async () => {
    const { result } = renderHook(() => useContainerSession('container-1', 'exec', { cmd: ['/bin/sh'] }, true));
    await act(async () => latest().emitOpen());

    await act(async () => latest().emitControl({ type: 'exit', code: 7 }));

    expect(result.current.exitCode).toBe(7);
    expect(result.current.status).toBe('closed');
  });

  // use-container-session.md — close() closes the channel, tearing down the session
  it('close() closes the underlying channel', async () => {
    const { result } = renderHook(() => useContainerSession('container-1', 'exec', { cmd: ['/bin/sh'] }, true));
    await act(async () => latest().emitOpen());

    act(() => result.current.close());

    expect(latest().readyState).toBe(FakeWebSocket.CLOSED);
  });

  // use-container-session.md — the channel is closed on unmount, and reopened when active/containerId/kind/launch change
  it('closes the channel on unmount without reopening it', async () => {
    const { unmount } = renderHook(() => useContainerSession('container-1', 'exec', { cmd: ['/bin/sh'] }, true));
    const first = latest();
    await act(async () => first.emitOpen());

    unmount();

    expect(first.readyState).toBe(FakeWebSocket.CLOSED);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  // use-container-session.md — the channel is reopened whenever active turns false and true again
  it('reopens a new channel when re-activated', async () => {
    const { rerender } = renderHook(({ active }: { active: boolean }) => useContainerSession('container-1', 'exec', { cmd: ['/bin/sh'] }, active), {
      initialProps: { active: true },
    });
    const first = latest();
    await act(async () => first.emitOpen());

    await act(async () => rerender({ active: false }));
    expect(first.readyState).toBe(FakeWebSocket.CLOSED);
    expect(FakeWebSocket.instances).toHaveLength(1);

    await act(async () => rerender({ active: true }));
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  // use-container-session.md — an unexpected connection drop is reported as an error
  it('reports an unexpected connection drop as an error', async () => {
    const { result } = renderHook(() => useContainerSession('container-1', 'attach', undefined, true));
    await act(async () => latest().emitOpen());

    await act(async () => latest().emitConnectionError());

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBeTruthy();
  });
});
