import { describe, expect, it } from 'vitest';
import { countCoverage, coverageAreas, type CoverageArea } from '../../src/coverage/coverage-map';
import { screens } from '../../src/shell/navigation';

// The coverage map is the product's own statement about itself (REQ-105), so a
// test that merely re-reads it proves nothing. What is checked here is whether
// the statement can be caught lying: a screen named that does not exist, a
// capability the plan withdrew presented as covered, a gap stated without its
// reason, or a screen of the application missing from the inventory.
//
// The authority for the gaps is the plan itself — "Departures from the spec" in
// batches.md (departures One and Three, 2026-08-07) and coverage-map.md — never
// the map under test.

/**
 * The capabilities the product does not cover with a screen of its own, each
 * identified by the command that reaches it in the raw console rather than by
 * the wording of an entry: coverage-map.md fixes the command, the prose is the
 * map's own to choose.
 */
const REQUIRED_CONSOLE_ONLY: { capability: string; command: RegExp; authority: string }[] = [
  { capability: 'image building', command: /\bdocker (buildx )?build\b/, authority: 'departure One' },
  { capability: 'swarm stack deployment', command: /\bdocker stack deploy\b/, authority: 'departure Three' },
  { capability: 'build-cache export and import', command: /--cache-(to|from)\b/, authority: 'departure Three' },
  { capability: 'TCP+TLS context creation', command: /\bdocker context create\b/, authority: 'departure Three' },
  { capability: 'vulnerability scanning (Docker Scout)', command: /\bdocker (scout|sbom)\b/, authority: 'never modelled' },
];

/**
 * How a capability withdrawn by a departure would read if some other entry
 * claimed it as covered. Applied to the entries that claim a dedicated screen:
 * none of them may advertise a capability the product gave up.
 */
const WITHDRAWN_CAPABILITY_CLAIMS: { capability: string; claim: RegExp }[] = [
  { capability: 'image building', claim: /\bbuild(s|ing)?\s+(an?\s+|the\s+)?images?\b|\bfrom a dockerfile\b/i },
  { capability: 'swarm stack deployment', claim: /\bdeploy(s|ing|ment)?\b/i },
  {
    capability: 'build-cache export and import',
    claim: /\b(export|import)\w*\b[^.]{0,40}\bcache\b|\bcache\b[^.]{0,40}\b(export|import)\w*\b/i,
  },
  { capability: 'TCP+TLS context creation', claim: /\bcreat\w*\b[^.]{0,60}\b(tls|certificate)|\b(tls|certificate)\w*\b[^.]{0,60}\bcreat/i },
];

function areaById(id: string): CoverageArea {
  const found = coverageAreas.find((area) => area.id === id);
  if (!found) throw new Error(`no coverage area with id ${id}`);
  return found;
}

function describeArea(area: CoverageArea): string {
  return `${area.id} ("${area.name}")`;
}

describe('Coverage map — the declaration itself (coverage/specs/coverage-map.md)', () => {
  // coverage-map.md — "id — stable, unique key of the area"
  it('names every area once', () => {
    const ids = coverageAreas.map((area) => area.id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const area of coverageAreas) {
      expect(area.name.length, `${area.id} must be named`).toBeGreaterThan(0);
      expect(area.summary.length, `${area.id} must say what it covers`).toBeGreaterThan(0);
    }
  });

  // coverage-map.md — "screenId ... present exactly when state is dedicated-screen"; "command ...
  // present exactly when state is console-only"; "reason ... present exactly when state is not
  // dedicated-screen"
  it('carries exactly the fields its coverage state prescribes', () => {
    for (const area of coverageAreas) {
      if (area.state === 'dedicated-screen') {
        expect(area.screenId, `${describeArea(area)} claims a screen without naming it`).toBeTruthy();
        expect(area.command, `${describeArea(area)} has a screen and must not name a command`).toBeUndefined();
        expect(area.reason, `${describeArea(area)} has a screen and is not a gap`).toBeUndefined();
      } else {
        expect(area.screenId, `${describeArea(area)} is not covered by a screen and must name none`).toBeUndefined();
        // "a gap is never stated without why it is a gap"
        expect(area.reason?.length ?? 0, `${describeArea(area)} states a gap without its reason`).toBeGreaterThan(0);
      }
      if (area.state === 'console-only') {
        expect(area.command?.length ?? 0, `${describeArea(area)} is console-only and must name its command`).toBeGreaterThan(0);
      } else {
        expect(area.command, `${describeArea(area)} is not console-only and must name no command`).toBeUndefined();
      }
    }
  });

  // coverage-map.md — "Every screenId names an entry of the navigation data: an area cannot claim a
  // screen that does not exist"
  it('claims only screens the navigation actually has', () => {
    const navigationIds = new Set(screens.map((screen) => screen.id));

    for (const area of coverageAreas.filter((candidate) => candidate.state === 'dedicated-screen')) {
      expect(navigationIds, `${describeArea(area)} claims the screen "${area.screenId}", which the navigation does not have`).toContain(
        area.screenId,
      );
    }
  });

  // coverage-map.md — "Every capability area covered by one of the application's screens appears
  // here with that screen: the map is the inventory of the product, not a subset of it"
  it('leaves no screen of the application out of the inventory', () => {
    const claimed = new Set(coverageAreas.map((area) => area.screenId).filter(Boolean));
    // The coverage matrix is the map itself, not a Docker capability the product covers.
    const shouldBeClaimed = screens.filter((screen) => screen.id !== 'coverage-matrix');

    for (const screen of shouldBeClaimed) {
      expect(claimed, `the "${screen.label}" screen exists but no capability area declares it as its cover`).toContain(screen.id);
    }
  });
});

describe('Coverage map — the gaps the plan requires (batches.md, departures One and Three)', () => {
  // coverage-map.md — "The declaration carries, at minimum, these console-only entries"; batches.md
  // — the four capabilities withdrawn on 2026-08-07, plus Docker Scout
  it.each(REQUIRED_CONSOLE_ONLY)('declares $capability console-only, as $authority requires', ({ command }) => {
    const matching = coverageAreas.filter((area) => command.test(area.command ?? ''));

    expect(matching.length, `no capability area names a command matching ${command}`).toBeGreaterThan(0);
    for (const area of matching) {
      expect(area.state, `${describeArea(area)} names the command but is not declared console-only`).toBe('console-only');
    }
  });

  // coverage-map.md — "The four capabilities withdrawn on 2026-08-07 ... are declared console-only
  // and never not-applicable: each is genuinely reachable by typing its command in the raw console"
  it('never files a withdrawn capability as outside the product', () => {
    const notApplicable = coverageAreas.filter((area) => area.state === 'not-applicable');

    for (const area of notApplicable) {
      for (const { capability, command } of REQUIRED_CONSOLE_ONLY) {
        expect(
          command.test(area.command ?? ''),
          `${describeArea(area)} files ${capability} as not applicable, but it is reachable from the console`,
        ).toBe(false);
      }
    }
  });

  // coverage-map.md — "not-applicable is reserved for what neither channel reaches at all (Docker
  // Desktop's own application settings) or what has no meaning for a daemon manager (docker init)"
  it('reserves "not applicable" for Docker Desktop settings and project scaffolding', () => {
    const notApplicable = coverageAreas.filter((area) => area.state === 'not-applicable');

    expect(notApplicable.length).toBe(2);
    expect(notApplicable.some((area) => /desktop/i.test(area.name))).toBe(true);
    expect(notApplicable.some((area) => /scaffold|init/i.test(`${area.name} ${area.summary}`))).toBe(true);
  });

  // plan-docker_management_app/REQ-105 — the claim is honest only if nothing withdrawn is presented
  // as covered: no entry with a screen of its own may advertise a withdrawn capability
  it.each(WITHDRAWN_CAPABILITY_CLAIMS)('never claims a dedicated screen for $capability', ({ claim }) => {
    const covered = coverageAreas.filter((area) => area.state === 'dedicated-screen');

    for (const area of covered) {
      expect(
        claim.test(`${area.name}. ${area.summary}`),
        `${describeArea(area)} claims a dedicated screen while advertising a capability the product withdrew: "${area.summary}"`,
      ).toBe(false);
    }
  });
});

describe('countCoverage (coverage/specs/coverage-map.md)', () => {
  // coverage-map.md — "{ total, dedicatedScreen, consoleOnly, notApplicable }, the number of entries
  // in each state; the three states sum to total"
  it('counts each state and sums them to the total', () => {
    const areas: CoverageArea[] = [
      { id: 'a', name: 'A', summary: 'a', state: 'dedicated-screen', screenId: 'dashboard' },
      { id: 'b', name: 'B', summary: 'b', state: 'dedicated-screen', screenId: 'containers' },
      { id: 'c', name: 'C', summary: 'c', state: 'console-only', command: 'docker c', reason: 'because' },
      { id: 'd', name: 'D', summary: 'd', state: 'not-applicable', reason: 'because' },
    ];

    expect(countCoverage(areas)).toEqual({ total: 4, dedicatedScreen: 2, consoleOnly: 1, notApplicable: 1 });
  });

  it('counts nothing over an empty declaration', () => {
    expect(countCoverage([])).toEqual({ total: 0, dedicatedScreen: 0, consoleOnly: 0, notApplicable: 0 });
  });

  // The declaration's own counts are consistent with it: the header of the screen states these.
  it('accounts for every entry of the declaration itself', () => {
    const counts = countCoverage(coverageAreas);

    expect(counts.total).toBe(coverageAreas.length);
    expect(counts.dedicatedScreen + counts.consoleOnly + counts.notApplicable).toBe(counts.total);
    // The five gaps coverage-map.md requires are at least that many console-only entries.
    expect(counts.consoleOnly).toBeGreaterThanOrEqual(REQUIRED_CONSOLE_ONLY.length);
  });

  it('leaves the declaration it counts untouched', () => {
    const before = JSON.stringify(coverageAreas);

    countCoverage(coverageAreas);

    expect(JSON.stringify(coverageAreas)).toBe(before);
  });
});

describe('Coverage map — a constant of the application (coverage/specs/coverage-map.md)', () => {
  // coverage-map.md — "The map holds no daemon reading and no state: it is a constant of the
  // application, true before anything is fetched, and identical whichever daemon is connected"
  it('holds only declared data, with no daemon reading of any kind', () => {
    for (const area of coverageAreas) {
      for (const value of Object.values(area)) {
        expect(typeof value).toBe('string');
      }
    }
    // Re-reading the module's own export yields the same declaration, whatever happened in between.
    expect(areaById('raw-console').state).toBe('dedicated-screen');
  });
});

describe('Coverage map — the swarm areas, reclassified (plan-docker_management_app-swarm_removal/REQ-12)', () => {
  /**
   * The five entries the withdrawal leaves, identified by the command that
   * reaches each: coverage-map.md fixes the command, the prose is the map's own.
   */
  const SWARM_AREAS = [
    { area: 'swarm cluster and nodes', command: /\bdocker swarm\b.*\bdocker node ls\b/ },
    { area: 'swarm services', command: /\bdocker service ls\b/ },
    { area: 'swarm secrets and configs', command: /\bdocker secret ls\b.*\bdocker config ls\b/ },
    { area: 'swarm stacks', command: /\bdocker stack ls\b/ },
    { area: 'swarm stack deployment', command: /\bdocker stack deploy\b/ },
  ];

  // coverage-map.md — "The four swarm areas withdrawn on 2026-08-27 are reclassified, not deleted,
  // and take the same form: console-only, each naming the command that reaches it and carrying the
  // one reason the whole withdrawal shares." The fifth was already console-only.
  it.each(SWARM_AREAS)('declares $area console-only, with its command and its reason', ({ command }) => {
    const matching = coverageAreas.filter((area) => command.test(area.command ?? ''));

    expect(matching.length, `no capability area names a command matching ${command}`).toBe(1);
    const area = matching[0]!;
    expect(area.state, `${describeArea(area)} names the command but is not declared console-only`).toBe('console-only');
    expect(area.screenId, `${describeArea(area)} still claims a screen`).toBeUndefined();
    expect(area.reason?.length ?? 0, `${describeArea(area)} states no reason`).toBeGreaterThan(0);
  });

  // REQ-12 — "no entry cites a screen that no longer exists", which is what the stack-deployment
  // entry was reworded for: it justified itself by pointing at the Swarm screen.
  it('leaves no entry naming the screen the product no longer has', () => {
    for (const area of coverageAreas) {
      const prose = `${area.name} ${area.summary} ${area.reason ?? ''}`;
      expect(/\bSwarm screen\b/i.test(prose), `${describeArea(area)} still cites the Swarm screen`).toBe(false);
    }
  });

  // coverage-map.md — "total does not move when an area is reclassified … four entries changed
  // state, none was added or removed". The four are still counted, and they are counted as gaps.
  it('keeps the four reclassified areas in the declaration, counted as console-only', () => {
    const swarmAreas = coverageAreas.filter((area) => /swarm/i.test(`${area.id} ${area.name}`));

    expect(swarmAreas.length, 'the swarm areas were deleted rather than reclassified').toBe(SWARM_AREAS.length);
    for (const area of swarmAreas) {
      expect(area.state, `${describeArea(area)} is not declared console-only`).toBe('console-only');
    }
  });
});
