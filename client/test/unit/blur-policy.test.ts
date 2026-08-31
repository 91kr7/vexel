import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// The blur allow-list is written twice on purpose — once as a constant the
// build check enforces, once as prose a human reads before touching a
// stylesheet — and the two silently disagreeing is exactly the failure
// plan-liquid_glass_overlays/REQ-14 exists to prevent. The expected list is
// neither file's: it is the one the component specification names.
const repositoryRoot = join(process.cwd(), '..');

const allowListedOverlaySelectors = [
  '.ui-overlay-glass',
  '.ui-combobox__list',
  '.ui-frame__rail',
  '.ui-nav-rail',
  '.ui-log-stream__jump',
];

// The two surfaces the human withdrew on sight after seeing them blurred: a
// scrim spans the whole viewport, so blurring it blurs the main view rather
// than a panel (plan-liquid_glass_overlays/REQ-5), and the session-ended
// overlay is inset: 0 over a whole terminal region, one scale down from the
// same objection (plan-liquid_glass_overlays/REQ-16).
const withdrawnFromTheAllowList = ['.ui-frame__scrim', '.ui-session-ended-overlay'];

const claudeMd = readFileSync(join(repositoryRoot, 'CLAUDE.md'), 'utf8');
const checkScript = readFileSync(join(process.cwd(), 'scripts', 'check-ui-conformance.mjs'), 'utf8');

/** The blur section of CLAUDE.md: from its heading to the next one of the same level. */
function blurSection(): string {
  const start = claudeMd.indexOf('### Performance — background and blur');
  if (start < 0) throw new Error('CLAUDE.md states no "Performance — background and blur" section');
  const next = claudeMd.indexOf('\n### ', start + 1);
  return next < 0 ? claudeMd.slice(start) : claudeMd.slice(start, next);
}

/**
 * The selectors of the allow-list table CLAUDE.md states, read from the table
 * itself rather than from the surrounding prose: the prose also names the
 * surfaces kept off the list, and a plain substring search would count those as
 * members.
 */
function documentedSelectors(): string[] {
  const section = blurSection();
  const header = section.indexOf('| Surface | Selector |');
  if (header < 0) throw new Error('CLAUDE.md states no allow-list table of blurred surfaces');
  const table = section.slice(header).split('\n');
  const rows = table.slice(2, table.findIndex((line, index) => index >= 2 && !line.startsWith('|')));
  return rows.flatMap((row) => [...row.split('|').at(-2)!.matchAll(/`([^`]+)`/g)].map((match) => match[1]));
}

/** The selectors of the checker's allow-list constant. */
function constantSelectors(): string[] {
  const declaration = /blurAllowedOverlaySelectors\s*=\s*new Set\(\[([\s\S]*?)\]\)/.exec(checkScript);
  if (!declaration) throw new Error('the check script declares no blurAllowedOverlaySelectors constant');
  return [...declaration[1].matchAll(/['"`]([^'"`]+)['"`]/g)].map((match) => match[1]);
}

/** Every stylesheet shipped under client/src/, path and content. */
function stylesheets(directory = join(process.cwd(), 'src')): { path: string; css: string }[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return stylesheets(path);
    return entry.name.endsWith('.css') ? [{ path, css: readFileSync(path, 'utf8') }] : [];
  });
}

/** The declaration blocks of the rules whose selector names the backdrop layer. */
function backdropRuleBodies(): string[] {
  return stylesheets().flatMap(({ css }) =>
    [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter((rule) => /\.ui-backdrop\b/.test(rule[1]))
      .map((rule) => rule[2]),
  );
}

describe('application backdrop', () => {
  // plan-liquid_glass_overlays/REQ-9
  it('declares no filter of its own on the backdrop layer', () => {
    const bodies = backdropRuleBodies();

    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) expect(body).not.toMatch(/(^|[\s;-])(backdrop-)?filter\s*:/);
  });
});

describe('blur policy documentation', () => {
  // plan-liquid_glass_overlays/REQ-14 — the section states the list itself, by surface
  it.each(allowListedOverlaySelectors)('names %s as an allow-listed surface in CLAUDE.md', (selector) => {
    expect(documentedSelectors()).toContain(selector);
  });

  // plan-liquid_glass_overlays/REQ-14, REQ-15 — "exactly as wide as the list, and no wider": a
  // surface withdrawn from the list must not still read as a member of it
  it.each(withdrawnFromTheAllowList)('does not present %s as an allow-listed surface', (selector) => {
    expect(documentedSelectors()).not.toContain(selector);
    expect(constantSelectors()).not.toContain(selector);
  });

  // plan-liquid_glass_overlays/REQ-14 — the guard rails that keep the allow-list narrow
  it('states the single blur token, the automated check and the exception marker', () => {
    const section = blurSection();

    expect(section).toContain('--blur-overlay');
    expect(section).toContain('20px');
    expect(section).toContain('check-ui-conformance.mjs');
    expect(section).toContain('ui-blur-exception:');
  });

  // plan-liquid_glass_overlays/REQ-14 — the one allow-listed surface that lives inside the
  // scrolled content flow is named next to the rule, with the reason it is accepted
  it('names the allow-listed surface that lives inside the scrolled content flow', () => {
    const section = blurSection();

    expect(section).toMatch(/content flow/);
    expect(section).toMatch(/jump-to-live/);
    expect(section).toMatch(/withdraw/);
  });

  // plan-liquid_glass_overlays/REQ-15 — no component specification still contradicts the shipped
  // code about a surface's material. The session-ended overlay is the one the plan corrected
  // twice: it was implemented blurred, then withdrawn to a plain dim (REQ-16), and every spec that
  // speaks of it has to say the same thing session-chrome.md does.
  it('has no ui-library specification claiming the session-ended overlay blurs', () => {
    const specs = join(repositoryRoot, '.sdd', 'modules', 'ui-library', 'specs');
    const claiming = readdirSync(specs)
      .filter((name) => name.endsWith('.md'))
      .flatMap((name) =>
        readFileSync(join(specs, name), 'utf8')
          .split(/\n\s*\n/)
          .filter((paragraph) => /session-ended overlay|SessionEndedOverlay/i.test(paragraph))
          .filter((paragraph) => /does blur|is blurred|carries the overlay glass material/i.test(paragraph))
          .map((paragraph) => `${name}: ${paragraph.trim()}`),
      );

    expect(claiming).toEqual([]);
  });

  // plan-liquid_glass_overlays/REQ-8, REQ-14 — one list, written in two places: the checker's
  // constant, the prose a human reads, and the component specification they both answer to
  it('keeps the checker constant and the documented allow-list identical', () => {
    expect(constantSelectors().slice().sort()).toEqual(allowListedOverlaySelectors.slice().sort());
    expect(documentedSelectors().slice().sort()).toEqual(allowListedOverlaySelectors.slice().sort());
  });
});
