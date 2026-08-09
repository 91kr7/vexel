import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EndpointField, type EndpointKindOption } from '../../src/ui';

afterEach(cleanup);

// ui-library/specs/endpoint-field.md — the form group capturing which kind of
// endpoint it is and the single host value that kind needs, or the statement of
// the fixed host it uses when the kind needs no input at all.
const KINDS: EndpointKindOption[] = [
  { value: 'local', label: 'Local socket', fixedHost: 'The Docker socket of the machine running the server; no path to type.' },
  { value: 'ssh', label: 'SSH', hostLabel: 'SSH destination', hostPlaceholder: 'user@host', hostHint: 'Authenticated with the local SSH keys.' },
  { value: 'bare', label: 'Bare' },
];

function renderField(overrides: Partial<Parameters<typeof EndpointField>[0]> = {}) {
  const onKindChange = vi.fn();
  const onHostChange = vi.fn();
  render(
    <EndpointField kinds={KINDS} kind="local" onKindChange={onKindChange} host="" onHostChange={onHostChange} {...overrides} />,
  );
  return { onKindChange, onHostChange };
}

describe('EndpointField (ui-library/specs/endpoint-field.md)', () => {
  // "A single-choice selector holding every offered kind", in the order given
  it('offers every kind given, in that order, under the default kind label', () => {
    renderField();

    const selector = screen.getByLabelText('Endpoint kind');
    expect(Array.from(selector.querySelectorAll('option')).map((option) => option.textContent)).toEqual([
      'Local socket',
      'SSH',
      'Bare',
    ]);
  });

  // "kindLabel?: string — label of the kind selector (default 'Endpoint kind')"
  it('labels the kind selector with the given kindLabel', () => {
    renderField({ kindLabel: 'Daemon endpoint' });

    expect(screen.getByLabelText('Daemon endpoint')).toBeInTheDocument();
  });

  // "For a kind carrying fixedHost instead: that sentence, read-only, in place of the input"
  it('states the fixed host, and shows no input, for a kind that needs none', () => {
    renderField({ kind: 'local' });

    expect(screen.getByText('The Docker socket of the machine running the server; no path to type.')).toBeInTheDocument();
    expect(screen.queryByLabelText('SSH destination')).not.toBeInTheDocument();
  });

  // "For a kind carrying hostLabel: a labelled text input for the host, with its own placeholder and hint"
  it("shows the selected kind's own labelled host input, placeholder and hint", () => {
    renderField({ kind: 'ssh' });

    const input = screen.getByLabelText('SSH destination');
    expect(input).toHaveAttribute('placeholder', 'user@host');
    expect(screen.getByText('Authenticated with the local SSH keys.')).toBeInTheDocument();
  });

  // "Nothing below the selector for a kind carrying neither"
  it('shows nothing below the selector for a kind carrying neither a host input nor a fixed host', () => {
    renderField({ kind: 'bare' });

    expect(screen.queryByLabelText('SSH destination')).not.toBeInTheDocument();
    expect(screen.queryByText(/no path to type/)).not.toBeInTheDocument();
  });

  // "error?: string — validation message shown under the host input, replacing its hint"
  it('replaces the host hint with the validation message when one is given', () => {
    renderField({ kind: 'ssh', error: 'A destination is required.' });

    expect(screen.getByText('A destination is required.')).toBeInTheDocument();
    expect(screen.queryByText('Authenticated with the local SSH keys.')).not.toBeInTheDocument();
  });

  // "Choosing another kind → reports the new kind"
  it('reports the newly chosen kind', async () => {
    const { onKindChange } = renderField({ kind: 'local' });

    await userEvent.selectOptions(screen.getByLabelText('Endpoint kind'), 'ssh');

    expect(onKindChange).toHaveBeenCalledWith('ssh');
  });

  // "Typing in the host input → reports the value on each keystroke"
  it('reports the host value on each keystroke', async () => {
    const { onHostChange } = renderField({ kind: 'ssh' });

    await userEvent.type(screen.getByLabelText('SSH destination'), 'abc');

    expect(onHostChange).toHaveBeenCalledTimes(3);
  });

  // "The component holds no state of its own: the selected kind and the host value are the caller's"
  it("keeps showing the caller's host value, holding no state of its own", async () => {
    renderField({ kind: 'ssh', host: 'operator@build-host' });

    const input = screen.getByLabelText('SSH destination');
    await userEvent.type(input, 'x');

    expect(input).toHaveValue('operator@build-host');
  });

  // "The host input belongs to the selected kind: a kind that declares no hostLabel shows no input,
  // so a kind needing nothing from the operator can never be given a value by mistake"
  it('shows no host input for the local kind even when a host value is held by the caller', () => {
    renderField({ kind: 'local', host: 'left-over-value' });

    expect(screen.queryByDisplayValue('left-over-value')).not.toBeInTheDocument();
  });
});
