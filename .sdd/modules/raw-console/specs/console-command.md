---
module: raw-console
component: ConsoleCommand
type: backend service
---

# ConsoleCommand

**Purpose** → what a line typed into the raw console means, before anything runs it: how it becomes
an argv, how an Engine API entry is read, whether it is destructive, and whether it could carry a
credential.

## Contract

- `tokenizeCommandLine(line): string[]`
  - Splits on whitespace, honouring single quotes, double quotes (with `\"`, `\\`, `\$`, `` \` ``
    escapes inside them) and backslash escapes outside them.
  - Rejects with a `ConsoleInputError` when the line ends inside an unterminated quote.
- `parseCliCommandLine(line): string[]` — the argv a CLI entry runs as.
  - Rejects with a `ConsoleInputError` when the line is blank, or when its first token is not
    `docker`.
- `parseApiCommandLine(line): { method, path, body? }`
  - Grammar: `[METHOD] /path[?query] [body]`. The method defaults to `GET` when the first token is
    not an HTTP method; the path is taken as typed, query included.
  - The body is the **rest of the line as typed**, trimmed at both ends — not a re-join of tokens —
    so a JSON body typed unquoted keeps its own quotes and its own spacing
    (`POST /containers/create {"Image":"alpine:3.20"}` sends exactly that object).
  - The one exception: a body wrapped in a single pair of quotes was quoted the way a shell would
    be, so those outer quotes are removed instead of being sent as part of the body.
  - Rejects with a `ConsoleInputError` when the line is blank or the path does not start with `/`.
- `carriesSecret(line): boolean` → the line could carry a credential.
  - True for `--password`, `--password-stdin`, `--token`, `--registry-token`, `--secret`,
    `--api-key`, `--auth` (bare or `=`-joined), for `-p` on a `login` command, and for any token
    containing a `password=` / `passwd=` / `token=` / `secret=` / `api_key=` / `api-key=` /
    `credential=` assignment (case-insensitive).
  - True for a body key naming a credential — `password`, `passwd`, `identity_token`,
    `registry_token`, `registryauth`, `auth`, `token`, `secret`, `credential`, `api_key`
    (case-insensitive, with or without its quotes, followed by `:`). The API channel carries a
    credential as easily as the CLI one — `POST /auth {"Username":"u","Password":"p"}` is the plain
    case — and there is no flag and no `=` there to recognise.
  - True for a line that cannot be tokenized at all: an unread line is assumed to carry one.
  - `-p` alone is not a secret flag: it is `docker run`'s port flag far more often than a password.
  - A word only counts as a body key when a `:` follows it, so a query filter (`filters=
    {"status":["running"]}`) and a subcommand (`docker secret ls`) are not mistaken for one.
  - **The recognition is deliberately over-eager, and stops at the `:`.** Any of those ten words
    followed by a colon counts, wherever it appears on the line and whether or not it is really a
    body key: `docker inspect token:latest`, a filter carrying `auth:1` and an argument like
    `secret:x` are all read as credential-bearing. The consequence is only that the entry is kept
    out of the history — it still runs, and it is still in the transcript for the session — which is
    the side to err on: a false positive costs one line of history, a false negative writes a
    password to disk.
- `classifyCommand(channel, line): { destructive, reason?, carriesSecret }`
  - `channel`: `'cli' | 'api'`. `reason` is present exactly when `destructive` is true, and states
    what makes it destructive in words meant for the operator.
  - CLI, destructive when any non-flag token is:
    - `prune` → a prune reaches every object the daemon considers unused
    - `swarm` together with `leave` → the node's membership ends
    - `rm`, `rmi`, `remove` → removal; the reason additionally says it is forced when the line
      carries `--force` or a short flag containing `f`, clustered ones included — `-fv` forces just
      as `-f` does
    - `kill`, `stop` → the containers named are stopped
  - API, destructive when the path contains `/prune` or `/swarm/leave`, when the method is `DELETE`,
    or when the path contains `/kill` or `/stop`.
  - Anything else is not destructive — including `build`, `stack deploy`, `buildx build` and
    `context create`, which are exactly the commands this console has to keep reachable.

## Rules and invariants

- Tokenizing is quoting and nothing else: no pipe, redirection, glob or variable is interpreted, so
  a metacharacter reaches the process as a literal argument rather than acting on the server.
- Classification never rewrites the line: it only says what it is. What runs is what was typed.
- Recognition is by whole token wherever it appears, so `docker volume rm` and `docker rm` are the
  same case, and a flag value that is itself one of those words counts too — the bias is
  deliberately towards asking for a confirmation once too often rather than once too rarely.

## Requirements served

- plan-docker_management_app/REQ-100
- plan-docker_management_app/REQ-101
- plan-docker_management_app/REQ-104
- plan-docker_management_app/REQ-112
