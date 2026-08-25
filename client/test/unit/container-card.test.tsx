import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContainerCard } from '../../src/containers/ContainerCard';
import type { ContainerSummary } from '../../src/data/containers-client';
import type { MenuEntry, RowAction } from '../../src/ui';

/**
 * `containers/specs/container-card.md` — the rules the card decides for itself: which state maps to
 * which tone (and the four the mock never drew), how a port is worded, how a figure is stated over
 * its capacity, and how "nothing was measured" is told apart from a measured zero.
 *
 * The arrangement asserted here is the one `containers-refactor-b3.png` fixes: identity → state and
 * duration → image → metrics → footer actions. Its **measured** form — bands, columns, edges, the
 * cluster flush right — is `client/e2e/containers-card-geometry.spec.ts`; jsdom lays nothing out, so
 * what is checked here is what the card says, in which order, and in which treatment.
 */

afterEach(cleanup);

function makeContainer(overrides: Partial<ContainerSummary> = {}): ContainerSummary {
  return {
    id: 'abcdef1234567890',
    shortId: 'abcdef123456',
    name: 'web-nginx',
    image: 'nginx:1.27',
    state: 'running',
    status: 'Up 3 days',
    ports: [],
    ...overrides,
  };
}

const LIFECYCLE: RowAction[] = [
  { id: 'stop', label: 'Stop', onClick: () => {} },
  { id: 'pause', label: 'Pause', onClick: () => {} },
  { id: 'restart', label: 'Restart', onClick: () => {} },
];

const OVERFLOW: MenuEntry[] = [
  { id: 'rename', label: 'Rename…', onSelect: () => {} },
  { id: 'export', label: 'Export filesystem…', onSelect: () => {} },
];

function renderCard(container: ContainerSummary, props: Partial<Parameters<typeof ContainerCard>[0]> = {}) {
  const view = render(
    <ContainerCard
      container={container}
      lifecycleActions={LIFECYCLE}
      overflowEntries={OVERFLOW}
      selected={false}
      onSelect={() => {}}
      {...props}
    />,
  );
  return view.container.querySelector<HTMLElement>('.ui-surface')!;
}

/** The card's content bands, in the order they are drawn — the footer is not one of them. */
function contentBands(card: HTMLElement): HTMLElement[] {
  const body = card.querySelector<HTMLElement>('.ui-surface__body')!;
  return Array.from((body.firstElementChild as HTMLElement).children) as HTMLElement[];
}

/** The metric strip's tracked columns and its trailing untracked one: `CPU`, `MEMORY`, `NET I/O`. */
function metricColumns(card: HTMLElement): HTMLElement[] {
  return Array.from(card.querySelectorAll<HTMLElement>('.ui-metric-strip__column'));
}

/** The strip's track-less labelled rows, of which the card draws exactly one: `PORTS`. */
function metricRows(card: HTMLElement): HTMLElement[] {
  return Array.from(card.querySelectorAll<HTMLElement>('.ui-metric-strip__row'));
}

function portsRow(card: HTMLElement): HTMLElement {
  return metricRows(card)[0];
}

function portChips(card: HTMLElement): string[] {
  return Array.from(portsRow(card).querySelectorAll('.ui-chip')).map((chip) => chip.textContent ?? '');
}

// container-card.md — "one rule maps state to presentation, and the dot, the pill and the accent
// always agree… every state the product can display has an entry", the metric fills taking that
// same tone (REQ-18, REQ-19).
describe('ContainerCard — one state, one tone, on every state the product can display (REQ-18, REQ-19)', () => {
  const STATES: Array<{ state: ContainerSummary['state']; tone: string }> = [
    { state: 'running', tone: 'success' },
    { state: 'paused', tone: 'warning' },
    { state: 'restarting', tone: 'warning' },
    { state: 'dead', tone: 'danger' },
    { state: 'created', tone: 'neutral' },
    { state: 'removing', tone: 'neutral' },
    { state: 'exited', tone: 'neutral' },
  ];

  it.each(STATES)('gives a $state container the $tone dot, pill and accent, and no second state', ({ state, tone }) => {
    const card = renderCard(makeContainer({ state, cpuPercent: 12, onlineCpus: 8 }));

    expect(card.className).toContain(`ui-surface--accent-${tone}`);
    expect(card.querySelector('.ui-table-status-dot')?.className).toContain(`ui-table-status-dot--tone-${tone}`);
    const pill = card.querySelector('.ui-badge') as HTMLElement;
    expect(pill.textContent).toBe(state.toUpperCase());
    // No card shows two states at once: exactly one accent class, one dot, one pill.
    expect(card.className.match(/ui-surface--accent-\w+/g)).toHaveLength(1);
    expect(card.querySelectorAll('.ui-table-status-dot')).toHaveLength(1);
    expect(card.querySelectorAll('.ui-badge')).toHaveLength(1);
  });

  it('gives the metric fills the container\'s own state tone', () => {
    const card = renderCard(makeContainer({ state: 'paused', cpuPercent: 40, onlineCpus: 8, memoryUsageBytes: 1024, memoryLimitBytes: 4096 }));

    const fills = Array.from(card.querySelectorAll('.ui-meter__fill'));
    expect(fills).toHaveLength(2);
    for (const fill of fills) expect(fill.className).toContain('ui-meter__fill--warning');
  });
});

// container-card.md — the ports are a row of the metric strip, always drawn, its label anchoring it:
// one chip per port, worded exactly as the delivered list worded it, at most two before the rest
// become one `+n`, and `none` where the container reports no port (REQ-5 as reversed and then
// lowered on 2026-08-25, REQ-12, REQ-22).
describe('ContainerCard — the ports (REQ-5, REQ-12, REQ-22)', () => {
  it('words a published mapping as public→private and an exposed port as the bare private port', () => {
    const card = renderCard(
      makeContainer({
        ports: [
          { privatePort: 5432, publicPort: 49_153, type: 'tcp' },
          { privatePort: 80, type: 'tcp' },
        ],
      }),
    );

    expect(portChips(card)).toEqual(['49153→5432', '80']);
  });

  it('reads the ports with the metrics, on a labelled row of the strip', () => {
    const card = renderCard(makeContainer({ ports: [{ privatePort: 5432, publicPort: 49_153, type: 'tcp' }] }));

    expect(metricRows(card)).toHaveLength(1);
    expect(portsRow(card).querySelector('.ui-meter__label--eyebrow')?.textContent).toBe('PORTS');
  });

  it.each([1, 2, 3])('draws one chip per port and no count when the container reports %i of them', (count) => {
    const ports = Array.from({ length: count }, (_, index) => ({ privatePort: 8080 + index, publicPort: 18_080 + index, type: 'tcp' }));
    const card = renderCard(makeContainer({ ports }));

    expect(portChips(card)).toEqual(ports.map((port) => `${port.publicPort}→${port.privatePort}`));
    expect(portsRow(card).textContent, 'a degenerate +1 was drawn where one more chip would have cost the same').not.toMatch(/\+\d/);
  });

  it('draws two chips and one +n past three ports, the count being the remainder', () => {
    const ports = [8080, 8081, 8082, 8083, 8084, 8085].map((privatePort) => ({ privatePort, publicPort: privatePort + 10_000, type: 'tcp' }));
    const card = renderCard(makeContainer({ ports }));

    expect(portChips(card)).toEqual(['18080→8080', '18081→8081', '+4']);
  });

  it('draws the row anyway when the container reports no port, reading `none`', () => {
    const card = renderCard(makeContainer({ ports: [] }));

    expect(metricRows(card), 'the ports row disappears with the container’s ports').toHaveLength(1);
    expect(portChips(card)).toEqual(['none']);
  });
});

// container-card.md — the values the delivered row showed, and the ones the card adds: the CPU
// capacity, the memory capacity, and NET I/O in and out (REQ-12, REQ-13).
describe('ContainerCard — the values it states (REQ-12, REQ-13)', () => {
  it('shows the name, the image, the short id and the daemon\'s own status sentence', () => {
    const card = renderCard(makeContainer({ status: 'Exited (0) 2 hours ago', state: 'exited' }));

    expect(card.querySelector('.ui-section-header__title')?.textContent).toBe('web-nginx');
    expect(card.textContent).toContain('nginx:1.27');
    expect(card.querySelector('.ui-table-identifier-cell')?.textContent).toBe('abcdef123456');
    expect(card.textContent).toContain('Exited (0) 2 hours ago');
  });

  it('states CPU over the host\'s online CPUs, and the reading against that capacity', () => {
    const card = renderCard(makeContainer({ cpuPercent: 40, onlineCpus: 8 }));

    const [cpu] = metricColumns(card);
    expect(cpu.querySelector('.ui-meter__label--eyebrow')?.textContent).toBe('CPU');
    expect(cpu.querySelector('.ui-meter__value')?.textContent).toBe('40.0%');
    expect(cpu.querySelector('.ui-meter__reading')?.textContent).toBe('of 8 cores');
    // Full scale is `cores × 100`, so 40% of one core out of eight is 5% of the track.
    expect(cpu.querySelector('[role="meter"]')?.getAttribute('aria-valuenow')).toBe('5');
  });

  it('says "core" rather than "cores" on a single-CPU host', () => {
    const card = renderCard(makeContainer({ cpuPercent: 1, onlineCpus: 1 }));

    expect(metricColumns(card)[0].querySelector('.ui-meter__reading')?.textContent).toBe('of 1 core');
  });

  it('states memory over its limit, and the reading against that capacity', () => {
    const card = renderCard(makeContainer({ memoryUsageBytes: 512 * 1024 * 1024, memoryLimitBytes: 2048 * 1024 * 1024 }));

    const memory = metricColumns(card)[1];
    expect(memory.querySelector('.ui-meter__label--eyebrow')?.textContent).toBe('MEMORY');
    expect(memory.querySelector('.ui-meter__value')?.textContent).toBe('512.0MB');
    expect(memory.querySelector('.ui-meter__reading')?.textContent).toBe('of 2.0GB');
    expect(memory.querySelector('[role="meter"]')?.getAttribute('aria-valuenow')).toBe('25');
  });

  // metric-primitives.md — a container with no measurable maximum is measured, and must not be
  // drawn as an unmeasured one: it keeps its number and takes the unbounded track, not the empty one.
  it('draws the unbounded track, and no capacity note, for a container with no memory limit', () => {
    const card = renderCard(makeContainer({ memoryUsageBytes: 512 * 1024 * 1024, memoryLimitBytes: 0 }));

    const memory = metricColumns(card)[1];
    expect(memory.querySelector('.ui-meter__value')?.textContent).toBe('512.0MB');
    expect(memory.querySelector('.ui-meter__reading')).toBeNull();
    expect(memory.querySelector('.ui-meter__track')?.className).toContain('ui-meter__track--unbounded');
    expect(memory.querySelector('.ui-meter__track')?.className).not.toContain('no-sample');
  });

  it('carries NET I/O as an in and an out reading, with no bar of its own', () => {
    const card = renderCard(makeContainer({ networkRxBytes: 2048, networkTxBytes: 1024 }));

    const readings = metricColumns(card)[2];
    expect(readings.className).toContain('ui-metric-strip__column--readings');
    expect(readings.querySelector('.ui-meter__label--eyebrow')?.textContent).toBe('NET I/O');
    const items = Array.from(readings.querySelectorAll('.ui-metric-strip__reading')).map((item) => item.textContent);
    expect(items).toEqual(['in2.0KB', 'out1.0KB']);
    expect(readings.querySelector('.ui-meter__track')).toBeNull();
  });
});

// container-card.md — "any tracked metric with no sample reads `—`, `no sample` in the capacity
// note's place, and an empty track", visibly distinguishable from a measured zero (REQ-16).
describe('ContainerCard — a metric with no sample (REQ-16)', () => {
  it('states the absence of a CPU and a memory sample in words and in an empty track', () => {
    const card = renderCard(makeContainer({ state: 'exited' }));

    for (const column of metricColumns(card).slice(0, 2)) {
      expect(column.querySelector('.ui-meter__value')?.textContent).toBe('—');
      expect(column.querySelector('.ui-meter__reading')?.textContent).toBe('no sample');
      expect(column.querySelector('.ui-meter__track')?.className).toContain('ui-meter__track--no-sample');
      expect(column.querySelector('.ui-meter__fill')).toBeNull();
    }
    for (const reading of card.querySelectorAll('.ui-metric-strip__reading')) {
      expect(reading.textContent).toMatch(/—$/);
    }
  });

  it('is told apart from a measured zero, which keeps its number and its capacity note', () => {
    const measured = renderCard(makeContainer({ cpuPercent: 0, onlineCpus: 8, memoryUsageBytes: 0, memoryLimitBytes: 4096 }));

    const [cpu, memory] = metricColumns(measured);
    expect(cpu.querySelector('.ui-meter__value')?.textContent).toBe('0.0%');
    expect(cpu.querySelector('.ui-meter__reading')?.textContent).toBe('of 8 cores');
    expect(cpu.querySelector('.ui-meter__track')?.className).not.toContain('no-sample');
    expect(memory.querySelector('.ui-meter__value')?.textContent).toBe('0B');
    expect(memory.querySelector('.ui-meter__track')?.className).not.toContain('no-sample');
  });
});

// container-card.md — the b3 arrangement: five content bands then a footer, in this order on every
// card and in every state (REQ-9, REQ-22). The metrics are stacked at any width (REQ-6).
describe('ContainerCard — the bands and their order (REQ-6, REQ-9, REQ-22)', () => {
  it('draws identity, then state and duration, then the image, then the metrics, then the footer', () => {
    const card = renderCard(makeContainer({ ports: [{ privatePort: 80, publicPort: 8080, type: 'tcp' }] }));

    const [identity, state, image, metrics, ...rest] = contentBands(card);
    expect(rest, 'the card carries a content band the arrangement does not name').toHaveLength(0);

    expect(identity.querySelector('.ui-table-status-dot')).not.toBeNull();
    expect(identity.querySelector('.ui-section-header__title')?.textContent).toBe('web-nginx');
    expect(identity.querySelector('.ui-table-identifier-cell')?.textContent).toBe('abcdef123456');

    expect(state.querySelector('.ui-badge')?.textContent).toBe('RUNNING');
    expect(state.textContent).toContain('Up 3 days');

    expect(image.className, 'the image does not take a field of its own').toContain('ui-chip--block');
    expect(image.querySelector('.ui-chip__prefix')?.textContent).toBe('image');
    expect(image.querySelector('.ui-chip__label')?.textContent).toBe('nginx:1.27');

    expect(metrics.querySelector('.ui-metric-strip')).not.toBeNull();
    expect(metrics.querySelector('.ui-metric-strip__row .ui-meter__label--eyebrow')?.textContent).toBe('PORTS');

    // Read and act are two gestures: the actions close the card in a band of their own.
    const footer = card.querySelector<HTMLElement>('.ui-surface__footer');
    expect(footer, 'the actions are not in a footer of their own').not.toBeNull();
    expect(footer!.querySelectorAll('.ui-action-button-group')).toHaveLength(2);
    expect(card.querySelector('.ui-surface__body')!.querySelector('.ui-action-button-group'), 'an action stands among the content bands').toBeNull();
  });

  it('lays a card of one state out exactly like a card of another, only its content varying', () => {
    const shapeOf = (container: ContainerSummary): string[] => {
      cleanup();
      const card = renderCard(container);
      return [
        ...contentBands(card).map((band) => band.className),
        `columns:${metricColumns(card).length}`,
        `rows:${metricRows(card).length}`,
        `footer-groups:${card.querySelectorAll('.ui-surface__footer .ui-action-button-group').length}`,
      ];
    };

    const running = shapeOf(makeContainer({ state: 'running', cpuPercent: 4, onlineCpus: 8, ports: [{ privatePort: 80, publicPort: 8080, type: 'tcp' }] }));
    const exited = shapeOf(makeContainer({ state: 'exited', status: 'Exited (0) 2 hours ago', ports: [] }));

    expect(exited).toEqual(running);
  });

  it('stacks the metrics one per row at any width', () => {
    const card = renderCard(makeContainer());

    expect(card.querySelector('.ui-metric-strip')?.className).toContain('ui-metric-strip--stacked');
  });
});

// container-card.md — the identity row: the name gives way, the id is anchored at the right and
// never truncates, and beside it the control that will open the detail in a modal (REQ-3).
describe('ContainerCard — the identity row (REQ-3)', () => {
  it('lets the name ellipsise and anchors the id, which never does', () => {
    const card = renderCard(makeContainer({ name: 'a-very-long-container-name-that-cannot-fit' }));

    const [identity] = contentBands(card);
    // `Row`'s truncation contract is read positionally: the last group is the trailing metadata and
    // keeps its natural width, every group before it may shrink (`layout-primitives.md`).
    expect(identity.className, 'the identity row applies no truncation contract').toContain('ui-row--truncating');
    expect(identity.lastElementChild!.contains(identity.querySelector('.ui-table-identifier-cell')), 'the id is not the anchored trailing group').toBe(true);
    const title = identity.querySelector('.ui-section-header__title')!;
    expect(title.className).toContain('ui-truncating-line');
    expect(title.getAttribute('title'), 'the whole name is not recoverable from the ellipsised one').toBe(
      'a-very-long-container-name-that-cannot-fit',
    );
    // Whether the id really keeps its characters is geometry, and is measured in
    // `e2e/containers-card-geometry.spec.ts`; what holds it here is its position — the row's own
    // contract exempts the last group from shrinking, and the id is it.
    expect(identity.lastElementChild, 'the anchored group is not the row’s last').toBe(
      identity.querySelector('.ui-table-identifier-cell')!.closest('.ui-row'),
    );
  });

  it('carries the detail control at the right, named after the container and not disabled', () => {
    const card = renderCard(makeContainer());

    const control = card.querySelector<HTMLButtonElement>('.ui-icon-button')!;
    expect(control.getAttribute('aria-label')).toBe('Open web-nginx details');
    expect(control.disabled, 'the detail control ships disabled, which was the alternative refused').toBe(false);
    expect(control.className, 'the detail control is not the compact icon button the card asks for').toContain('ui-icon-button--sm');
    expect(contentBands(card)[0].contains(control), 'the detail control is not on the identity row').toBe(true);
  });

  /**
   * **A deliberately inert control** (`container-card.md`, the human's decision of 2026-08-25):
   * present, named, not disabled, and doing nothing at all when clicked — including not selecting
   * the card, since its click arrives with the intervention that moves the detail into a modal.
   * This asserts the decision, not a defect.
   */
  it('does nothing when the detail control is clicked, the card’s own selection included', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const view = render(
      <ContainerCard
        container={makeContainer()}
        lifecycleActions={LIFECYCLE}
        overflowEntries={OVERFLOW}
        selected={false}
        onSelect={onSelect}
      />,
    );
    const before = view.container.innerHTML;

    await user.click(screen.getByRole('button', { name: 'Open web-nginx details' }));

    expect(onSelect, 'the inert detail control selected the card').not.toHaveBeenCalled();
    expect(view.container.innerHTML, 'the inert detail control changed something').toBe(before);
  });
});

// container-card.md — the image reference takes a line of its own and truncates at the **front**, so
// the registry host is what is lost and `name:tag` survives (REQ-5, REQ-12).
describe('ContainerCard — the image line (REQ-5, REQ-12)', () => {
  it('gives the reference a full-width field of its own, ellipsised at its front', () => {
    const reference = 'registry.io/acme-platform/payments-service:2.14.0-rc3';
    const card = renderCard(makeContainer({ image: reference }));

    const chip = contentBands(card)[2];
    expect(chip.className).toContain('ui-chip--block');
    const label = chip.querySelector('.ui-chip__label')!;
    expect(label.className).toContain('ui-truncating-line--start');
    expect(label.textContent).toBe(reference);
    expect(label.getAttribute('title'), 'the whole reference is not recoverable from the truncated one').toBe(reference);
  });
});

// container-card.md — what the card deliberately does not carry: Block I/O and PIDS stay in the
// detail panel (REQ-14), and no card shows the age of a sample (REQ-53).
describe('ContainerCard — what it leaves out (REQ-14, REQ-53)', () => {
  it('carries neither Block I/O nor PIDS', () => {
    const card = renderCard(makeContainer({ cpuPercent: 10, onlineCpus: 4, memoryUsageBytes: 1024, memoryLimitBytes: 4096 }));

    expect(card.textContent).not.toMatch(/block\s*i\/o/i);
    expect(card.textContent).not.toMatch(/\bPIDS?\b/i);
    expect(metricColumns(card)).toHaveLength(3);
  });

  it('states no age of any sample beside the figures', () => {
    const card = renderCard(makeContainer({ cpuPercent: 10, onlineCpus: 4, networkRxBytes: 10, networkTxBytes: 10 }));

    const strip = card.querySelector('.ui-metric-strip') as HTMLElement;
    expect(strip.textContent).not.toMatch(/ago|sampled|updated|\bs old\b|seconds/i);
  });
});

// container-card.md — the four action slots are the caller's, and the footer is the card's only
// action-bearing area: a click on a control never also selects the card (REQ-20, REQ-23).
describe('ContainerCard — its actions and its selection (REQ-20, REQ-23)', () => {
  it('renders the primary slot apart from the joined Pause · Restart · … cluster, in that order', () => {
    const card = renderCard(makeContainer());

    const groups = Array.from(card.querySelectorAll('.ui-action-button-group'));
    expect(groups).toHaveLength(2);
    expect(groups[0].className).not.toContain('segmented');
    expect(groups[1].className).toContain('ui-action-button-group--segmented');
    const labels = Array.from(card.querySelectorAll('.ui-action-button-group button')).map((button) => button.textContent?.trim());
    expect(labels).toEqual(['Stop', 'Pause', 'Restart', '…']);
  });

  it('selects the card on a click outside its action cluster, and never on a click inside it', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onStop = vi.fn();
    const view = render(
      <ContainerCard
        container={makeContainer()}
        lifecycleActions={[{ id: 'stop', label: 'Stop', onClick: onStop }, ...LIFECYCLE.slice(1)]}
        overflowEntries={OVERFLOW}
        selected={false}
        onSelect={onSelect}
      />,
    );
    const card = view.container.querySelector<HTMLElement>('.ui-surface')!;

    await user.click(card.querySelector('.ui-section-header__title') as HTMLElement);
    expect(onSelect).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Stop' }));
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('reports which card is the selected one', () => {
    const card = renderCard(makeContainer(), { selected: true });

    expect(card.className).toContain('ui-surface--selected');
    expect(card.getAttribute('aria-selected')).toBe('true');
  });

  it('shows the rename control in the name\'s place while it is given one', () => {
    const card = renderCard(makeContainer(), { renameControl: <input aria-label="New name for web-nginx" /> });

    expect(card.querySelector('.ui-section-header__title')).toBeNull();
    expect(card.querySelector('input[aria-label="New name for web-nginx"]')).not.toBeNull();
  });
});

// container-card.md — "the card owns none of its own material… this file writes no colour, radius,
// spacing, shadow, font size or z-index, emits no raw DOM tag and imports no stylesheet" (REQ-29,
// REQ-31). The screen-wide guard is `check-ui-conformance.mjs`; this is the same claim about the one
// file the guard admits by name, so that admitting the path never becomes admitting its content.
describe('ContainerCard — it owns none of its material (REQ-29, REQ-31)', () => {
  const source = readFileSync(join(process.cwd(), 'src/containers/ContainerCard.tsx'), 'utf8');

  it('imports no stylesheet and writes no colour, radius, shadow, font size or z-index', () => {
    expect(source).not.toMatch(/import\s+['"][^'"]*\.css['"]/);
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
    expect(source).not.toMatch(/var\(--(color|radius|shadow|font-size|z-index|blur)[^)]*\)/);
    expect(source).not.toMatch(/style=\{/);
  });

  it('draws its box through the library Card and no element of its own', () => {
    const card = renderCard(makeContainer());

    expect(card.className).toContain('ui-surface');
    // The one surface on the card is the card itself: nothing inside it re-declares the material.
    expect(card.querySelectorAll('.ui-surface')).toHaveLength(0);
  });
});

// REQ-27 — "every string is unchanged and stays in the product's current language; the only new
// strings are the labels the new metrics genuinely require… authored in English. No Italian from the
// mock reaches the product." Three more were added by the rearrangement: the `PORTS` label, `none`,
// and the detail control's accessible name.
describe('ContainerCard — the strings it authors (REQ-27)', () => {
  it('authors these English labels and nothing else, every other word coming from the daemon or the caller', () => {
    const card = renderCard(
      makeContainer({
        name: 'web-nginx',
        shortId: 'abcdef123456',
        image: 'nginx:1.27',
        status: 'Up 3 days',
        cpuPercent: 40,
        onlineCpus: 8,
        memoryUsageBytes: 1024,
        memoryLimitBytes: 4096,
        networkRxBytes: 2048,
        networkTxBytes: 1024,
        ports: [{ privatePort: 80, publicPort: 8080, type: 'tcp' }],
      }),
    );

    const authored = Array.from(card.querySelectorAll('*'))
      .flatMap((element) => Array.from(element.childNodes))
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => (node.nodeValue ?? '').trim())
      .filter(Boolean)
      // What the daemon supplies, what the caller supplies, and the figures themselves.
      .filter((text) => !['web-nginx', 'abcdef123456', 'nginx:1.27', 'Up 3 days', 'RUNNING', 'Stop', 'Pause', 'Restart', '…', '↗'].includes(text))
      .filter((text) => !/^\d/.test(text));

    expect([...new Set(authored)].sort()).toEqual(['CPU', 'MEMORY', 'NET I/O', 'PORTS', 'image', 'in', 'of 8 cores', 'of 4.0KB', 'out'].sort());
  });

  it('states the absence of a port and names the detail control in English', () => {
    const card = renderCard(makeContainer({ state: 'exited', ports: [] }));

    expect(portChips(card)).toEqual(['none']);
    expect(card.querySelector('.ui-icon-button')?.getAttribute('aria-label')).toBe('Open web-nginx details');
    for (const column of metricColumns(card).slice(0, 2)) {
      expect(column.querySelector('.ui-meter__reading')?.textContent).toBe('no sample');
    }
  });
});
