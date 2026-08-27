import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * The swarm absence conformance check
 * (`coverage/specs/swarm-absence-conformance-check.md`), run as a black box over
 * a source tree of the test's own.
 *
 * It is the whole automated proof of the two requirements no check of this
 * project observes on a running cluster, **no check of this project ever
 * initialising a swarm** (the human's decision of 2026-08-27): nothing in the
 * application reads the daemon's swarm (REQ-7), and nothing narrows a listing by
 * a swarm criterion (REQ-8). So what is asserted here is the rule itself — what
 * it refuses, what it accepts, and where the decision to widen it is taken.
 *
 * The script resolves the two trees it scans from its own location, so each case
 * copies it into a throwaway root beside a fabricated `client/src` and
 * `server/src`, and removes the root afterwards.
 */

// Resolved from the client workspace root (vitest's working directory), not
// import.meta.url: the jsdom environment does not preserve a file: URL suitable
// for path resolution.
const realScript = join(process.cwd(), '..', 'scripts', 'check-swarm-absence-conformance.mjs');

interface CheckResult {
  status: number;
  stdout: string;
  stderr: string;
}

const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

/**
 * The check, run over a tree holding exactly `files` — paths relative to the
 * repository root, so a case can place a file inside a scanned tree or outside
 * one. Both scanned trees always exist, empty when a case puts nothing in them.
 */
function runCheckOver(files: Record<string, string>): CheckResult {
  const root = mkdtempSync(join(tmpdir(), 'swarm-absence-conformance-'));
  roots.push(root);
  const script = join(root, 'scripts', 'check-swarm-absence-conformance.mjs');
  mkdirSync(dirname(script), { recursive: true });
  copyFileSync(realScript, script);
  mkdirSync(join(root, 'client', 'src'), { recursive: true });
  mkdirSync(join(root, 'server', 'src'), { recursive: true });
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  const run = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  return { status: run.status ?? -1, stdout: run.stdout, stderr: run.stderr };
}

describe('Swarm absence conformance check — what it refuses', () => {
  // "an identifier whose name contains `swarm`, in any case"
  it.each([
    ['const swarmState = read();\n', 'a lower-case identifier'],
    ['export function readSwarm() { return null; }\n', 'an identifier in camel case'],
    ['import { SwarmNode } from "./elsewhere.js";\n', 'an imported name'],
  ])('refuses %s (%s)', (source) => {
    const result = runCheckOver({ 'client/src/feature/reads.ts': source });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/client\/src\/feature\/reads\.ts:1\b/);
    expect(result.stderr).toMatch(/swarm named in the code/i);
  });

  // "a string, template or regular-expression literal whose content names swarm"
  it.each([
    ['export const label = "Swarm";\n', 'a string literal'],
    ['export const path = `/api/${id}/swarm`;\n', 'a template literal'],
    ['export const pattern = /swarm/i;\n', 'a regular expression'],
  ])('refuses %s (%s)', (source) => {
    const result = runCheckOver({ 'client/src/feature/names.ts': source });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/client\/src\/feature\/names\.ts:1\b/);
    expect(result.stderr).toMatch(/a literal names swarm/i);
  });

  // "a request to a swarm address of the daemon: a literal beginning `/swarm`, `/nodes`,
  // `/services`, `/tasks`, `/secrets` or `/configs`, with or without the `/api` prefix. Five of
  // those six carry no swarm in their spelling and are how the area returns unnoticed: the
  // withdrawn stack count read `/services`."
  it.each(['/nodes', '/services', '/tasks', '/secrets', '/configs', '/api/services', '/api/nodes'])(
    'refuses a request to %s',
    (address) => {
      const result = runCheckOver({ 'server/src/system/overview-service.ts': `export const read = () => request("${address}");\n` });

      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/server\/src\/system\/overview-service\.ts:1\b/);
      expect(result.stderr).toMatch(/a request to a swarm address of the daemon/i);
    },
  );

  // "It fails closed on the addresses: `/services` is refused whatever the caller meant by it,
  // because a path cannot be judged without the client it is handed to." The suffixed forms are
  // the same address.
  it.each(['/services?filters=%7B%7D', '/nodes/abc123'])('refuses %s, the address carrying more after it', (address) => {
    const result = runCheckOver({ 'server/src/system/reads.ts': `export const read = () => request("${address}");\n` });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/a request to a swarm address of the daemon/i);
  });

  // "a label a cluster puts on its own objects: `com.docker.stack.*`, `com.docker.swarm.*`" — the
  // other half of REQ-8: nothing may narrow a listing by a swarm criterion. The stack family is
  // the one that carries no swarm in its spelling, so it is the one this branch has to catch on
  // its own; `com.docker.swarm.*` is refused as a literal naming swarm, which is the same refusal
  // reached one clause earlier.
  it.each([
    ['com.docker.stack.namespace', /a label a cluster puts on its own objects/i],
    ['com.docker.swarm.service.id', /a literal names swarm/i],
  ])('refuses the %s label', (label, message) => {
    const result = runCheckOver({ 'server/src/containers/containers-service.ts': `export const key = "${label}";\n` });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(message);
  });

  // "a swarm-only network named in a listing: the literal `ingress`"
  it('refuses a listing naming the ingress network', () => {
    const result = runCheckOver({ 'server/src/networks/networks-service.ts': 'export const hidden = ["ingress"];\n' });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/a swarm-only network named in a listing/i);
  });

  // "in a stylesheet, a rule naming swarm"
  it('refuses a stylesheet rule naming swarm', () => {
    const result = runCheckOver({ 'client/src/ui/glass/panels.css': '.ui-panel { color: red; }\n\n.ui-swarm-banner { color: blue; }\n' });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/client\/src\/ui\/glass\/panels\.css:3\b/);
    expect(result.stderr).toMatch(/a stylesheet rule names swarm/i);
  });

  it('scans both source trees, not one of them', () => {
    const result = runCheckOver({
      'client/src/a.ts': 'export const swarmOne = 1;\n',
      'server/src/b.ts': 'export const swarmTwo = 2;\n',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/client\/src\/a\.ts/);
    expect(result.stderr).toMatch(/server\/src\/b\.ts/);
  });
});

describe('Swarm absence conformance check — what it accepts', () => {
  // "comments are blanked before the scan, so a comment may name swarm — explaining an absence is
  // how the absence survives. This is not a ban on the word."
  it('accepts a comment naming swarm, in either comment form', () => {
    const result = runCheckOver({
      'client/src/shell/Shell.ts': [
        '// A persisted `swarm` names no known screen, so the default one stays active.',
        '/* The swarm area left the product on 2026-08-27. */',
        'export const restore = (id: string) => id;',
        '',
      ].join('\n'),
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/passed/i);
  });

  // "comments are blanked with their newlines kept, so every line number reported is the file's
  // own": a violation under a multi-line comment is reported at the line it is written on.
  it('reports the line the violation is written on, under a comment of any length', () => {
    const result = runCheckOver({
      'client/src/shell/reads.ts': ['/*', ' * swarm', ' * swarm', ' */', 'export const swarmState = 1;', ''].join('\n'),
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/client\/src\/shell\/reads\.ts:5\b/);
  });

  // "the `overlay` network driver, deliberately: it is an option of the network creation form,
  // which is a Docker capability rather than a swarm read"
  it('accepts the overlay network driver', () => {
    const result = runCheckOver({ 'client/src/volumes-networks/NetworkForm.ts': "export const drivers = ['bridge', 'overlay', 'macvlan'];\n" });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/passed/i);
  });

  // "an import path such as `../shell/services/…`: a swarm address is recognised only where the
  // literal *begins* one"
  it.each(['../shell/services/ConfirmationService.js', './data/nodes.js', 'node:fs'])('accepts the import path %s', (path) => {
    const result = runCheckOver({ 'client/src/shell/Shell.ts': `import { thing } from '${path}';\nexport const use = () => thing;\n` });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/passed/i);
  });

  // "The check trees (`client/test/`, `client/e2e/`, `server/test/`) are outside it: a check that
  // swarm is absent has to be able to name swarm."
  it.each(['client/test/unit/a.test.ts', 'client/e2e/a.spec.ts', 'server/test/unit/a.test.ts'])('does not scan %s', (path) => {
    const result = runCheckOver({ [path]: 'const swarmState = "swarm";\n' });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/passed/i);
  });
});

describe('Swarm absence conformance check — the escape hatch', () => {
  // "Two files are allow-listed by name, and only two": the console's warning before
  // `docker swarm leave` (REQ-11) and the coverage statement's swarm entries (REQ-12).
  it('lets the two allow-listed files name swarm', () => {
    const result = runCheckOver({
      'server/src/console/console-command.ts': 'export const destructive = /^docker swarm leave\\b/;\n',
      'client/src/coverage/coverage-map.ts': "export const areas = [{ id: 'swarm-cluster', command: 'docker swarm init' }];\n",
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/passed/i);
  });

  it('allow-lists those two files and no others', () => {
    const result = runCheckOver({
      'server/src/console/console-runner.ts': 'export const destructive = /^docker swarm leave\\b/;\n',
      'client/src/coverage/coverage-areas.ts': "export const areas = [{ id: 'swarm-cluster' }];\n",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/server\/src\/console\/console-runner\.ts/);
    expect(result.stderr).toMatch(/client\/src\/coverage\/coverage-areas\.ts/);
  });

  // "There is deliberately no per-line exception comment, unlike the other two build checks of this
  // repository": the markers those two answer to exempt nothing here.
  it.each(['ui-blur-exception:', 'list-order-exception:', 'swarm-absence-exception:'])('is not exempted by a "%s" comment', (marker) => {
    const result = runCheckOver({
      'client/src/feature/reads.ts': [`// ${marker} this is deliberate`, 'export const swarmState = 1;', ''].join('\n'),
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/swarm named in the code/i);
  });

  // The allow-list and the specification's "Escape hatch" section are one decision written twice.
  it('holds exactly the two allow-listed paths in its own source', () => {
    const source = readFileSync(realScript, 'utf8');
    const list = source.slice(source.indexOf('const allowedFiles'), source.indexOf(']);', source.indexOf('const allowedFiles')));
    const paths = [...list.matchAll(/'((?:client|server)\/src\/[^']+)'/g)].map((match) => match[1]);

    expect(paths.sort()).toEqual(['client/src/coverage/coverage-map.ts', 'server/src/console/console-command.ts']);
  });
});

describe('Swarm absence conformance check — how it answers', () => {
  // "Exit 0 and one line on success"
  it('exits zero and says so over a tree that reads nothing of the swarm', () => {
    const result = runCheckOver({
      'client/src/feature/Screen.ts': "export const title = 'Containers';\n",
      'server/src/containers/containers-service.ts': 'export const list = () => request("/containers/json");\n',
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/passed/i);
    expect(result.stderr).toBe('');
  });

  // "exit 1 and one line per violation — `path:line — what was found` — followed by the count and
  // the decision that has to be taken to widen the rule"
  it('lists every violation with its line, then the count and where the rule is widened', () => {
    const result = runCheckOver({
      'client/src/a.ts': ['export const one = 1;', 'export const swarmState = 2;', ''].join('\n'),
      'server/src/b.ts': ['export const path = "/services";', ''].join('\n'),
    });

    expect(result.status).toBe(1);
    const reported = result.stderr.split('\n').filter((line) => /^\s+\S+:\d+ — /.test(line));
    expect(reported).toHaveLength(2);
    expect(result.stderr).toMatch(/2 violation\(s\)/);
    expect(result.stderr).toMatch(/check-swarm-absence-conformance\.mjs/);
  });

  // REQ-3, REQ-7, REQ-8, REQ-13, REQ-15 — the repository's own two source trees conform, which is
  // what the check exists for and what the two requirements rest on.
  it('passes over the repository’s own client and server source trees', () => {
    const run = spawnSync(process.execPath, [realScript], { encoding: 'utf8' });

    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toMatch(/passed/i);
  });
});
