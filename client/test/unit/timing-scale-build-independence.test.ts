import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * **The factor never enters the bundle** (plan-docker_management_app-timing_scale/REQ-13;
 * `timing-scale/specs/client-timing-scale.md`,
 * `timing-scale/specs/timing-scale-endpoint.md`).
 *
 * The requirement is that the files an operator runs and the files a suite
 * exercises are the same files, and only the configuration of the process serving
 * them differs. A source read at build time — the environment variable by name,
 * or `import.meta.env`, both of which Vite substitutes into the output — would
 * make that false silently: two builds of one tree would differ, and no runtime
 * check could see it.
 *
 * This file reads sources. It cannot prove two builds are byte for byte equal —
 * that is the human's own acceptance scenario, run twice with and without the
 * variable — but it forbids the one mechanism by which they could differ, at the
 * cost of no build at all.
 *
 * The suite's own configuration (`client/playwright.config.ts`) names the variable
 * on purpose and is deliberately outside the scanned set: it configures the server
 * process a run starts, and no line of it reaches the browser.
 */

const clientRoot = process.cwd();

/** What a build turns into the delivered bundle, plus the config that drives it. */
const SCANNED_TREES = [join('src')];
const SCANNED_FILES = ['index.html', 'vite.config.ts', 'app-version.ts'];

/** Read at build time by Vite, so a value written here would be frozen into the output. */
const BUILD_TIME_READS = ['VEXEL_TIMING_SCALE', 'import.meta.env', 'process.env'];

interface SourceFile {
  path: string;
  text: string;
}

function filesUnder(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' || entry.name === 'dist' ? [] : filesUnder(path);
    return /\.(tsx?|css|html)$/.test(entry.name) ? [path] : [];
  });
}

function scannedSources(): SourceFile[] {
  const paths = [...SCANNED_TREES.flatMap((tree) => filesUnder(join(clientRoot, tree))), ...SCANNED_FILES.map((file) => join(clientRoot, file)).filter((file) => existsSync(file))];
  return paths.map((path) => ({ path: relative(clientRoot, path), text: readFileSync(path, 'utf8') }));
}

describe('The factor is read at runtime, never at build time (REQ-13)', () => {
  it('scans the sources a build turns into the bundle', () => {
    const sources = scannedSources();
    expect(sources.length).toBeGreaterThan(50);
    expect(sources.map((source) => source.path)).toContain(join('src', 'main.tsx'));
    expect(sources.map((source) => source.path)).toContain(join('src', 'timing', 'timing-scale.ts'));
  });

  it.each(BUILD_TIME_READS)('never reads %s', (token) => {
    const offenders = scannedSources()
      .filter((source) => source.text.includes(token))
      .map((source) => source.path);
    expect(offenders, `${token} is read where a build could substitute it`).toEqual([]);
  });

  // The counterpart of the prohibition: the client does have a source for the
  // factor, and it is the endpoint (timing-scale-endpoint.md).
  it('gets the factor from the endpoint instead', () => {
    const reader = readFileSync(join(clientRoot, 'src', 'timing', 'timing-scale-client.ts'), 'utf8');
    expect(reader).toContain('/api/timing-scale');
  });
});
