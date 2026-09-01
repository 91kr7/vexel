/**
 * Runs only the tests that act on the whole host, and nothing else.
 *
 * These used to be a directory and a Playwright project of their own —
 * `server/test/exclusive/` and `client/e2e/exclusive/` — scheduled after
 * everything else. That arrangement cost more than it bought: the project
 * declared the parallel one as its dependency, so one unrelated red anywhere in
 * the suite skipped all eight destructive specs without saying so. They now sit
 * beside every other file, and this script is what the split was actually worth
 * keeping: the ability to run the destructive ones alone, and the ability to run
 * the suite without them touching the operator's machine.
 *
 * A glob cannot replace the list below. `system-prune.spec.ts` and
 * `system-prune-preserved.spec.ts` are named after the prune and never confirm
 * one — they are the half of that screen which can be established without
 * touching the host — so any pattern matching "prune" sweeps in two files that
 * do not belong and makes the command a lie.
 *
 * Usage: `npm run test:destructive` (both trees), `-- server`, `-- client`.
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** What each file does to the host, which is why it is on this list. */
const SERVER_FILES = [
  "test/api/build-cache-prune-routes.test.ts", // prunes the build cache
  "test/api/builders-active-routes.test.ts", // switches the active builder for the whole daemon
  "test/api/console-destructive-routes.test.ts", // executes a real removal through the raw console
  "test/api/contexts-use-routes.test.ts", // switches the active context, so every later call talks to another daemon
  "test/api/networks-prune-routes.test.ts", // prunes unused networks
  "test/api/plugins-lifecycle-routes.test.ts", // installs into the host-wide plugin list
  "test/api/prune-routes.test.ts", // prunes stopped containers and dangling images
  "test/api/system-prune-routes.test.ts", // prunes every category at once
  "test/api/volumes-prune-routes.test.ts", // prunes unused volumes
];

const CLIENT_FILES = [
  "e2e/build-cache-prune.spec.ts", // prunes the build cache through the screen
  "e2e/plugins-lifecycle.spec.ts", // installs into the host-wide plugin list through the screen
  "e2e/prune.spec.ts", // prunes stopped containers and dangling images through the screen
  "e2e/raw-console-destructive.spec.ts", // executes a real removal through the raw console
  "e2e/system-prune-confirmed.spec.ts", // confirms the per-category prunes of System & prune
  "e2e/volumes-prune.spec.ts", // prunes unused volumes through the screen
];

/**
 * A renamed file must fail this command rather than quietly leave the list, which
 * is the one way a list like this stops covering what it claims to.
 */
function requireAllPresent() {
  const missing = [
    ...SERVER_FILES.map((f) => join("server", f)),
    ...CLIENT_FILES.map((f) => join("client", f)),
  ].filter((f) => !existsSync(join(ROOT, f)));
  if (missing.length === 0) return;
  console.error(`These files are named by scripts/destructive-tests.mjs and are not on disk:\n${missing.map((f) => `  ${f}`).join("\n")}`);
  console.error("Renamed or removed? Update the list; do not let it shrink by accident.");
  process.exit(1);
}

function run(command, args, cwd, env = {}) {
  console.log(`\n=== ${command} ${args.join(" ")}`);
  const { status } = spawnSync(command, args, {
    cwd: join(ROOT, cwd),
    stdio: "inherit",
    shell: false,
    env: { ...process.env, ...env },
  });
  return status ?? 1;
}

/** What `test:api` sets around the same files, so running them here is the same run. */
const SERVER_ENV = {
  VEXEL_DOCKER_LOG: "off",
  VEXEL_TIMING_SCALE: "0.2",
  VEXEL_DATA_DIR: join(process.env.TMPDIR ?? "/tmp", "vexel-server-test-data"),
};

const which = process.argv[2] ?? "both";
if (!["both", "server", "client"].includes(which)) {
  console.error(`Unknown target "${which}". Use "server", "client", or nothing for both.`);
  process.exit(1);
}

requireAllPresent();

let failed = 0;

if (which === "both" || which === "server") {
  // The preliminary steps first, exactly as `test:api` chains them: a prune run
  // straight after another pass can find the base images gone.
  failed |= run("npm", ["run", "test:sweep"], "server");
  failed |= run("npm", ["run", "test:images"], "server");
  failed |= run("npm", ["run", "test:registry"], "server");
  failed |= run(
    "node",
    [
      "--experimental-test-module-mocks",
      "--import",
      "tsx",
      "--import",
      "./test/support/fresh-data-dir.ts",
      "--test-reporter=dot",
      "--test-concurrency=1",
      "--test",
      ...SERVER_FILES,
    ],
    "server",
    SERVER_ENV,
  );
}

if (which === "both" || which === "client") {
  failed |= run("npx", ["playwright", "test", "--quiet", ...CLIENT_FILES], "client");
}

process.exit(failed === 0 ? 0 : 1);
