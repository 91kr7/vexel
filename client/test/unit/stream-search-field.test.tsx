import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StreamSearchField } from '../../src/ui';

afterEach(cleanup);

function renderField(overrides: Partial<Parameters<typeof StreamSearchField>[0]> = {}) {
  const props = {
    value: '',
    onChange: vi.fn(),
    matchCount: 0,
    activeMatchIndex: 0,
    onNext: vi.fn(),
    onPrevious: vi.fn(),
    ...overrides,
  };
  render(<StreamSearchField {...props} />);
  return props;
}

describe('StreamSearchField (REQ-31)', () => {
  // stream-search-field.md — no indicator while the search term is empty
  it('shows no match indicator while the term is empty', () => {
    renderField();

    expect(screen.queryByText('No matches')).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+\/\d+/)).not.toBeInTheDocument();
  });

  // stream-search-field.md — "No matches" when nothing was found, and the navigation is disabled
  it('reports "No matches" and disables the navigation when nothing matches', () => {
    renderField({ value: 'nothing', matchCount: 0 });

    expect(screen.getByText('No matches')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  });

  // stream-search-field.md — the indicator is "<activeMatchIndex + 1>/<matchCount>"
  it('shows the current match position over the total match count', () => {
    renderField({ value: 'error', matchCount: 5, activeMatchIndex: 1 });

    expect(screen.getByText('2/5')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  // stream-search-field.md — typing reports the new value; next/previous move the current match
  it('reports typing and moves between matches', async () => {
    const user = userEvent.setup();
    const props = renderField({ value: '', matchCount: 3, activeMatchIndex: 0 });

    await user.type(screen.getByRole('textbox'), 'e');
    expect(props.onChange).toHaveBeenCalledWith('e');

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(props.onNext).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(props.onPrevious).toHaveBeenCalledTimes(1);
  });

  // stream-search-field.md — pressing Enter in the input moves to the next match
  it('moves to the next match when Enter is pressed in the input', async () => {
    const user = userEvent.setup();
    const props = renderField({ value: 'error', matchCount: 2, activeMatchIndex: 0 });

    await user.click(screen.getByRole('textbox'));
    await user.keyboard('{Enter}');

    expect(props.onNext).toHaveBeenCalledTimes(1);
  });
});
