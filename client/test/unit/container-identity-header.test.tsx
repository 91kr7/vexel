/**
 * `containers/specs/container-identity-header.md` and `containers/specs/container-status.md` — the
 * container's identity as a dialog's title, and the one reading of state and health the module's
 * surfaces share
 * (`plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-6`,
 * `REQ-7`, `REQ-8`, `REQ-9`).
 *
 * What the header shows is asserted as a composition — the dot, the bare name, the state pill, the
 * health pill when the daemon states an outcome, the short id — and what it must *not* show is
 * asserted just as closely: the withdrawn `Container — ` prefix, and the placeholder that must not
 * stand where a health pill is absent.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { ContainerIdentityHeader } from '../../src/containers/ContainerIdentityHeader';
import { STATE_TONE, readHealthOutcome, stateTone } from '../../src/containers/container-status';
import type { ContainerState, ContainerSummary } from '../../src/data/containers-client';

afterEach(cleanup);

function makeContainer(overrides: Partial<ContainerSummary> = {}): ContainerSummary {
  return {
    id: 'abcdef1234567890',
    shortId: 'abcdef123456',
    name: 'payments-service',
    image: 'nginx:1.27',
    state: 'running',
    status: 'Up 3 days',
    ports: [],
    ...overrides,
  };
}

function renderHeader(container: ContainerSummary): HTMLElement {
  const { container: root } = render(<ContainerIdentityHeader container={container} />);
  return root.firstElementChild as HTMLElement;
}

/** The tone an element is drawn in; a badge or a dot carrying no tone class is the neutral one. */
function toneOf(element: Element): string {
  return /--tone-(\w+)/.exec(element.className)?.[1] ?? 'neutral';
}

/**
 * The header's identity elements in the order it draws them, each read as what it is: the state
 * dot, the name, a pill and its label, the short id. The spec fixes an order, so the reading is a
 * sequence rather than a set of independent lookups.
 */
function identityOrder(header: HTMLElement): string[] {
  const parts = header.querySelectorAll('.ui-table-status-dot, .ui-section-header__title, .ui-badge, .ui-table-identifier-cell');
  return Array.from(parts).map((part) => {
    if (part.classList.contains('ui-table-status-dot')) return `dot:${toneOf(part)}`;
    if (part.classList.contains('ui-section-header__title')) return `name:${part.textContent}`;
    if (part.classList.contains('ui-badge')) return `pill:${part.textContent}:${toneOf(part)}`;
    return `id:${part.textContent}`;
  });
}

function pills(header: HTMLElement): HTMLElement[] {
  return Array.from(header.querySelectorAll<HTMLElement>('.ui-badge'));
}

// container-identity-header.md — "Shows, in this order: … the state as a dot, the name on its own,
// the state as a pill, the health outcome as a pill only when the daemon states one, the short id".
describe('ContainerIdentityHeader — the identity it draws (REQ-6, REQ-7, REQ-8)', () => {
  it('draws the dot, the name, the state pill, the health pill and the short id, in that order', () => {
    const header = renderHeader(makeContainer({ state: 'running', status: 'Up 4 minutes (healthy)' }));

    expect(identityOrder(header)).toEqual([
      'dot:success',
      'name:payments-service',
      'pill:RUNNING:success',
      'pill:HEALTHY:success',
      'id:abcdef123456',
    ]);
  });

  // REQ-6 — "the `Container — ` prefix is gone: the name stands alone".
  it('states the name on its own, with no prefix and no other qualifier', () => {
    const header = renderHeader(makeContainer({ name: 'payments-service' }));

    expect(header.querySelector('.ui-section-header__title')?.textContent).toBe('payments-service');
    expect(header.textContent, 'the withdrawn prefix is still drawn').not.toMatch(/Container\s+—/);
  });

  // REQ-8 — the short id, as the list carries it, not the full one.
  it('shows the short id the list carries and not the full id', () => {
    const header = renderHeader(makeContainer({ id: 'abcdef1234567890', shortId: 'abcdef123456' }));

    expect(header.querySelector('.ui-table-identifier-cell')?.textContent).toBe('abcdef123456');
    expect(header.textContent).not.toContain('abcdef1234567890');
  });

  // container-status.md — the state's tone is the module's one reading, so the header cannot
  // disagree with the card the operator opened it from.
  it.each(Object.keys(STATE_TONE) as ContainerState[])('draws a %s container\'s dot and state pill in that state\'s own tone', (state) => {
    const header = renderHeader(makeContainer({ state, status: 'Up 3 days' }));

    const tone = STATE_TONE[state];
    expect(toneOf(header.querySelector('.ui-table-status-dot') as Element)).toBe(tone);
    expect(pills(header)).toHaveLength(1);
    expect(pills(header)[0].textContent, 'the state pill is not the state, uppercased as the card states it').toBe(state.toUpperCase());
    expect(toneOf(pills(header)[0])).toBe(tone);
  });

  // REQ-7 — "a container that has none shows no health pill, and nothing occupies the space where
  // it would be": the second pill is absent from the composition, not present and empty.
  it('draws no health pill, and nothing in its place, for a container the daemon states no outcome for', () => {
    const header = renderHeader(makeContainer({ status: 'Up 3 days' }));

    expect(identityOrder(header)).toEqual(['dot:success', 'name:payments-service', 'pill:RUNNING:success', 'id:abcdef123456']);
    // Nothing at all in its place: the short id follows the state pill directly, with no element —
    // empty pill, placeholder or held-open box — standing between the two.
    expect(pills(header)[0].nextElementSibling).toBe(header.querySelector('.ui-table-identifier-cell'));
  });

  it.each([
    { status: 'Up 4 minutes (healthy)', label: 'HEALTHY', tone: 'success' },
    { status: 'Up 4 minutes (unhealthy)', label: 'UNHEALTHY', tone: 'danger' },
    { status: 'Up 4 seconds (health: starting)', label: 'STARTING', tone: 'warning' },
  ])('draws $label in the $tone tone beside the state pill when the daemon states it', ({ status, label, tone }) => {
    const header = renderHeader(makeContainer({ status }));

    expect(pills(header).map((pill) => pill.textContent)).toEqual(['RUNNING', label]);
    expect(toneOf(pills(header)[1])).toBe(tone);
  });

  // container-identity-header.md — "Actions: none: every element of it is a statement".
  it('offers nothing operable', () => {
    const header = renderHeader(makeContainer({ status: 'Up 4 minutes (healthy)' }));

    expect(header.querySelectorAll('button, a, input, select, textarea')).toHaveLength(0);
  });

  // REQ-9 — "it asks the daemon for nothing": the values come out of the summary it is handed.
  it('issues no request and opens no stream of its own', () => {
    const fetchMock = vi.fn();
    const eventSource = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('EventSource', eventSource);
    try {
      renderHeader(makeContainer({ status: 'Up 4 minutes (healthy)' }));

      expect(fetchMock).not.toHaveBeenCalled();
      expect(eventSource).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  // container-identity-header.md — "a caller handing it the last summary known for a container that
  // has ceased to exist gets that identity drawn, unchanged".
  it('states the summary it is given, whatever the container has since become', () => {
    const header = renderHeader(
      makeContainer({ name: 'gone-service', shortId: 'ffee11223344', state: 'exited', status: 'Exited (0) 2 seconds ago' }),
    );

    expect(identityOrder(header)).toEqual(['dot:neutral', 'name:gone-service', 'pill:EXITED:neutral', 'id:ffee11223344']);
  });

  // container-identity-header.md — "the name gives way before its neighbours do": it is the name
  // that ellipsises, and the pills and the id it must not push out of place are still drawn.
  it('lets the name give way rather than its neighbours, keeping the whole of it available', () => {
    const longName = 'a-container-name-far-longer-than-the-band-it-is-drawn-on-could-ever-hold';
    const header = renderHeader(makeContainer({ name: longName, status: 'Up 4 minutes (healthy)' }));

    const name = header.querySelector('.ui-section-header__title') as HTMLElement;
    expect(name.className, 'the name is not the element that gives way').toContain('ui-truncating-line');
    expect(name.getAttribute('title'), 'the whole name is not available where it is cut').toBe(longName);
    expect(pills(header).map((pill) => pill.textContent)).toEqual(['RUNNING', 'HEALTHY']);
    expect(header.querySelector('.ui-table-identifier-cell')?.textContent).toBe('abcdef123456');
  });
});

// container-status.md — the one reading of the daemon's own status sentence, and what it refuses to
// read as an outcome (REQ-7, REQ-9).
describe('Container status reading — the health outcome the daemon states (REQ-7, REQ-9)', () => {
  it.each([
    { status: 'Up 4 minutes (unhealthy)', label: 'UNHEALTHY', tone: 'danger' },
    { status: 'Up 4 minutes (healthy)', label: 'HEALTHY', tone: 'success' },
    { status: 'Up 4 seconds (health: starting)', label: 'STARTING', tone: 'warning' },
  ])('reads $label out of "$status"', ({ status, label, tone }) => {
    expect(readHealthOutcome(status)).toEqual({ label, tone });
  });

  it('reads the same outcome whatever the case the daemon states it in', () => {
    expect(readHealthOutcome('Up 4 minutes (HEALTHY)')).toEqual({ label: 'HEALTHY', tone: 'success' });
    expect(readHealthOutcome('Up 4 minutes (Unhealthy)')).toEqual({ label: 'UNHEALTHY', tone: 'danger' });
    expect(readHealthOutcome('Up 4 seconds (Health: starting)')).toEqual({ label: 'STARTING', tone: 'warning' });
  });

  it.each([
    'Up 3 days',
    'Up 3 days (Paused)',
    'Exited (0) 2 minutes ago',
    'Exited (137) 2 minutes ago',
    'Created',
    'Restarting (1) 4 seconds ago',
    'Removal In Progress',
    '',
  ])('states no outcome for "%s"', (status) => {
    expect(readHealthOutcome(status)).toBeUndefined();
  });

  // container-status.md — "both readings are total": every state the product can display has a tone.
  it('gives every container state a tone', () => {
    const states: ContainerState[] = ['created', 'running', 'paused', 'restarting', 'removing', 'exited', 'dead'];

    expect(Object.keys(STATE_TONE).sort()).toEqual([...states].sort());
    expect(states.map((state) => STATE_TONE[state])).toEqual([
      'neutral',
      'success',
      'warning',
      'warning',
      'neutral',
      'neutral',
      'danger',
    ]);
  });

  it('reads the same outcome every time it is asked, holding nothing between calls', () => {
    expect(readHealthOutcome('Up 4 minutes (healthy)')).toEqual(readHealthOutcome('Up 4 minutes (healthy)'));
    expect(readHealthOutcome('Up 3 days')).toBeUndefined();
    expect(readHealthOutcome('Up 4 minutes (healthy)')).toEqual({ label: 'HEALTHY', tone: 'success' });
  });
});

// container-status.md — `stateTone(status)`: the same table read for a state the daemon named as a
// plain string (the inspect payload's own `State.Status`, which the Inspect tab's `Lifecycle` group
// draws its pill from — `…-tabs_composition_refactor/REQ-35`). Total by contract, so a caller never
// has to decide what an unknown state looks like.
describe('Container status reading — the tone of a state named as a string (REQ-35)', () => {
  it.each(Object.keys(STATE_TONE) as ContainerState[])('gives a %s state the tone the one table gives it', (state) => {
    expect(stateTone(state)).toBe(STATE_TONE[state]);
  });

  it.each(['', 'unknown', 'zombie', 'exited (0)'])('draws the unnamed state "%s" neutral rather than nothing', (status) => {
    expect(stateTone(status)).toBe('neutral');
  });

  it('reads the same tone every time it is asked, holding nothing between calls', () => {
    expect(stateTone('running')).toBe('success');
    expect(stateTone('nonsense')).toBe('neutral');
    expect(stateTone('running')).toBe('success');
  });
});
