/**
 * The one wording a screen shows in place of data its read could not load
 * (plan-docker_management_app-inline_error_panels/REQ-3, /REQ-4).
 *
 * Two halves. What it draws — one sentence, no cause, no control — and what a
 * caller can obtain from it: there is no prop through which a cause or a control
 * could be passed, which is what keeps the sentence the same on every screen and
 * for every cause. The second half lives in the types, so it is asserted with
 * `@ts-expect-error`; `npm run test:typecheck -w client` is what fails if the
 * component ever accepts either again.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { FailedReadEmptyState, FAILED_READ_TITLE } from '../../src/shell/FailedReadEmptyState';
import { FAILED_READ_WORDING, failedReadPlaceholders } from '../support/failed-read';

afterEach(cleanup);

function placeholder(): HTMLElement {
  const [only, ...rest] = failedReadPlaceholders();
  if (!only || rest.length > 0) throw new Error(`expected one placeholder, found ${rest.length + (only ? 1 : 0)}`);
  return only;
}

describe('FailedReadEmptyState (app-shell/specs/failed-read-empty-state.md)', () => {
  // "the sentence 'This data could not be loaded', and nothing else"
  it('shows the one sentence a failed read is told with', () => {
    render(<FailedReadEmptyState />);

    expect(screen.getByText(FAILED_READ_WORDING)).toBeInTheDocument();
  });

  // "It states no cause: no message, no error text, no reason" (…/REQ-3)
  it('states nothing beside that sentence', () => {
    render(<FailedReadEmptyState />);

    expect(placeholder().querySelector('.ui-empty-state__description'), 'the placeholder stated a cause').toBeNull();
    expect(placeholder().textContent).toBe(FAILED_READ_WORDING);
  });

  // "It carries no control, and gains none: the retry is the header's" (…/REQ-4)
  it('carries no control at all', () => {
    render(<FailedReadEmptyState />);

    expect(placeholder().querySelectorAll('button, a, input, select'), 'the placeholder carried a control').toHaveLength(0);
  });

  // "compact -> the library's compact empty-state presentation, for a placeholder inside a pane"
  it('keeps the same sentence in the compact presentation', () => {
    render(<FailedReadEmptyState compact />);

    expect(placeholder()).toHaveClass('ui-empty-state--compact');
    expect(placeholder().textContent).toBe(FAILED_READ_WORDING);
  });

  // "FAILED_READ_TITLE is the same sentence as a string, for the rare surface that takes a title"
  it('exports that sentence as the string a title-taking surface uses', () => {
    expect(FAILED_READ_TITLE).toBe(FAILED_READ_WORDING);
  });

  // The prop set is what makes "no cause, no control" structural rather than a habit.
  it('accepts neither a cause nor a control through its API', () => {
    // @ts-expect-error — a cause cannot be passed to it.
    render(<FailedReadEmptyState description="the daemon refused the read" />);
    // @ts-expect-error — a control cannot be passed to it.
    render(<FailedReadEmptyState action={<button type="button">Retry</button>} />);

    expect(failedReadPlaceholders()).toHaveLength(2);
    for (const drawn of failedReadPlaceholders()) {
      expect(drawn.textContent, 'a rejected prop reached the placeholder').toBe(FAILED_READ_WORDING);
    }
  });
});
