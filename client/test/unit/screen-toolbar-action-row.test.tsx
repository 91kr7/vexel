/**
 * The toolbar's action row, and when it is not drawn at all
 * (`ui-library/specs/screen-toolbar.md`, `plan-ui-coherence-optimisation/REQ-38`
 * by way of the screen that first needed it).
 *
 * The rule is stated on the component rather than on the screen: "a toolbar
 * given no action draws no action row, and therefore no space where one would
 * have been". The half that is easy to lose is the second one — an empty row
 * still consumes the toolbar's own gap — so the row's *absence* is asserted,
 * not merely the absence of buttons inside it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ScreenToolbar } from '../../src/ui';

afterEach(cleanup);

function actionRow(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.ui-screen-toolbar__actions');
}

describe('ScreenToolbar — the action row (ui-library/specs/screen-toolbar.md)', () => {
  it('draws no action row for a toolbar whose only control is its filter', () => {
    render(<ScreenToolbar filters={<input aria-label="Filter" />} />);

    expect(document.querySelector('.ui-screen-toolbar')).not.toBeNull();
    expect(actionRow(), 'the toolbar draws an action row holding no action').toBeNull();
    expect(document.querySelector('.ui-screen-toolbar__filters')).not.toBeNull();
  });

  it('draws no action row for a toolbar given nothing at all', () => {
    render(<ScreenToolbar />);

    expect(actionRow()).toBeNull();
  });

  it('draws the action row as soon as one action is given, whichever slot it is in', () => {
    const onClick = vi.fn();

    const { unmount } = render(<ScreenToolbar primaryAction={{ label: 'Create…', onClick }} />);
    expect(actionRow()).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Create…' })).toBeInTheDocument();
    unmount();

    render(<ScreenToolbar secondaryActions={[{ label: 'Load…', onClick }]} />);
    expect(actionRow()).not.toBeNull();
    cleanup();

    render(<ScreenToolbar destructiveAction={{ label: 'Prune', onClick }} />);
    expect(actionRow()).not.toBeNull();
  });
});
