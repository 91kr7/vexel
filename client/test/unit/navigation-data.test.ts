import { describe, expect, it } from 'vitest';
import { coverageAreas } from '../../src/coverage/coverage-map';
import { defaultScreenId, navGroupOrder, screens, type ScreenDefinition } from '../../src/shell/navigation';

// The navigation data is the single source of truth for what the operator is
// offered and how each screen names itself (app-shell/specs/navigation-data.md).
// The rename of the screen the application dedicates to itself lives entirely
// here, so this is where the two halves of it are checked against each other:
// what the operator reads changed, what the application persists did not.
//
// The entry under test is addressed by its internal id, never by its label —
// the label is the thing being asserted, and the id is what the contract says
// may not move.

/**
 * The internal identity of the screen the application dedicates to itself, as
 * an earlier version persisted it as the last active screen
 * (plan-docker_management_app/REQ-115). It is the value automated checks and
 * stored preferences address the screen by.
 */
const PERSISTED_SCREEN_ID = 'coverage-matrix';

/** The old operator-visible name of that screen, which nothing addressed at a human reader may still use. */
const OLD_SCREEN_NAME = /coverage matrix/i;

function aboutScreen(): ScreenDefinition {
  const found = screens.find((screen) => screen.id === PERSISTED_SCREEN_ID);
  if (!found) throw new Error(`no screen with id ${PERSISTED_SCREEN_ID}`);
  return found;
}

describe('Navigation data — the About screen (app-shell/specs/navigation-data.md)', () => {
  // plan-docker_management_app-about_license_notice/REQ-1
  it('labels the application\'s own screen "About", with the matching title and a one-line description', () => {
    const about = aboutScreen();

    expect(about.label).toBe('About');
    expect(about.title).toBe('About');
    // "a one-line description": present, and a single line.
    expect(about.description.length).toBeGreaterThan(0);
    expect(about.description).not.toContain('\n');
  });

  // plan-docker_management_app-about_license_notice/REQ-1 — same group, same position as before
  it('keeps that entry as the last one of the "Full coverage" group', () => {
    const about = aboutScreen();
    const fullCoverage = screens.filter((screen) => screen.group === 'Full coverage');

    expect(about.group).toBe('Full coverage');
    expect(fullCoverage.at(-1)).toBe(about);
    // The group itself has not moved either: it is still the last of the rail.
    expect(navGroupOrder.at(-1)).toBe('Full coverage');
    expect(navGroupOrder).toEqual(['Workloads', 'Artifacts', 'Environment', 'Full coverage']);
  });

  // plan-docker_management_app-about_license_notice/REQ-2 — the rename does not reach the identity
  it('leaves the screen addressable by the identity an earlier version persisted', () => {
    // A "last active screen" written before the rename still names a screen the
    // application knows, so restoring it needs no migration step.
    expect(screens.map((screen) => screen.id)).toContain(PERSISTED_SCREEN_ID);
    expect(aboutScreen().label).not.toBe(PERSISTED_SCREEN_ID);
    // Nothing else answers to that id, so the restore is unambiguous.
    expect(screens.filter((screen) => screen.id === PERSISTED_SCREEN_ID)).toHaveLength(1);
  });

  // plan-docker_management_app-about_license_notice/REQ-4 — the coverage statement stays discoverable
  it('names the functional coverage matrix in the entry\'s description', () => {
    const about = aboutScreen();

    expect(
      OLD_SCREEN_NAME.test(about.description),
      'the description is the only place the navigation still says the coverage matrix is on this screen',
    ).toBe(true);
    // It says so alongside what the screen is now named after: identity and licence.
    expect(/identit|licen[cs]e/i.test(about.description)).toBe(true);
  });

  // plan-docker_management_app-about_license_notice/REQ-5
  it('offers the operator no entry still named "Coverage matrix"', () => {
    for (const screen of screens) {
      expect(OLD_SCREEN_NAME.test(screen.label), `the "${screen.id}" entry is still labelled with the old name`).toBe(false);
      expect(OLD_SCREEN_NAME.test(screen.title), `the "${screen.id}" header still carries the old name`).toBe(false);
    }
  });

  // plan-docker_management_app-about_license_notice/REQ-5 — every operator-visible string, wherever it lives
  it('leaves no other operator-visible string naming the screen by its old name', () => {
    // The coverage map's own prose is read by the operator on this very screen;
    // row references to screens are resolved from the navigation data and are
    // covered by the assertions above.
    for (const area of coverageAreas) {
      const prose = `${area.name} ${area.summary} ${area.reason ?? ''}`;
      expect(OLD_SCREEN_NAME.test(prose), `the "${area.id}" coverage area still names the screen "Coverage matrix"`).toBe(false);
    }
  });
});

describe('Navigation data — the inventory (app-shell/specs/navigation-data.md)', () => {
  // "Exactly twelve entries", "Every id is unique" — the Swarm entry left on 2026-08-27 with the
  // area (plan-docker_management_app-swarm_removal/REQ-1) and nothing took its place.
  it('declares the twelve screens, each with a unique id', () => {
    const ids = screens.map((screen) => screen.id);

    expect(screens).toHaveLength(12);
    expect(new Set(ids).size).toBe(ids.length);
    for (const screen of screens) {
      expect(screen.label.length, `${screen.id} must be labelled`).toBeGreaterThan(0);
      expect(screen.title.length, `${screen.id} must carry a header title`).toBeGreaterThan(0);
      expect(screen.glyph.length, `${screen.id} must carry a rail glyph`).toBeGreaterThan(0);
      expect(navGroupOrder, `${screen.id} belongs to a group the rail does not show`).toContain(screen.group);
    }
  });

  // navigation-data.md — "The Swarm entry left on 2026-08-27 with the area
  // (plan-docker_management_app-swarm_removal/REQ-1) and nothing took its place: no disabled
  // entry, no separator, no group left short of a member" (REQ-1, REQ-3).
  it('offers no swarm entry, and leaves no group short of a member where one was', () => {
    for (const screen of screens) {
      expect(/swarm/i.test(`${screen.id} ${screen.label} ${screen.title} ${screen.description}`), `the "${screen.id}" entry names swarm`).toBe(
        false,
      );
    }

    for (const group of navGroupOrder) {
      expect(
        screens.filter((screen) => screen.group === group).length,
        `the "${group}" group holds no entry at all`,
      ).toBeGreaterThan(0);
    }
  });

  // "defaultScreenId — 'dashboard', the screen active on load": untouched by the rename
  it('still lands on a screen of the inventory when nothing is persisted', () => {
    expect(defaultScreenId).toBe('dashboard');
    expect(screens.map((screen) => screen.id)).toContain(defaultScreenId);
  });
});
