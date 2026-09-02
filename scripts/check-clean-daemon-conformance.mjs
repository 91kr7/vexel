// Fails the build when a daemon-backed test file does not start from a clean
// daemon. It spans both test trees, which is why it lives at the root beside the
// swarm-absence check rather than inside a workspace.
//
// Both passes are serial and every file drives the same daemon, so a file that
// does not reset it inherits whatever the file before it left standing — and
// fails, later and somewhere else, depending on which files ran first. The two
// trees are guarded differently because they are wired differently:
//
//  - **end-to-end** — one Playwright worker serves every spec, so the reset has
//    to be registered per file. Two things are checked, because either one alone
//    lets the failure back in: every `*.spec.ts` calls `cleanDaemonBeforeAll()`
//    at the top level, and no `test(…)`, `test.beforeAll(…)` or other `test.*`
//    call comes before it — hooks run in registration order, so a hook registered
//    first would build its fixtures on a daemon the reset then prunes.
//  - **server api** — `node --test` gives every file a process of its own, so the
//    reset is a preload and no file can forget it. What can be lost is the
//    preload itself, so what is checked is that `test:api` still names it.
//
// The end-to-end tree to scan is the first argument, so the check that drives
// this guard can point it at files of its own. Wired into `npm run lint` and
// `npm run test` at the repository root.
//
// There is no exception marker: a file that must not reset the daemon does not
// exist, and if one ever does, that is a decision to write down here rather than
// to sprinkle at a call site.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const repositoryRoot = new URL("..", import.meta.url).pathname;
const scanRoot = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : join(repositoryRoot, "client", "e2e");

const registration = "cleanDaemonBeforeAll";
/** What `test:api` has to preload for the server tree's guarantee to hold at all. */
const apiPreload = "test/support/api-lifecycle.ts";

function shown(filePath) {
  const path = relative(repositoryRoot, filePath).split(sep).join("/");
  return path.startsWith("..") ? filePath : path;
}

// A copy of the source with comments and the contents of quoted literals blanked
// out, newlines kept: offsets and line numbers stay those of the original, so a
// call named in a comment counts for nothing and a `test(` inside a title cannot
// be mistaken for a declaration.
function blankNonCode(content) {
  const out = content.split("");
  const blank = (from, to) => {
    for (let index = from; index < to && index < out.length; index += 1) {
      if (out[index] !== "\n") out[index] = " ";
    }
  };

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];
    if (char === "/" && next === "/") {
      const end = content.indexOf("\n", index);
      const stop = end === -1 ? content.length : end;
      blank(index, stop);
      index = stop;
      continue;
    }
    if (char === "/" && next === "*") {
      const end = content.indexOf("*/", index + 2);
      const stop = end === -1 ? content.length : end + 2;
      blank(index, stop);
      index = stop - 1;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      const singleLine = char !== "`";
      let scan = index + 1;
      while (scan < content.length && content[scan] !== char) {
        if (singleLine && content[scan] === "\n") break;
        if (content[scan] === "\\") scan += 1;
        scan += 1;
      }
      blank(index + 1, scan);
      index = scan;
    }
  }

  return out.join("");
}

function collectSpecFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSpecFiles(full, out);
      continue;
    }
    if (entry.endsWith(".spec.ts")) out.push(full);
  }
  return out;
}

function lineOf(content, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) if (content[index] === "\n") line += 1;
  return line;
}

const failures = [];
let checked = 0;

for (const filePath of collectSpecFiles(scanRoot).sort()) {
  checked += 1;
  const content = readFileSync(filePath, "utf8");
  const code = blankNonCode(content);

  // At the top level, so it cannot end up inside a `describe` that runs after
  // another one has already built its fixtures.
  const call = new RegExp(`^${registration}\\s*\\(\\s*\\)\\s*;`, "m").exec(code);
  if (call === null) {
    failures.push(
      `${shown(filePath)} — this file does not call \`${registration}()\` at its top level, so it starts from whatever the file before it left on the daemon.`,
    );
    continue;
  }

  // `(?<![\w$.])` keeps a regular expression's own `.test(` out of this.
  const earlier = /(?<![\w$.])test\s*(?:\.\s*[A-Za-z_$][\w$]*\s*)*\(/.exec(code);
  if (earlier !== null && earlier.index < call.index) {
    failures.push(
      `${shown(filePath)}:${lineOf(content, earlier.index)} — a \`test\` call comes before \`${registration}()\` (line ${lineOf(content, call.index)}). Hooks run in registration order, so this one would build its fixtures on a daemon the reset then prunes.`,
    );
  }
}

// The server tree needs no per-file line, so what is guarded is the one thing it
// does need: that the pass still preloads the module holding the reset.
const serverManifest = join(repositoryRoot, "server", "package.json");
const apiScript = JSON.parse(readFileSync(serverManifest, "utf8")).scripts?.["test:api"] ?? "";
if (!apiScript.includes(`--import ./${apiPreload}`)) {
  failures.push(
    `${shown(serverManifest)} — \`test:api\` does not preload \`${apiPreload}\` (\`--import ./${apiPreload}\`), so the files under \`server/test/api/\` no longer reset the daemon before they run.`,
  );
}

if (failures.length > 0) {
  console.error("Clean-daemon conformance check failed:\n");
  for (const failure of failures) console.error(`  ${failure}`);
  console.error(
    `\n${failures.length} violation(s) over ${checked} spec file(s) and the server pass. A spec calls \`${registration}()\` from './support/lifecycle.js' at the top of the file, above every hook and every test; the server pass preloads \`${apiPreload}\`.`,
  );
  process.exit(1);
}

console.log(`Clean-daemon conformance check passed (${checked} spec files, and the server pass preloads its reset).`);
