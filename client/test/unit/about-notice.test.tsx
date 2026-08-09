import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AboutNotice } from '../../src/shell/AboutNotice';

// The identity and legal notice is the Appropriate Legal Notices display the
// AGPL asks an interactive network application for
// (app-shell/specs/about-notice.md). Every clause below is required on its own
// — a display missing one of them is arguably not such a display at all — so
// each requirement gets its own assertion rather than one match over the whole
// block.
//
// Nothing here is read off the component: the wording is matched by the idea
// each requirement states, the URLs and the version come from the files the
// repository ships, and the layout is only ever asked whether two clauses are
// distinguishable, never how.

/** The repository root, from the client workspace directory vitest runs in. */
const repositoryRoot = join(process.cwd(), '..');

/** The source repository the notice must offer a route to (REQ-14). */
const SOURCE_URL = 'https://github.com/91kr7/vexel';

/** The version the project declares for the build being run (REQ-15). */
function declaredVersion(): string {
  const manifest = JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8')) as { version?: string };
  if (!manifest.version) throw new Error('the repository root package.json declares no version');
  return manifest.version;
}

/** Whitespace-insensitive reading of what an element puts in front of the operator. */
function textOf(element: Element | null): string {
  return (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function renderNotice(): HTMLElement {
  const { container } = render(<AboutNotice />);
  return container;
}

/**
 * The smallest element of the subtree whose text carries `pattern` — the block
 * the operator sees that clause in.
 *
 * Used to ask whether two clauses are told apart, without assuming anything
 * about which element the notice happens to wrap a paragraph in.
 */
function smallestBlockContaining(root: HTMLElement, pattern: RegExp): HTMLElement {
  const matches = Array.from(root.querySelectorAll<HTMLElement>('*')).filter((element) => pattern.test(textOf(element)));
  if (matches.length === 0) throw new Error(`no element of the notice states ${pattern}`);
  const innermost = matches.filter((element) => !matches.some((other) => other !== element && element.contains(other)));
  return innermost[0];
}

function links(root: HTMLElement): HTMLAnchorElement[] {
  return Array.from(root.querySelectorAll('a'));
}

/** The clauses the notice must state, each one a requirement of its own. */
const CLAUSES: { requirement: string; pattern: RegExp }[] = [
  { requirement: 'REQ-10 — the author\'s copyright', pattern: /Copyright \(C\) 2026 Christian Mariani/ },
  { requirement: 'REQ-11 — the licence it is under', pattern: /GNU Affero General Public License, version 3/i },
  { requirement: 'REQ-12 — the absence of warranty', pattern: /no warranty/i },
  { requirement: 'REQ-13 — the right to convey', pattern: /convey/i },
  { requirement: 'REQ-15 — the running version', pattern: /version \d+\.\d+\.\d+/ },
  { requirement: 'REQ-16 — the network-modification duty', pattern: /over a network/i },
  { requirement: 'REQ-17 — the reservation of the name', pattern: /rights in the name/i },
];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  // The no-request test installs a beacon jsdom does not ship; it leaves with it.
  Reflect.deleteProperty(window.navigator, 'sendBeacon');
  window.localStorage.clear();
});

describe('AboutNotice — what the notice states (app-shell/specs/about-notice.md)', () => {
  // plan-docker_management_app-about_license_notice/REQ-9
  it('states the product name', () => {
    expect(textOf(renderNotice())).toMatch(/\bVexel\b/);
  });

  // plan-docker_management_app-about_license_notice/REQ-10
  it('states the copyright of the natural person holding it, with the year', () => {
    expect(textOf(renderNotice())).toMatch(/Copyright \(C\) 2026 Christian Mariani/);
  });

  // plan-docker_management_app-about_license_notice/REQ-11
  it('states the licence and the additional terms permitted under its section 7', () => {
    const text = textOf(renderNotice());

    expect(text).toMatch(/GNU Affero General Public License, version 3/i);
    expect(text).toMatch(/AGPL-3\.0-only/);
    expect(text, 'the notice never says the licence is supplemented under section 7').toMatch(/section 7/i);
  });

  // plan-docker_management_app-about_license_notice/REQ-11 — two distinct routes, one document each
  it('offers a route to the full licence and another to the additional terms, neither to the repository root', () => {
    const targets = links(renderNotice()).map((link) => link.getAttribute('href') ?? '');

    const licence = targets.filter((href) => /\/LICENSE$/.test(href));
    const additionalTerms = targets.filter((href) => /\/LICENSE-ADDITIONAL-TERMS\.md$/.test(href));
    expect(licence, 'no route reaches the full licence text in one step').toHaveLength(1);
    expect(additionalTerms, 'no route reaches the additional terms in one step').toHaveLength(1);
    expect(licence[0]).not.toBe(additionalTerms[0]);
    // Neither may stop at the repository, leaving the operator to search for the document.
    for (const href of [...licence, ...additionalTerms]) {
      expect(href.replace(/\/$/, ''), 'a licence route leads to the repository root, not to the document').not.toBe(SOURCE_URL);
    }
  });

  // plan-docker_management_app-about_license_notice/REQ-12
  it('states that the software comes with no warranty', () => {
    expect(textOf(renderNotice())).toMatch(/no warranty/i);
  });

  // plan-docker_management_app-about_license_notice/REQ-13
  it('states that the operator may convey the work under this licence', () => {
    const clause = textOf(smallestBlockContaining(renderNotice(), /convey/i));

    expect(clause).toMatch(/convey/i);
    expect(clause, 'the right to convey is stated without saying it is under the same licence').toMatch(/licen[cs]e/i);
  });

  // plan-docker_management_app-about_license_notice/REQ-14
  it('offers the source repository as a route followable in one step and legible as plain text', () => {
    const container = renderNotice();
    const source = links(container).filter((link) => link.getAttribute('href') === SOURCE_URL);

    expect(source, `no route leads to ${SOURCE_URL}`).toHaveLength(1);
    // Legible where following it is impossible: the URL is shown character for character.
    expect(textOf(source[0])).toContain(SOURCE_URL);
  });

  // plan-docker_management_app-about_license_notice/REQ-15
  it('shows the version the project declares for this build, next to the route to the source', () => {
    const container = renderNotice();
    const source = links(container).find((link) => link.getAttribute('href') === SOURCE_URL);

    // "next to": the same block carries both, so the two are read together.
    expect(textOf(source?.parentElement ?? null)).toMatch(new RegExp(`version\\s*${declaredVersion().replace(/\./g, '\\.')}`));
  });

  // plan-docker_management_app-about_license_notice/REQ-16
  it('warns that a network-exposed modified version owes its users the source and the attribution', () => {
    const clause = textOf(smallestBlockContaining(renderNotice(), /over a network/i));

    expect(clause).toMatch(/modif/i);
    expect(clause, 'the duty to offer the source of the modified version is not stated').toMatch(/source/i);
    expect(clause, 'the duty to preserve the author attribution is not stated').toMatch(/attribution/i);
  });

  // plan-docker_management_app-about_license_notice/REQ-17
  it('reserves the name and claims nothing beyond that', () => {
    const clause = textOf(smallestBlockContaining(renderNotice(), /rights in the name/i));

    expect(clause).toMatch(/no rights in the name .Vexel. are granted/i);
    expect(clause).toMatch(/reserved/i);
    // A reservation of the name, not a claim of control over what a fork may do.
    expect(clause, 'the name clause claims more than the name').not.toMatch(/may not (fork|modify|redistribute|use)/i);
  });

  // app-shell/specs/about-notice.md — "Every clause above is stated separately, so removing any one
  // of them is visible"; two adjacent runs of prose must not collapse into one paragraph
  it('states each clause in a block of its own, so no two of them merge', () => {
    const container = renderNotice();
    const blocks = CLAUSES.map((clause) => ({ ...clause, block: smallestBlockContaining(container, clause.pattern) }));

    for (const left of blocks) {
      for (const right of blocks) {
        if (left === right) continue;
        expect(left.block === right.block, `${left.requirement} and ${right.requirement} share one block`).toBe(false);
        expect(
          left.block.contains(right.block),
          `${left.requirement} is not told apart from ${right.requirement}: one block contains the other`,
        ).toBe(false);
      }
    }
  });
});

describe('AboutNotice — how it is presented (app-shell/specs/about-notice.md)', () => {
  // plan-docker_management_app-about_license_notice/REQ-6
  it('is one self-contained block holding everything it says', () => {
    const container = renderNotice();

    expect(container.children, 'the notice renders as more than one top-level block').toHaveLength(1);
    const block = container.children[0];
    for (const { requirement, pattern } of CLAUSES) {
      expect(pattern.test(textOf(block)), `${requirement} is stated outside the notice's own block`).toBe(true);
    }
    // Recognisable as one unit: the block is a surface of the library, with a title of its own.
    expect(block.className).toContain('ui-surface');
  });

  // plan-docker_management_app-about_license_notice/REQ-8
  it('takes no props and reads nothing an operator could change', () => {
    expect(AboutNotice.length, 'the notice accepts a parameter, so a caller can influence it').toBe(0);

    // Stored state of any kind must leave it identical: same markup with an empty
    // browser store and with one carrying values that name the notice.
    window.localStorage.clear();
    const first = renderNotice().innerHTML;
    cleanup();
    window.localStorage.setItem('aboutNotice', 'hidden');
    window.localStorage.setItem('lastScreenId', 'dashboard');
    const second = renderNotice().innerHTML;
    window.localStorage.clear();

    expect(second).toBe(first);
  });

  // plan-docker_management_app-about_license_notice/REQ-19
  it('renders without issuing a network request of any kind', () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error('the notice must not fetch anything')));
    const xhrOpen = vi.fn();
    const sendBeacon = vi.fn(() => true);
    const eventSource = vi.fn();
    const webSocket = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('EventSource', eventSource);
    vi.stubGlobal('WebSocket', webSocket);
    vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(xhrOpen);
    // jsdom ships no sendBeacon, so it is installed rather than spied on; the
    // property is removed again below whether or not the assertions pass.
    Object.defineProperty(window.navigator, 'sendBeacon', { value: sendBeacon, configurable: true });

    const container = renderNotice();

    // It rendered complete from what the application already holds locally...
    for (const { requirement, pattern } of CLAUSES) {
      expect(pattern.test(textOf(container)), `${requirement} is missing with no network available`).toBe(true);
    }
    // ...and contacted nobody: not for its content, not to check for an update,
    // not to report the installation.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(xhrOpen).not.toHaveBeenCalled();
    expect(sendBeacon).not.toHaveBeenCalled();
    expect(eventSource).not.toHaveBeenCalled();
    expect(webSocket).not.toHaveBeenCalled();
  });

  // plan-docker_management_app-about_license_notice/REQ-20 — built from library components only, so
  // the documented minimum contrast holds without anything local overriding it
  it('hard-codes no colour and no spacing of its own', () => {
    const container = renderNotice();

    for (const element of Array.from(container.querySelectorAll<HTMLElement>('*'))) {
      for (const className of Array.from(element.classList)) {
        expect(className.startsWith('ui-'), `"${className}" is not a class of the UI library`).toBe(true);
      }
      const style = element.getAttribute('style');
      if (!style) continue;
      // The library's layout primitives carry a token-valued gap; a literal
      // colour, length or shadow here would be a hard-coded value.
      for (const declaration of style.split(';').filter((part) => part.trim().length > 0)) {
        expect(declaration, `the notice sets a value of its own: ${declaration.trim()}`).toMatch(/var\(--[a-z0-9-]+\)/);
      }
    }
  });

  // plan-docker_management_app-about_license_notice/REQ-21
  it('reads as a legal statement, with no call to action beyond the routes the licence asks for', () => {
    const container = renderNotice();

    // Exactly the three routes the licence itself requires: the two documents and the source.
    expect(links(container)).toHaveLength(3);
    expect(container.querySelectorAll('button')).toHaveLength(0);
    // Nothing that solicits the reader on the author's behalf.
    for (const solicitation of [/\bstar\b/i, /sponsor/i, /donate/i, /subscribe/i, /sign up/i, /follow us/i, /download now/i]) {
      expect(textOf(container), `the notice solicits the reader: ${solicitation}`).not.toMatch(solicitation);
    }
  });

  // plan-docker_management_app-about_license_notice/REQ-22
  it('carries nothing that goes stale but the running version', () => {
    const text = textOf(renderNotice());

    // No release date, and no year other than the copyright year.
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    const years = text.match(/\b(19|20)\d{2}\b/g) ?? [];
    expect(new Set(years), 'the notice states a year other than the copyright year').toEqual(new Set(['2026']));
    // The version is the only value that moves, and it is the declared one.
    // No word boundary at the end: adjacent blocks concatenate in the text.
    const moving = text.match(/\d+\.\d+\.\d+/g) ?? [];
    expect(moving).toEqual([declaredVersion()]);
  });
});
