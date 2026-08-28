// One line written before anything is asked of Docker, on either of the two
// channels the product talks to it on: the Engine API over the dialed socket
// (unix, TCP(+TLS), or the ssh tunnel) and the local `docker` CLI.
//
// Two call sites cover every call the product makes, and that is the whole
// reason this file is worth having rather than a log statement per area: both
// channels already funnel through a single function each — `send`/`hijack` in
// `http-client.ts`, `runCliCommand`/`runOnce` in `cli-runner.ts` — so a new
// area is logged the day it is written, without being told to be.
//
// The line goes out *before* the request is issued or the process is spawned,
// which is the point of it: a call that hangs, or that kills the daemon, is
// named in the log by the time it does so. Nothing is written afterwards — no
// outcome, no duration — so the volume is exactly one line per call.
//
// What is never written: request and response bodies, headers, and the child's
// standard input. That last one is not a detail. Standard input is where this
// product deliberately puts every secret it hands the CLI, precisely so it
// stays out of `argv` where `ps` would show it (REQ-87); logging it here would
// hand back what that rule exists to withhold. `argv` itself is redacted all
// the same, because the raw console lets an operator type anything.
import type { DockerEndpoint } from "./types.js";

/** Which of the two channels the call travels on. */
export type DockerCallChannel = "socket" | "cli";

/**
 * How a socket call is framed. `request` is the ordinary buffered one and is
 * left unmarked in the line; the other two are worth seeing because they own a
 * connection for as long as they last — minutes, for a followed log stream.
 */
export type SocketCallMode = "request" | "stream" | "hijack";

export interface SocketCall {
  method: string;
  /** The path as it will be dialed, API version prefix and query string included. */
  path: string;
  mode: SocketCallMode;
}

/**
 * Values of `VEXEL_DOCKER_LOG` that silence the log. Anything else — including
 * no value at all — leaves it on: an operator running the product is meant to
 * be told what it asks of their daemon without having to ask for it first.
 */
const SILENCING_VALUES = new Set(["off", "0", "false", "no"]);

/** Longest path or command line written; beyond it the line is cut and marked. */
const MAX_DETAIL_LENGTH = 500;

const REDACTED = "***";

/**
 * Flags whose value is a credential wherever it appears. `--password-stdin` is
 * deliberately absent: it carries no value, and seeing it is how one reads that
 * the secret went over standard input rather than through `argv`.
 */
const SECRET_FLAGS = new Set(["--password", "--token", "--registry-token", "--identity-token", "--secret", "--auth"]);

/**
 * Flags that carry a credential for `docker login` alone. `-p` is a password
 * there and a published port everywhere else, so it is redacted for that one
 * subcommand only — reading `-p 8080:80` as a credential would blank out the
 * most useful half of the line for every container the product starts.
 */
const LOGIN_ONLY_SECRET_FLAGS = new Set(["-p"]);

type LogSink = (line: string) => void;

const writeToStdout: LogSink = (line) => process.stdout.write(`${line}\n`);

let sink: LogSink = writeToStdout;

/**
 * Test seam: redirects the lines somewhere a check can read them. The server
 * never calls it; passing `undefined` restores standard output.
 */
export function setDockerCallLogSink(next: LogSink | undefined): void {
  sink = next ?? writeToStdout;
}

/**
 * Read per call rather than once at import, on purpose: a check flips it around
 * a single call, and one process must not be pinned to whatever the environment
 * held the instant this module was first imported.
 */
function isEnabled(): boolean {
  const value = process.env.VEXEL_DOCKER_LOG?.trim().toLowerCase();
  return value === undefined || !SILENCING_VALUES.has(value);
}

/** How the endpoint is named in a line — the same URL forms `DOCKER_HOST` accepts. */
export function describeEndpoint(endpoint: DockerEndpoint): string {
  switch (endpoint.kind) {
    case "unix":
      return `unix://${endpoint.socketPath}`;
    case "tcp":
      return `tcp://${endpoint.host}:${endpoint.port}${endpoint.tls ? " (tls)" : ""}`;
    case "ssh":
      return `ssh://${endpoint.destination}`;
  }
}

function truncate(detail: string): string {
  if (detail.length <= MAX_DETAIL_LENGTH) return detail;
  return `${detail.slice(0, MAX_DETAIL_LENGTH)}… (+${detail.length - MAX_DETAIL_LENGTH} chars)`;
}

/** An argument is wrapped only when reading it back would otherwise be ambiguous. */
function quote(value: string): string {
  return value === "" || /\s/.test(value) ? `'${value}'` : value;
}

/**
 * Blanks the value of every flag that carries a credential, leaving the flag
 * itself in place: what was asked of Docker stays readable, what was handed to
 * it does not. Both spellings are covered — `--password secret` and
 * `--password=secret`.
 */
export function redactCliArgs(args: string[]): string[] {
  const isLogin = args[0] === "login";
  const redacted: string[] = [];
  let valueIsSecret = false;

  for (const arg of args) {
    if (valueIsSecret) {
      redacted.push(REDACTED);
      valueIsSecret = false;
      continue;
    }
    const separator = arg.indexOf("=");
    const name = separator === -1 ? arg : arg.slice(0, separator);
    if (!SECRET_FLAGS.has(name) && !(isLogin && LOGIN_ONLY_SECRET_FLAGS.has(name))) {
      redacted.push(arg);
      continue;
    }
    if (separator === -1) {
      redacted.push(arg);
      // The value is the next element of argv, whatever it turns out to be.
      valueIsSecret = true;
    } else {
      redacted.push(`${name}=${REDACTED}`);
    }
  }
  return redacted;
}

function write(channel: DockerCallChannel, detail: string, target: string | undefined): void {
  const suffix = target ? ` → ${target}` : "";
  sink(`${new Date().toISOString()} [docker ${channel}] ${truncate(detail)}${suffix}`);
}

/**
 * Announces an Engine API call about to be issued on the endpoint's socket.
 *
 * The gate comes first, before the line is composed: silenced, a call pays for
 * one environment lookup and nothing else — which is what makes it affordable
 * to sit in front of every call the product makes.
 */
export function logSocketCall(endpoint: DockerEndpoint, call: SocketCall): void {
  if (!isEnabled()) return;
  const mode = call.mode === "request" ? "" : ` (${call.mode})`;
  write("socket", `${call.method} ${call.path}${mode}`, describeEndpoint(endpoint));
}

/**
 * Announces a CLI process about to be spawned. The endpoint is omitted for the
 * availability probe (`docker --version` and friends), which dials nothing and
 * would be described by a target it never contacts.
 */
export function logCliCall(command: string, args: string[], endpoint?: DockerEndpoint): void {
  if (!isEnabled()) return;
  const line = [command, ...redactCliArgs(args)].map(quote).join(" ");
  write("cli", line, endpoint && describeEndpoint(endpoint));
}
