// What a line typed into the raw console means, before anything runs it: how
// it becomes an argv (no shell involved), how an Engine API entry is read, and
// whether it is destructive (REQ-112) or carries a secret (REQ-104).
export type ConsoleChannel = "cli" | "api";

/** A line the operator typed that cannot be run as it stands; answered as a rejection, never guessed at. */
export class ConsoleInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConsoleInputError";
  }
}

export interface ConsoleApiRequest {
  method: string;
  path: string;
  body?: string;
}

export interface CommandClassification {
  destructive: boolean;
  /** What makes it destructive, said to the operator in the confirmation. */
  reason?: string;
  /** The line could carry a credential, so it is never written to the history file. */
  carriesSecret: boolean;
}

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

// Verbs that remove, and the ones that end a running thing. Recognised
// wherever they appear in the argv, so `docker volume rm` and `docker rm` are
// the same case, and so is `docker system prune -a`.
const REMOVAL_VERBS = ["rm", "rmi", "remove", "prune"];
const HALT_VERBS = ["kill", "stop"];

// Flags and assignments whose value is a credential. `-p` is deliberately not
// in this list on its own — it is `docker run`'s port flag far more often than
// `docker login`'s password — so it counts only on a login command.
const SECRET_FLAGS = ["--password", "--password-stdin", "--token", "--registry-token", "--secret", "--api-key", "--auth"];
const SECRET_ASSIGNMENT = /(password|passwd|token|secret|api[_-]?key|credential)\s*=/i;
// A credential travels just as easily inside a body — `POST /auth
// {"Username":"u","Password":"p"}` on the API channel is the plain case — where
// there is no flag and no `=` to recognise. The key is matched with or without
// its quotes, so a body typed unquoted reads the same way.
const SECRET_BODY_KEY =
  /["{,\s]"?(password|passwd|identity[_-]?token|registry[_-]?token|registryauth|auth|token|secret|credential|api[_-]?key)"?\s*:/i;

/**
 * Splits a typed line into an argv the way a shell would quote it — and only
 * that. No pipe, redirection, glob or variable is interpreted: whatever is left
 * after quoting is handed to the process as a literal argument.
 */
export function tokenizeCommandLine(line: string): string[] {
  return tokenizeWithOffsets(line).map((token) => token.value);
}

interface PositionedToken {
  value: string;
  /** Index in the line just past the token's last character, quotes included. */
  end: number;
}

/** Tokenization keeping where each token ended, for the caller that needs the rest of the line as typed. */
function tokenizeWithOffsets(line: string): PositionedToken[] {
  const tokens: PositionedToken[] = [];
  let current = "";
  let started = false;
  let quote: '"' | "'" | undefined;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quote === "'") {
      if (char === "'") quote = undefined;
      else current += char;
      continue;
    }
    if (quote === '"') {
      if (char === "\\" && index + 1 < line.length && ['"', "\\", "$", "`"].includes(line[index + 1])) {
        current += line[index + 1];
        index += 1;
        continue;
      }
      if (char === '"') quote = undefined;
      else current += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      started = true;
      continue;
    }
    if (char === "\\" && index + 1 < line.length) {
      current += line[index + 1];
      index += 1;
      started = true;
      continue;
    }
    if (/\s/.test(char)) {
      if (started) tokens.push({ value: current, end: index });
      current = "";
      started = false;
      continue;
    }
    current += char;
    started = true;
  }

  if (quote) throw new ConsoleInputError(`The command ends inside an unterminated ${quote === '"' ? "double" : "single"} quote.`);
  if (started) tokens.push({ value: current, end: line.length });
  return tokens;
}

/**
 * The argv a CLI entry runs as. The line must be a `docker` command: the
 * console is the escape hatch of the Docker CLI, not a shell on the server.
 */
export function parseCliCommandLine(line: string): string[] {
  const argv = tokenizeCommandLine(line);
  if (argv.length === 0) throw new ConsoleInputError("Type a docker command to run.");
  if (argv[0] !== "docker") throw new ConsoleInputError("A CLI entry must start with 'docker' — the console runs the Docker CLI, not a shell.");
  return argv;
}

/**
 * The Engine API entry grammar: `[METHOD] /path[?query] [body]`. The method
 * defaults to `GET`, the path is taken as typed (query included) and the rest
 * of the line is the request body — taken raw, so a JSON body typed without
 * quotes keeps its own quotes and spacing instead of being re-joined out of
 * tokens.
 */
export function parseApiCommandLine(line: string): ConsoleApiRequest {
  const tokens = tokenizeWithOffsets(line);
  if (tokens.length === 0) throw new ConsoleInputError("Type an Engine API call, e.g. GET /containers/json?all=1.");

  const hasMethod = HTTP_METHODS.includes(tokens[0].value.toUpperCase());
  const method = hasMethod ? tokens[0].value.toUpperCase() : "GET";
  const pathToken = tokens[hasMethod ? 1 : 0];
  if (!pathToken || !pathToken.value.startsWith("/")) {
    throw new ConsoleInputError("An Engine API entry must name a path starting with '/', e.g. GET /containers/json?all=1.");
  }
  const body = unquoteWholeBody(line.slice(pathToken.end).trim());
  return { method, path: pathToken.value, ...(body ? { body } : {}) };
}

/**
 * The body is taken as typed, with one exception: a body the operator wrapped
 * in a single pair of quotes was quoting it the way a shell would, so those
 * outer quotes are removed rather than sent to the daemon as part of the JSON.
 */
function unquoteWholeBody(rest: string): string {
  if (rest[0] !== '"' && rest[0] !== "'") return rest;
  const tokens = tokenizeCommandLine(rest);
  return tokens.length === 1 ? tokens[0] : rest;
}

/** Whether the line could carry a credential; such a line is never persisted (REQ-104). */
export function carriesSecret(line: string): boolean {
  let tokens: string[];
  try {
    tokens = tokenizeCommandLine(line);
  } catch {
    // Unparseable: assume the worst rather than persist something unread.
    return true;
  }
  const lowered = tokens.map((token) => token.toLowerCase());
  if (lowered.some((token) => SECRET_FLAGS.some((flag) => token === flag || token.startsWith(`${flag}=`)))) return true;
  if (lowered.includes("login") && lowered.some((token) => token === "-p" || token.startsWith("-p="))) return true;
  if (tokens.some((token) => SECRET_ASSIGNMENT.test(token))) return true;
  // Tested on the line as typed: tokenizing strips the quotes a JSON key wears.
  return SECRET_BODY_KEY.test(line);
}

/** Classifies a typed line so the client can require a confirmation naming it before it runs (REQ-112). */
export function classifyCommand(channel: ConsoleChannel, line: string): CommandClassification {
  const secret = carriesSecret(line);
  const reason = channel === "cli" ? cliDestructiveReason(line) : apiDestructiveReason(line);
  return { destructive: reason !== undefined, ...(reason ? { reason } : {}), carriesSecret: secret };
}

function cliDestructiveReason(line: string): string | undefined {
  let tokens: string[];
  try {
    tokens = tokenizeCommandLine(line).map((token) => token.toLowerCase());
  } catch {
    return undefined;
  }
  const verbs = tokens.filter((token) => !token.startsWith("-"));
  const forced = tokens.some(isForceFlag);

  if (verbs.includes("prune")) {
    return "A prune removes every object the daemon considers unused — including objects this application never created.";
  }
  if (verbs.includes("swarm") && verbs.includes("leave")) {
    return "Leaving the swarm ends this node's membership, and with it the services it was running.";
  }
  if (verbs.some((verb) => REMOVAL_VERBS.includes(verb))) {
    return forced
      ? "This removes the objects it names, forced: the daemon will not refuse it for being in use, and what it removes does not come back."
      : "This removes the objects it names, and what it removes does not come back.";
  }
  if (verbs.some((verb) => HALT_VERBS.includes(verb))) {
    return "This stops the containers it names, and whatever they were running with them.";
  }
  return undefined;
}

/**
 * Whether a token forces the command. Short flags cluster — `docker rm -fv` is
 * this project's own habit — so a cluster is read letter by letter rather than
 * compared whole.
 */
function isForceFlag(token: string): boolean {
  if (token === "--force" || token.startsWith("--force=")) return true;
  return /^-[a-z]+$/i.test(token) && token.slice(1).toLowerCase().includes("f");
}

function apiDestructiveReason(line: string): string | undefined {
  let request: ConsoleApiRequest;
  try {
    request = parseApiCommandLine(line);
  } catch {
    return undefined;
  }
  const path = request.path.toLowerCase();
  if (path.includes("/prune")) {
    return "A prune removes every object the daemon considers unused — including objects this application never created.";
  }
  if (path.includes("/swarm/leave")) {
    return "Leaving the swarm ends this node's membership, and with it the services it was running.";
  }
  if (request.method === "DELETE") {
    return "This deletes the object the path names, and what it deletes does not come back.";
  }
  if (path.includes("/kill") || path.includes("/stop")) {
    return "This stops the container the path names, and whatever it was running with it.";
  }
  return undefined;
}
