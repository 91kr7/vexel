import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConsoleInputError } from "../../src/console/console-command.js";
import { runConsoleCliCommand } from "../../src/console/console-cli-service.js";

// raw-console/specs/console-cli-service.md — the CLI channel spawns the `docker` binary found on
// PATH with the argv the tokenizer produced. These tests put a stand-in `docker` on PATH that
// simply reports the argv it was handed: it makes the "no shell is involved" invariant (REQ-100)
// directly observable, and it means an adversarial line is probed without a single real command
// running against the operator's daemon.

const binDir = mkdtempSync(join(tmpdir(), "vexel-console-cli-bin-"));
const workDir = mkdtempSync(join(tmpdir(), "vexel-console-cli-work-"));
const emptyBinDir = mkdtempSync(join(tmpdir(), "vexel-console-cli-nobin-"));

writeFileSync(
  join(binDir, "docker"),
  [
    "#!/bin/sh",
    "case \"$1\" in",
    // `exec` so the stand-in is replaced by the long-running process rather than
    // becoming its parent: a grandchild would keep the pipes open after the kill
    // and turn a cancellation into a wait, which says nothing about the channel.
    "  --sleep) exec sleep 30 ;;",
    "  --fail) printf 'boom\\n' >&2; exit 7 ;;",
    "  --read-stdin) cat > /dev/null; printf 'stdin reached EOF\\n' ;;",
    "  *) printf '%s\\n' \"$@\" ;;",
    "esac",
    "",
  ].join("\n"),
  "utf-8",
);
chmodSync(join(binDir, "docker"), 0o755);

const realPath = process.env.PATH;
process.env.PATH = `${binDir}:${realPath ?? ""}`;

interface Run {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  exits: number;
  errors: string[];
  cancel: () => void;
}

/** Runs a line through the channel and resolves once it has ended, however it ended. */
function runToEnd(commandLine: string, onStarted?: (cancel: () => void) => void): Promise<Run> {
  return new Promise((resolve, reject) => {
    const run: Run = { stdout: "", stderr: "", exitCode: null, exits: 0, errors: [], cancel: () => undefined };
    let cancel: () => void;
    try {
      cancel = runConsoleCliCommand(commandLine, {
        onOutput: (chunk) => {
          if (chunk.stream === "stdout") run.stdout += chunk.text;
          else run.stderr += chunk.text;
        },
        onExit: (exitCode) => {
          run.exits += 1;
          run.exitCode = exitCode;
          // Settles a tick later so a second, contract-breaking callback would
          // still be counted before the assertions read the run.
          setTimeout(() => resolve(run), 20);
        },
        onError: (message) => {
          run.errors.push(message);
          setTimeout(() => resolve(run), 20);
        },
      });
    } catch (error) {
      reject(error);
      return;
    }
    run.cancel = cancel;
    onStarted?.(cancel);
  });
}

// console-cli-service.md — "Rejects (throws a ConsoleInputError) before anything is spawned when the
// line is not a runnable docker command line"; REQ-100 — the console is the Docker CLI, not a shell
test("runConsoleCliCommand refuses a line that does not start with docker, before spawning anything", () => {
  for (const line of ["rm -rf /tmp/x", "sh -c 'docker ps'", "  ", 'docker ps "'] as const) {
    let spawned = false;
    assert.throws(
      () =>
        runConsoleCliCommand(line, {
          onOutput: () => {
            spawned = true;
          },
          onExit: () => {
            spawned = true;
          },
          onError: () => {
            spawned = true;
          },
        }),
      ConsoleInputError,
      `expected ${line} to be refused`,
    );
    assert.equal(spawned, false, `${line} produced output`);
  }
});

// console-cli-service.md — onOutput per chunk, onExit with the exit code, exactly one of the two
test("runConsoleCliCommand streams stdout and reports exit 0 exactly once", async () => {
  const run = await runToEnd("docker version --format {{.Server.Version}}");

  assert.equal(run.exitCode, 0);
  assert.equal(run.exits, 1);
  assert.deepEqual(run.errors, []);
  assert.equal(run.stdout, "version\n--format\n{{.Server.Version}}\n");
});

test("runConsoleCliCommand reports stderr and a non-zero exit code", async () => {
  const run = await runToEnd("docker --fail");

  assert.equal(run.exitCode, 7);
  assert.equal(run.exits, 1);
  assert.equal(run.stderr, "boom\n");
  assert.deepEqual(run.errors, []);
});

// console-cli-service.md — "The command runs exactly as it was typed, parsed into an argv — never
// rewritten, re-ordered or supplemented with flags of the application's own."
test("runConsoleCliCommand hands the process the argv that was typed, in order and unsupplemented", async () => {
  const run = await runToEnd("docker manifest inspect --verbose alpine:3.20");

  assert.deepEqual(run.stdout.split("\n").filter((line) => line.length > 0), [
    "manifest",
    "inspect",
    "--verbose",
    "alpine:3.20",
  ]);
});

// console-cli-service.md — "No shell is involved: what the tokenizer produces is passed to the
// process as arguments, so a metacharacter cannot act on the server's filesystem." (REQ-100)
test("a command separator reaches the process as a literal argument and starts no second process", async () => {
  const victim = join(workDir, "victim.txt");
  writeFileSync(victim, "still here", "utf-8");

  const run = await runToEnd(`docker ps; rm -rf ${victim}`);

  assert.deepEqual(run.stdout.split("\n").filter((line) => line.length > 0), ["ps;", "rm", "-rf", victim]);
  assert.equal(existsSync(victim), true, "the file a shell would have removed is gone");
});

test("a redirection, an && chain and a pipe reach the process as literal arguments, creating nothing", async () => {
  const created = join(workDir, "redirected.txt");
  const chained = join(workDir, "chained.txt");

  const redirect = await runToEnd(`docker version > ${created}`);
  assert.deepEqual(redirect.stdout.split("\n").filter((line) => line.length > 0), ["version", ">", created]);
  assert.equal(existsSync(created), false, "a redirection created a file on the server");

  const chain = await runToEnd(`docker version && touch ${chained}`);
  assert.deepEqual(chain.stdout.split("\n").filter((line) => line.length > 0), ["version", "&&", "touch", chained]);
  assert.equal(existsSync(chained), false, "an && chain ran a second command");

  const piped = await runToEnd("docker ps | sh");
  assert.deepEqual(piped.stdout.split("\n").filter((line) => line.length > 0), ["ps", "|", "sh"]);
});

test("a command substitution reaches the process unexpanded", async () => {
  const substituted = join(workDir, "substituted.txt");

  const dollar = await runToEnd(`docker version $(touch ${substituted})`);
  assert.ok(dollar.stdout.includes("$(touch"), `substitution was expanded: ${dollar.stdout}`);
  const backtick = await runToEnd(`docker version \`touch ${substituted}\``);
  assert.ok(backtick.stdout.includes("`touch"), `substitution was expanded: ${backtick.stdout}`);
  assert.equal(existsSync(substituted), false, "a command substitution ran on the server");
});

test("a newline inside the line is whitespace, not the start of a second command", async () => {
  const created = join(workDir, "newline.txt");

  const run = await runToEnd(`docker version\ntouch ${created}`);

  assert.deepEqual(run.stdout.split("\n").filter((line) => line.length > 0), ["version", "touch", created]);
  assert.equal(existsSync(created), false, "the line after the newline was executed");
});

// console-cli-service.md — "The returned function cancels the run: the process is killed and
// onExit(null) follows."
test("the returned function kills the process and ends the run with a null exit code", async () => {
  const started = Date.now();
  const run = await runToEnd("docker --sleep", (cancel) => setTimeout(cancel, 50));

  assert.equal(run.exitCode, null);
  assert.equal(run.exits, 1);
  assert.deepEqual(run.errors, []);
  assert.ok(Date.now() - started < 10_000, "cancelling did not interrupt the process");
});

// console-cli-service.md — "Standard input is closed immediately: a command that would otherwise
// wait for input nobody can type fails instead of hanging the console."
test("standard input is closed, so a command that reads it ends instead of hanging", async () => {
  const run = await runToEnd("docker --read-stdin");

  assert.equal(run.exitCode, 0);
  assert.equal(run.stdout, "stdin reached EOF\n");
});

// console-cli-service.md — "onError(message) — the process never ran (e.g. the docker binary is
// gone)" and "Exactly one of onExit / onError fires, once."
test("a docker binary that cannot be spawned reports onError and never onExit", async () => {
  const previous = process.env.PATH;
  process.env.PATH = emptyBinDir;
  try {
    const run = await runToEnd("docker ps");
    assert.equal(run.exits, 0);
    assert.equal(run.errors.length, 1);
    assert.ok((run.errors[0] ?? "").length > 0);
  } finally {
    process.env.PATH = previous;
  }
});
