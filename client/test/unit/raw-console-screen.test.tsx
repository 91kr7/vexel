import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ConsoleRunEntry, UseConsoleResult } from '../../src/data/use-console';
import type { ContextSummary } from '../../src/data/contexts-client';
import { ConfirmationProvider } from '../../src/shell/services/ConfirmationService';
import { ErrorReportingProvider, useErrorReporter } from '../../src/shell/services/ErrorReportingService';
import { ToastProvider } from '../../src/ui';

// raw-console/specs/raw-console-screen.md — the escape hatch where any docker command line or any
// Engine API call can be run (REQ-100 … REQ-104, REQ-112, REQ-114). The console hook is mocked so
// the screen's own decisions are what is under test: above all that nothing runs unclassified, and
// that a destructive entry goes through the application's confirmation naming the exact command.

const consoleHook = {
  classify: vi.fn(),
  run: vi.fn(),
  cancel: vi.fn(),
};

let consoleState: Pick<UseConsoleResult, 'entries' | 'loaded' | 'error' | 'running' | 'recallable'> = {
  entries: [],
  loaded: true,
  running: false,
  recallable: [],
};

let activeContext: ContextSummary | undefined = {
  name: 'colima',
  endpoint: 'unix:///Users/op/.colima/docker.sock',
  kind: 'local',
  tls: false,
  active: true,
};

vi.mock('../../src/data/use-console', () => ({
  useConsole: (): UseConsoleResult => ({ ...consoleState, ...consoleHook }),
}));

vi.mock('../../src/data/use-contexts', () => ({
  useContexts: () => ({ contexts: [], active: activeContext, loaded: true, refresh: vi.fn(), create: vi.fn(), remove: vi.fn(), use: vi.fn() }),
}));

const { RawConsoleScreen } = await import('../../src/console/RawConsoleScreen');

function sessionEntry(overrides: Partial<ConsoleRunEntry> = {}): ConsoleRunEntry {
  return {
    id: 'e1',
    channel: 'cli',
    command: 'docker ps -a',
    lines: [{ id: 'l1', text: 'CONTAINER ID', stream: 'stdout' }],
    status: 'exit 0',
    succeeded: true,
    running: false,
    persisted: true,
    restored: false,
    ...overrides,
  };
}

/** Surfaces what the screen reported through the shared error service, so the assertion can read it. */
function ReportedErrors() {
  const { errors } = useErrorReporter();
  return (
    <>
      {errors.map((error) => (
        <p key={error.id}>{`${error.title}${error.detail ? `: ${error.detail}` : ''}`}</p>
      ))}
    </>
  );
}

function renderScreen() {
  render(
    <ErrorReportingProvider>
      <ConfirmationProvider>
        <ToastProvider>
          <RawConsoleScreen />
          <ReportedErrors />
        </ToastProvider>
      </ConfirmationProvider>
    </ErrorReportingProvider>,
  );
}

function prompt(): HTMLInputElement {
  return screen.getByLabelText('Console prompt') as HTMLInputElement;
}

function confirmDialog(): HTMLElement {
  return document.querySelector('.ui-modal') as HTMLElement;
}

beforeEach(() => {
  for (const spy of Object.values(consoleHook)) spy.mockReset();
  consoleHook.classify.mockResolvedValue({ destructive: false, carriesSecret: false });
  consoleHook.run.mockResolvedValue(undefined);
  consoleState = { entries: [], loaded: true, running: false, recallable: [] };
  activeContext = { name: 'colima', endpoint: 'unix:///Users/op/.colima/docker.sock', kind: 'local', tls: false, active: true };
});

afterEach(cleanup);

describe('RawConsoleScreen — the channel and its notice (REQ-104)', () => {
  // raw-console-screen.md — "the channel selector, docker CLI or Engine API, exactly one selected
  // (CLI when the screen opens)"
  it('opens on the CLI channel, with both channels offered', () => {
    renderScreen();

    const selector = screen.getByRole('group', { name: 'Console channel' });
    expect(within(selector).getByRole('button', { name: 'docker CLI' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(selector).getByRole('button', { name: 'Engine API' })).toHaveAttribute('aria-pressed', 'false');
  });

  // raw-console-screen.md — "the notice, restated for the selected channel: the channel's name, that
  // entries run with the full privileges of the Docker daemon and of the user the server runs as,
  // and what the channel dials — a local docker process, or a direct Engine API call — against the
  // active context, named"
  it('states the channel, the privileges and what the CLI channel dials against the named context', () => {
    renderScreen();

    const notice = document.querySelector('.ui-state-summary-bar') as HTMLElement;
    expect(notice).toHaveTextContent('docker CLI');
    expect(notice).toHaveTextContent(/full privileges of the Docker daemon and of the user the server runs as/i);
    expect(notice).toHaveTextContent(/local docker process/i);
    expect(notice).toHaveTextContent('colima');
  });

  it('restates the notice for the Engine API channel once it is selected', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(screen.getByRole('button', { name: 'Engine API' }));

    const notice = document.querySelector('.ui-state-summary-bar') as HTMLElement;
    expect(notice).toHaveTextContent('Engine API');
    expect(notice).toHaveTextContent(/direct Engine API call/i);
    expect(notice).toHaveTextContent(/full privileges/i);
    expect(notice).toHaveTextContent('colima');
  });

  // raw-console-screen.md — "the prompt, its placeholder being an example in the selected channel's
  // own grammar"
  it('offers a placeholder in the grammar of the selected channel', async () => {
    const user = userEvent.setup();
    renderScreen();

    expect(prompt().placeholder).toMatch(/^docker /);

    await user.click(screen.getByRole('button', { name: 'Engine API' }));
    expect(prompt().placeholder).toMatch(/^(GET|POST|PUT|DELETE) \//);
  });

  // raw-console-screen.md — "each with the command as it was typed, the channel it ran on ..."
  it('states on each entry the channel it ran on, whichever channel is now selected', async () => {
    const user = userEvent.setup();
    consoleState.entries = [sessionEntry({ id: 'a', channel: 'cli', command: 'docker ps' })];
    renderScreen();

    await user.click(screen.getByRole('button', { name: 'Engine API' }));

    const entry = document.querySelector('.ui-console-surface__entry') as HTMLElement;
    expect(entry).toHaveTextContent('docker ps');
    expect(entry).toHaveTextContent('docker CLI');
  });
});

describe('RawConsoleScreen — running a line (REQ-100, REQ-112)', () => {
  // raw-console-screen.md — "Before a line runs it is classified by the server"; a non-destructive
  // line runs straight away, on the selected channel, exactly as typed
  it('classifies the line and runs it exactly as typed on the selected channel', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.type(prompt(), 'docker manifest inspect alpine:3.20{Enter}');

    await waitFor(() => expect(consoleHook.run).toHaveBeenCalled());
    expect(consoleHook.classify).toHaveBeenCalledWith('cli', 'docker manifest inspect alpine:3.20');
    expect(consoleHook.run).toHaveBeenCalledWith('cli', 'docker manifest inspect alpine:3.20', { persist: true });
  });

  it('runs on the Engine API channel once it is selected', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(screen.getByRole('button', { name: 'Engine API' }));
    await user.type(prompt(), 'GET /containers/json?all=1{Enter}');

    await waitFor(() => expect(consoleHook.run).toHaveBeenCalledWith('api', 'GET /containers/json?all=1', { persist: true }));
  });

  // raw-console-screen.md — "A classification that could not be obtained is reported and the line is
  // not run: nothing runs unclassified."
  it('reports a classification that could not be obtained and runs nothing', async () => {
    const user = userEvent.setup();
    consoleHook.classify.mockRejectedValue(new Error('classification unreachable'));
    renderScreen();

    await user.type(prompt(), 'docker ps{Enter}');

    expect(await screen.findByText(/classification unreachable/)).toBeInTheDocument();
    expect(consoleHook.run).not.toHaveBeenCalled();
    // The line the operator typed is still there to try again.
    expect(prompt()).toHaveValue('docker ps');
  });

  // raw-console-screen.md — "Nothing runs while another entry is running."
  it('runs nothing while another entry is running', async () => {
    const user = userEvent.setup();
    consoleState.running = true;
    renderScreen();

    await user.type(prompt(), 'docker ps{Enter}');

    expect(consoleHook.classify).not.toHaveBeenCalled();
    expect(consoleHook.run).not.toHaveBeenCalled();
  });

  // raw-console-screen.md — "'Cancel', while an entry is running → ends it"
  it('offers a cancel control while an entry is running', async () => {
    const user = userEvent.setup();
    consoleState.running = true;
    consoleState.entries = [sessionEntry({ running: true, status: undefined })];
    renderScreen();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(consoleHook.cancel).toHaveBeenCalledTimes(1);
  });

  // raw-console-screen.md — "'Re-run' on an entry → runs that entry's command again, on that entry's
  // channel, through the same path as a typed one"
  it('re-runs an entry on its own channel, through the same classification path', async () => {
    const user = userEvent.setup();
    consoleState.entries = [sessionEntry({ id: 'api-entry', channel: 'api', command: 'GET /info' })];
    renderScreen();

    await user.click(screen.getByRole('button', { name: 'Re-run' }));

    await waitFor(() => expect(consoleHook.run).toHaveBeenCalledWith('api', 'GET /info', { persist: true }));
    expect(consoleHook.classify).toHaveBeenCalledWith('api', 'GET /info');
  });
});

describe('RawConsoleScreen — the confirmation a destructive entry goes through (REQ-112)', () => {
  // raw-console-screen.md — "A line classified as destructive opens the application's own
  // confirmation, whose title and body name the exact command, and states what makes it destructive
  // plus that it runs on the daemon of the active context."
  it('opens the application confirmation naming the exact command and what makes it destructive', async () => {
    const user = userEvent.setup();
    consoleHook.classify.mockResolvedValue({
      destructive: true,
      reason: 'A prune reaches every object the daemon considers unused.',
      carriesSecret: false,
    });
    renderScreen();

    await user.type(prompt(), 'docker system prune -a{Enter}');

    expect(await screen.findByRole('heading', { name: 'Confirm: docker system prune -a' })).toBeInTheDocument();
    const dialog = confirmDialog();
    expect(dialog).toHaveTextContent('docker system prune -a');
    expect(dialog).toHaveTextContent('A prune reaches every object the daemon considers unused.');
    expect(dialog).toHaveTextContent(/daemon of the active context/i);
    expect(consoleHook.run).not.toHaveBeenCalled();
  });

  // raw-console-screen.md — "Cancelling runs nothing and leaves the line in the prompt."
  it('runs nothing and keeps the line in the prompt when the confirmation is cancelled', async () => {
    const user = userEvent.setup();
    consoleHook.classify.mockResolvedValue({ destructive: true, reason: 'It removes.', carriesSecret: false });
    renderScreen();

    await user.type(prompt(), 'docker rm -f my-container{Enter}');
    await screen.findByRole('heading', { name: 'Confirm: docker rm -f my-container' });

    await user.click(within(confirmDialog()).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('heading', { name: /^Confirm:/ })).not.toBeInTheDocument());
    expect(consoleHook.run).not.toHaveBeenCalled();
    expect(prompt()).toHaveValue('docker rm -f my-container');
  });

  // raw-console-screen.md — "A confirmed command runs exactly as it was typed — never rewritten,
  // never re-quoted, never supplemented."
  it('runs the command exactly as typed once the confirmation is given', async () => {
    const user = userEvent.setup();
    const typed = 'docker rm -f  "my container"';
    consoleHook.classify.mockResolvedValue({ destructive: true, reason: 'It removes.', carriesSecret: false });
    renderScreen();

    await user.type(prompt(), `${typed}{Enter}`);
    // Read off the dialog's own text: an accessible name collapses the double
    // space, and the point here is that nothing collapses the command itself.
    await screen.findByRole('button', { name: 'Run' });
    expect(confirmDialog().textContent).toContain(typed);
    await user.click(within(confirmDialog()).getByRole('button', { name: 'Run' }));

    await waitFor(() => expect(consoleHook.run).toHaveBeenCalledWith('cli', typed, { persist: true }));
  });
});

describe('RawConsoleScreen — a command that could carry a credential (REQ-104)', () => {
  // use-console.md / raw-console-screen.md — a classification carrying carriesSecret runs with
  // persist false, so the command never reaches the history file
  it('runs a credential-carrying command without ever handing it to the history', async () => {
    const user = userEvent.setup();
    consoleHook.classify.mockResolvedValue({ destructive: false, carriesSecret: true });
    renderScreen();

    await user.type(prompt(), 'docker login -p hunter2 registry.example.com{Enter}');

    await waitFor(() =>
      expect(consoleHook.run).toHaveBeenCalledWith('cli', 'docker login -p hunter2 registry.example.com', { persist: false }),
    );
  });

  // raw-console-screen.md — "'not kept in history' on an entry whose command could carry a credential"
  it('marks an entry that was not kept in the history', () => {
    consoleState.entries = [sessionEntry({ persisted: false, command: 'docker login -p hunter2 registry.example.com' })];
    renderScreen();

    expect(screen.getByText('not kept in history')).toBeInTheDocument();
  });

  it('marks no ordinary entry as unkept', () => {
    consoleState.entries = [sessionEntry()];
    renderScreen();

    expect(screen.queryByText('not kept in history')).not.toBeInTheDocument();
  });
});

describe('RawConsoleScreen — the starting points (REQ-103)', () => {
  // raw-console-screen.md — "the starting points for the selected channel: the long tail the console
  // exists for (manifest, trust, scout, sbom, buildx bake, context inspect, plugin install, events,
  // system df, checkpoint)"
  it('offers the long-tail commands as one-click starting points on the CLI channel', () => {
    renderScreen();

    for (const fragment of ['manifest', 'trust', 'scout', 'sbom', 'buildx bake', 'context inspect', 'plugin install', 'events', 'system df', 'checkpoint']) {
      expect(
        screen.getByRole('button', { name: new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }),
        `no starting point for ${fragment}`,
      ).toBeInTheDocument();
    }
  });

  // raw-console-screen.md — "and, on the CLI channel, a second group for what no screen of its own
  // carries — image build, stack deploy, a build with a cache export, and creating a TCP+TLS context"
  it('offers a second group for what no screen of its own carries', () => {
    renderScreen();

    // An image build, a stack deploy, a build exporting its cache, and a TCP+TLS context.
    expect(screen.getByRole('button', { name: /^docker build -t/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^docker stack deploy/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^docker buildx build .*--cache-to/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^docker context create .*tcp:\/\/.*ca=.*cert=.*key=/ })).toBeInTheDocument();
  });

  it('offers Engine API starting points, and no CLI ones, on the API channel', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(screen.getByRole('button', { name: 'Engine API' }));

    expect(screen.getByRole('button', { name: 'GET /containers/json?all=1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^docker manifest/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^docker build/ })).not.toBeInTheDocument();
  });

  // raw-console-screen.md — "a starting-point chip → puts that command into the prompt, ready to be
  // completed; it never runs on its own"
  it('puts a starting point into the prompt without running it', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(screen.getByRole('button', { name: /^docker manifest inspect/ }));

    expect(prompt().value).toMatch(/^docker manifest inspect/);
    expect(consoleHook.classify).not.toHaveBeenCalled();
    expect(consoleHook.run).not.toHaveBeenCalled();
  });
});

describe('RawConsoleScreen — the history read (REQ-114)', () => {
  // raw-console-screen.md — "The history is read once when the screen opens and survives a restart;
  // a read that fails is reported without emptying what is already shown."
  it('shows the restored history alongside this session\'s entries', () => {
    consoleState.entries = [
      sessionEntry({ id: 'old', command: 'docker version', restored: true }),
      sessionEntry({ id: 'new', command: 'docker info' }),
    ];
    renderScreen();

    const commands = Array.from(document.querySelectorAll('.ui-console-surface__command')).map((node) => node.textContent);
    expect(commands).toEqual(['docker version', 'docker info']);
  });

  it('reports a failed history read without emptying the transcript', () => {
    consoleState.entries = [sessionEntry({ command: 'docker version' })];
    consoleState.error = 'history unreachable';
    renderScreen();

    expect(screen.getByText(/history unreachable/)).toBeInTheDocument();
    expect(document.querySelector('.ui-console-surface__command')).toHaveTextContent('docker version');
  });

  // raw-console-screen.md — the prompt walks "the previous commands, the ones from before the
  // restart included"
  it('walks the recallable commands into the prompt, restored ones included', async () => {
    const user = userEvent.setup();
    consoleState.recallable = ['docker version', 'docker info'];
    renderScreen();

    await user.type(prompt(), '{ArrowUp}');

    expect(prompt()).toHaveValue('docker info');
  });
});

describe('RawConsoleScreen — with no context named yet', () => {
  // raw-console-screen.md — the notice names the active context; it must still state the privileges
  // before the context list has been read
  it('still states the channel and the privileges before the active context is known', () => {
    activeContext = undefined;
    renderScreen();

    const notice = document.querySelector('.ui-state-summary-bar') as HTMLElement;
    expect(notice).toHaveTextContent(/full privileges/i);
    expect(notice).toHaveTextContent(/active Docker context/i);
  });
});
