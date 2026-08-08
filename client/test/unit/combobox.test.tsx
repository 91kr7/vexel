import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Combobox, type ComboboxOption } from '../../src/ui';

afterEach(cleanup);

const OPTIONS: ComboboxOption[] = [
  { value: 'nginx:1.27', label: 'nginx:1.27', hint: 'aaaaaaaaaaaa' },
  { value: 'alpine:3.20', label: 'alpine:3.20' },
  { value: 'sha256:deadbeef', label: 'deadbeef1234', hint: 'untagged' },
];

/** Controlled harness: the typed text is the value, exactly as a real caller holds it. */
function Harness({ options = OPTIONS, onNext, ...rest }: { options?: ComboboxOption[]; onNext?: (value: string) => void } & Record<string, unknown>) {
  const [value, setValue] = useState('');
  return (
    <Combobox
      value={value}
      onChange={(next) => {
        setValue(next);
        onNext?.(next);
      }}
      options={options}
      ariaLabel="Image reference"
      {...rest}
    />
  );
}

function input() {
  return screen.getByRole('combobox', { name: 'Image reference' });
}

describe('Combobox (ui-library/specs/combobox.md)', () => {
  // combobox.md — the suggestion list opens on focus and lists the known options
  it('lists the known options once the input has focus', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(input());

    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(expect.arrayContaining(['nginx:1.27aaaaaaaaaaaa', 'alpine:3.20']));
  });

  // combobox.md — the visible suggestions are those whose label or value contains the typed text, case-insensitively
  it('narrows the suggestions to those whose label or value contains the typed text, whatever the case', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(input(), 'ALPI');

    const options = screen.getAllByRole('option').map((option) => option.textContent);
    expect(options).toHaveLength(1);
    expect(options[0]).toContain('alpine:3.20');
  });

  // combobox.md — a value matching no option is never rejected nor rewritten: free text is a legitimate value
  it('keeps free text that matches no option', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(<Harness onNext={onNext} />);

    await user.type(input(), 'ghcr.io/acme/api:2');

    expect(onNext).toHaveBeenLastCalledWith('ghcr.io/acme/api:2');
    expect(input()).toHaveValue('ghcr.io/acme/api:2');
  });

  // combobox.md — choosing a suggestion reports that option's value and closes the list
  it("reports the chosen suggestion's value and closes the list", async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(<Harness onNext={onNext} />);
    await user.click(input());

    await user.click(screen.getByRole('option', { name: /deadbeef1234/ }));

    expect(onNext).toHaveBeenLastCalledWith('sha256:deadbeef');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  // combobox.md — Escape closes the list without changing the value
  it('closes the list on Escape without changing the value', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(input(), 'ngi');

    await user.keyboard('{Escape}');

    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(input()).toHaveValue('ngi');
  });

  // combobox.md — at most maxVisibleOptions matching suggestions are listed at once
  it('lists at most maxVisibleOptions suggestions', async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 12 }, (_, index) => ({ value: `image-${index}:1`, label: `image-${index}:1` }));
    render(<Harness options={many} maxVisibleOptions={3} />);

    await user.click(input());

    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  // combobox.md — while loading and nothing matches yet, the loading label stands in for the list
  it('shows the loading label while the options are still being read and nothing matches', async () => {
    const user = userEvent.setup();
    render(<Harness options={[]} loading loadingLabel="Loading images…" />);

    await user.click(input());

    expect(screen.getByText('Loading images…')).toBeInTheDocument();
  });

  // combobox.md — when nothing matches and nothing is loading, the empty label is shown instead
  it('shows the empty label when nothing matches and nothing is loading', async () => {
    const user = userEvent.setup();
    render(<Harness emptyLabel="No match — used as is." />);

    await user.type(input(), 'zzzz');

    expect(screen.getByText('No match — used as is.')).toBeInTheDocument();
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  // combobox.md — the validation message is shown below the input
  it('shows the validation message when the field is in error', () => {
    render(<Harness error="An image reference is required." />);

    expect(screen.getByText('An image reference is required.')).toBeInTheDocument();
  });
});
