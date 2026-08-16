import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Resolved from the client workspace root (vitest's working directory), not
// import.meta.url: the jsdom test environment rewrites module URLs and does
// not preserve a file: scheme suitable for path resolution.
const clientRoot = process.cwd();
const scriptPath = join(clientRoot, 'scripts', 'check-ui-conformance.mjs');
const fixtureDir = join(clientRoot, 'src', '__conformance-fixture__');

/** The overlay surfaces the blur policy allows, per the component specification. */
const allowListedOverlaySelectors = [
  '.ui-overlay-glass',
  '.ui-combobox__list',
  '.ui-frame__rail',
  '.ui-nav-rail',
  '.ui-log-stream__jump',
];

function writeFixture(fileName: string, content: string) {
  mkdirSync(fixtureDir, { recursive: true });
  writeFileSync(join(fixtureDir, fileName), content, 'utf8');
}

function runCheck() {
  return spawnSync(process.execPath, [scriptPath], { cwd: clientRoot, encoding: 'utf8' });
}

afterEach(() => {
  rmSync(fixtureDir, { recursive: true, force: true });
});

describe('UI conformance check — library boundary', () => {
  // plan-docker_management_app/REQ-5
  it('passes on the current, conformant codebase', () => {
    const result = runCheck();
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/passed/);
  });

  // plan-docker_management_app/REQ-5
  it('fails when feature code renders a raw DOM tag', () => {
    writeFixture('RawDiv.tsx', 'export function RawDiv() { return <div>raw</div>; }\n');

    const result = runCheck();

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/raw DOM tag/);
  });

  // plan-docker_management_app/REQ-5
  it('fails when feature code carries a className prop', () => {
    writeFixture('ClassName.tsx', 'export function C() { return <Button className="x">Go</Button>; }\n');

    const result = runCheck();

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/"className" prop/);
  });

  // plan-docker_management_app/REQ-5
  it('fails when feature code carries a style prop', () => {
    writeFixture('Style.tsx', 'export function S() { return <Button style={{ color: "red" }}>Go</Button>; }\n');

    const result = runCheck();

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/"style" prop/);
  });

  // plan-docker_management_app/REQ-5
  it('fails when feature code imports a CSS file from outside the UI library', () => {
    writeFixture('styles.css', '.x { color: red; }\n');
    writeFixture('BadImport.tsx', "import './styles.css';\nexport function B() { return null; }\n");

    const result = runCheck();

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/CSS import outside/);
  });
});

describe('UI conformance check — wiring', () => {
  // plan-liquid_glass_overlays/REQ-8 — the check is the one lint and test already run
  it('is invoked by the client workspace lint and test commands', () => {
    const scripts = JSON.parse(readFileSync(join(clientRoot, 'package.json'), 'utf8')).scripts;

    expect(scripts['lint:ui-boundary']).toContain('check-ui-conformance.mjs');
    expect(scripts.lint).toContain('lint:ui-boundary');
    expect(scripts.test).toContain('lint:ui-boundary');
  });
});

describe('UI conformance check — blur policy', () => {
  // plan-liquid_glass_overlays/REQ-8
  it('fails on a runtime blur outside the allow-list, naming file, line and selector', () => {
    writeFixture('blur-outside.css', '.ui-card {\n  backdrop-filter: blur(var(--blur-overlay));\n}\n');

    const result = runCheck();

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(
      /__conformance-fixture__[/\\]blur-outside\.css:2 .* runtime blur on "\.ui-card", which is not an allow-listed overlay surface/,
    );
  });

  // plan-liquid_glass_overlays/REQ-8
  it.each(allowListedOverlaySelectors)(
    'accepts a token-valued blur on %s with no exception comment',
    (selector) => {
      writeFixture('blur-allowed.css', `${selector} {\n  backdrop-filter: var(--blur-overlay);\n}\n`);

      const result = runCheck();

      expect(result.stderr).not.toMatch(/runtime blur/);
      expect(result.status).toBe(0);
    },
  );

  // plan-liquid_glass_overlays/REQ-8
  it('accepts blur(var(--blur-overlay)) as the value of an allow-listed surface', () => {
    writeFixture('blur-function.css', '.ui-combobox__list {\n  backdrop-filter: blur(var(--blur-overlay));\n}\n');

    const result = runCheck();

    expect(result.stderr).not.toMatch(/runtime blur/);
    expect(result.status).toBe(0);
  });

  // plan-liquid_glass_overlays/REQ-8
  it('accepts companion filter functions beside a token-valued blur', () => {
    writeFixture(
      'blur-companion.css',
      '.ui-overlay-glass {\n  backdrop-filter: blur(var(--blur-overlay)) saturate(140%);\n}\n',
    );

    const result = runCheck();

    expect(result.stderr).not.toMatch(/runtime blur/);
    expect(result.status).toBe(0);
  });

  // plan-liquid_glass_overlays/REQ-8
  it('accepts an allow-listed surface blurred inside a media query', () => {
    writeFixture(
      'blur-media.css',
      '@media (max-width: 720px) {\n  .ui-nav-rail {\n    backdrop-filter: var(--blur-overlay);\n  }\n}\n',
    );

    const result = runCheck();

    expect(result.stderr).not.toMatch(/runtime blur/);
    expect(result.status).toBe(0);
  });

  // plan-liquid_glass_overlays/REQ-8
  it('fails when an allow-listed surface declares a blur length of its own', () => {
    writeFixture('blur-literal.css', '.ui-combobox__list {\n  backdrop-filter: blur(20px);\n}\n');

    const result = runCheck();

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(
      /runtime blur on "\.ui-combobox__list" must be valued var\(--blur-overlay\), not a blur length of its own/,
    );
  });

  // plan-liquid_glass_overlays/REQ-8
  it('fails when the token carries a blur length as its fallback', () => {
    writeFixture('blur-fallback.css', '.ui-nav-rail {\n  backdrop-filter: var(--blur-overlay, 20px);\n}\n');

    const result = runCheck();

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/runtime blur on "\.ui-nav-rail" must be valued var\(--blur-overlay\)/);
  });

  // plan-liquid_glass_overlays/REQ-8 — the material declares its blur on the surface's own pseudo
  // layer so that no carrier becomes a backdrop root, which the check has to let through
  it.each(allowListedOverlaySelectors)('accepts a token-valued blur on the %s::before layer', (selector) => {
    writeFixture('blur-pseudo.css', `${selector}::before {\n  backdrop-filter: blur(var(--blur-overlay));\n}\n`);

    const result = runCheck();

    expect(result.stderr).not.toMatch(/runtime blur/);
    expect(result.status).toBe(0);
  });

  // plan-liquid_glass_overlays/REQ-5, REQ-16 — the two surfaces withdrawn from the allow-list are
  // guarded like any main-view surface: a blur on either is a violation again
  it.each(['.ui-frame__scrim', '.ui-session-ended-overlay'])(
    'fails on a runtime blur on %s, withdrawn from the allow-list',
    (selector) => {
      writeFixture('blur-withdrawn.css', `${selector} {\n  backdrop-filter: blur(var(--blur-overlay));\n}\n`);

      const result = runCheck();

      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(
        new RegExp(`runtime blur on "\\${selector}", which is not an allow-listed overlay surface`),
      );
    },
  );

  // plan-liquid_glass_overlays/REQ-8
  it('fails on a filter: blur() with a length of its own on an allow-listed surface', () => {
    writeFixture('blur-filter-literal.css', '.ui-log-stream__jump {\n  filter: blur(4px);\n}\n');

    const result = runCheck();

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/runtime blur on "\.ui-log-stream__jump" must be valued var\(--blur-overlay\)/);
  });

  // plan-liquid_glass_overlays/REQ-8
  it('fails on a vendor-prefixed backdrop-filter outside the allow-list', () => {
    writeFixture('blur-prefixed.css', '.ui-panel {\n  -webkit-backdrop-filter: blur(var(--blur-overlay));\n}\n');

    const result = runCheck();

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/runtime blur on "\.ui-panel", which is not an allow-listed overlay surface/);
  });

  // plan-liquid_glass_overlays/REQ-8
  it('fails on a filter valued with the blur token outside the allow-list', () => {
    writeFixture('blur-token-filter.css', '.ui-table {\n  filter: var(--blur-overlay);\n}\n');

    const result = runCheck();

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/runtime blur on "\.ui-table", which is not an allow-listed overlay surface/);
  });

  // plan-liquid_glass_overlays/REQ-9
  it('fails on a runtime blur applied to the backdrop layer', () => {
    writeFixture('blur-backdrop.css', '.ui-backdrop {\n  backdrop-filter: blur(var(--blur-overlay));\n}\n');

    const result = runCheck();

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/runtime blur on "\.ui-backdrop", which is not an allow-listed overlay surface/);
  });

  // plan-liquid_glass_overlays/REQ-8 — fails closed: no enclosing rule
  it('fails on a blur declaration that sits outside any rule', () => {
    writeFixture('blur-no-rule.css', 'backdrop-filter: blur(var(--blur-overlay));\n');

    const result = runCheck();

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/runtime blur/);
  });

  // plan-liquid_glass_overlays/REQ-8 — fails closed: at-rule prelude
  it('fails on a blur whose enclosing prelude is an at-rule', () => {
    writeFixture('blur-at-rule.css', '@media (max-width: 720px) {\n  backdrop-filter: var(--blur-overlay);\n}\n');

    const result = runCheck();

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/runtime blur/);
  });

  // plan-liquid_glass_overlays/REQ-8 — fails closed: one non-allow-listed member of a selector list
  it('fails on a selector list mixing an allow-listed surface with another', () => {
    writeFixture(
      'blur-selector-list.css',
      '.ui-combobox__list,\n.ui-card {\n  backdrop-filter: var(--blur-overlay);\n}\n',
    );

    const result = runCheck();

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/is not an allow-listed overlay surface/);
  });

  // plan-liquid_glass_overlays/REQ-8 — fails closed: a descendant is not the allow-listed surface
  it('fails on a blur applied to a descendant of an allow-listed surface', () => {
    writeFixture(
      'blur-descendant.css',
      '.ui-combobox__list .ui-combobox__option {\n  backdrop-filter: var(--blur-overlay);\n}\n',
    );

    const result = runCheck();

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/is not an allow-listed overlay surface/);
  });

  // plan-liquid_glass_overlays/REQ-8 — fails closed: an allow-listed name as a mere substring
  it('fails on a class that only contains an allow-listed name as a substring', () => {
    writeFixture('blur-substring.css', '.ui-nav-rail__brand {\n  backdrop-filter: var(--blur-overlay);\n}\n');

    const result = runCheck();

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/runtime blur on "\.ui-nav-rail__brand", which is not an allow-listed overlay surface/);
  });

  // plan-liquid_glass_overlays/REQ-8 — switching the material off is not a runtime blur
  it('accepts backdrop-filter: none and filter: none on any surface', () => {
    writeFixture('blur-none.css', '.ui-card {\n  backdrop-filter: none;\n  filter: none;\n}\n');

    const result = runCheck();

    expect(result.stderr).not.toMatch(/runtime blur/);
    expect(result.status).toBe(0);
  });

  // plan-liquid_glass_overlays/REQ-8
  it('exempts a declaration carrying the exception marker on the line above', () => {
    writeFixture(
      'blur-exception-above.css',
      '.ui-card {\n  /* ui-blur-exception: justified, single small element */\n  backdrop-filter: blur(8px);\n}\n',
    );

    const result = runCheck();

    expect(result.stderr).not.toMatch(/runtime blur/);
    expect(result.status).toBe(0);
  });

  // plan-liquid_glass_overlays/REQ-8
  it('exempts a declaration carrying the exception marker on its own line', () => {
    writeFixture(
      'blur-exception-inline.css',
      '.ui-card {\n  backdrop-filter: blur(8px); /* ui-blur-exception: justified */\n}\n',
    );

    const result = runCheck();

    expect(result.stderr).not.toMatch(/runtime blur/);
    expect(result.status).toBe(0);
  });

  // plan-liquid_glass_overlays/REQ-8 — comments neither hide a declaration nor shift its line
  it('ignores a blur inside a comment and reports the real one on its own line', () => {
    writeFixture(
      'blur-commented.css',
      '/*\n * backdrop-filter: blur(20px);\n */\n.ui-card {\n  backdrop-filter: blur(var(--blur-overlay));\n}\n',
    );

    const result = runCheck();

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/blur-commented\.css:5 .* runtime blur on "\.ui-card"/);
    expect(result.stderr.match(/blur-commented\.css/g)).toHaveLength(1);
  });

  // plan-liquid_glass_overlays/REQ-8 — a quoted string is not a declaration
  it('ignores a blur declaration quoted inside a string value', () => {
    writeFixture('blur-string.css', '.ui-card::after {\n  content: "backdrop-filter: blur(20px)";\n}\n');

    const result = runCheck();

    expect(result.stderr).not.toMatch(/runtime blur/);
    expect(result.status).toBe(0);
  });

  // plan-liquid_glass_overlays/REQ-8 — every violation of the pass is reported, with the count
  it('reports a blur violation alongside a boundary violation, and counts them', () => {
    writeFixture('blur-and-tag.css', '.ui-card {\n  backdrop-filter: blur(var(--blur-overlay));\n}\n');
    writeFixture('RawTag.tsx', 'export function R() { return <span>raw</span>; }\n');

    const result = runCheck();

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/runtime blur on "\.ui-card"/);
    expect(result.stderr).toMatch(/raw DOM tag/);
    expect(result.stderr).toMatch(/2 violation\(s\)/);
    expect(result.stderr).toMatch(/CLAUDE\.md/);
  });
});

/**
 * **The card row stays retired, and the command the developer already runs is
 * what says so**
 * (`plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-23`,
 * `REQ-24`, `REQ-33`).
 *
 * REQ-23 is not satisfied by a pass existing: it requires the check to be
 * **demonstrated red against a deliberate reintroduction of each of the two
 * forms, and green on the converted tree**. So every case below drives the real
 * script — the one `npm run lint` and `npm run test` invoke — over a fixture
 * that reintroduces the presentation, and reads what it printed. The green half
 * is the file's first test, "passes on the current, conformant codebase", which
 * runs the same script over the tree as delivered.
 *
 * The fixture directory is deliberately **not** exempt from this pass: a guard
 * that skipped the only place a test can put an offence could not be shown
 * failing at all, which is the difference between a demonstration and a claim.
 */
describe('UI conformance check — the card row stays retired', () => {
  /** The message every card-row violation carries, whatever form it reports (REQ-24). */
  const DECISION = /an object list is one table — one header, ruled rows beneath it, no surface per row/;
  const RECORD = /See \.sdd\/analysis\/ui-coherence-optimisation-comfortable_variant_retired-classic_table\.md/;

  // .../classic-table/REQ-23, first form — **the library offering it again**: the presentation asked
  // for by name at a call site. This is the demonstration the batch is accepted on, so the message is
  // read in full: the file, the line, what is wrong, the decision, and where the decision is written.
  it('fails when a call site asks the library for the retired presentation again', () => {
    writeFixture(
      'AskedByName.tsx',
      'export function VolumesList({ rows }: { rows: string[] }) {\n  return <DataTable variant="comfortable" rows={rows} />;\n}\n',
    );

    const result = runCheck();

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(
      /__conformance-fixture__[/\\]AskedByName\.tsx:2 — the retired card row asked for by name \("comfortable"\)/,
    );
    expect(result.stderr, 'the guard reports the offence without naming the decision it enforces').toMatch(DECISION);
    expect(result.stderr, 'the guard names no record for the decision it enforces').toMatch(RECORD);
  });

  // .../classic-table/REQ-23, second form — **a feature file rebuilding it by hand**: a list composed
  // as one surface per row, which is what the retired presentation drew and what every hand-built
  // card list before it drew. Read from the syntax tree, so the surface has to be *per item*.
  it.each([
    ['Card', 'CardPerRow.tsx'],
    ['Surface', 'SurfacePerRow.tsx'],
  ])('fails when a feature file builds a list as one <%s> per row', (tag, fileName) => {
    writeFixture(
      fileName,
      `export function List({ rows }: { rows: string[] }) {\n  return <Stack>{rows.map((row) => (\n    <${tag} key={row}>{row}</${tag}>\n  ))}</Stack>;\n}\n`,
    );

    const result = runCheck();

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(
      new RegExp(`__conformance-fixture__[/\\\\]${fileName.replace('.', '\\.')}:3 — a list built as one <${tag}> per row, which is the card row rebuilt by hand`),
    );
    expect(result.stderr, 'the guard reports the offence without naming the decision it enforces').toMatch(DECISION);
    expect(result.stderr, 'the guard names no record for the decision it enforces').toMatch(RECORD);
  });

  // …and a card that is a screen's own panel is untouched, which is what a card is for. Stated as a
  // case of its own because a guard that refused every `<Card>` would be unusable and would be
  // switched off, which is the same outcome as not having one.
  it('accepts a card that is a panel rather than a row', () => {
    writeFixture(
      'PanelCard.tsx',
      'export function Panel({ rows }: { rows: string[] }) {\n  return <Card><DataTable rows={rows} /></Card>;\n}\n',
    );

    const result = runCheck();

    expect(result.stderr).not.toMatch(/card row/);
    expect(result.status).toBe(0);
  });

  // .../classic-table/REQ-22 — the retired vocabulary itself, in each of the names it went by. A
  // reintroduction that restores the type or the carrier is the same reintroduction as one that
  // states the value, and the guard names the file and the line for each.
  it.each([
    [
      'retired-classes.css',
      '.ui-data-table__row--comfortable {\n  padding: 16px;\n}\n',
      /retired-classes\.css:1 — a class of the retired card row \(ui-data-table__row--comfortable\)/,
    ],
    [
      'RetiredType.ts',
      "export type DataTableVariant = 'dense' | 'comfortable';\n",
      /RetiredType\.ts:1 — the type that offered the retired card row \(DataTableVariant\)/,
    ],
    [
      'RetiredCarrier.tsx',
      'export function ComfortableRowCarrier() {\n  return null;\n}\n',
      /RetiredCarrier\.tsx:1 — the surface each retired row was drawn on \(ComfortableRowCarrier\)/,
    ],
  ])('fails on the retired vocabulary in %s', (fileName, content, expected) => {
    writeFixture(fileName, content);

    const result = runCheck();

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(expected);
  });

  // .../classic-table/REQ-23 — the presentation rebuilt in the **stylesheet**, under whatever name:
  // a row given a corner, an outline or a shadow of its own, and a gap opened between the rows of a
  // list body. The retired rules stated exactly these, so a guard that only knew the old class names
  // would be one rename away from useless.
  it.each([
    [
      'row-radius.css',
      '.ui-data-table__row {\n  border-radius: 12px;\n}\n',
      /row-radius\.css:2 — a list row given a surface of its own \(border-radius: 12px\) on "\.ui-data-table__row"/,
    ],
    [
      'row-outline.css',
      '.ui-data-table__row--fancy {\n  outline: 1px solid red;\n}\n',
      /row-outline\.css:2 — a list row given a surface of its own \(outline: 1px solid red\)/,
    ],
    [
      'row-shadow.css',
      '.ui-data-table__row {\n  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);\n}\n',
      /row-shadow\.css:2 — a list row given a surface of its own \(box-shadow: 0 1px 2px rgba\(0, 0, 0, 0\.4\)\)/,
    ],
    [
      'row-content-radius.css',
      '.ui-data-table__row-content {\n  border-top-left-radius: 8px;\n}\n',
      /row-content-radius\.css:2 — a list row given a surface of its own \(border-top-left-radius: 8px\)/,
    ],
    [
      'body-gap.css',
      '.ui-data-table__body {\n  gap: var(--space-3);\n}\n',
      /body-gap\.css:2 — a gap between the rows of a list body \(gap: var\(--space-3\)\) on "\.ui-data-table__body"/,
    ],
    [
      'body-row-gap.css',
      '.ui-data-table__body {\n  row-gap: 12px;\n}\n',
      /body-row-gap\.css:2 — a gap between the rows of a list body \(row-gap: 12px\)/,
    ],
  ])('fails on %s, the presentation rebuilt in a stylesheet', (fileName, content, expected) => {
    writeFixture(fileName, content);

    const result = runCheck();

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(expected);
    expect(result.stderr).toMatch(DECISION);
  });

  // …and switching one off is not drawing one. `border-radius: 0` is the shape of a row that refuses
  // to be a card, and the library states exactly that: a guard those rules failed would be a guard
  // the library could not satisfy.
  it('accepts a row that states the absence of a corner, a shadow and a gap', () => {
    writeFixture(
      'row-inert.css',
      '.ui-data-table__row {\n  border-radius: 0;\n  box-shadow: none;\n  outline: none;\n}\n.ui-data-table__body {\n  gap: 0;\n}\n',
    );

    const result = runCheck();

    expect(result.stderr).not.toMatch(/card row/);
    expect(result.status).toBe(0);
  });

  // .../classic-table/REQ-23 — a rule wrapped in a media query is still a rule about a row, and so is
  // one written with CSS nesting. Both are how the arrangement would come back at one viewport only,
  // and both are read on the rule that actually paints rather than on the text around it.
  it.each([
    [
      'row-radius-media.css',
      '@media (max-width: 720px) {\n  .ui-data-table__row {\n    border-radius: 12px;\n  }\n}\n',
      /row-radius-media\.css:3 — a list row given a surface of its own \(border-radius: 12px\)/,
    ],
    [
      'row-radius-nested.css',
      '.ui-data-table__body {\n  & > .ui-data-table__row {\n    box-shadow: 0 2px 4px black;\n  }\n}\n',
      /row-radius-nested\.css:3 — a list row given a surface of its own \(box-shadow: 0 2px 4px black\)/,
    ],
  ])('fails on %s, where the rule is nested inside another', (fileName, content, expected) => {
    writeFixture(fileName, content);

    const result = runCheck();

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(expected);
  });

  /**
   * .../classic-table/REQ-24 — **the guard does not become a formality**.
   *
   * The blur half admits a `ui-blur-exception:` comment, and this half admits
   * nothing: a comment written at the very call site that reintroduces the
   * arrangement is how a decision stops being one. So the marker that exempts a
   * blur is driven here against each of the two forms, and against the
   * stylesheet form, and each is still refused — with the offence named, not
   * merely with a non-zero exit.
   */
  it.each([
    [
      'ExemptedCallSite.tsx',
      '// ui-blur-exception: measured and justified on the spot\nexport function L({ rows }: { rows: string[] }) {\n  return <DataTable variant="comfortable" rows={rows} />;\n}\n',
      /the retired card row asked for by name/,
    ],
    [
      'ExemptedCardPerRow.tsx',
      'export function L({ rows }: { rows: string[] }) {\n  // ui-blur-exception: this list really does need a card per row\n  return <Stack>{rows.map((row) => <Card key={row}>{row}</Card>)}</Stack>;\n}\n',
      /a list built as one <Card> per row/,
    ],
    [
      'exempted-row.css',
      '.ui-data-table__row {\n  /* ui-blur-exception: justified, one small list */\n  border-radius: 12px; /* ui-blur-exception: and again on the line itself */\n}\n',
      /a list row given a surface of its own/,
    ],
  ])('refuses %s even with an exception comment at the offending line', (fileName, content, expected) => {
    writeFixture(fileName, content);

    const result = runCheck();

    expect(result.status, 'an exception comment satisfied the guard at the call site that violates it').toBe(1);
    expect(result.stderr).toMatch(expected);
  });

  // .../classic-table/REQ-23 — the three passes are independent and share nothing but the collector
  // every violation lands in: a card-row offence is reported beside a blur one and a boundary one,
  // and all three are counted.
  it('reports a card-row violation alongside a blur and a boundary one, and counts all three', () => {
    writeFixture('body-gap-and-blur.css', '.ui-data-table__body {\n  gap: 12px;\n}\n.ui-card {\n  backdrop-filter: blur(20px);\n}\n');
    writeFixture('RawTagBesideIt.tsx', 'export function R() { return <span>raw</span>; }\n');

    const result = runCheck();

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/a gap between the rows of a list body/);
    expect(result.stderr).toMatch(/runtime blur on "\.ui-card"/);
    expect(result.stderr).toMatch(/raw DOM tag/);
    expect(result.stderr).toMatch(/3 violation\(s\)/);
  });
});
