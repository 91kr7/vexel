import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TransferProgressDialog, type TransferProgressDialogProps } from '../../src/ui';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** The one second the surface waits before dismissing itself; fixed, so the tests name it once. */
const AUTO_CLOSE_MS = 1000;

/** A caller's own in-flight phase wording — the thing completion must replace rather than join. */
const PHASE_CAPTION = 'Indexing the filesystem…';

function renderDialog(props: Partial<TransferProgressDialogProps> = {}) {
  const onClose = props.onClose ?? vi.fn();
  const onCancel = props.onCancel ?? vi.fn();
  const view = render(
    <TransferProgressDialog
      open
      title="Extracting the filesystem"
      currentBytes={0}
      status="active"
      formatCaption={() => PHASE_CAPTION}
      onCancel={onCancel}
      onClose={onClose}
      {...props}
    />,
  );
  const rerender = (next: Partial<TransferProgressDialogProps> = {}) =>
    view.rerender(
      <TransferProgressDialog
        open
        title="Extracting the filesystem"
        currentBytes={0}
        status="active"
        formatCaption={() => PHASE_CAPTION}
        onCancel={onCancel}
        onClose={onClose}
        {...props}
        {...next}
      />,
    );
  return { ...view, rerender, onClose, onCancel };
}

function advance(milliseconds: number) {
  act(() => {
    vi.advanceTimersByTime(milliseconds);
  });
}

/**
 * Presses the dialog's own Close control. `fireEvent` rather than `userEvent`: these two checks run
 * on a fake clock, which `userEvent`'s own delay machinery deadlocks against, and what they contract
 * is who owns the pending close — not where the control sits, which is the e2e checks' subject and
 * is driven there with a real pointer.
 */
function pressClose() {
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  });
}

function barWidth(): string | undefined {
  return document.querySelector<HTMLElement>('.ui-progress-bar__fill')?.style.width;
}

/**
 * The visible caption. Read by its own class rather than by its words: the completion is also
 * exposed as a status message, so `Completed` is deliberately in the dialog twice.
 */
function caption(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.ui-transfer-progress-dialog__caption');
}

describe('TransferProgressDialog — completion (ui-library/specs/transfer-progress-dialog.md)', () => {
  // transfer-progress-dialog.md — at `done` the caption reads `Completed` and the bar is full, the
  // two agreeing in the same render (REQ-1)
  it('states the completion in words with the bar full', () => {
    renderDialog({ status: 'done', totalBytes: 10, currentBytes: 4 });

    expect(caption()).toHaveTextContent('Completed');
    expect(barWidth()).toBe('100%');
  });

  // transfer-progress-dialog.md — the completion wording replaces `formatCaption`'s output
  // entirely: no state has a full bar and a caption naming a phase (REQ-2, REQ-3, REQ-4)
  it('replaces the caller\'s phase wording rather than joining it', () => {
    const { rerender } = renderDialog({ status: 'active' });
    expect(caption()).toHaveTextContent(PHASE_CAPTION);

    rerender({ status: 'done' });

    expect(caption()).toHaveTextContent('Completed');
    expect(screen.queryByText(PHASE_CAPTION)).not.toBeInTheDocument();
  });

  // transfer-progress-dialog.md — completion is exposed as a status message, and focus does not
  // move (REQ-14)
  it('announces the completion as a status message without taking focus', () => {
    const { rerender } = renderDialog({ status: 'active' });
    const focusedBefore = document.activeElement;
    expect(screen.getByRole('status')).toBeEmptyDOMElement();

    rerender({ status: 'done' });

    expect(screen.getByRole('status')).toHaveTextContent('Completed');
    expect(document.activeElement).toBe(focusedBefore);
  });
});

describe('TransferProgressDialog — self-dismissal (ui-library/specs/transfer-progress-dialog.md)', () => {
  // transfer-progress-dialog.md — the self-dismissal is opt-in and off by default (REQ-12)
  it('waits to be dismissed when the opt-in prop is not given', () => {
    vi.useFakeTimers();
    const { onClose } = renderDialog({ status: 'done' });

    advance(AUTO_CLOSE_MS * 10);

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Extracting the filesystem' })).toBeInTheDocument();
  });

  // transfer-progress-dialog.md — with the opt-in prop, one second after the completed state is
  // rendered the dialog closes itself, through the caller's own `onClose` (REQ-6, REQ-7)
  it('closes itself one second after completion is shown, exactly once', () => {
    vi.useFakeTimers();
    const { rerender, onClose } = renderDialog({ status: 'active', autoCloseOnDone: true });

    rerender({ status: 'done' });
    advance(AUTO_CLOSE_MS - 1);
    expect(onClose).not.toHaveBeenCalled();

    advance(1);
    expect(onClose).toHaveBeenCalledTimes(1);

    advance(AUTO_CLOSE_MS * 5);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // transfer-progress-dialog.md — a failed operation arms nothing: it stays on screen with its
  // cause until it is dismissed (REQ-8, REQ-20)
  it('never closes itself on a failure, however long the clock runs', () => {
    vi.useFakeTimers();
    const { onClose } = renderDialog({
      status: 'error',
      errorMessage: 'the daemon refused the export',
      autoCloseOnDone: true,
    });

    expect(screen.getByText('the daemon refused the export')).toBeInTheDocument();
    advance(AUTO_CLOSE_MS * 30);

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('the daemon refused the export')).toBeInTheDocument();
  });

  // transfer-progress-dialog.md — a running operation arms nothing (REQ-9)
  it('arms nothing while it is still running', () => {
    vi.useFakeTimers();
    const { onClose, onCancel } = renderDialog({ status: 'active', autoCloseOnDone: true });

    advance(AUTO_CLOSE_MS * 30);

    expect(onClose).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  // transfer-progress-dialog.md — a pending close is abandoned on unmount (REQ-11)
  it('abandons the pending close when it is unmounted', () => {
    vi.useFakeTimers();
    const { rerender, unmount, onClose } = renderDialog({ status: 'active', autoCloseOnDone: true });
    rerender({ status: 'done' });

    unmount();
    advance(AUTO_CLOSE_MS * 5);

    expect(onClose).not.toHaveBeenCalled();
  });

  // transfer-progress-dialog.md — a pending close is abandoned when the view around it closes
  // (REQ-11)
  it('abandons the pending close when the dialog is closed by the view around it', () => {
    vi.useFakeTimers();
    const { rerender, onClose } = renderDialog({ status: 'active', autoCloseOnDone: true });
    rerender({ status: 'done' });

    rerender({ status: 'done', open: false });
    advance(AUTO_CLOSE_MS * 5);

    expect(onClose).not.toHaveBeenCalled();
  });

  // transfer-progress-dialog.md — a pending close is abandoned when the operation is started again
  // inside the second: it never closes a dialog it did not arm (REQ-11)
  it('abandons the pending close when the operation is started again inside the second', () => {
    vi.useFakeTimers();
    const { rerender, onClose } = renderDialog({ status: 'active', autoCloseOnDone: true });
    rerender({ status: 'done' });

    advance(AUTO_CLOSE_MS - 100);
    rerender({ status: 'active' });
    advance(AUTO_CLOSE_MS * 5);

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(PHASE_CAPTION)).toBeInTheDocument();
  });

  // transfer-progress-dialog.md — the dialog stays dismissible by hand throughout the second
  // (REQ-10)
  it('still closes by hand inside the second, and the abandoned timer adds no second call', () => {
    vi.useFakeTimers();
    const { rerender, onClose } = renderDialog({ status: 'active', autoCloseOnDone: true });
    rerender({ status: 'done' });

    pressClose();
    expect(onClose).toHaveBeenCalledTimes(1);

    advance(AUTO_CLOSE_MS * 5);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // transfer-progress-dialog.md — a manual close landing at the same instant as the elapsed delay
  // still yields exactly one call and no error: the dialog is still mounted, its caller not having
  // processed the close yet (REQ-10)
  it('yields exactly one close when the hand and the timer arrive at the same instant', () => {
    vi.useFakeTimers();
    const { rerender, onClose } = renderDialog({ status: 'active', autoCloseOnDone: true });
    rerender({ status: 'done' });

    advance(AUTO_CLOSE_MS);
    expect(onClose).toHaveBeenCalledTimes(1);

    // The caller has not re-rendered yet, so the Close button is still there to be pressed.
    pressClose();

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // transfer-progress-dialog.md — the overlay is one of the surface's usual dismissal gestures and
  // keeps working throughout the second, the abandoned timer adding no second call (REQ-10)
  it('still closes by the overlay inside the second, and adds no second call after it', () => {
    vi.useFakeTimers();
    const { rerender, onClose } = renderDialog({ status: 'active', autoCloseOnDone: true });
    rerender({ status: 'done' });

    advance(AUTO_CLOSE_MS / 2);
    act(() => {
      fireEvent.click(document.querySelector('.ui-modal-overlay')!);
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    advance(AUTO_CLOSE_MS * 5);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // transfer-progress-dialog.md — a failure that arrives after some progress has been reported arms
  // nothing either: the dialog stays on screen with its cause until it is dismissed (REQ-8, REQ-20)
  it('never closes itself on a failure that arrives after progress was reported', () => {
    vi.useFakeTimers();
    const { rerender, onClose } = renderDialog({
      status: 'active',
      currentBytes: 6,
      totalBytes: 10,
      autoCloseOnDone: true,
    });

    rerender({ status: 'error', errorMessage: 'the export stream ended early' });
    advance(AUTO_CLOSE_MS * 30);

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('the export stream ended early')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  // transfer-progress-dialog.md — the pending close belongs to the completion that armed it, which
  // cuts both ways: the completion that follows a re-run inside the second arms its own (REQ-11)
  it('arms a fresh close for the completion that follows a re-run inside the second', () => {
    vi.useFakeTimers();
    const { rerender, onClose } = renderDialog({ status: 'active', autoCloseOnDone: true });

    rerender({ status: 'done' });
    advance(AUTO_CLOSE_MS - 100);
    rerender({ status: 'active' });
    advance(AUTO_CLOSE_MS);
    expect(onClose).not.toHaveBeenCalled();

    rerender({ status: 'done' });
    advance(AUTO_CLOSE_MS - 1);
    expect(onClose).not.toHaveBeenCalled();

    advance(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('TransferProgressDialog — the completion of a run with no phase and no total (ui-library/specs/transfer-progress-dialog.md)', () => {
  /** What a caller reports for a run served from a cache: no phase was ever reported for it. */
  const NO_PHASE_CAPTION = 'Starting…';

  // transfer-progress-dialog.md — the completion wording replaces `formatCaption`'s output whatever
  // it returns, the "no phase reported yet" wording of a cached run included (REQ-2, REQ-22)
  it('replaces the "no phase reported yet" wording of a cached run', () => {
    renderDialog({ status: 'done', currentBytes: 0, formatCaption: () => NO_PHASE_CAPTION });

    expect(caption()).toHaveTextContent('Completed');
    expect(screen.queryByText(NO_PHASE_CAPTION)).not.toBeInTheDocument();
  });

  // transfer-progress-dialog.md — at `done` the caption reads `Completed` and the bar is full, the
  // two agreeing in the same render; the rule is not conditional on the total being known, and a
  // run served from a cache is exactly the one that reports neither progress nor a total
  // (REQ-1, REQ-2)
  it('shows the bar full at completion even when the total was never known', () => {
    renderDialog({ status: 'done', currentBytes: 0, formatCaption: () => NO_PHASE_CAPTION });

    expect(barWidth()).toBe('100%');
  });
});

describe('TransferProgressDialog — nothing else about the surface changes (ui-library/specs/transfer-progress-dialog.md)', () => {
  // transfer-progress-dialog.md — exactly one of Cancel (active) or Close (done/error) is offered,
  // and `children` are rendered only at `done` (REQ-16)
  it('offers Close and not Cancel once completed, with the caller\'s own content shown', () => {
    renderDialog({ status: 'done', totalBytes: 10, currentBytes: 10, children: 'myrepo/app:1.0' });

    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    expect(screen.getByText('myrepo/app:1.0')).toBeInTheDocument();
  });

  // transfer-progress-dialog.md — while running, Cancel is the action offered and the caller's own
  // in-flight phase wording is the caption (REQ-16)
  it('offers Cancel and not Close while running, captioned by the caller\'s phase wording', () => {
    renderDialog({ status: 'active', totalBytes: 10, currentBytes: 3 });

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    expect(caption()).toHaveTextContent(PHASE_CAPTION);
  });

  // transfer-progress-dialog.md — the progress bar is not shown while `status` is `'error'`: the
  // ErrorBanner takes its place (REQ-16)
  it('replaces the bar with the failure cause on a failure', () => {
    renderDialog({ status: 'error', errorMessage: 'the daemon refused the export' });

    expect(document.querySelector('.ui-progress-bar')).toBeNull();
    expect(screen.getByText('the daemon refused the export')).toBeInTheDocument();
  });
});

// transfer-progress-dialog.md — the optional retry, offered **inside the failure report itself**,
// for an operation whose caller has a way to start it again
// (plan-docker_management_app-filesystem_browse_direct/REQ-9)
describe('TransferProgressDialog — the retry inside the failure report (ui-library/specs/transfer-progress-dialog.md)', () => {
  /** The failure report itself, as opposed to the dialog around it: the retry has to live in here. */
  function failureReport(): HTMLElement | null {
    return document.querySelector<HTMLElement>('.ui-error-banner');
  }

  it('offers the retry inside the failure report, and calls it without dismissing the dialog', () => {
    const onRetry = vi.fn();
    const { onClose } = renderDialog({ status: 'error', errorMessage: 'the daemon refused the export', onRetry });

    const retry = screen.getByRole('button', { name: 'Retry' });
    expect(failureReport()?.contains(retry), 'the retry is offered outside the failure report').toBe(true);

    act(() => {
      fireEvent.click(retry);
    });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  // It never replaces the Close action: a failure is always dismissible, retry or no retry.
  it('keeps the dismissal alongside the retry', () => {
    renderDialog({ status: 'error', errorMessage: 'the daemon refused the export', onRetry: vi.fn() });

    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  // Omitted, the failure offers only its dismissal — the prop is additive and off by default, so
  // every other caller of this surface is unchanged.
  it('offers no retry when the caller supplies none', () => {
    renderDialog({ status: 'error', errorMessage: 'the daemon refused the export' });

    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  // It never appears while the operation is running or once it has completed: it belongs to the
  // failure report and to nothing else.
  it('offers no retry while the operation is running or once it has completed', () => {
    const { rerender } = renderDialog({ status: 'active', onRetry: vi.fn() });

    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();

    rerender({ status: 'done', totalBytes: 10, currentBytes: 10 });

    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });
});
