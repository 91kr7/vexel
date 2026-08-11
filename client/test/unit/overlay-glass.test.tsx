import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Combobox,
  ConfirmDialog,
  FormDialog,
  Modal,
  NavBrand,
  NavRail,
  SessionEndedOverlay,
  Surface,
  TransferProgressDialog,
} from '../../src/ui';

afterEach(cleanup);

// ui-library/specs/overlay-glass.md — the one runtime-blurred material of the
// application, carried by the surfaces drawn above what they cover. jsdom
// applies no stylesheet and computes no backdrop-filter, so the material itself
// is verified on the stylesheet text and the carriers on the rendered classes;
// what the browser finally paints stays a human's judgement
// (plan-liquid_glass_overlays, departure 4).

const srcRoot = join(process.cwd(), 'src');

interface CssRule {
  /** The rule's own prelude, i.e. its selector list. */
  selector: string;
  /** The at-rule preludes enclosing it, outermost first. */
  conditions: string[];
  /** The declarations written directly in the rule, nested blocks removed. */
  declarations: string;
}

/**
 * Every stylesheet shipped under client/src/, path and content, comments
 * stripped. The conformance check's fixture directory is skipped: that suite
 * writes deliberately illegal stylesheets there for the length of one spawn,
 * and a scan of the shipped code must not depend on whether it is mid-run
 * (CLAUDE.md, "Tests" — a test depends on nothing another test did).
 */
function stylesheets(directory = srcRoot): { path: string; css: string }[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.name === '__conformance-fixture__') return [];
    if (entry.isDirectory()) return stylesheets(path);
    if (!entry.name.endsWith('.css')) return [];
    return [{ path, css: readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '') }];
  });
}

/** Flattens a stylesheet into its style rules, each with the at-rules that enclose it. */
function parseRules(css: string): CssRule[] {
  const rules: CssRule[] = [];
  const open: { prelude: string; start: number }[] = [];
  let preludeStart = 0;
  for (let index = 0; index < css.length; index += 1) {
    const character = css[index];
    if (character === '{') {
      open.push({ prelude: css.slice(preludeStart, index).trim(), start: index + 1 });
      preludeStart = index + 1;
    } else if (character === '}') {
      const block = open.pop();
      preludeStart = index + 1;
      if (!block || block.prelude.startsWith('@')) continue;
      const body = css.slice(block.start, index);
      rules.push({
        selector: block.prelude,
        conditions: open.map((enclosing) => enclosing.prelude).filter((prelude) => prelude.startsWith('@')),
        declarations: body.replace(/\{[^{}]*\}/g, ''),
      });
    }
  }
  return rules;
}

const allRules = stylesheets().flatMap(({ path, css }) => parseRules(css).map((rule) => ({ ...rule, path })));

/** The rules whose selector list names the given class as a whole class. */
function rulesFor(className: string): (CssRule & { path: string })[] {
  const named = new RegExp(`\\${className}(?![\\w-])`);
  return allRules.filter((rule) => named.test(rule.selector));
}

/** A declaration block computes a runtime blur when it asks for a blur that is not switched off. */
function declaresRuntimeBlur(declarations: string): boolean {
  return [...declarations.matchAll(/(?:-webkit-)?(?:backdrop-)?filter\s*:\s*([^;]+)/g)].some(([, value]) =>
    /blur\(/.test(value),
  );
}

function declaredValues(declarations: string, property: string): string[] {
  const matcher = new RegExp(`(?:^|[;{\\s])${property}\\s*:\\s*([^;]+)`, 'g');
  return [...declarations.matchAll(matcher)].map(([, value]) => value.trim());
}

function isPhoneBreakpoint(conditions: string[]): boolean {
  return conditions.some((condition) => /@media/.test(condition) && /max-width:\s*720px/.test(condition));
}

function isReducedTransparency(condition: string): boolean {
  return /prefers-reduced-transparency:\s*reduce/.test(condition);
}

const overlayGlassRules = rulesFor('.ui-overlay-glass');

/**
 * The surfaces that write the material out themselves: the class every Surface
 * opts into, and the two plain-CSS surfaces a media query keeps a class from
 * reaching. Every other carrier takes the material by wearing the class.
 */
const carriers = ['.ui-overlay-glass', '.ui-combobox__list', '.ui-nav-rail'];

/** Every rule in the client's stylesheets that asks the browser for a blur. */
const blurringRules = allRules.filter((rule) => declaresRuntimeBlur(rule.declarations));

/** Every place the material's shared fill variable is given a value, with the at-rules around it. */
const fillSettings = allRules.flatMap((rule) =>
  declaredValues(rule.declarations, '--overlay-glass-background').map((value) => ({ ...rule, value })),
);

describe('overlay glass material — the blur it declares (ui-library/specs/overlay-glass.md)', () => {
  // plan-liquid_glass_overlays/REQ-1, REQ-6 — the material is defined once, under its own name,
  // and blurs at the token
  it('declares the backdrop blur on .ui-overlay-glass, valued from the blur token', () => {
    const blurring = overlayGlassRules.filter((rule) => declaresRuntimeBlur(rule.declarations));

    expect(blurring.length).toBeGreaterThan(0);
    for (const rule of blurring) {
      expect(declaredValues(rule.declarations, 'backdrop-filter').join(' ')).toContain('blur(var(--blur-overlay))');
    }
  });

  // plan-liquid_glass_overlays/REQ-12 — the blur reaches WebKit too: the prefixed property is
  // declared alongside the standard one, and written first, so a minifier folding the pair keeps
  // the standard one
  it.each(carriers)('declares the -webkit- counterpart before the standard property on %s', (selector) => {
    const blurring = rulesFor(selector).filter((rule) => declaresRuntimeBlur(rule.declarations));

    expect(blurring.length).toBeGreaterThan(0);
    for (const rule of blurring) {
      const prefixed = rule.declarations.search(/-webkit-backdrop-filter\s*:/);
      const standard = rule.declarations.search(/(?:^|[;{\s])backdrop-filter\s*:/);
      expect(prefixed).toBeGreaterThanOrEqual(0);
      expect(standard).toBeGreaterThanOrEqual(0);
      expect(prefixed).toBeLessThan(standard);
    }
  });

  // overlay-glass.md — "no carrying surface is ever a backdrop root": the blur is painted on a
  // layer of the surface's own, never by the surface element, because an element carrying a
  // backdrop blur becomes the backdrop root of everything inside it and a nested blur then renders
  // nothing at all (plan-liquid_glass_overlays/REQ-1, REQ-4)
  it('declares every blur of the client on a pseudo layer, never on the surface element', () => {
    expect(blurringRules.length).toBeGreaterThan(0);
    for (const rule of blurringRules) {
      const compounds = rule.selector.split(',').map((compound) => compound.trim());
      for (const compound of compounds) expect(compound).toMatch(/::[a-z-]+$/);
    }
  });

  // overlay-glass.md — that layer sits behind the surface's content, which is what makes the
  // blurred backdrop visible through the translucent fill (plan-liquid_glass_overlays/REQ-1)
  it('puts the blur layer behind the content of the surface carrying it', () => {
    for (const rule of blurringRules) {
      expect(declaredValues(rule.declarations, 'z-index')).toContain('-1');
    }
  });

  // overlay-glass.md — a translucent fill and a border, and nothing laid over them: the depth comes
  // from the blurred content behind, and a light wash on top only greyed the surface out
  it('lays no gradient over the fill of the material', () => {
    for (const rule of [...overlayGlassRules, ...blurringRules]) {
      expect(rule.declarations).not.toMatch(/gradient\(/);
      expect(declaredValues(rule.declarations, 'background-image')).toEqual([]);
    }
  });

  // plan-liquid_glass_overlays/REQ-6 — one blur value in the whole codebase, and it is the token
  it('never states a blur length of its own, anywhere in the client stylesheets', () => {
    const blurring = allRules.filter((rule) => /blur\(/.test(rule.declarations));

    expect(blurring.length).toBeGreaterThan(0);
    for (const rule of blurring) {
      // Every blur() left once the token-valued ones are removed carries a length of its own.
      expect(rule.declarations.replaceAll('blur(var(--blur-overlay))', '')).not.toContain('blur(');
    }
  });

  // plan-liquid_glass_overlays/REQ-6 — the token carries the single documented value, declared as
  // the maximum any surface may use
  it('defines --blur-overlay as 20px in the tokens', () => {
    const tokens = readFileSync(join(srcRoot, 'ui', 'tokens.css'), 'utf8');

    expect(/--blur-overlay:\s*20px\s*;/.test(tokens)).toBe(true);
  });

  // plan-liquid_glass_overlays/REQ-1 — a translucent fill, not an opaque box; and the fill is
  // chosen once, centrally, so no carrier states a fallback of its own
  it('fills the material from the shared fill variable, defaulting to the translucent token', () => {
    const filling = overlayGlassRules.filter((rule) => rule.conditions.length === 0);
    const defaults = fillSettings.filter((setting) => setting.conditions.length === 0);

    expect(declaredValues(filling.map((rule) => rule.declarations).join(';'), 'background-color')).toContain(
      'var(--overlay-glass-background)',
    );
    expect(defaults.map((setting) => setting.value)).toEqual(['var(--color-surface-overlay)']);
  });

  // plan-liquid_glass_overlays/REQ-1 — the surfaces that bear text over the material take the same
  // fill from the same variable, so all three states reach them without a per-surface fallback.
  // The drawer scrim is deliberately excluded: it bears no text and keeps its own dim (frame.md).
  it.each(['.ui-overlay-glass', '.ui-combobox__list', '.ui-nav-rail'])('fills %s from that same variable', (selector) => {
    const backgrounds = rulesFor(selector).flatMap((rule) => declaredValues(rule.declarations, 'background-color'));

    expect(backgrounds).toContain('var(--overlay-glass-background)');
  });
});

describe('overlay glass material — its two degradations (ui-library/specs/overlay-glass.md)', () => {
  // plan-liquid_glass_overlays/REQ-11 — no backdrop blur available: the fill goes near-opaque so
  // the covered content stays unreadable without the blur doing that work
  it('raises the fill to the dense token where backdrop blur is unsupported', () => {
    const fallback = fillSettings.filter((setting) =>
      setting.conditions.some((condition) => /@supports/.test(condition) && /\bnot\b/.test(condition) && /backdrop-filter/.test(condition)),
    );

    expect(fallback.map((setting) => setting.value)).toEqual(['var(--color-surface-overlay-dense)']);
  });

  // plan-liquid_glass_overlays/REQ-13 — reduced transparency: a fully opaque fill …
  it('turns the fill opaque under prefers-reduced-transparency', () => {
    const reduced = fillSettings.filter((setting) => setting.conditions.some(isReducedTransparency));

    expect(reduced.map((setting) => setting.value)).toEqual(['var(--color-surface-overlay-opaque)']);
  });

  // plan-liquid_glass_overlays/REQ-11, REQ-13 — both degradations present the same surface at the
  // same geometry: they change the fill and the blur, and nothing that could move a layout
  it('changes nothing but the fill and the blur in either degradation', () => {
    const degraded = allRules.filter((rule) =>
      rule.conditions.some(
        (condition) => isReducedTransparency(condition) || (/@supports/.test(condition) && /backdrop-filter/.test(condition)),
      ),
    );

    expect(degraded.length).toBeGreaterThan(0);
    for (const rule of degraded) {
      expect(rule.declarations).not.toMatch(
        /(?:^|[;{\s])(?:position|display|inset|top|right|bottom|left|width|height|margin|padding|border-radius|font-size)\s*:/,
      );
    }
  });

  // plan-liquid_glass_overlays/REQ-13 — … and no blur left on any carrier, prefixed property
  // included
  it.each(carriers)('drops the blur of %s under prefers-reduced-transparency', (selector) => {
    const reduced = rulesFor(selector).filter((rule) => rule.conditions.some(isReducedTransparency));
    const declarations = reduced.map((rule) => rule.declarations).join(';');

    expect(declaredValues(declarations, 'backdrop-filter')).toContain('none');
    expect(declaredValues(declarations, '-webkit-backdrop-filter')).toContain('none');
    for (const rule of reduced) expect(declaresRuntimeBlur(rule.declarations)).toBe(false);
  });
});

describe('overlay glass material — where it lands (ui-library/specs/overlay-glass.md)', () => {
  // plan-liquid_glass_overlays/REQ-7 — the base surface never blurs, at any elevation: that is what
  // keeps every main-view panel built on a Surface free of one
  it.each(['.ui-surface', '.ui-surface--flat', '.ui-surface--raised', '.ui-surface--sunken'])(
    'declares no runtime blur on %s',
    (selector) => {
      const rules = rulesFor(selector);

      expect(rules.length).toBeGreaterThan(0);
      for (const rule of rules) expect(declaresRuntimeBlur(rule.declarations)).toBe(false);
    },
  );

  // plan-liquid_glass_overlays/REQ-7 — no surface of the main view computes a runtime blur: the
  // shell frame, the header, cards, panels, tables, detail panels, split panes and the log /
  // console / terminal surfaces are all covered by there being nothing else that blurs at all.
  // The rail's sizing wrapper is included: it is a bare box, and the card is what paints
  // (frame.md).
  it('leaves the material carriers as the only blurred surfaces of the client', () => {
    const blurred = new Set(
      blurringRules.flatMap((rule) => rule.selector.split(',').map((compound) => compound.trim().replace(/::[a-z-]+$/, ''))),
    );

    expect([...blurred].sort()).toEqual([...carriers].sort());
  });

  // plan-liquid_glass_overlays/REQ-2 — the dialog scrim stays a plain dim: it must not become the
  // backdrop root of the dialog nested inside it
  it('declares no runtime blur on the dialog scrim', () => {
    const rules = rulesFor('.ui-modal-overlay');

    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) expect(declaresRuntimeBlur(rule.declarations)).toBe(false);
  });

  // plan-liquid_glass_overlays/REQ-4 — the suggestion popup is plain CSS, so it declares the
  // material on its own rule, from the same token
  it('gives the suggestion popup the material', () => {
    const blurring = rulesFor('.ui-combobox__list').filter((rule) => declaresRuntimeBlur(rule.declarations));

    expect(blurring.length).toBeGreaterThan(0);
    expect(declaredValues(blurring.map((rule) => rule.declarations).join(';'), 'backdrop-filter').join(' ')).toContain(
      'blur(var(--blur-overlay))',
    );
  });

  // plan-liquid_glass_overlays/REQ-5, REQ-7 — the drawer card blurs only where the rail has left
  // the flow; above the phone breakpoint the docked rail is main view and blurs not at all
  it('blurs .ui-nav-rail at the phone breakpoint only', () => {
    const blurring = rulesFor('.ui-nav-rail').filter((rule) => declaresRuntimeBlur(rule.declarations));

    expect(blurring.length).toBeGreaterThan(0);
    for (const rule of blurring) expect(isPhoneBreakpoint(rule.conditions)).toBe(true);
  });

  // plan-liquid_glass_overlays/REQ-5 — the drawer's scrim is no carrier: it spans the whole
  // viewport, so a blur on it would blur the entire main view, background asset included. It says
  // so explicitly rather than by omission (frame.md).
  it('leaves the drawer scrim a plain dim, declaring the absence explicitly', () => {
    const rules = rulesFor('.ui-frame__scrim');
    const declarations = rules.map((rule) => rule.declarations).join(';');

    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) expect(declaresRuntimeBlur(rule.declarations)).toBe(false);
    expect(declaredValues(declarations, 'backdrop-filter')).toContain('none');
    expect(declaredValues(declarations, '-webkit-backdrop-filter')).toContain('none');
  });

  // plan-liquid_glass_overlays/REQ-16 — the session-ended overlay is inset: 0 over the whole
  // terminal region, so it stays a plain dim too, and states the absence explicitly
  // (session-chrome.md)
  it('leaves the session-ended overlay a plain dim, declaring the absence explicitly', () => {
    const rules = rulesFor('.ui-session-ended-overlay');
    const declarations = rules.map((rule) => rule.declarations).join(';');

    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) expect(declaresRuntimeBlur(rule.declarations)).toBe(false);
    expect(declaredValues(declarations, 'backdrop-filter')).toContain('none');
    expect(declaredValues(declarations, '-webkit-backdrop-filter')).toContain('none');
  });

  // plan-liquid_glass_overlays/REQ-16 — and the overlay does not wear the material's class either,
  // which is the other way a surface could acquire it
  it('renders the session-ended overlay without the material class', () => {
    const { container } = render(<SessionEndedOverlay message="Session ended." />);

    const overlay = container.querySelector('.ui-session-ended-overlay') as HTMLElement;
    expect(overlay.classList.contains('ui-overlay-glass')).toBe(false);
  });
});

describe('Surface material opt-in (ui-library/specs/surface.md)', () => {
  // surface.md — a Surface asked for no material is unchanged: the material is additive and
  // reachable only by asking (plan-liquid_glass_overlays/REQ-7)
  it.each(['flat', 'raised', 'sunken'] as const)('carries no material class at elevation %s without the opt-in', (elevation) => {
    const { container } = render(<Surface elevation={elevation}>panel</Surface>);

    const surface = container.querySelector('.ui-surface') as HTMLElement;
    expect(surface.classList.contains('ui-overlay-glass')).toBe(false);
    expect(surface.classList.contains(`ui-surface--${elevation}`)).toBe(true);
  });

  // surface.md — "a Surface asked for no material renders exactly what it rendered before the
  // opt-in existed: same markup, same classes". The opt-in is additive and its default adds
  // nothing at all (plan-liquid_glass_overlays/REQ-7).
  it.each(['flat', 'raised', 'sunken'] as const)('renders elevation %s identically with and without the prop', (elevation) => {
    const implicit = render(
      <Surface elevation={elevation} padding="md">
        panel
      </Surface>,
    ).container.innerHTML;
    cleanup();
    const explicit = render(
      <Surface elevation={elevation} padding="md" material="base">
        panel
      </Surface>,
    ).container.innerHTML;

    expect(implicit).toBe(explicit);
    expect(implicit).toBe(`<div class="ui-surface ui-surface--${elevation} ui-surface--pad-md">panel</div>`);
  });

  // surface.md — material="overlay" is the single opt-in that blurs
  // (plan-liquid_glass_overlays/REQ-1)
  it('carries the material class when asked for the overlay material', () => {
    const { container } = render(
      <Surface elevation="raised" material="overlay">
        panel
      </Surface>,
    );

    const surface = container.querySelector('.ui-surface') as HTMLElement;
    expect(surface.classList.contains('ui-overlay-glass')).toBe(true);
    expect(surface.classList.contains('ui-surface--raised')).toBe(true);
  });
});

describe('Modal surfaces (ui-library/specs/modal.md)', () => {
  // modal.md — the dialog surface carries the material at both sizes, the scrim carries none
  // (plan-liquid_glass_overlays/REQ-1, REQ-2)
  it.each(['default', 'large'] as const)('gives the %s dialog surface the material and never the scrim', (size) => {
    const { container } = render(
      <Modal open title="Remove container" size={size} onClose={vi.fn()}>
        body
      </Modal>,
    );

    const scrim = container.querySelector('.ui-modal-overlay') as HTMLElement;
    const surface = container.querySelector('.ui-surface') as HTMLElement;
    expect(surface.classList.contains('ui-overlay-glass')).toBe(true);
    expect(scrim.classList.contains('ui-overlay-glass')).toBe(false);
  });

  // modal.md — everything built on Modal carries the material by construction, so the rule holds
  // for every dialog in the application, not only for one (plan-liquid_glass_overlays/REQ-1)
  it.each([
    ['ConfirmDialog', () => <ConfirmDialog open targetName="web" consequence="It is removed." onConfirm={vi.fn()} onCancel={vi.fn()} />],
    ['FormDialog', () => <FormDialog open title="Pull an image" onSubmit={vi.fn()} onCancel={vi.fn()} />],
    [
      'TransferProgressDialog',
      () => <TransferProgressDialog open title="Saving" currentBytes={1} status="active" onCancel={vi.fn()} onClose={vi.fn()} />,
    ],
  ] as const)('gives the %s surface the material and not its scrim', (_name, dialog) => {
    const { container } = render(dialog());

    const scrim = container.querySelector('.ui-modal-overlay') as HTMLElement;
    const surface = container.querySelector('.ui-surface') as HTMLElement;
    expect(surface.classList.contains('ui-overlay-glass')).toBe(true);
    expect(scrim.classList.contains('ui-overlay-glass')).toBe(false);
  });
});

describe('the plain-CSS carriers render the selectors the material is written for', () => {
  // plan-liquid_glass_overlays/REQ-4 — the popup the CSS rule targets is the one Combobox opens
  it('opens a suggestion list carrying the popup selector', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [value, setValue] = useState('');
      return (
        <Combobox value={value} onChange={setValue} options={[{ value: 'alpine:3.20', label: 'alpine:3.20' }]} ariaLabel="Image reference" />
      );
    }
    const { container } = render(<Harness />);

    await user.click(screen.getByRole('combobox', { name: 'Image reference' }));

    expect(container.querySelector('.ui-combobox__list')).not.toBeNull();
  });

  // plan-liquid_glass_overlays/REQ-5 — the drawer card the CSS rule targets is the one NavRail paints
  it('paints the rail card under the drawer selector', () => {
    const { container } = render(<NavRail brand={<NavBrand name="Vexel" tagline="Docker" />} />);

    expect(container.querySelector('.ui-nav-rail')).not.toBeNull();
  });
});
