import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BaselineReport } from '../../src/data/system-client';
import type { CoverageArea, CoverageCounts } from '../../src/coverage/coverage-map';

// The Coverage matrix states what the product covers of Docker and against
// which Docker baseline (coverage-matrix-screen.md). The coverage hook is
// mocked so the screen can be put in each of its states, but the cross-
// navigation service is the real one: where a row leads is part of the contract
// under test (REQ-105).
const refresh = vi.fn();
let coverageState: { areas: CoverageArea[]; counts: CoverageCounts; baseline?: BaselineReport; loaded: boolean; error?: string } = {
  areas: [],
  counts: { total: 0, dedicatedScreen: 0, consoleOnly: 0, notApplicable: 0 },
  loaded: true,
};

vi.mock('../../src/data/use-coverage', () => ({
  useCoverage: () => ({ ...coverageState, refresh }),
}));

const { CoverageMatrixScreen } = await import('../../src/coverage/CoverageMatrixScreen');
const { coverageAreas, countCoverage } = await import('../../src/coverage/coverage-map');
const { screens } = await import('../../src/shell/navigation');
const { CrossNavigationProvider, useCrossNavigation } = await import('../../src/shell/services/CrossNavigationService');

/** Harness: makes the pending cross-navigation request observable beside the screen. */
function NavigationProbe() {
  const { request } = useCrossNavigation();
  return <output data-testid="navigation">{request ? request.screenId : ''}</output>;
}

function report(overrides: Partial<BaselineReport> = {}): BaselineReport {
  return {
    declared: { engineApiVersion: '1.43', cliVersion: '24.0' },
    daemon: { version: '24.0.7', apiVersion: '1.43', minApiVersion: '1.24' },
    comparison: 'match',
    ...overrides,
  };
}

function renderScreen(state: Partial<typeof coverageState> = {}) {
  coverageState = {
    areas: coverageAreas,
    counts: countCoverage(coverageAreas),
    baseline: report(),
    loaded: true,
    ...state,
  };
  render(
    <CrossNavigationProvider>
      <CoverageMatrixScreen />
      <NavigationProbe />
    </CrossNavigationProvider>,
  );
}

function navigatedTo(): string {
  return screen.getByTestId('navigation').textContent ?? '';
}

/** The matrix rows, in the order they are drawn. */
function matrixRows(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.ui-data-table__row'));
}

/** The row of a capability area, found by the name the map gives it. */
function rowOf(area: CoverageArea): HTMLElement {
  const found = matrixRows().find((row) => row.textContent?.includes(area.name));
  if (!found) throw new Error(`no matrix row for ${area.id} ("${area.name}")`);
  return found;
}

function badgeOf(area: CoverageArea): string {
  return rowOf(area).querySelector('.ui-badge')?.textContent ?? '';
}

function baselineStrip(): HTMLElement {
  const found = document.querySelector<HTMLElement>('.ui-state-summary-bar');
  if (!found) throw new Error('the baseline strip is not on the screen');
  return found;
}

/** The label/value pairs of the baseline card. */
function baselineValues(): Record<string, string> {
  const pairs: Record<string, string> = {};
  for (const row of document.querySelectorAll<HTMLElement>('.ui-definition-list__row')) {
    pairs[row.querySelector('.ui-definition-list__label')?.textContent ?? ''] = row.querySelector('.ui-definition-list__value')?.textContent ?? '';
  }
  return pairs;
}

function valueMatching(pattern: RegExp): string {
  const entry = Object.entries(baselineValues()).find(([label]) => pattern.test(label));
  if (!entry) throw new Error(`no baseline value labelled like ${pattern} among ${Object.keys(baselineValues()).join(', ')}`);
  return entry[1];
}

const firstOfState = (state: CoverageArea['state']): CoverageArea => {
  const found = coverageAreas.find((area) => area.state === state);
  if (!found) throw new Error(`the coverage map declares no ${state} area`);
  return found;
};

beforeEach(() => {
  refresh.mockReset();
});

afterEach(cleanup);

describe('CoverageMatrixScreen — the matrix (coverage/specs/coverage-matrix-screen.md)', () => {
  // coverage-matrix-screen.md — "Every area of the coverage map is shown; the screen filters, hides
  // and reorders nothing"; plan-docker_management_app/REQ-105
  it('shows every capability area of the map, in the map\'s own order', () => {
    renderScreen();

    const rows = matrixRows();
    expect(rows).toHaveLength(coverageAreas.length);
    rows.forEach((row, index) => {
      const area = coverageAreas[index]!;
      expect(row.textContent).toContain(area.name);
      // "the area's name over what it covers, both in full (no truncation)"
      expect(row.textContent).toContain(area.summary);
    });
  });

  // coverage-matrix-screen.md — "its coverage state as a badge: 'Dedicated screen' (success),
  // 'Console only' (warning), 'Not applicable' (neutral)"
  it('badges each area with its coverage state', () => {
    renderScreen();

    const expected: Record<CoverageArea['state'], string> = {
      'dedicated-screen': 'Dedicated screen',
      'console-only': 'Console only',
      'not-applicable': 'Not applicable',
    };
    for (const area of coverageAreas) {
      expect(badgeOf(area), `${area.id} is ${area.state} and must be badged accordingly`).toBe(expected[area.state]);
    }
  });

  // coverage-matrix-screen.md — "a reference to the covering screen, named as the navigation names
  // it"; "Every row's coverage state and its 'where it lives' cell agree by construction"
  it('names the covering screen exactly as the navigation names it', () => {
    renderScreen();

    for (const area of coverageAreas.filter((candidate) => candidate.state === 'dedicated-screen')) {
      const label = screens.find((navScreen) => navScreen.id === area.screenId)?.label ?? '';
      expect(label.length, `${area.id} claims a screen the navigation does not name`).toBeGreaterThan(0);
      expect(within(rowOf(area)).getByRole('button', { name: new RegExp(label) })).toBeInTheDocument();
    }
  });

  // coverage-matrix-screen.md — "for a console-only area, a reference to the Raw console screen"
  it('sends every console-only area to the Raw console', () => {
    renderScreen();

    const rawConsoleLabel = screens.find((navScreen) => navScreen.id === 'raw-console')!.label;
    for (const area of coverageAreas.filter((candidate) => candidate.state === 'console-only')) {
      expect(within(rowOf(area)).getByRole('button', { name: new RegExp(rawConsoleLabel) })).toBeInTheDocument();
      // "the command that reaches it and the reason it has no screen, both in full"
      expect(rowOf(area).textContent).toContain(area.command);
      expect(rowOf(area).textContent).toContain(area.reason);
    }
  });

  // coverage-matrix-screen.md — "for a not-applicable area, no reference but the stated 'no screen,
  // no command' in its place"
  it('offers no destination for an area outside the product, and says so', () => {
    renderScreen();

    for (const area of coverageAreas.filter((candidate) => candidate.state === 'not-applicable')) {
      expect(within(rowOf(area)).queryByRole('button')).not.toBeInTheDocument();
      expect(rowOf(area).textContent).toContain('no screen, no command');
      expect(rowOf(area).textContent).toContain(area.reason);
    }
  });

  // coverage-matrix-screen.md — "nothing for an area that has its own screen"
  it('states neither command nor reason for an area that has its own screen', () => {
    renderScreen();

    for (const area of coverageAreas.filter((candidate) => candidate.state === 'dedicated-screen')) {
      expect(rowOf(area).textContent).not.toContain('no screen, no command');
    }
  });

  // coverage-matrix-screen.md — "Following a row's reference makes the screen it names active,
  // through the application's cross-navigation service"; plan-docker_management_app/REQ-105
  it('navigates to the screen a row names, through the cross-navigation service', async () => {
    const user = userEvent.setup();
    renderScreen();

    for (const screenId of [...new Set(coverageAreas.map((area) => area.screenId).filter(Boolean))]) {
      const area = coverageAreas.find((candidate) => candidate.screenId === screenId)!;
      const label = screens.find((navScreen) => navScreen.id === screenId)!.label;

      await user.click(within(rowOf(area)).getByRole('button', { name: new RegExp(label) }));

      expect(navigatedTo(), `following "${area.name}" must lead to ${screenId}`).toBe(screenId);
    }
  });

  // coverage-matrix-screen.md — a console-only row leads to the Raw console
  it('navigates to the Raw console from a console-only row', async () => {
    const user = userEvent.setup();
    renderScreen();
    const area = firstOfState('console-only');
    const rawConsoleLabel = screens.find((navScreen) => navScreen.id === 'raw-console')!.label;

    await user.click(within(rowOf(area)).getByRole('button', { name: new RegExp(rawConsoleLabel) }));

    expect(navigatedTo()).toBe('raw-console');
  });

  // coverage-matrix-screen.md — "The header of the second card states the totals: how many
  // capability areas there are, how many have a dedicated screen, how many are reachable only
  // through the raw console, and how many are outside this product"
  it('states the four totals in the header of the matrix', () => {
    renderScreen();
    const counts = countCoverage(coverageAreas);

    const header = Array.from(document.querySelectorAll<HTMLElement>('.ui-section-header')).find((candidate) =>
      candidate.textContent?.includes('Docker capability coverage'),
    );
    const description = header?.querySelector('.ui-section-header__description')?.textContent ?? '';
    expect(description).toMatch(new RegExp(`\\b${counts.total}\\b`));
    expect(description).toMatch(new RegExp(`\\b${counts.dedicatedScreen}\\b`));
    expect(description).toMatch(new RegExp(`\\b${counts.consoleOnly}\\b`));
    expect(description).toMatch(new RegExp(`\\b${counts.notApplicable}\\b`));
  });
});

describe('CoverageMatrixScreen — the baseline (coverage/specs/coverage-matrix-screen.md)', () => {
  // plan-docker_management_app/REQ-106; coverage-matrix-screen.md — "The declared baseline and the
  // daemon's versions are always shown together, never one without the other"
  it('shows the declared baseline and the daemon reading side by side', () => {
    renderScreen({ baseline: report() });

    expect(valueMatching(/declared.*engine api/i)).toContain('1.43');
    expect(valueMatching(/declared.*cli/i)).toContain('24.0');
    expect(valueMatching(/daemon.*engine api/i)).toContain('1.43');
    expect(valueMatching(/daemon version/i)).toContain('24.0.7');
    expect(valueMatching(/oldest/i)).toContain('1.24');
    // The strip carries both readings too, so the divergence is read off one line.
    expect(baselineStrip().textContent).toContain('1.43');
    expect(baselineStrip().textContent).toContain('24.0.7');
  });

  // plan-docker_management_app/REQ-106 — "so a mismatch is visible"; coverage-matrix-screen.md — the
  // verdict in words, per comparison
  it.each<[BaselineReport['comparison'], RegExp]>([
    ['match', /matches/i],
    ['daemon-newer', /newer/i],
    ['daemon-older', /older/i],
    ['unknown', /could not be compared/i],
  ])('states the verdict in words when the comparison is %s', (comparison, verdict) => {
    renderScreen({ baseline: report({ comparison }) });

    expect(baselineStrip().textContent).toMatch(verdict);
  });

  // coverage-matrix-screen.md — a mismatch is a warning, a match a success, an incomparable pair
  // neutral: the state dot carries the tone
  it.each<[BaselineReport['comparison'], string]>([
    ['match', 'success'],
    ['daemon-newer', 'warning'],
    ['daemon-older', 'warning'],
    ['unknown', 'neutral'],
  ])('tones the state dot for %s as %s', (comparison, tone) => {
    renderScreen({ baseline: report({ comparison }) });

    expect(baselineStrip().querySelector('.ui-table-status-dot')?.className).toContain(`tone-${tone}`);
  });

  // coverage-matrix-screen.md — "An unreachable daemon empties neither the matrix nor the declared
  // half of the baseline: only the daemon's own readings are missing, and each says so"
  it('keeps the declared half and the whole matrix when the daemon could not be read', () => {
    renderScreen({
      baseline: report({ daemon: undefined, daemonUnavailableDetail: 'Connection refused by the Docker endpoint', comparison: 'unknown' }),
    });

    expect(valueMatching(/declared.*engine api/i)).toContain('1.43');
    expect(valueMatching(/daemon.*engine api/i)).toBe('unavailable');
    expect(valueMatching(/daemon version/i)).toBe('unavailable');
    expect(baselineStrip().textContent).toContain('Connection refused by the Docker endpoint');
    expect(matrixRows()).toHaveLength(coverageAreas.length);
  });

  // coverage-matrix-screen.md — the oldest Engine API reads "not reported" when the daemon does not
  // say
  it('says the oldest accepted Engine API is not reported when the daemon does not give one', () => {
    renderScreen({ baseline: report({ daemon: { version: '24.0.7', apiVersion: '1.43' } }) });

    expect(valueMatching(/oldest/i)).toBe('not reported');
  });

  // coverage-matrix-screen.md — "Before the first successful read: the strip states that the
  // baseline is being read"
  it('states that the baseline is being read before the first read settles', () => {
    renderScreen({ baseline: undefined, loaded: false });

    expect(baselineStrip().textContent).toMatch(/reading the baseline/i);
    // The map never waits on the baseline.
    expect(matrixRows()).toHaveLength(coverageAreas.length);
  });

  // coverage-matrix-screen.md — "if that read failed, that it could not be read, and a failure
  // banner carries the message with a retry"
  it('states the failure with its message and a retry when the read failed', async () => {
    const user = userEvent.setup();
    renderScreen({ baseline: undefined, loaded: true, error: 'Request failed with HTTP 500' });

    expect(baselineStrip().textContent).toMatch(/could not be read/i);
    const banner = document.querySelector('.ui-error-banner');
    expect(banner?.textContent).toContain('Request failed with HTTP 500');
    expect(matrixRows()).toHaveLength(coverageAreas.length);

    await user.click(within(banner as HTMLElement).getByRole('button', { name: /retry/i }));
    expect(refresh).toHaveBeenCalled();
  });

  // coverage-matrix-screen.md — "a failed read keeps the last good baseline on screen beside the
  // error banner" (use-coverage.md: "A failed read leaves the last successfully read baseline in
  // place rather than blanking it")
  it('keeps the last known baseline beside the failure banner', () => {
    renderScreen({ baseline: report(), error: 'daemon unreachable' });

    expect(document.querySelector('.ui-error-banner')?.textContent).toContain('daemon unreachable');
    expect(valueMatching(/declared.*engine api/i)).toContain('1.43');
    expect(valueMatching(/daemon version/i)).toContain('24.0.7');
  });

  // coverage-matrix-screen.md — "'Re-read' on the baseline strip ... re-read the baseline"
  it('re-reads the baseline on demand', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(within(baselineStrip()).getByRole('button', { name: /re-?read/i }));

    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
