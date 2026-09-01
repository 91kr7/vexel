/**
 * The factor the server runs its own cadences at
 * (`timing-scale/specs/server-timing-scale.md`;
 * plan-docker_management_app-timing_scale/REQ-1, REQ-2, REQ-3, REQ-4, REQ-5).
 *
 * Every case runs in a **child process of its own**, and that is the only shape
 * this contract can be checked in: the factor is read once, when the module is
 * first imported, so a second value can never be observed inside a process that
 * has already imported it — and the refusal the spec asks for happens at that
 * import, before the port would open. A child per value is what "read once, at
 * start-up" looks like from the outside.
 *
 * The cases of a group are spawned together, so the group costs one child's
 * start-up rather than one per value.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const serverDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const timingScaleModule = pathToFileURL(join(serverDir, "src", "timing", "timing-scale.ts")).href;
const refreshCacheModule = pathToFileURL(join(serverDir, "src", "refresh-cache", "refresh-cache.ts")).href;
// Resolved from this file rather than passed as a bare name: the child is spawned
// with an environment of its own and must not depend on a lookup.
const typescriptLoader = import.meta.resolve("tsx");

interface ChildOutcome {
  code: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Runs one expression in a fresh process whose `VEXEL_TIMING_SCALE` is exactly
 * what the case says: `undefined` removes the variable, so the "unset" case is
 * not silently inheriting the value of whoever launched the pass.
 */
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

interface ScaleReading {
  scale: number;
  /** `cadence()` applied to a declared cadence, a tiny one and zero. */
  cadences: [number, number, number];
}

const READ_SCALE = `
  const timing = await import(${JSON.stringify(timingScaleModule)});
  console.log(JSON.stringify({ scale: timing.timingScale, cadences: [timing.cadence(750), timing.cadence(2), timing.cadence(0)] }));
  process.exit(0);
`;

async function readScale(value: string | undefined): Promise<ScaleReading> {
  const outcome = await runWithScale(value, READ_SCALE);
  assert.equal(outcome.code, 0, `VEXEL_TIMING_SCALE=${String(value)} was refused:\n${outcome.stderr}`);
  return JSON.parse(outcome.stdout) as ScaleReading;
}

// REQ-1 — the factor is 1 when the variable says nothing, so the operator's own
// process, which sets nothing, runs the product to the millisecond it ships.
test("uses 1 when the variable is unset, empty or blank", async () => {
  const readings = await Promise.all([undefined, "", "   "].map((value) => readScale(value)));
  for (const [index, reading] of readings.entries()) {
    assert.equal(reading.scale, 1, `case ${index} did not read as 1`);
    assert.equal(reading.cadences[0], 750, `case ${index} did not leave a declared cadence alone`);
  }
});

// REQ-1 — a plain decimal inside the range is the factor, written canonically in
// each of the forms the spec accepts.
test("takes a plain decimal from 0.1 to 10 as the factor", async () => {
  const cases: [string, number][] = [
    ["1", 1],
    ["1.0", 1],
    ["0.2", 0.2],
    ["0.1", 0.1],
    ["10", 10],
  ];
  const readings = await Promise.all(cases.map(([value]) => readScale(value)));
  for (const [index, reading] of readings.entries()) {
    assert.equal(reading.scale, cases[index][1], `VEXEL_TIMING_SCALE=${cases[index][0]}`);
  }
});

// REQ-4 — a declared cadence runs at its value multiplied by the factor.
test("multiplies a declared cadence by the factor", async () => {
  const [full, fifth, tenfold] = await Promise.all([readScale(undefined), readScale("0.2"), readScale("10")]);
  assert.equal(full.cadences[0], 750);
  assert.equal(fifth.cadences[0], 150);
  assert.equal(tenfold.cadences[0], 7500);
});

// REQ-3 — no scaled cadence is ever shorter than one millisecond, however small
// the factor and however small the declared value.
test("never returns a cadence below one millisecond", async () => {
  const smallest = await readScale("0.1");
  assert.equal(smallest.cadences[1], 1, "a 2 ms cadence at factor 0.1 fell below a millisecond");
  assert.equal(smallest.cadences[2], 1, "a 0 ms cadence fell below a millisecond");
  const full = await readScale(undefined);
  assert.equal(full.cadences[2], 1, "a 0 ms cadence fell below a millisecond at factor 1");
});

// REQ-2 — a value that is not a plain decimal, or is outside the range, is
// refused at the import, and the message names the variable and the value as it
// was written. `02` is the case the spec singles out: an ordinary numeric parse
// reads it as 2, so a typo would silently double the product's speed.
test("refuses a value that is not a number or is out of range, naming the variable and the value", async () => {
  const refused = ["02", "abc", ".5", "2.", "1e-1", "+1", "-1", "0.05", "11", "0"];
  const outcomes = await Promise.all(refused.map((value) => runWithScale(value, READ_SCALE)));
  for (const [index, outcome] of outcomes.entries()) {
    const value = refused[index];
    assert.notEqual(outcome.code, 0, `VEXEL_TIMING_SCALE=${value} was accepted; it printed ${outcome.stdout}`);
    const message = `${outcome.stdout}${outcome.stderr}`;
    assert.ok(message.includes("VEXEL_TIMING_SCALE"), `the refusal of ${value} never names the variable:\n${message}`);
    assert.ok(message.includes(value), `the refusal of ${value} never names the value:\n${message}`);
  }
});

// REQ-5 — with the variable unset the two refresh-cache cadences hold exactly the
// values they hold today; REQ-4 — with a factor set they run at that value
// multiplied by it. Read from the module that declares them, so a cadence that
// stopped going through the helper is visible here.
test("the refresh-cache cadences hold their shipped values unset, and scale when set", async () => {
  const source = `
    const refresh = await import(${JSON.stringify(refreshCacheModule)});
    console.log(JSON.stringify({ grouping: refresh.EVENT_GROUPING_WINDOW_MS, demand: refresh.DEMAND_EXPIRY_MS }));
    process.exit(0);
  `;
  const [shipped, scaled] = await Promise.all([runWithScale(undefined, source), runWithScale("0.2", source)]);
  assert.equal(shipped.code, 0, shipped.stderr);
  assert.equal(scaled.code, 0, scaled.stderr);
  assert.deepEqual(JSON.parse(shipped.stdout), { grouping: 750, demand: 60000 });
  assert.deepEqual(JSON.parse(scaled.stdout), { grouping: 150, demand: 12000 });
});
