import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { ToastProvider, useToast, type ToastInput } from '../../src/ui';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

let push: (toast: ToastInput) => void = () => {};

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

function titlesOnScreen(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.ui-toast__title')).map((title) => title.textContent ?? '');
}

/** jsdom lays out nothing, so there are no coordinates to aim at: the real-pointer half is the e2e suite's. */
function dismissToast(title: string) {
  const control = screen.getByRole('button', { name: `Dismiss notification: ${title}` });
  act(() => {
    control.click();
  });
}

function advance(milliseconds: number) {
  act(() => {
    vi.advanceTimersByTime(milliseconds);
  });
}

describe('ToastProvider (ui-library/specs/toast.md)', () => {
  // plan-liquid_glass_overlays/REQ-10 — at most three at once, newest last.
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

  // plan-liquid_glass_overlays/REQ-10 — a toast dropped by the cap takes its pending auto-dismissal with it.
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

  // ui-library/specs/toast.md — each toast auto-dismisses at its own duration.
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

  // plan-docker_management_app-toast_feedback/REQ-23 — no duration of its own means the 5s default, every tone alike.
  it('auto-dismisses a toast with no duration of its own after the 5s default', () => {
    vi.useFakeTimers();
    const { container } = renderProvider();

    pushToast({ title: 'untimed' });
    pushToast({ title: 'untimed and toned', tone: 'danger' });

    advance(4999);
    expect(container.querySelectorAll('.ui-toast')).toHaveLength(2);

    advance(2);
    expect(container.querySelectorAll('.ui-toast')).toHaveLength(0);
  });

  // plan-liquid_glass_overlays/REQ-3 — every toast surface carries the overlay glass material.
  it('gives every toast surface the overlay glass material', () => {
    const { container } = renderProvider();

    for (const title of ['first', 'second', 'third']) pushToast({ title });

    const surfaces = Array.from(container.querySelectorAll('.ui-surface'));
    expect(surfaces).toHaveLength(3);
    for (const surface of surfaces) expect(surface.classList.contains('ui-overlay-glass')).toBe(true);
  });

  // plan-docker_management_app-toast_feedback/REQ-1, REQ-4, REQ-27 — one badge per tone, none for neutral.
  it('renders each tone as its own structure, and an untoned toast as neither', () => {
    const { container } = renderProvider();

    pushToast({ title: 'toned success', tone: 'success' });
    pushToast({ title: 'toned danger', tone: 'danger' });
    pushToast({ title: 'untoned' });

    const [success, danger, neutral] = Array.from(container.querySelectorAll('.ui-toast'));

    expect(success!.classList.contains('ui-toast--tone-success')).toBe(true);
    expect(success!.querySelector('.ui-toast__glyph')?.textContent).toBe('✓');

    expect(danger!.classList.contains('ui-toast--tone-danger')).toBe(true);
    expect(danger!.querySelector('.ui-toast__glyph')?.textContent).toBe('!');

    expect(Array.from(neutral!.classList).filter((name) => name.startsWith('ui-toast--tone-'))).toEqual([]);
    expect(neutral!.querySelector('.ui-toast__glyph')).toBeNull();
  });

  // plan-docker_management_app-toast_feedback/REQ-3, REQ-27 — the three tones are told apart without reading a colour.
  it('tells the three tones apart without reading a single colour', () => {
    const { container } = renderProvider();

    pushToast({ title: 'a', tone: 'success' });
    pushToast({ title: 'b', tone: 'danger' });
    pushToast({ title: 'c' });

    const badges = Array.from(container.querySelectorAll('.ui-toast')).map(
      (card) => card.querySelector('.ui-toast__glyph')?.textContent ?? null,
    );

    expect(badges[0]).not.toBeNull();
    expect(badges[1]).not.toBeNull();
    expect(badges[2]).toBeNull();
    expect(badges[0]).not.toBe(badges[1]);
    expect(new Set(badges).size).toBe(3);
  });

  // plan-docker_management_app-toast_feedback/REQ-6, REQ-9 — a named dismiss button on every toast.
  it('gives every toast a named dismiss control of its own', () => {
    const { container } = renderProvider();

    for (const title of ['first', 'second', 'third']) pushToast({ title });

    for (const card of Array.from(container.querySelectorAll('.ui-toast'))) {
      const title = card.querySelector('.ui-toast__title')?.textContent ?? '';
      const control = card.querySelector('button[aria-label]');
      expect(control, `the toast “${title}” carries no dismiss control`).not.toBeNull();
      expect(control!.getAttribute('type')).toBe('button');
      expect(control!.getAttribute('aria-label')).toBe(`Dismiss notification: ${title}`);
    }
  });

  // plan-docker_management_app-toast_feedback/REQ-6, REQ-7, REQ-8 — dismissing removes that toast alone, in order.
  it('removes only the dismissed toast, leaving the others in their order', () => {
    const { container } = renderProvider();

    for (const title of ['first', 'second', 'third']) pushToast({ title });

    dismissToast('second');

    expect(titlesOnScreen(container)).toEqual(['first', 'third']);
  });

  // plan-docker_management_app-toast_feedback/REQ-7 — a dismissal disturbs no other toast's remaining time.
  it('leaves every surviving toast its own remaining time when one is dismissed', () => {
    vi.useFakeTimers();
    const { container } = renderProvider();

    pushToast({ title: 'dismissed', durationMs: 1000 });
    pushToast({ title: 'short', durationMs: 4000 });
    pushToast({ title: 'long', durationMs: 60000 });

    advance(500);
    dismissToast('dismissed');
    expect(titlesOnScreen(container)).toEqual(['short', 'long']);

    advance(1000);
    expect(titlesOnScreen(container)).toEqual(['short', 'long']);

    advance(2400);
    expect(titlesOnScreen(container)).toEqual(['short', 'long']);
    advance(200);
    expect(titlesOnScreen(container)).toEqual(['long']);

    advance(55000);
    expect(titlesOnScreen(container)).toEqual(['long']);
    advance(2000);
    expect(titlesOnScreen(container)).toEqual([]);
  });

  // plan-docker_management_app-toast_feedback/REQ-11 — the glass surface is asked for no padding of its own.
  it('asks the glass surface for no padding of its own', () => {
    const { container } = renderProvider();

    pushToast({ title: 'only one padding' });

    const surface = container.querySelector('.ui-surface');
    expect(surface!.classList.contains('ui-surface--pad-none')).toBe(true);
    for (const step of ['sm', 'md', 'lg']) {
      expect(surface!.classList.contains(`ui-surface--pad-${step}`)).toBe(false);
    }
  });
});
