import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConsoleSurface, type ConsoleEntry } from '../../src/ui';

afterEach(cleanup);

// ui-library/specs/console-surface.md — the transcript of a command console: self-contained entries
// with their own command, output, status, copy and re-run, plus the prompt that adds the next one
// (REQ-100, REQ-101, REQ-102, REQ-104).

// userEvent.setup() installs its own navigator.clipboard stub, so the test's stub must be defined
// after setup() to take precedence over it.
function stubClipboard(): ReturnType<typeof vi.fn> {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  return writeText;
}

function entry(overrides: Partial<ConsoleEntry> = {}): ConsoleEntry {
  return {
    id: 'e1',
    command: 'docker ps -a',
    lines: [{ id: 'l1', text: 'CONTAINER ID   IMAGE' }],
    status: 'exit 0',
    statusTone: 'success',
    ...overrides,
  };
}

function renderSurface(props: Partial<React.ComponentProps<typeof ConsoleSurface>> = {}) {
  const onChange = vi.fn();
  const onSubmit = vi.fn();
  const result = render(
    <ConsoleSurface entries={[]} value="" onChange={onChange} onSubmit={onSubmit} {...props} />,
  );
  return { ...result, onChange, onSubmit };
}

function prompt(): HTMLInputElement {
  return screen.getByLabelText('Console prompt') as HTMLInputElement;
}

describe('ConsoleSurface — the transcript', () => {
  // console-surface.md — "the prompt symbol and the command exactly as given ... its channel label
  // when present, then its status"
  it('shows each entry with the command exactly as given, its channel label and its status', () => {
    const typed = 'docker ps   --filter "name=my container"';
    const { container } = renderSurface({
      entries: [entry({ command: typed, channelLabel: 'docker CLI' })],
    });

    expect(container.querySelector('.ui-console-surface__command')).toHaveTextContent(typed, { normalizeWhitespace: false });
    expect(screen.getByText('docker CLI')).toBeInTheDocument();
    expect(screen.getByText('exit 0')).toBeInTheDocument();
  });

  // console-surface.md — "the entry's output lines under it, in order ... a line tagged stderr is
  // visually distinguished from an stdout one"
  it('shows the output lines in order, setting a stderr line apart', () => {
    const { container } = renderSurface({
      entries: [
        entry({
          lines: [
            { id: 'a', text: 'first', stream: 'stdout' },
            { id: 'b', text: 'went wrong', stream: 'stderr' },
            { id: 'c', text: 'third', stream: 'stdout' },
          ],
        }),
      ],
    });

    const lines = Array.from(container.querySelectorAll('.ui-console-surface__line'));
    expect(lines.map((line) => line.textContent)).toEqual(['first', 'went wrong', 'third']);
    expect(lines[1]!.className).not.toEqual(lines[0]!.className);
    expect(lines[1]!.className).toContain('stderr');
  });

  // console-surface.md — "a pending indicator while running is true, the status badge once it is not"
  it('shows a pending indicator instead of the status while an entry is running', () => {
    renderSurface({ entries: [entry({ running: true, status: 'exit 0' })] });

    expect(screen.queryByText('exit 0')).not.toBeInTheDocument();
  });

  // console-surface.md — "note? — a muted aside next to the status (e.g. why the entry was not kept)"
  it('shows the entry note next to its status', () => {
    renderSurface({ entries: [entry({ note: 'not kept in history' })] });

    expect(screen.getByText('not kept in history')).toBeInTheDocument();
  });

  // console-surface.md — "the empty-state label instead of any entry when entries is empty"
  it('shows the empty-state label when there is no entry', () => {
    renderSurface({ emptyLabel: 'Nothing has been run yet.' });

    expect(screen.getByText('Nothing has been run yet.')).toBeInTheDocument();
  });

  it('shows no empty-state label once an entry is present', () => {
    renderSurface({ entries: [entry()], emptyLabel: 'Nothing has been run yet.' });

    expect(screen.queryByText('Nothing has been run yet.')).not.toBeInTheDocument();
  });

  it('keeps the entries in the order they were given', () => {
    const { container } = renderSurface({
      entries: [entry({ id: 'first', command: 'docker version' }), entry({ id: 'second', command: 'docker info' })],
    });

    const commands = Array.from(container.querySelectorAll('.ui-console-surface__command')).map((node) => node.textContent);
    expect(commands).toEqual(['docker version', 'docker info']);
  });
});

describe('ConsoleSurface — per-entry actions (REQ-102)', () => {
  // console-surface.md — "Copy (on every entry) → puts "<promptSymbol> <command>" followed by the
  // entry's output lines, one per line, on the clipboard"
  it('copies the command and its output, one line per line', async () => {
    const user = userEvent.setup();
    const writeText = stubClipboard();
    renderSurface({
      entries: [
        entry({
          command: 'docker ps -a',
          lines: [
            { id: 'a', text: 'first' },
            { id: 'b', text: 'second' },
          ],
        }),
      ],
    });

    await user.click(screen.getByRole('button', { name: 'Copy' }));

    expect(writeText).toHaveBeenCalledWith('$ docker ps -a\nfirst\nsecond');
  });

  it('copies with the prompt symbol the caller chose', async () => {
    const user = userEvent.setup();
    const writeText = stubClipboard();
    renderSurface({ entries: [entry({ command: 'GET /info', lines: [] })], promptSymbol: '>' });

    await user.click(screen.getByRole('button', { name: 'Copy' }));

    expect(writeText).toHaveBeenCalledWith('> GET /info');
  });

  // console-surface.md — "Re-run (on every entry, only when onRerun is set) → calls onRerun(entry.id)"
  it('offers no re-run control when onRerun is not given', () => {
    renderSurface({ entries: [entry()] });

    expect(screen.queryByRole('button', { name: 'Re-run' })).not.toBeInTheDocument();
  });

  it('calls onRerun with the id of the entry whose control was used', async () => {
    const user = userEvent.setup();
    const onRerun = vi.fn();
    renderSurface({
      entries: [entry({ id: 'first', command: 'docker version' }), entry({ id: 'second', command: 'docker info' })],
      onRerun,
    });

    await user.click(screen.getAllByRole('button', { name: 'Re-run' })[1]!);

    expect(onRerun).toHaveBeenCalledWith('second');
  });

  // console-surface.md — "inert while busy"
  it('leaves the re-run control inert while busy', async () => {
    // The pointer-events check is switched off for the session, not per call:
    // `click` takes the element alone, so a per-call option would be ignored.
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onRerun = vi.fn();
    renderSurface({ entries: [entry()], onRerun, busy: true, onCancel: vi.fn() });

    const rerun = screen.getByRole('button', { name: 'Re-run' });
    expect(rerun).toBeDisabled();
    await user.click(rerun);
    expect(onRerun).not.toHaveBeenCalled();
  });

  // console-surface.md — "Cancel (only while busy and onCancel is set) → calls onCancel"
  it('offers the cancel control only while busy and onCancel is set', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const { rerender } = render(
      <ConsoleSurface entries={[entry()]} value="" onChange={vi.fn()} onSubmit={vi.fn()} onCancel={onCancel} />,
    );
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();

    rerender(<ConsoleSurface entries={[entry()]} value="" onChange={vi.fn()} onSubmit={vi.fn()} busy />);
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();

    rerender(<ConsoleSurface entries={[entry()]} value="" onChange={vi.fn()} onSubmit={vi.fn()} busy onCancel={onCancel} />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('ConsoleSurface — the prompt', () => {
  // console-surface.md — "the prompt line: the prompt symbol, the editable value, the placeholder
  // while it is empty"; "inputAriaLabel? (default "Console prompt")"
  it('shows the value and the placeholder, under the default prompt label', () => {
    renderSurface({ value: 'docker ps', placeholder: 'docker manifest inspect alpine:3.20' });

    const input = prompt();
    expect(input).toHaveValue('docker ps');
    expect(input).toHaveAttribute('placeholder', 'docker manifest inspect alpine:3.20');
  });

  it('uses the input label the caller chose', () => {
    renderSurface({ inputAriaLabel: 'Engine API prompt' });

    expect(screen.getByLabelText('Engine API prompt')).toBeInTheDocument();
  });

  // console-surface.md — "typing in the prompt → calls onChange with the new value"
  it('calls onChange with what was typed', async () => {
    const user = userEvent.setup();
    const { onChange } = renderSurface();

    await user.type(prompt(), 'd');

    expect(onChange).toHaveBeenCalledWith('d');
  });

  // console-surface.md — "Enter in the prompt → calls onSubmit; does nothing when busy or when the
  // value is blank"
  it('submits on Enter', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderSurface({ value: 'docker ps' });

    await user.type(prompt(), '{Enter}');

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('does not submit a blank value', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderSurface({ value: '   ' });

    await user.type(prompt(), '{Enter}');

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not submit while busy', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderSurface({ value: 'docker ps', busy: true, onCancel: vi.fn() });

    await user.type(prompt(), '{Enter}');

    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('ConsoleSurface — recall (REQ-102)', () => {
  // console-surface.md — "ArrowUp / ArrowDown in the prompt → walks recallable into the prompt, most
  // recent first"
  it('walks the previous commands most recent first on ArrowUp', async () => {
    const user = userEvent.setup();
    const { onChange } = renderSurface({ recallable: ['docker version', 'docker info', 'docker ps'] });

    await user.type(prompt(), '{ArrowUp}');
    expect(onChange).toHaveBeenLastCalledWith('docker ps');
  });

  it('keeps walking further back, and stops at the oldest command', async () => {
    const user = userEvent.setup();
    const recallable = ['docker version', 'docker info', 'docker ps'];
    const Harness = () => {
      const [value, setValue] = React.useState('');
      return <ConsoleSurface entries={[]} value={value} onChange={setValue} onSubmit={vi.fn()} recallable={recallable} />;
    };
    render(<Harness />);

    const input = prompt();
    await user.type(input, '{ArrowUp}');
    expect(input).toHaveValue('docker ps');
    await user.type(input, '{ArrowUp}');
    expect(input).toHaveValue('docker info');
    await user.type(input, '{ArrowUp}');
    expect(input).toHaveValue('docker version');
    // Nothing older to walk to: the oldest command stays.
    await user.type(input, '{ArrowUp}');
    expect(input).toHaveValue('docker version');
  });

  // console-surface.md — "walking back past the most recent one restores the text the operator had typed"
  it('restores the operator\'s own draft when the walk comes back down past the most recent command', async () => {
    const user = userEvent.setup();
    const Harness = () => {
      const [value, setValue] = React.useState('');
      return (
        <ConsoleSurface entries={[]} value={value} onChange={setValue} onSubmit={vi.fn()} recallable={['docker version', 'docker ps']} />
      );
    };
    render(<Harness />);

    const input = prompt();
    await user.type(input, 'half-typed');
    await user.type(input, '{ArrowUp}');
    expect(input).toHaveValue('docker ps');
    await user.type(input, '{ArrowDown}');
    expect(input).toHaveValue('half-typed');
  });

  // console-surface.md — "Editing the prompt by hand ends the recall walk, so the next ArrowUp starts
  // again from the most recent command"
  it('restarts the walk from the most recent command after the prompt was edited by hand', async () => {
    const user = userEvent.setup();
    const Harness = () => {
      const [value, setValue] = React.useState('');
      return (
        <ConsoleSurface entries={[]} value={value} onChange={setValue} onSubmit={vi.fn()} recallable={['docker version', 'docker ps']} />
      );
    };
    render(<Harness />);

    const input = prompt();
    await user.type(input, '{ArrowUp}{ArrowUp}');
    expect(input).toHaveValue('docker version');

    await user.clear(input);
    await user.type(input, 'edited');
    await user.type(input, '{ArrowUp}');
    expect(input).toHaveValue('docker ps');
  });

  it('does nothing on ArrowUp when there is nothing to recall', async () => {
    const user = userEvent.setup();
    const { onChange } = renderSurface({ value: 'draft' });

    await user.type(prompt(), '{ArrowUp}');

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('ConsoleSurface — no blur on a large, frequently repainted surface', () => {
  // console-surface.md — "No animation and no blur is applied to the region"; CLAUDE.md forbids
  // backdrop-filter on large surfaces
  it('declares no blur and no animation in the surface stylesheet', () => {
    const css = readFileSync(join(process.cwd(), 'src/ui/console/console-surface.css'), 'utf-8');

    expect(css).not.toMatch(/backdrop-filter/);
    expect(css).not.toMatch(/filter:\s*blur/);
    expect(css).not.toMatch(/^\s*animation(-[a-z]+)?\s*:/m);
  });
});

describe('ConsoleSurface — structure the transcript relies on', () => {
  it('renders one entry block per entry', () => {
    const { container } = renderSurface({ entries: [entry({ id: 'a' }), entry({ id: 'b' })] });

    expect(container.querySelectorAll('.ui-console-surface__entry')).toHaveLength(2);
    expect(within(container.querySelector('.ui-console-surface__entry') as HTMLElement).getByText('docker ps -a')).toBeInTheDocument();
  });
});
