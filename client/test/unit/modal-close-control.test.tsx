/**
 * `ui-library/specs/modal.md` — the dialog's two **opt-in** presentations: the labelled close
 * control, and the return of the point of interaction on dismissal
 * (`plan-docker_management_app-containers_card_view-detail_modal/REQ-10`, `REQ-14`, `REQ-17`).
 *
 * Both are asked for by the caller and by nothing else, so what this file guards as closely as the
 * presentations themselves is their absence: a dialog that asks for neither renders exactly what it
 * rendered before they existed.
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
// the bare title, no close control, no focus return" (REQ-14).
describe('Modal — both presentations are opt-in (REQ-14)', () => {
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

  // REQ-14 — "asked for by this one surface and by nothing else": the perimeter is the call sites,
  // so it is read off them rather than trusted.
  it('is asked for one of these presentations by exactly one place in the application', () => {
    const asking = sourceFiles(join(process.cwd(), 'src'))
      .filter((path) => !path.includes(join('src', 'ui')))
      .filter((path) => /\bcloseControl\b|\brestoreFocus\b/.test(readFileSync(path, 'utf8')));

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
    const carrying = sourceFiles(join(process.cwd(), 'src'))
      .filter((path) => !path.includes('__conformance-fixture__'))
      .filter((path) => readFileSync(path, 'utf8').includes('ui-blur-exception:'));

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
