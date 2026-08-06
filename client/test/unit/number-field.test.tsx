import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NumberField } from '../../src/ui';

afterEach(cleanup);

// Controlled harness: NumberField is a controlled input, so a test that types
// more than one character needs its value fed back through onChange like a
// real caller would.
function ControlledNumberField({ initial, onNext }: { initial?: number; onNext: (value: number | undefined) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <NumberField
      ariaLabel="Amount"
      value={value}
      onChange={(next) => {
        setValue(next);
        onNext(next);
      }}
    />
  );
}

describe('NumberField (ui-library/specs/number-field.md)', () => {
  // ui-library/specs/number-field.md — empty input reports undefined
  it('reports undefined when the field is cleared', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledNumberField initial={5} onNext={onChange} />);

    await user.clear(screen.getByRole('spinbutton', { name: 'Amount' }));

    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  // ui-library/specs/number-field.md — reports the numeric value entered
  it('reports the numeric value entered', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledNumberField onNext={onChange} />);

    await user.type(screen.getByRole('spinbutton', { name: 'Amount' }), '42');

    expect(onChange).toHaveBeenLastCalledWith(42);
  });

  // ui-library/specs/number-field.md — error renders a FieldMessage under the field
  it('renders the error message under the field when error is set', () => {
    render(<NumberField value={1} onChange={vi.fn()} ariaLabel="Amount" error="Must be positive" />);

    expect(screen.getByText('Must be positive')).toBeInTheDocument();
  });
});
