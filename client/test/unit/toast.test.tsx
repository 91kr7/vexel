import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { ToastProvider, useToast, type ToastInput } from '../../src/ui';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// ui-library/specs/toast.md — the stack is capped at three, which is also what bounds how many
// blurred overlay surfaces the compositor can be asked for at one moment
// (plan-liquid_glass_overlays/REQ-10).

let push: (toast: ToastInput) => void = () => {};

/** Hands the provider's own push out, so a test drives it exactly as a caller would. */
function Pusher() {
  push = useToast().push;
  return null;
}

function renderProvider() {
  return render(
    <ToastProvider>
      <Pusher />
    </ToastProvider>,
  );
}

function pushToast(toast: ToastInput) {
  act(() => {
    push(toast);
  });
}

function advance(milliseconds: number) {
  act(() => {
    vi.advanceTimersByTime(milliseconds);
  });
}

describe('ToastProvider (ui-library/specs/toast.md)', () => {
  // toast.md — at most three at once, newest last; a fourth drops the oldest immediately
  // (plan-liquid_glass_overlays/REQ-10)
  it('keeps at most three toasts on screen, dropping the oldest when a fourth arrives', () => {
    const { container } = renderProvider();

    for (const title of ['first', 'second', 'third']) pushToast({ title });
    expect(container.querySelectorAll('.ui-toast')).toHaveLength(3);

    pushToast({ title: 'fourth' });

    expect(container.querySelectorAll('.ui-toast')).toHaveLength(3);
    expect(screen.queryByText('first')).not.toBeInTheDocument();
    expect(screen.getByText('second')).toBeInTheDocument();
    expect(screen.getByText('third')).toBeInTheDocument();
    expect(screen.getByText('fourth')).toBeInTheDocument();
  });

  // toast.md — a toast dropped by the cap takes its pending auto-dismissal with it: it never
  // dismisses the toast that took its place (plan-liquid_glass_overlays/REQ-10)
  it('never lets a dropped toast dismiss another when its time comes', () => {
    vi.useFakeTimers();
    const { container } = renderProvider();

    pushToast({ title: 'first', durationMs: 1000 });
    for (const title of ['second', 'third', 'fourth']) pushToast({ title, durationMs: 60000 });

    advance(1500);

    expect(container.querySelectorAll('.ui-toast')).toHaveLength(3);
    expect(screen.getByText('second')).toBeInTheDocument();
    expect(screen.getByText('third')).toBeInTheDocument();
    expect(screen.getByText('fourth')).toBeInTheDocument();
  });

  // toast.md — each toast still auto-dismisses at its own duration
  it('dismisses each surviving toast at its own duration', () => {
    vi.useFakeTimers();
    const { container } = renderProvider();

    pushToast({ title: 'short', durationMs: 1000 });
    pushToast({ title: 'long', durationMs: 60000 });

    advance(1500);
    expect(screen.queryByText('short')).not.toBeInTheDocument();
    expect(screen.getByText('long')).toBeInTheDocument();

    advance(60000);
    expect(container.querySelectorAll('.ui-toast')).toHaveLength(0);
  });

  // toast.md — every toast surface carries the overlay glass material, the same one the dialog
  // surfaces carry (plan-liquid_glass_overlays/REQ-3)
  it('gives every toast surface the overlay glass material', () => {
    const { container } = renderProvider();

    for (const title of ['first', 'second', 'third']) pushToast({ title });

    const surfaces = Array.from(container.querySelectorAll('.ui-surface'));
    expect(surfaces).toHaveLength(3);
    for (const surface of surfaces) expect(surface.classList.contains('ui-overlay-glass')).toBe(true);
  });
});
