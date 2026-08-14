import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **The mechanism the arrangement is required to use, and the ones it is
 * required not to.** REQ ids belong to
 * `plan-docker_management_app-detail_property_columns`.
 *
 * REQ-5 is a requirement about *how* the count is computed, and its whole
 * content is a negative: no JavaScript measurement, no `ResizeObserver`, no
 * viewport query, nothing recomputed per frame. None of that is observable in a
 * browser — a `ResizeObserver` implementation produces the same column count as
 * an intrinsic one and passes every geometric check in the Playwright tree — so
 * it is checked here, at the source, exactly as REQ-27's "no count at a call
 * site" is.
 *
 * **Nothing here asserts geometry** (REQ-43): jsdom has no layout and reports
 * every box as zero, so a column count or a height written here would pass on
 * any build. The counts, the heights and the boxes live in
 * `client/e2e/property-columns-rule.spec.ts` and in the four specs beside it.
 */

const read = (...segments: string[]) => readFileSync(join(process.cwd(), 'src', ...segments), 'utf8');

/** The files that decide how many columns a property section shows. */
const ARRANGEMENT_FILES = ['ui/layout/content-columns.ts', 'ui/layout/ContentColumns.tsx', 'ui/layout/Grid.tsx', 'ui/data/DefinitionList.tsx'];

/** The two call sites the report names, which state a content class and nothing else. */
const REPORTED_PANELS = ['images/ImageDetailPanel.tsx', 'containers/ContainerDetailPanel.tsx'];

/** A layout read in JavaScript, in any of the shapes this codebase could reach for. */
const JAVASCRIPT_MEASUREMENT = [
  /ResizeObserver/,
  /getBoundingClientRect/,
  /offsetWidth|offsetHeight|clientWidth|clientHeight/,
  /matchMedia/,
  /requestAnimationFrame/,
  /window\.innerWidth|window\.innerHeight/,
];

/** The declaration blocks of a stylesheet, selector and body. */
function rules(css: string): { selector: string; body: string }[] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((rule) => ({ selector: rule[1]!.trim(), body: rule[2]! }));
}

/** The value of a custom property declared in `tokens.css`. */
function token(name: string): string | undefined {
  return new RegExp(`${name}:\\s*([^;]+);`).exec(read('ui', 'tokens.css'))?.[1]?.trim();
}

function pixels(value: string | undefined): number {
  expect(value, 'the token is not declared at all').toBeDefined();
  const parsed = /^(\d+(?:\.\d+)?)px$/.exec(value!.trim());
  expect(parsed, `the token is declared as "${value}", which is not a length in px`).not.toBeNull();
  return Number(parsed![1]);
}

describe('the arrangement computes nothing in JavaScript', () => {
  // REQ-5 — the count is the layout engine's, not a measurement taken in an effect. These sections
  // sit in the scrolled main view of screens listing hundreds of objects, and the project's own
  // performance rule is that the main view pays nothing.
  it.each([...ARRANGEMENT_FILES, ...REPORTED_PANELS])('%s reads no box and observes no resize', (path) => {
    const text = read(...path.split('/'));
    for (const forbidden of JAVASCRIPT_MEASUREMENT) {
      expect(text, `it measures the layout in JavaScript (${forbidden.source})`).not.toMatch(forbidden);
    }
  });

  // REQ-5 — a viewport media query answers for the window, not for the box, and REQ-4 requires two
  // sections on one screen at one instant to differ. A container query is admitted by REQ-5 only
  // where intrinsic sizing genuinely cannot express the rule; intrinsic sizing can, so there is
  // none, and REQ-12's "no new breakpoint is invented" holds by the same absence.
  it('states the rule without a viewport query and without a container query', () => {
    const css = read('ui', 'layout', 'content-columns.css');

    expect(css, 'the arrangement is keyed to the window instead of to its own box').not.toMatch(/@media/);
    expect(css, 'the arrangement uses a container query, which REQ-5 admits only where intrinsic sizing cannot express the rule').not.toMatch(/@container/);
  });
});

describe('the rule the arrangement states', () => {
  const css = read('ui', 'layout', 'content-columns.css');
  const trackRules = rules(css).filter((rule) => rule.body.includes('grid-template-columns'));

  // REQ-2, REQ-5 — "as many bands of at least X as fit, against the container's own box", which is
  // what `repeat(auto-fit, minmax(…, 1fr))` resolved against the element's own width says.
  it('sizes its tracks intrinsically, at the minimum of a content class', () => {
    const derived = trackRules.filter((rule) => rule.body.includes('repeat('));

    expect(derived.length, 'no rule derives its track count at all').toBeGreaterThan(0);
    for (const rule of derived) {
      expect(rule.body, `${rule.selector} does not fit as many tracks as its box carries`).toMatch(/repeat\(\s*auto-fit\s*,\s*minmax\(/);
      expect(rule.body, `${rule.selector} does not let a track grow into the width it is given`).toMatch(/1fr\s*\)\s*\)/);
    }
  });

  // REQ-7 — a minimum wider than the section degrades to the section's width instead of pushing a
  // track through it: the ~400px card case, which the caller-stated surfaces already fail and which
  // this correction must not recreate.
  it('degrades every minimum to the container’s own width', () => {
    const derived = trackRules.filter((rule) => rule.body.includes('repeat('));

    for (const rule of derived) {
      expect(rule.body, `${rule.selector} states a minimum that can overflow a container narrower than it`).toMatch(/minmax\(\s*min\(\s*var\(--band-min-[a-z-]+\)\s*,\s*100%\s*\)/);
    }
  });

  // REQ-36 — the minima, the maxima and the gap are library values referenced by name; a length
  // written into the rule is the same defect as a length written at a call site, one file further in.
  it.each([
    ['ui/layout/content-columns.css', undefined],
    ['ui/layout/layout.css', '.ui-grid--pair'],
  ])('%s writes no length of its own', (path, selector) => {
    const scoped = rules(read(...path.split('/'))).filter((rule) => (selector ? rule.selector.includes(selector) : true));

    expect(scoped.length, `no rule matched ${selector ?? path}`).toBeGreaterThan(0);
    for (const rule of scoped) {
      expect(rule.body.replace(/100%/g, ''), `${rule.selector} writes a length instead of naming a design value`).not.toMatch(/\d+(px|rem|em|vw|vh)/);
    }
  });

  // REQ-18, REQ-12 — the `Config` tab's split is the library's, and it collapses against its own
  // box, so no breakpoint is invented for it either.
  it('states the pair split as the same intrinsic rule', () => {
    const pair = rules(read('ui', 'layout', 'layout.css')).find((rule) => rule.selector.includes('.ui-grid--pair'));

    expect(pair, 'the library declares no named pair arrangement').toBeDefined();
    expect(pair!.body, 'the pair split is not derived from its own box').toMatch(/repeat\(\s*auto-fit\s*,\s*minmax\(\s*min\(/);
  });
});

describe('the class minima and maxima are design values, and are the stated ones', () => {
  // REQ-3 — the minimum band width is stated and derived from the content: ~360px for a short
  // scalar, ~560px for long single-line text. REQ-1, REQ-3 — each class carries a maximum on the
  // label→value run: ~500px, and the same additive headroom on the long class, ~700px.
  it('declares the pair minima and the run maxima the requirement states', () => {
    expect(pixels(token('--band-min-pair-short-scalar'))).toBeCloseTo(360, -1);
    expect(pixels(token('--band-min-pair-long-single-line'))).toBeCloseTo(560, -1);
    expect(pixels(token('--band-run-max-short-scalar'))).toBeCloseTo(500, -1);
    expect(pixels(token('--band-run-max-long-single-line'))).toBeCloseTo(700, -1);
  });

  /**
   * REQ-3 — the minimum is *derived from the content*, and the content of a band
   * that carries no label is smaller by exactly the label run the requirement
   * itemises (the ~85px label, the label→value gap and the band's padding). A
   * band of single values sized as though it carried a label would be a figure
   * chosen rather than derived, in the other direction.
   */
  it('takes the label run off the minimum of a band that carries no label', () => {
    for (const contentClass of ['short-scalar', 'long-single-line']) {
      const pair = pixels(token(`--band-min-pair-${contentClass}`));
      const value = pixels(token(`--band-min-value-${contentClass}`));
      const labelRun = pair - value;

      expect(value, `the ${contentClass} value minimum is not smaller than its pair minimum`).toBeLessThan(pair);
      expect(labelRun, `the ${contentClass} classes differ by ${labelRun}px, which is not the label run the derivation states`).toBeGreaterThanOrEqual(80);
      expect(labelRun, `the ${contentClass} classes differ by ${labelRun}px, which is more than the label run the derivation states`).toBeLessThanOrEqual(170);
    }
  });

  // REQ-3, REQ-6 — three classes, and free text is the absence of a grid rather than a third
  // minimum: a Dockerfile instruction against a timestamp label is not a column.
  it('gives unbounded free text one column and no minimum at all', () => {
    const css = read('ui', 'layout', 'content-columns.css');
    const freeText = rules(css).filter((rule) => rule.selector.includes('free-text'));

    expect(freeText.length, 'the free-text class selects no rule of its own').toBeGreaterThan(0);
    for (const rule of freeText) {
      expect(rule.body, `${rule.selector} arranges free text in columns`).not.toMatch(/repeat\(/);
      expect(rule.body, `${rule.selector} does not give free text the one full-width column it keeps today`).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    }
    expect(token('--band-min-pair-free-text'), 'free text carries a minimum band width, which it has no columns to need').toBeUndefined();
  });
});

describe('the reported call sites state a content class and nothing else', () => {
  /**
   * The names of the props one element is handed, read at brace depth zero so
   * that the data an `items` expression carries — arrow functions, template
   * strings, a percentage in a value — is never mistaken for a prop of the
   * section.
   */
  function propsOf(text: string, tag: string): string[][] {
    const elements: string[][] = [];
    for (const opening of [...text.matchAll(new RegExp(`<${tag}(?=[\\s/>])`, 'g'))]) {
      const props: string[] = [];
      let depth = 0;
      let index = opening.index! + opening[0].length;
      let attribute = '';
      while (index < text.length) {
        const character = text[index]!;
        if (character === '{') depth += 1;
        else if (character === '}') depth -= 1;
        else if (depth === 0 && character === '>') break;
        else if (depth === 0 && /[A-Za-z]/.test(character)) attribute += character;
        else if (depth === 0 && character === '=') {
          props.push(attribute);
          attribute = '';
        } else if (depth === 0 && /\s/.test(character)) attribute = '';
        index += 1;
      }
      elements.push(props);
    }
    return elements;
  }

  /** What a caller of these components may state: the data, and the class of the values it holds. */
  const STATEABLE = new Set(['items', 'contentClass', 'key', 'arrangement', 'children']);

  // REQ-27, REQ-36 — scoped to what REQ-27 is about: the sections themselves. A caller cannot know
  // the width it will be given, so a count, a template or a length passed to one of these is the
  // wrong shape whatever it is worth.
  it.each(REPORTED_PANELS)('%s hands its property sections no count, template or length', (path) => {
    const text = read(...path.split('/'));
    const sections = [...propsOf(text, 'DefinitionList'), ...propsOf(text, 'ContentColumns'), ...propsOf(text, 'Grid')];

    expect(sections.length, 'the panel renders none of the components this report is about').toBeGreaterThan(0);
    // The props are read, not merely searched for: a parser that found none would make every
    // assertion below pass on any build.
    expect(sections.flat(), 'no prop was read at all, so what follows would certify nothing').toContain('items');
    for (const props of sections) {
      const stated = props.filter((prop) => !STATEABLE.has(prop));
      expect(stated, `a property section is handed ${stated.join(', ')}, where the only thing a caller may state is what its values are`).toEqual([]);
    }
  });

  /**
   * The same reading applied to a call site that **does** state a count: if the
   * props of one could not be read, the assertion above would be empty of
   * content on any build.
   *
   * It used to be applied to `SwarmServicesPanel.tsx`, which was the last file
   * in the product still writing `columns={2}`. The work that retired the
   * caller-stated count took that source away, so the reading is exercised
   * against a source written here — one that states a count, a template and a
   * length — rather than against whichever file happens to still hold a defect.
   * A self-check that depends on a defect surviving is a self-check with an
   * expiry date.
   */
  it('reads a caller-stated count, template and length where one is written', () => {
    const stated = `
      <DefinitionList columns={2} style={{ minWidth: 360 }} items={list.map(([key, value]) => ({ label: key, value }))} />
      <Grid columns="1fr 1fr" gap="var(--space-5)">{children}</Grid>
    `;

    expect(propsOf(stated, 'DefinitionList').flat(), 'the reading of a call site’s props finds nothing where a count is written').toEqual(['columns', 'style', 'items']);
    expect(propsOf(stated, 'Grid').flat(), 'the reading of a call site’s props finds nothing where a template is written').toEqual(['columns', 'gap']);
  });

  // REQ-36 — and no stylesheet and no inline style anywhere in the file: the visual language has one
  // home, and it is not a feature screen.
  it.each(REPORTED_PANELS)('%s carries no stylesheet and no inline style', (path) => {
    const text = read(...path.split('/'));

    expect(text, 'the panel imports a stylesheet of its own').not.toMatch(/import\s+['"][^'"]*\.css['"]/);
    expect(text, 'the panel writes an inline style').not.toMatch(/style\s*=\s*\{/);
  });
});
