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
  '.ui-frame__scrim',
  '.ui-session-ended-overlay',
  '.ui-log-stream__jump',
];

const claudeMd = readFileSync(join(repositoryRoot, 'CLAUDE.md'), 'utf8');
const checkScript = readFileSync(join(process.cwd(), 'scripts', 'check-ui-conformance.mjs'), 'utf8');

/** The blur section of CLAUDE.md: from its heading to the next one of the same level. */
function blurSection(): string {
  const start = claudeMd.indexOf('### Performance — background and blur');
  if (start < 0) throw new Error('CLAUDE.md states no "Performance — background and blur" section');
  const next = claudeMd.indexOf('\n### ', start + 1);
  return next < 0 ? claudeMd.slice(start) : claudeMd.slice(start, next);
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
  // plan-liquid_glass_overlays/REQ-14
  it.each(allowListedOverlaySelectors)('names %s as an allow-listed surface in CLAUDE.md', (selector) => {
    expect(blurSection()).toContain(selector);
  });

  // plan-liquid_glass_overlays/REQ-14 — the guard rails that keep the allow-list narrow
  it('states the single blur token, the automated check and the exception marker', () => {
    const section = blurSection();

    expect(section).toContain('--blur-overlay');
    expect(section).toContain('20px');
    expect(section).toContain('check-ui-conformance.mjs');
    expect(section).toContain('ui-blur-exception:');
  });

  // plan-liquid_glass_overlays/REQ-14 — the two content-flow overlays are named with their reason
  it('names the two allow-listed surfaces that live inside the scrolled content flow', () => {
    const section = blurSection();

    expect(section).toContain('.ui-session-ended-overlay');
    expect(section).toContain('.ui-log-stream__jump');
    expect(section).toMatch(/content flow/);
  });

  // plan-liquid_glass_overlays/REQ-8, REQ-14 — one list, written in two places
  it('keeps the checker constant and the documented allow-list identical', () => {
    expect(constantSelectors().slice().sort()).toEqual(allowListedOverlaySelectors.slice().sort());
  });
});
