// The web server the browser-driven suite runs against under coverage: the
// product handles no stop signal, so it would exit with nothing recorded.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { takeCoverage } from "node:v8";
import { repositoryRoot } from "./report-store.mjs";

function build(command) {
  const env = { ...process.env };
  // Node forces its own coverage directory on every process it spawns, so the
  // builds are pointed at one nobody reads rather than at the server's.
  if (env.NODE_V8_COVERAGE) env.NODE_V8_COVERAGE = join(env.NODE_V8_COVERAGE, "..", "build-tools");
  const status = spawnSync("npm", command, { cwd: repositoryRoot, stdio: "inherit", env }).status;
  if (status !== 0) process.exit(status ?? 1);
}

// Source maps are asked for on the command line, not in the two build
// configurations: `client/vite.config.ts` may read no environment variable at
// all (plan-docker_management_app-timing_scale/REQ-13).
build(["run", "build", "-w", "client", "-s", "--", "--sourcemap"]);
build(["run", "build", "-w", "server", "-s", "--", "--sourceMap"]);

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    takeCoverage();
    process.exit(0);
  });
}

await import(pathToFileURL(join(repositoryRoot, "server", "dist", "index.js")).href);
