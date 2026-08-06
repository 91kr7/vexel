import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Resolved from the client workspace root (vitest's working directory), not
// import.meta.url: the jsdom test environment rewrites module URLs and does
// not preserve a file: scheme suitable for path resolution.
const clientRoot = process.cwd();
const scriptPath = join(clientRoot, 'scripts', 'check-ui-conformance.mjs');
const fixtureDir = join(clientRoot, 'src', '__conformance-fixture__');

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

describe('UI conformance check (REQ-5 / REQ-108)', () => {
  // plan-docker_management_app/REQ-5
  it('passes on the current, conformant codebase', () => {
    const result = runCheck();
    expect(result.status).toBe(0);
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

  // plan-docker_management_app/REQ-108
  it('fails when a stylesheet uses backdrop-filter without an exception comment', () => {
    writeFixture('blur.css', '.x { backdrop-filter: blur(8px); }\n');

    const result = runCheck();

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/backdrop-filter\/blur\(\) without/);
  });

  // plan-docker_management_app/REQ-108
  it('passes when backdrop-filter carries the documented exception comment', () => {
    writeFixture('blur-exception.css', '/* ui-blur-exception: justified, single small element */\n.x { backdrop-filter: blur(8px); }\n');

    const result = runCheck();

    expect(result.status).toBe(0);
  });
});
