import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KeyValueEditor, type KeyValuePair } from '../../src/ui';

afterEach(cleanup);

// Controlled harness: the caller owns the pairs, as a real caller does, so a
// sequence of edits sees each one applied on top of the last.
function Harness({ initialPairs, onNext, name }: { initialPairs: KeyValuePair[]; onNext?: (pairs: KeyValuePair[]) => void; name?: string }) {
  const [pairs, setPairs] = useState(initialPairs);
  return (
    <KeyValueEditor
      pairs={pairs}
      name={name}
      onChange={(next) => {
        setPairs(next);
        onNext?.(next);
      }}
    />
  );
}

describe('KeyValueEditor — accessible naming without a name (ui-library/specs/key-value-editor.md)', () => {
  // key-value-editor.md — without `name`, row N is named "Key N" / "Value N"
  it('names row N "Key N" and "Value N", 1-based', () => {
    render(<Harness initialPairs={[{ key: 'a', value: '1' }, { key: 'b', value: '2' }]} />);

    expect(screen.getByRole('textbox', { name: 'Key 1' })).toHaveValue('a');
    expect(screen.getByRole('textbox', { name: 'Value 1' })).toHaveValue('1');
    expect(screen.getByRole('textbox', { name: 'Key 2' })).toHaveValue('b');
    expect(screen.getByRole('textbox', { name: 'Value 2' })).toHaveValue('2');
  });

  // key-value-editor.md — without `name`, the remove action is named after the row's current key
  it('names the remove action after the row\'s key', () => {
    render(<Harness initialPairs={[{ key: 'MODE', value: 'production' }]} />);

    expect(screen.getByRole('button', { name: 'Remove MODE' })).toBeInTheDocument();
  });

  // key-value-editor.md — an empty key falls back to "pair N" in the remove action's name
  it('falls back to "pair N" in the remove action while the key is empty', () => {
    render(<Harness initialPairs={[{ key: 'MODE', value: 'production' }, { key: '', value: '' }]} />);

    expect(screen.getByRole('button', { name: 'Remove pair 2' })).toBeInTheDocument();
  });
});

describe('KeyValueEditor — accessible naming with a name (ui-library/specs/key-value-editor.md)', () => {
  // key-value-editor.md — with `name`, row N is named "<name> Key N" / "<name> Value N"
  it('qualifies both textboxes of row N with the caller\'s name', () => {
    render(<Harness name="Environment" initialPairs={[{ key: 'a', value: '1' }, { key: 'b', value: '2' }]} />);

    expect(screen.getByRole('textbox', { name: 'Environment Key 1' })).toHaveValue('a');
    expect(screen.getByRole('textbox', { name: 'Environment Value 1' })).toHaveValue('1');
    expect(screen.getByRole('textbox', { name: 'Environment Key 2' })).toHaveValue('b');
    expect(screen.getByRole('textbox', { name: 'Environment Value 2' })).toHaveValue('2');
  });

  // key-value-editor.md — with `name`, the remove action is named "Remove <key> from <name>"
  it('qualifies the remove action with the caller\'s name', () => {
    render(<Harness name="Environment" initialPairs={[{ key: 'MODE', value: 'production' }]} />);

    expect(screen.getByRole('button', { name: 'Remove MODE from Environment' })).toBeInTheDocument();
  });

  // key-value-editor.md — the "pair N" fallback is qualified too
  it('falls back to "Remove pair N from <name>" while the key is empty', () => {
    render(<Harness name="Environment" initialPairs={[{ key: 'MODE', value: 'production' }, { key: '', value: '' }]} />);

    expect(screen.getByRole('button', { name: 'Remove pair 2 from Environment' })).toBeInTheDocument();
  });

  // key-value-editor.md — the remove action follows the key as the row is filled in
  it('follows the key typed into the row in the remove action\'s name', async () => {
    const user = userEvent.setup();
    render(<Harness name="Environment" initialPairs={[{ key: '', value: '' }]} />);

    await user.type(screen.getByRole('textbox', { name: 'Environment Key 1' }), 'MODE');

    expect(screen.getByRole('button', { name: 'Remove MODE from Environment' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove pair 1 from Environment' })).toBeNull();
  });
});

describe('KeyValueEditor — two editors on one form (ui-library/specs/key-value-editor.md)', () => {
  // key-value-editor.md — two editors with different names share no accessible name
  it('gives every control of both editors a name of its own', () => {
    render(
      <>
        <Harness name="Environment" initialPairs={[{ key: '', value: '' }]} />
        <Harness name="Labels" initialPairs={[{ key: '', value: '' }]} />
      </>,
    );

    for (const name of ['Environment Key 1', 'Environment Value 1', 'Labels Key 1', 'Labels Value 1']) {
      expect(screen.getAllByRole('textbox', { name })).toHaveLength(1);
    }
    for (const name of ['Remove pair 1 from Environment', 'Remove pair 1 from Labels']) {
      expect(screen.getAllByRole('button', { name })).toHaveLength(1);
    }
    // The bare, unqualified names of an editor that was given one are gone:
    // nothing is announced as just "Key 1" any more.
    for (const name of ['Key 1', 'Value 1']) {
      expect(screen.queryAllByRole('textbox', { name })).toHaveLength(0);
    }
  });

  // key-value-editor.md — a field resolved by its qualified name belongs to that editor alone
  it('routes an edit made through a qualified name to that editor only', async () => {
    const user = userEvent.setup();
    const onEnvironment = vi.fn();
    const onLabels = vi.fn();
    render(
      <>
        <Harness name="Environment" initialPairs={[{ key: '', value: '' }]} onNext={onEnvironment} />
        <Harness name="Labels" initialPairs={[{ key: '', value: '' }]} onNext={onLabels} />
      </>,
    );

    await user.type(screen.getByRole('textbox', { name: 'Labels Key 1' }), 'team');

    expect(onLabels).toHaveBeenLastCalledWith([{ key: 'team', value: '' }]);
    expect(onEnvironment).not.toHaveBeenCalled();
  });
});

describe('KeyValueEditor — the name is a naming qualifier only (ui-library/specs/key-value-editor.md)', () => {
  // key-value-editor.md — `name` never changes what is rendered on screen
  it('renders exactly the same markup with and without a name', () => {
    const pairs = [{ key: 'MODE', value: 'production' }];
    const plain = render(<Harness initialPairs={pairs} />).container.innerHTML;
    cleanup();
    const named = render(<Harness name="Environment" initialPairs={pairs} />).container.innerHTML;

    expect(stripAriaLabels(named)).toBe(stripAriaLabels(plain));
  });

  // key-value-editor.md — the visible placeholders and add action stay as the caller set them
  it('keeps the caller\'s placeholders and add action untouched', () => {
    render(
      <KeyValueEditor
        pairs={[{ key: '', value: '' }]}
        onChange={() => {}}
        name="Labels"
        keyPlaceholder="key"
        valuePlaceholder="text"
        addLabel="Add label"
      />,
    );

    expect(screen.getByRole('textbox', { name: 'Labels Key 1' })).toHaveAttribute('placeholder', 'key');
    expect(screen.getByRole('textbox', { name: 'Labels Value 1' })).toHaveAttribute('placeholder', 'text');
    expect(screen.getByRole('button', { name: 'Add label' })).toBeInTheDocument();
  });

  // key-value-editor.md — the qualifier is not displayed
  it('does not display the name', () => {
    const { container } = render(<Harness name="Environment" initialPairs={[{ key: '', value: '' }]} />);

    expect(within(container).queryByText(/Environment/)).toBeNull();
  });
});

describe('KeyValueEditor — editing behaviour is unaffected by the name (ui-library/specs/key-value-editor.md)', () => {
  // key-value-editor.md — the add action appends an empty pair
  it('appends an empty pair on add', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(<Harness name="Environment" initialPairs={[{ key: 'MODE', value: 'production' }]} onNext={onNext} />);

    await user.click(screen.getByRole('button', { name: 'Add variable' }));

    expect(onNext).toHaveBeenLastCalledWith([{ key: 'MODE', value: 'production' }, { key: '', value: '' }]);
  });

  // key-value-editor.md — an edit reports the full next array
  it('reports the full next array on an edit', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(<Harness name="Environment" initialPairs={[{ key: 'MODE', value: '' }, { key: 'TZ', value: 'UTC' }]} onNext={onNext} />);

    await user.type(screen.getByRole('textbox', { name: 'Environment Value 1' }), 'production');

    expect(onNext).toHaveBeenLastCalledWith([{ key: 'MODE', value: 'production' }, { key: 'TZ', value: 'UTC' }]);
  });

  // key-value-editor.md — the remove action drops that row alone
  it('removes the targeted row only', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(<Harness name="Environment" initialPairs={[{ key: 'MODE', value: 'production' }, { key: 'TZ', value: 'UTC' }]} onNext={onNext} />);

    await user.click(screen.getByRole('button', { name: 'Remove MODE from Environment' }));

    expect(onNext).toHaveBeenLastCalledWith([{ key: 'TZ', value: 'UTC' }]);
  });
});

/** Drops the aria-label attributes, leaving what a sighted user actually sees. */
function stripAriaLabels(html: string): string {
  return html.replace(/ aria-label="[^"]*"/g, '');
}
