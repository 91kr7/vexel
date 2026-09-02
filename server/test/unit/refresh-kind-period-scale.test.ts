/**
 * A refresh kind's declared period runs on the process's clock
 * (`refresh-cache/specs/refresh-cache.md`;
 * plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-74).
 *
 * The contract is about a figure a caller declares — `periodMs` — becoming a
 * cadence the operator's factor multiplies, so what is measured here is the only
 * thing a caller can observe: how often the kind is read again. Each case runs
 * in a **child process of its own**, because the factor is read once, when the
 * timing module is first imported, and this pass leaves `VEXEL_TIMING_SCALE`
 * unset on purpose.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const serverDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const refreshCacheModule = pathToFileURL(join(serverDir, "src", "refresh-cache", "refresh-cache.ts")).href;
const typescriptLoader = import.meta.resolve("tsx");

interface ChildOutcome {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runWithScale(value: string | undefined, source: string): Promise<ChildOutcome> {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (value === undefined) delete env.VEXEL_TIMING_SCALE;
  else env.VEXEL_TIMING_SCALE = value;

  const child = spawn(process.execPath, ["--import", typescriptLoader, "--input-type=module", "-e", source], {
    cwd: serverDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => (stdout += chunk));
  child.stderr.on("data", (chunk: string) => (stderr += chunk));
  return new Promise((settle) => {
    child.once("close", (code) => settle({ code, stdout, stderr }));
  });
}

/**
 * Registers one kind declaring a 1000 ms period, asks for it once so its
 * refresher starts, and reports how many reads it had made 700 ms later.
 */
const countReads = `
  const { registerRefreshKind } = await import(${JSON.stringify(refreshCacheModule)});
  let reads = 0;
  const kind = registerRefreshKind({
    key: "check-period-on-the-process-clock",
    read: async () => { reads += 1; return reads; },
    periodMs: 1000,
  });
  await kind.read();
  await new Promise((resolve) => setTimeout(resolve, 700));
  console.log(JSON.stringify({ reads }));
  kind.dispose();
  process.exit(0);
`;

// REQ-74 — the figure a caller declares is what it wants at a factor of `1`, and
// the cache puts it on the process's clock: at `0.2` a 1000 ms period is 200 ms,
// so the kind is read again three times inside a 700 ms window that leaves an
// unscaled one read exactly once.
test("a declared period is multiplied by the operator's factor", async () => {
  const [shipped, scaled] = await Promise.all([runWithScale(undefined, countReads), runWithScale("0.2", countReads)]);

  assert.equal(shipped.code, 0, shipped.stderr);
  assert.equal(scaled.code, 0, scaled.stderr);

  const atFullSpeed = JSON.parse(shipped.stdout).reads;
  const atOneFifth = JSON.parse(scaled.stdout).reads;

  assert.equal(atFullSpeed, 1, `a 1000 ms period was read ${atFullSpeed} times in 700 ms at a factor of 1`);
  assert.ok(
    atOneFifth >= 3,
    `a 1000 ms period at a factor of 0.2 was read ${atOneFifth} times in 700 ms; it is a 200 ms period, so it is off the process's clock`,
  );
});
