import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { forwardRef, useImperativeHandle } from 'react';
import type { TerminalHandle, TerminalProps } from '../../src/ui/terminal/Terminal';
import { ContainerSessionView } from '../../src/containers/ContainerSessionView';
import type { ContainerSummary } from '../../src/data/containers-client';

// The Terminal wraps xterm.js, a third-party emulator this suite does not
// exercise (it needs a real browser, covered by the e2e suite instead); this
// fake keeps the same typed surface so ContainerSessionView's own wiring
// (write on incoming data, onInput/onResize plumbing) stays under test.
const writesByInstance: string[][] = [];
vi.mock('../../src/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/ui')>();
  const FakeTerminal = forwardRef<TerminalHandle, TerminalProps>(function FakeTerminal({ onInput, onResize }, ref) {
    const writes: string[] = [];
    writesByInstance.push(writes);
    useImperativeHandle(ref, () => ({
      write: (data: string) => writes.push(data),
      focus: () => {},
      dispose: () => {},
    }));
    return (
      <div data-testid="fake-terminal">
        <button onClick={() => onInput?.('typed-by-operator')}>simulate-keystroke</button>
        <button onClick={() => onResize?.(100, 30)}>simulate-resize</button>
      </div>
    );
  });
  return { ...actual, Terminal: FakeTerminal };
});

// Stands in for the browser's WebSocket underneath useContainerSession, so
// the session's lifecycle (connecting/open/closed/error) is driven directly
// from the test rather than a real socket.
class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
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

  emitControl(message: unknown) {
    this.dispatch('message', { data: JSON.stringify(message) });
  }

  emitBinaryChunk(text: string) {
    this.dispatch('message', { data: new TextEncoder().encode(text).buffer });
  }

  private dispatch(type: string, event: unknown) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

function latestSocket(): FakeWebSocket {
  return FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
}

function makeContainer(overrides: Partial<ContainerSummary> = {}): ContainerSummary {
  return {
    id: 'container-1',
    shortId: 'container1',
    name: 'web-nginx',
    image: 'nginx:1.27',
    state: 'running',
    status: 'Up 3 days',
    ports: [],
    ...overrides,
  };
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  writesByInstance.length = 0;
  vi.stubGlobal('WebSocket', FakeWebSocket);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ContainerSessionView — not running (REQ-34, REQ-35)', () => {
  // container-session-view.md — a non-running container shows an empty state instead of the form/terminal
  it('shows an empty state and opens no session for a non-running container', () => {
    render(<ContainerSessionView container={makeContainer({ state: 'exited' })} kind="exec" />);

    expect(screen.getByText('Container is not running')).toBeInTheDocument();
    expect(FakeWebSocket.instances).toHaveLength(0);
  });
});

describe('ContainerSessionView — exec launch form (REQ-34)', () => {
  // container-session-view.md — a preset shell is run directly, as its own Cmd token
  it('launches a preset shell directly as the exec command', async () => {
    const user = userEvent.setup();
    render(<ContainerSessionView container={makeContainer()} kind="exec" />);

    await user.click(screen.getByRole('button', { name: 'Launch session' }));

    expect(latestSocket().url).toContain('cmd=%2Fbin%2Fbash');
  });

  // container-session-view.md — a custom command is run as /bin/sh -c "<command>"
  it('runs a custom command as /bin/sh -c "<command>"', async () => {
    const user = userEvent.setup();
    render(<ContainerSessionView container={makeContainer()} kind="exec" />);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Shell' }), 'custom');
    await user.type(screen.getByRole('textbox', { name: 'Custom command' }), 'tail -f /var/log/app.log');
    await user.click(screen.getByRole('button', { name: 'Launch session' }));

    const url = new URL(latestSocket().url);
    expect(url.searchParams.getAll('cmd')).toEqual(['/bin/sh', '-c', 'tail -f /var/log/app.log']);
  });

  // container-session-view.md — the chosen user and working directory are carried into the launch
  it('carries the chosen user and working directory into the launch', async () => {
    const user = userEvent.setup();
    render(<ContainerSessionView container={makeContainer()} kind="exec" />);

    await user.type(screen.getByRole('textbox', { name: 'User' }), 'root');
    await user.type(screen.getByRole('textbox', { name: 'Working directory' }), '/app');
    await user.click(screen.getByRole('button', { name: 'Launch session' }));

    const url = new URL(latestSocket().url);
    expect(url.searchParams.get('user')).toBe('root');
    expect(url.searchParams.get('workdir')).toBe('/app');
  });
});

describe('ContainerSessionView — attach (REQ-35)', () => {
  // container-session-view.md — kind="attach" offers only an attach action, no launch form
  it('offers only an Attach action, with no shell/user/workdir fields', () => {
    render(<ContainerSessionView container={makeContainer()} kind="attach" />);

    expect(screen.getByRole('button', { name: 'Attach' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Shell' })).not.toBeInTheDocument();
  });

  // container-session-view.md — the Attach action opens the attach endpoint, with no launch query
  it('opens the attach session on the attach endpoint', async () => {
    const user = userEvent.setup();
    render(<ContainerSessionView container={makeContainer()} kind="attach" />);

    await user.click(screen.getByRole('button', { name: 'Attach' }));

    expect(latestSocket().url).toContain('/api/containers/container-1/attach');
  });
});

describe('ContainerSessionView — live session and teardown (REQ-34, REQ-35, REQ-36)', () => {
  // container-session-view.md — once connected, output arriving over the session is written into the terminal
  it('writes incoming session output into the terminal', async () => {
    const user = userEvent.setup();
    render(<ContainerSessionView container={makeContainer()} kind="exec" />);
    await user.click(screen.getByRole('button', { name: 'Launch session' }));
    await act(async () => latestSocket().emitOpen());

    await act(async () => latestSocket().emitBinaryChunk('output from the process'));

    expect(writesByInstance[writesByInstance.length - 1]).toContain('output from the process');
  });

  // container-session-view.md — the session header's detach/close action closes the session without affecting the container
  it("detaching via the session header's action closes the session", async () => {
    const user = userEvent.setup();
    render(<ContainerSessionView container={makeContainer()} kind="exec" />);
    await user.click(screen.getByRole('button', { name: 'Launch session' }));
    await act(async () => latestSocket().emitOpen());

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(latestSocket().readyState).toBe(FakeWebSocket.CLOSED);
  });

  // container-session-view.md — attach's header action is labelled Detach rather than Close
  it("labels the attach session's disconnect action Detach", async () => {
    const user = userEvent.setup();
    render(<ContainerSessionView container={makeContainer()} kind="attach" />);
    await user.click(screen.getByRole('button', { name: 'Attach' }));
    await act(async () => latestSocket().emitOpen());

    expect(screen.getByRole('button', { name: 'Detach' })).toBeInTheDocument();
  });

  // container-session-view.md — once the session ends, an overlay states why, with a Close action returning to the pre-session state
  it('shows the session-ended overlay with the exit code, and Close returns to the launch form', async () => {
    const user = userEvent.setup();
    render(<ContainerSessionView container={makeContainer()} kind="exec" />);
    await user.click(screen.getByRole('button', { name: 'Launch session' }));
    await act(async () => latestSocket().emitOpen());

    await act(async () => latestSocket().emitControl({ type: 'exit', code: 7 }));

    const overlayMessage = await screen.findByText('Session ended (exit code 7).');
    const overlay = overlayMessage.closest('.ui-session-ended-overlay') as HTMLElement;
    await user.click(within(overlay).getByRole('button', { name: 'Close' }));

    expect(screen.getByRole('button', { name: 'Launch session' })).toBeInTheDocument();
  });

  // container-session-view.md — a server-reported error is shown as the session-ended overlay's message
  it("shows the daemon's own error message on the session-ended overlay", async () => {
    const user = userEvent.setup();
    render(<ContainerSessionView container={makeContainer()} kind="exec" />);
    await user.click(screen.getByRole('button', { name: 'Launch session' }));
    await act(async () => latestSocket().emitOpen());

    await act(async () => latestSocket().emitControl({ type: 'error', message: 'container is not running' }));

    expect(await screen.findByText('container is not running')).toBeInTheDocument();
  });

  // container-session-view.md — unmounting the view (e.g. switching tabs) closes any active session
  it('closes the active session when the view unmounts', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ContainerSessionView container={makeContainer()} kind="exec" />);
    await user.click(screen.getByRole('button', { name: 'Launch session' }));
    await act(async () => latestSocket().emitOpen());

    unmount();

    expect(latestSocket().readyState).toBe(FakeWebSocket.CLOSED);
  });

  // container-session-view.md — the Terminal's onInput is wired to the session's operator input
  it("forwards the terminal's keystrokes as session input", async () => {
    const user = userEvent.setup();
    render(<ContainerSessionView container={makeContainer()} kind="exec" />);
    await user.click(screen.getByRole('button', { name: 'Launch session' }));
    await act(async () => latestSocket().emitOpen());

    await user.click(screen.getByRole('button', { name: 'simulate-keystroke' }));

    expect(latestSocket().sent).toHaveLength(1);
  });

  // container-session-view.md — the Terminal's onResize is wired to the session's resize
  it("forwards the terminal's layout resize as a session resize", async () => {
    const user = userEvent.setup();
    render(<ContainerSessionView container={makeContainer()} kind="exec" />);
    await user.click(screen.getByRole('button', { name: 'Launch session' }));
    await act(async () => latestSocket().emitOpen());

    await user.click(screen.getByRole('button', { name: 'simulate-resize' }));

    const sent = latestSocket().sent[0];
    expect(JSON.parse(sent as string)).toEqual({ type: 'resize', cols: 100, rows: 30 });
  });
});
