// Fails the build when any source file of the application reads the daemon's
// swarm. Swarm left the product on 2026-08-27
// (plan-docker_management_app-swarm_removal/REQ-3, REQ-7, REQ-8, REQ-13,
// REQ-15), and a removal is the kind of change that decays: one reinstated
// import, one `/services` request for a stack count, one branch on a swarm
// state, and the area is back in the tree without anyone deciding it.
//
// It is also what proves, at build time and across both trees at once, the two
// requirements no automated check of this project observes on a running
// cluster — because no check of this project ever initialises a swarm (the
// human's decision of 2026-08-27):
//   REQ-7 — the application behaves the same on a swarm daemon as on any other.
//           It can only behave differently if it *reads* something that
//           differs; nothing here reads anything of the swarm, so there is no
//           input from which a difference could come.
//   REQ-8 — swarm-caused objects that are not swarm objects keep appearing on
//           the generic screens. Nothing names a swarm label, a swarm-only
//           network or the stack namespace, so no listing can narrow what the
//           daemon returns by a swarm criterion: an overlay network and a
//           service-task container are listed for the reason `bridge` is.
//
// This is NOT a ban on the word. Comments are blanked before the scan, so
// prose may name swarm — explaining an absence is how the absence survives.
// What is refused is swarm in the code and in the data the source declares:
// an address, a daemon-information field, a label, an identifier, an import.
// Two files are allow-listed by name and only two, each for a requirement of
// its own; there is deliberately no per-line exception comment, because
// widening this rule has to be a decision taken here rather than one sprinkled
// at the call site.
// Wired into `npm run lint` and `npm run test` at the repository root.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';

const repoRoot = new URL('..', import.meta.url).pathname;
const sourceRoots = [join(repoRoot, 'client', 'src'), join(repoRoot, 'server', 'src')];

// The two files that legitimately name swarm, and the requirement each answers.
// This list and the "Escape hatch" section of the check's specification are one
// decision written twice: they change together.
const allowedFiles = new Map([
  [
    'server/src/console/console-command.ts',
    'REQ-11 — the console warns before `docker swarm leave`, which stays executable',
  ],
  ['client/src/coverage/coverage-map.ts', 'REQ-12 — the coverage statement keeps declaring the swarm areas'],
]);

// The swarm family of Engine addresses. `/services`, `/nodes`, `/tasks`,
// `/secrets` and `/configs` carry no swarm in their spelling and are the way
// the area comes back unnoticed: the withdrawn stack count read `/services`.
const swarmAddress = /^(\/api)?\/(swarm|nodes|services|tasks|secrets|configs)(\/|\?|$)/;

// The labels Docker puts on the objects a cluster owns. Reading one is both a
// swarm read and the only way a generic listing could filter a swarm object out
// of what the daemon returned.
const swarmLabel = /com\.docker\.(stack|swarm)\./;

// A swarm-only network, named as a literal: the other half of REQ-8. The
// `overlay` driver is deliberately absent — it is an option of the network
// creation form, which is a Docker capability and not a swarm read.
const swarmNetwork = /(^|[^a-z])ingress([^a-z]|$)/i;

const swarmWord = /swarm/i;

/** @type {string[]} */
const violations = [];

function collectSourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const info = statSync(full);
    if (info.isDirectory()) {
      collectSourceFiles(full, out);
      continue;
    }
    if (['.ts', '.tsx', '.css'].includes(extname(entry))) out.push(full);
  }
  return out;
}

/**
 * A copy of the source with comments blanked out (newlines kept, so line
 * numbers are the original's) plus every string, template and regular
 * expression literal it contains. Prose is therefore free and data is not.
 */
function readCode(content) {
  let code = '';
  /** @type {{ value: string, line: number }[]} */
  const literals = [];
  let line = 1;
  let index = 0;
  // Whether a `/` here opens a regular expression rather than dividing.
  let regexAllowed = true;

  const blank = (text) => text.replace(/[^\n]/g, ' ');

  while (index < content.length) {
    const char = content[index];
    const next = content[index + 1];

    if (char === '/' && next === '/') {
      const end = content.indexOf('\n', index);
      const stop = end === -1 ? content.length : end;
      code += blank(content.slice(index, stop));
      index = stop;
      continue;
    }

    if (char === '/' && next === '*') {
      const end = content.indexOf('*/', index + 2);
      const stop = end === -1 ? content.length : end + 2;
      const comment = content.slice(index, stop);
      code += blank(comment);
      line += (comment.match(/\n/g) ?? []).length;
      index = stop;
      continue;
    }

    if (char === '"' || char === "'" || char === '`' || (char === '/' && regexAllowed)) {
      const closer = char === '/' ? '/' : char;
      const startLine = line;
      let cursor = index + 1;
      let value = '';
      while (cursor < content.length) {
        const inner = content[cursor];
        if (inner === '\\') {
          value += content.slice(cursor, cursor + 2);
          cursor += 2;
          continue;
        }
        if (inner === closer) break;
        if (inner === '\n') {
          // An unterminated quote or a `/` that was a division after all: give
          // up on this literal rather than swallowing the rest of the file.
          if (closer !== '`') {
            cursor = index;
            value = '';
            break;
          }
          line += 1;
        }
        value += inner;
        cursor += 1;
      }
      if (cursor === index) {
        code += char;
        index += 1;
        regexAllowed = true;
        continue;
      }
      literals.push({ value, line: startLine });
      code += blank(content.slice(index, cursor + 1));
      index = cursor + 1;
      regexAllowed = false;
      continue;
    }

    if (char === '\n') line += 1;
    if (!/\s/.test(char)) regexAllowed = /[([{,;:=!&|?+\-*%<>~^]/.test(char);
    code += char;
    index += 1;
  }

  return { code, literals };
}

function lineOf(code, offset) {
  return code.slice(0, offset).split('\n').length;
}

function report(filePath, line, message) {
  violations.push(`${relative(repoRoot, filePath)}:${line} — ${message}`);
}

for (const root of sourceRoots) {
  for (const filePath of collectSourceFiles(root)) {
    const relativePath = relative(repoRoot, filePath).split(sep).join('/');
    if (allowedFiles.has(relativePath)) continue;

    const content = readFileSync(filePath, 'utf8');

    if (extname(filePath) === '.css') {
      const withoutComments = content.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
      const match = swarmWord.exec(withoutComments);
      if (match) report(filePath, lineOf(withoutComments, match.index), 'a stylesheet rule names swarm');
      continue;
    }

    const { code, literals } = readCode(content);

    const identifier = /[A-Za-z_$][\w$]*/g;
    let found;
    while ((found = identifier.exec(code)) !== null) {
      if (!swarmWord.test(found[0])) continue;
      report(filePath, lineOf(code, found.index), `\`${found[0]}\` — swarm named in the code`);
    }

    for (const literal of literals) {
      if (swarmWord.test(literal.value)) {
        report(filePath, literal.line, 'a literal names swarm');
        continue;
      }
      if (swarmAddress.test(literal.value)) {
        report(filePath, literal.line, `\`${literal.value}\` — a request to a swarm address of the daemon`);
        continue;
      }
      if (swarmLabel.test(literal.value)) {
        report(filePath, literal.line, `\`${literal.value}\` — a label a cluster puts on its own objects`);
        continue;
      }
      if (swarmNetwork.test(literal.value)) {
        report(filePath, literal.line, `\`${literal.value}\` — a swarm-only network named in a listing`);
      }
    }
  }
}

if (violations.length > 0) {
  console.error('Swarm absence conformance check failed:\n');
  for (const violation of violations) console.error(`  ${violation}`);
  console.error(
    `\n${violations.length} violation(s). Swarm left the product on 2026-08-27: the application reads nothing of the daemon's swarm, and the console is the way to it. Only ${[...allowedFiles.keys()].join(' and ')} may name it, and adding a third is a decision taken in ${relative(repoRoot, process.argv[1])}.`,
  );
  process.exit(1);
}

console.log('Swarm absence conformance check passed.');
