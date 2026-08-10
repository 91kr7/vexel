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
  '.ui-combobox__list',
  '.ui-frame__rail',
  '.ui-nav-rail',
  '.ui-frame__scrim',
  '.ui-session-ended-overlay',
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
      '.ui-frame__scrim {\n  backdrop-filter: blur(var(--blur-overlay)) saturate(140%);\n}\n',
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
    writeFixture('blur-fallback.css', '.ui-frame__scrim {\n  backdrop-filter: var(--blur-overlay, 20px);\n}\n');

    const result = runCheck();

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/runtime blur on "\.ui-frame__scrim" must be valued var\(--blur-overlay\)/);
  });

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
