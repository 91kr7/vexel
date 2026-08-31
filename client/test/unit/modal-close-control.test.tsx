/**
 * `ui-library/specs/modal.md` — the dialog's **opt-in** presentations: the labelled close control,
 * the return of the point of interaction on dismissal, and the large format's fluid width
 * (`plan-docker_management_app-containers_card_view-detail_modal/REQ-10`, `REQ-14`, `REQ-17`,
 * `REQ-18`).
 *
 * Each is asked for by the caller and by nothing else, so what this file guards as closely as the
 * presentations themselves is their absence: a dialog that asks for none of them renders exactly
 * what it rendered before they existed.
 */
import { useState } from 'react';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button, Grid, Modal } from '../../src/ui';

afterEach(cleanup);

function dialog(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.ui-modal');
}

function closeControl(): HTMLElement | null {
  return screen.queryByRole('button', { name: 'Close dialog' });
}

/**
 * A dialog opened from a control of the caller's own, inside a region declared as the dismissal
 * focus target — the arrangement `restoreFocus` is written for, and the one the containers screen
 * composes.
 */
function DialogHarness({
  closeControl: withCloseControl = false,
  restoreFocus = false,
  withOpener = true,
}: {
  closeControl?: boolean;
  restoreFocus?: boolean;
  withOpener?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [openerGone, setOpenerGone] = useState(false);
  return (
    <Grid arrangement="cards" dismissalFocusTarget={withOpener}>
      {openerGone ? null : <Button onClick={() => setOpen(true)}>Open the detail</Button>}
      <Button onClick={() => setOpenerGone(true)}>Remove the opener</Button>
      <Modal open={open} title="A dialog" onClose={() => setOpen(false)} closeControl={withCloseControl} restoreFocus={restoreFocus}>
        the dialog body
      </Modal>
    </Grid>
  );
}

// modal.md — "a dialog that asks for neither renders exactly what it rendered before they existed:
// the bare title, no close control, no focus return" (REQ-14), and the large format keeps the width
// it has unless the caller asks otherwise (REQ-18, as amended on 2026-08-26).
describe('Modal — the presentations are opt-in (REQ-14, REQ-18)', () => {
  it('draws the bare title and no close control when none is asked for', () => {
    render(
      <Modal open title="A dialog" onClose={vi.fn()}>
        the dialog body
      </Modal>,
    );

    expect(closeControl(), 'a dialog that asked for no close control grew one').toBeNull();
    expect(document.querySelector('.ui-modal__header'), 'a dialog that asked for no close control grew a header band').toBeNull();
    expect(dialog()!.firstElementChild!.className).toContain('ui-modal__title');
    expect(dialog()!.querySelector('.ui-modal__title')!.textContent).toBe('A dialog');
  });

  it.each([
    { size: undefined, name: 'default' },
    { size: 'large' as const, name: 'large' },
  ])('leaves the $name dialog standing on Escape, with the close control and without it', async ({ size }) => {
    const user = userEvent.setup();
    for (const withControl of [false, true]) {
      cleanup();
      render(
        <Modal open title="A dialog" size={size} closeControl={withControl} onClose={vi.fn()}>
          the dialog body
        </Modal>,
      );

      await user.keyboard('{Escape}');

      expect(dialog(), `Escape closed the dialog (closeControl=${withControl})`).not.toBeNull();
    }
  });

  it('restores no focus when the return was not asked for', async () => {
    const user = userEvent.setup();
    render(<DialogHarness closeControl />);

    const opener = screen.getByRole('button', { name: 'Open the detail' });
    await user.click(opener);
    await user.click(closeControl()!);

    expect(dialog()).toBeNull();
    expect(document.activeElement, 'a dialog that asked for no focus return handed the focus back').not.toBe(opener);
  });

  // REQ-18 — the fluid width is a modifier of the large format and not a third size: a large dialog
  // that does not ask for it keeps `min(1100px, 92vw)`, which is what leaves the four other large
  // dialogs rendering exactly what they rendered.
  it('leaves a large dialog that does not ask for it at the format’s own width', () => {
    render(
      <Modal open title="A dialog" size="large" onClose={vi.fn()}>
        the dialog body
      </Modal>,
    );

    const positioner = document.querySelector<HTMLElement>('.ui-modal__positioner')!;
    expect(positioner.className).toContain('ui-modal__positioner--size-large');
    expect(positioner.className, 'a large dialog that asked for nothing widened itself').not.toContain(
      'ui-modal__positioner--fluid-width',
    );
    expect(positioner.style.width, 'the dialog states a width of its own instead of taking the format’s').toBe('');
  });

  it('marks the positioner as fluid, on the large format, only when it is asked for', () => {
    render(
      <Modal open title="A dialog" size="large" fluidWidth onClose={vi.fn()}>
        the dialog body
      </Modal>,
    );

    const positioner = document.querySelector<HTMLElement>('.ui-modal__positioner')!;
    expect(positioner.className).toContain('ui-modal__positioner--size-large');
    expect(positioner.className).toContain('ui-modal__positioner--fluid-width');
    // Compounded with the format it modifies, so it is inert anywhere else: the rule the browser
    // resolves names both classes, and jsdom loads no stylesheet to read it from.
    const css = readFileSync(join(process.cwd(), 'src', 'ui', 'feedback', 'feedback.css'), 'utf8');
    expect(css).toMatch(/\.ui-modal__positioner--size-large\.ui-modal__positioner--fluid-width\s*\{/);
    expect(css, 'the fluid width is declared on its own class, so it would widen an ordinary dialog too').not.toMatch(
      /(^|[},])\s*\.ui-modal__positioner--fluid-width\s*\{/,
    );
  });

  // REQ-14, REQ-18 — "asked for by this one surface and by nothing else": the perimeter is the call
  // sites, so it is read off them rather than trusted.
  it('is asked for one of these presentations by exactly one place in the application', () => {
    const asking = sourceFiles(join(process.cwd(), 'src'))
      .filter((path) => !path.includes(join('src', 'ui')))
      .filter((path) => /\bcloseControl\b|\brestoreFocus\b|\bfluidWidth\b/.test(readFileSync(path, 'utf8')));

    expect(asking.map((path) => path.slice(path.indexOf(join('src', ''))))).toEqual([join('src', 'containers', 'ContainersScreen.tsx')]);
  });
});

// modal.md — `closeControl`: one labelled control on the dialog's own chrome, beside the title,
// named `Close dialog`, calling `onClose`, reachable by pointer and by keyboard, and the dialog's
// first focusable element (REQ-10).
describe('Modal — the close control it is asked for (REQ-10)', () => {
  function renderWithControl(onClose = vi.fn()) {
    render(
      <Modal open title="A dialog" closeControl onClose={onClose}>
        <Button onClick={vi.fn()}>a control inside the body</Button>
      </Modal>,
    );
    return onClose;
  }

  it('presents exactly one labelled control, beside the title, on the dialog’s own chrome', () => {
    renderWithControl();

    const header = dialog()!.querySelector<HTMLElement>('.ui-modal__header');
    expect(header, 'the close control does not stand on the dialog’s chrome beside the title').not.toBeNull();
    expect(header!.querySelector('.ui-modal__title')!.textContent).toBe('A dialog');
    expect(header!.contains(closeControl()!)).toBe(true);
    expect(screen.getAllByRole('button', { name: 'Close dialog' })).toHaveLength(1);
  });

  it('dismisses the dialog when it is operated with a pointer', async () => {
    const user = userEvent.setup();
    const onClose = renderWithControl();

    await user.click(closeControl()!);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('dismisses the dialog when it is operated from the keyboard', async () => {
    const user = userEvent.setup();
    const onClose = renderWithControl();

    closeControl()!.focus();
    await user.keyboard('{Enter}');
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.keyboard(' ');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('is the dialog’s first focusable element', () => {
    renderWithControl();

    const focusable = Array.from(dialog()!.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]')).filter(
      (element) => element.getAttribute('tabindex') !== '-1',
    );
    expect(focusable[0]).toBe(closeControl());
  });
});

// modal.md — `restoreFocus`: on dismissal, by every route the dialog offers, the point of
// interaction returns to whatever held it when the dialog opened; where that element no longer
// exists, to the nearest dismissal focus target enclosing it; where neither exists, nothing is
// focused (REQ-17).
describe('Modal — the focus return it is asked for (REQ-17)', () => {
  it('hands the point of interaction back to the opener when the close control dismisses it', async () => {
    const user = userEvent.setup();
    render(<DialogHarness closeControl restoreFocus />);
    const opener = screen.getByRole('button', { name: 'Open the detail' });

    await user.click(opener);
    await user.click(closeControl()!);

    expect(dialog()).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('hands it back the same way when the dimmed area dismisses it', async () => {
    const user = userEvent.setup();
    render(<DialogHarness closeControl restoreFocus />);
    const opener = screen.getByRole('button', { name: 'Open the detail' });

    await user.click(opener);
    await user.click(document.querySelector('.ui-modal-overlay') as HTMLElement);

    expect(dialog()).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('falls back to the dismissal focus target enclosing an opener that has gone', async () => {
    const user = userEvent.setup();
    render(<DialogHarness closeControl restoreFocus />);
    const region = document.querySelector<HTMLElement>('[data-ui-dismissal-focus-target]')!;

    await user.click(screen.getByRole('button', { name: 'Open the detail' }));
    // The opener leaves the document while the dialog stands over it — a container removed under an
    // open detail is exactly this case.
    await user.click(screen.getByRole('button', { name: 'Remove the opener' }));
    await user.click(closeControl()!);

    expect(screen.queryByRole('button', { name: 'Open the detail' })).not.toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(region));
  });

  it('focuses nothing when neither the opener nor a dismissal focus target is left', async () => {
    const user = userEvent.setup();
    render(<DialogHarness closeControl restoreFocus withOpener={false} />);

    await user.click(screen.getByRole('button', { name: 'Open the detail' }));
    await user.click(screen.getByRole('button', { name: 'Remove the opener' }));
    await user.click(closeControl()!);

    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });
});

// detail_modal/REQ-20 — the blur allow-list gains and loses nothing, and no `ui-blur-exception:`
// comment is added. The allow-list's two halves are guarded by `blur-policy.test.ts` and by
// `check-ui-conformance.mjs`; the exception marker is the one way past both, so it is counted here.
describe('the blur perimeter this change leaves untouched (REQ-20)', () => {
  it('carries no blur exception anywhere in the application’s sources', () => {
    const carrying = sourceFiles(join(process.cwd(), 'src')).filter((path) =>
      readFileSync(path, 'utf8').includes('ui-blur-exception:'),
    );

    expect(carrying).toEqual([]);
  });
});

/** Every source file shipped under a directory: what a perimeter claim has to be read from. */
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(tsx?|css)$/.test(entry.name) ? [path] : [];
  });
}
