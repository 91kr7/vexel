/**
 * `FormFooter` — the save/cancel footer, its dirty indicator and the standing note
 * (`ui-library/specs/form-footer.md`).
 *
 * The file exists for one clause above all: **a footer given no `note` draws exactly what it drew
 * before the slot existed** — the indicator alone on the leading side, with no container around it.
 * That is the half of the contract protecting the footer's other consumers, and until now nothing in
 * either test tree read this component at all.
 *
 * jsdom lays nothing out, so "above the indicator" is asserted here as the order the document
 * states; where the note is actually painted is measured in
 * `e2e/container-detail-config-editing.spec.ts`. The note's tone is read out of the library's own
 * stylesheet, the way the neighbouring unit files read a treatment, since the library is the only
 * place one may be declared.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormFooter } from '../../src/ui';

afterEach(cleanup);

function declaredColour(selector: string): string {
  const css = readFileSync(join(process.cwd(), 'src', 'ui', 'controls', 'controls.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const body = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((rule) => rule[1].replace(/\s+/g, ' ').trim() === selector)?.[2];
  expect(body, `no CSS rule for ${selector}`).toBeDefined();
  const colour = /(?:^|;)\s*color\s*:([^;]*)/.exec(body!)?.[1].trim();
  expect(colour, `${selector} declares no colour`).toBeDefined();
  return colour!;
}

/** The footer's own outermost row: the element carrying both sides of it. */
function footerRow(): HTMLElement {
  const save = screen.getByRole('button', { name: /^(Save|Saving…|Save changes)$/ });
  const row = save.closest('.ui-row')?.parentElement;
  expect(row, 'the footer does not draw its two sides on a row of its own').not.toBeNull();
  return row as HTMLElement;
}

describe('FormFooter — the dirty indicator and its two actions', () => {
  // form-footer.md — the status text reads "Unsaved changes" or "No changes", and save is disabled
  // while there is nothing to save.
  it('states there is nothing to save and disables the save action', () => {
    render(<FormFooter dirty={false} onSave={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText('No changes')).toBeInTheDocument();
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  // form-footer.md — a dirty footer offers the save, under its own label when one is given.
  it('states there is something to save, offers it, and reports both actions', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(<FormFooter dirty onSave={onSave} onCancel={onCancel} saveLabel="Save changes" />);

    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  // form-footer.md — while a save is in flight the action is disabled and reads "Saving…", dirty or
  // not: this is the rule the container's edit form leans on while its request is out.
  it('disables the save while one is in flight and says so', () => {
    render(<FormFooter dirty saving onSave={vi.fn()} onCancel={vi.fn()} saveLabel="Save changes" />);

    const save = screen.getByRole('button', { name: 'Saving…' });
    expect(save).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
  });
});

describe('FormFooter — the standing note (REQ-25)', () => {
  /**
   * form-footer.md — "A footer given no `note` draws exactly what it drew before the slot existed:
   * the dirty indicator alone on the leading side, and no container around it." Read as: the
   * indicator is a child of the footer's own row, the one carrying the actions too — a wrapper
   * introduced for every consumer would put the actions outside the indicator's parent.
   */
  it('given no note, draws the indicator alone on the leading side, unwrapped', () => {
    render(<FormFooter dirty={false} onSave={vi.fn()} onCancel={vi.fn()} />);

    const status = screen.getByText('No changes');
    expect(status.parentElement, 'the indicator is not a child of the footer’s own row').toBe(footerRow());
    expect(
      within(status.parentElement as HTMLElement).getByRole('button', { name: 'Cancel' }),
      'the indicator has been wrapped in a container of its own even though no note was given',
    ).toBeInTheDocument();
  });

  // form-footer.md — the note never replaces the dirty indicator: both are stated, the note above.
  it('given a note, states it above the indicator and keeps the indicator', () => {
    render(<FormFooter dirty onSave={vi.fn()} onCancel={vi.fn()} note="Changing this recreates the object." />);

    const note = screen.getByText('Changing this recreates the object.');
    const status = screen.getByText('Unsaved changes');
    expect(status, 'the note replaced the dirty indicator instead of standing above it').toBeInTheDocument();
    expect(
      note.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING,
      'the note is drawn after the dirty indicator rather than above it',
    ).toBeTruthy();
  });

  // form-footer.md — the note is drawn on the footer's leading side, and carries no action of its own.
  it('draws the note on the leading side, carrying no action', () => {
    render(<FormFooter dirty onSave={vi.fn()} onCancel={vi.fn()} note="Changing this recreates the object." />);

    const note = screen.getByText('Changing this recreates the object.');
    const leading = footerRow().firstElementChild as HTMLElement;
    expect(leading.contains(note), 'the note is not on the footer’s leading side').toBe(true);
    expect(within(leading).queryAllByRole('button'), 'the note carries an action of its own').toHaveLength(0);
  });

  // form-footer.md — the note is stated "in the cautioning tone": a treatment of its own, declared
  // by token like every other in the library, and not the indicator's quiet one.
  it('states the note in a tone of its own, declared by token', () => {
    const note = declaredColour('.ui-form-footer__note');
    const status = declaredColour('.ui-form-footer__status');

    expect(note, 'the note’s colour is written on the spot instead of referencing a token').toMatch(/^var\(--/);
    expect(note, 'the note is painted exactly like the dirty indicator, so no tone tells them apart').not.toBe(status);
  });
});
