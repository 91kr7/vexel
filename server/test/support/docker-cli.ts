/**
 * Every `docker` the tests invoke, with a deadline on it.
 *
 * `execFile` waits for ever by default and `node --test` imposes no limit of its
 * own, so a daemon that accepts a command and never answers does not fail a run
 * — it holds it open. That is not hypothetical: a `docker plugin push` the
 * daemon could not complete once kept a pass alive for thirty-three minutes and
 * reported nothing at all, because the file it belonged to simply never exited.
 * A test that cannot finish must say so, and quickly.
 *
 * Two deadlines, chosen by what the command actually does:
 *
 * - **Thirty seconds** for everything by default. Every other command these
 *   suites run only asks the local daemon a question, and a healthy daemon
 *   answers in well under a second; thirty seconds is already far more room
 *   than any of them needs.
 * - **Five minutes** for the handful of verbs that move bytes — pulling,
 *   pushing, building, committing, saving and loading. These legitimately take
 *   minutes on a cold cache or a slow network, so holding them to the short
 *   deadline would fail them for being honest work. Five minutes is still a
 *   deadline: the stall this module exists to prevent is unbounded, not slow.
 *
 * The verb decides, in one place, rather than being repeated at four dozen call
 * sites where it would drift. A caller that knows better passes its own
 * `timeout` and always wins.
 */
import { execFile, type ExecFileOptions } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/** The deadline a command that merely questions the daemon gets. */
export const DOCKER_TIMEOUT_MS = 30_000;

/** The deadline a command that moves image bytes gets instead. */
export const DOCKER_TRANSFER_TIMEOUT_MS = 300_000;

/**
 * Past this, a call says how long it took. Nothing here is meant to be slow — a
 * question to a local daemon answers in well under a second — so one that is not
 * names itself instead of being averaged into whichever hook it exhausts.
 *
 * Paid for by `menu-follows-its-control`: a `beforeAll` doing work that measures
 * 0.4s spent its whole thirty-second budget, and neither the reporter nor the
 * Playwright trace could say on which call, because a trace records browser
 * actions and this is not one.
 */
const SLOW_CALL_MS = 5_000;

/**
 * The verbs that move bytes, and so earn the longer deadline. Matched against
 * the first two arguments, since the verb is either the first (`docker pull`)
 * or the second (`docker plugin push`, `docker image save`).
 */
const TRANSFER_VERBS = new Set(["pull", "push", "build", "commit", "save", "load", "import", "export"]);

function deadlineFor(args: readonly string[]): number {
  const verbs = args.slice(0, 2);
  return verbs.some((verb) => TRANSFER_VERBS.has(verb)) ? DOCKER_TRANSFER_TIMEOUT_MS : DOCKER_TIMEOUT_MS;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
}

/**
 * `promisify(execFile)` with a deadline, and an error that names what expired.
 *
 * Node reports a child it killed as a plain "Command failed", which reads
 * exactly like the command having been refused — the one thing a stalled daemon
 * must not be mistaken for. The message is rewritten so the deadline names
 * itself, and says which command was still waiting.
 */
export async function execFileAsync(
  file: string,
  args: readonly string[],
  options: ExecFileOptions & { timeout?: number } = {},
): Promise<ExecResult> {
  const timeout = options.timeout ?? deadlineFor(args);
  const started = Date.now();
  const sayIfSlow = (): void => {
    const took = Date.now() - started;
    if (took > SLOW_CALL_MS) console.warn(`slow: \`${file} ${args.join(" ")}\` took ${Math.round(took / 1000)}s`);
  };
  try {
    const { stdout, stderr } = await run(file, [...args], { ...options, timeout });
    sayIfSlow();
    return { stdout: String(stdout), stderr: String(stderr) };
  } catch (error) {
    sayIfSlow();
    const failure = error as { killed?: boolean; signal?: string | null };
    if (failure.killed === true && failure.signal === "SIGTERM") {
      throw new Error(
        `\`${file} ${args.join(" ")}\` did not answer within ${timeout} ms and was killed. ` +
          "The command was accepted and never completed; the test is failed here rather than waiting for ever.",
      );
    }
    throw error;
  }
}
