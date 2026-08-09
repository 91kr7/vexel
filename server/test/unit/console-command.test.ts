import { test } from "node:test";
import assert from "node:assert/strict";
import {
  carriesSecret,
  classifyCommand,
  ConsoleInputError,
  parseApiCommandLine,
  parseCliCommandLine,
  tokenizeCommandLine,
} from "../../src/console/console-command.js";

// raw-console/specs/console-command.md — what a typed line means before anything runs it. The
// tokenizer is the whole of the "no shell on the server" guarantee (REQ-100), so the metacharacter
// cases below are the ones that matter most: they must come out as ordinary arguments.

// console-command.md — "Splits on whitespace, honouring single quotes, double quotes ... and
// backslash escapes outside them"
test("tokenizeCommandLine splits on whitespace runs of any kind", () => {
  assert.deepEqual(tokenizeCommandLine("docker  ps \t -a\n--quiet"), ["docker", "ps", "-a", "--quiet"]);
});

test("tokenizeCommandLine returns no token for a blank line", () => {
  assert.deepEqual(tokenizeCommandLine("   \t "), []);
});

test("tokenizeCommandLine keeps a single-quoted run together and interprets nothing inside it", () => {
  assert.deepEqual(tokenizeCommandLine(`docker ps --filter 'name=my container' 'a\\"b'`), [
    "docker",
    "ps",
    "--filter",
    "name=my container",
    'a\\"b',
  ]);
});

test("tokenizeCommandLine honours the four escapes of a double-quoted run and leaves any other backslash alone", () => {
  assert.deepEqual(tokenizeCommandLine('docker run "a\\"b" "a\\\\b" "a\\$b" "a\\`b" "a\\nb"'), [
    "docker",
    "run",
    'a"b',
    "a\\b",
    "a$b",
    "a`b",
    "a\\nb",
  ]);
});

test("tokenizeCommandLine honours a backslash escape outside quotes", () => {
  assert.deepEqual(tokenizeCommandLine("docker cp /tmp/a\\ file container:/tmp/"), [
    "docker",
    "cp",
    "/tmp/a file",
    "container:/tmp/",
  ]);
});

test("tokenizeCommandLine keeps an empty quoted argument as a token of its own", () => {
  assert.deepEqual(tokenizeCommandLine(`docker ps --filter ""`), ["docker", "ps", "--filter", ""]);
});

// console-command.md — "Rejects with a ConsoleInputError when the line ends inside an unterminated quote"
test("tokenizeCommandLine rejects a line ending inside an unterminated double quote", () => {
  assert.throws(() => tokenizeCommandLine('docker ps --filter "name=x'), ConsoleInputError);
});

test("tokenizeCommandLine rejects a line ending inside an unterminated single quote", () => {
  assert.throws(() => tokenizeCommandLine("docker ps --filter 'name=x"), ConsoleInputError);
});

// console-command.md — "Tokenizing is quoting and nothing else: no pipe, redirection, glob or
// variable is interpreted, so a metacharacter reaches the process as a literal argument rather than
// acting on the server." Probed the way an attacker would type it.
test("tokenizeCommandLine leaves a command separator as a literal argument instead of starting a second command", () => {
  assert.deepEqual(tokenizeCommandLine("docker ps; rm -rf /tmp/x"), ["docker", "ps;", "rm", "-rf", "/tmp/x"]);
});

test("tokenizeCommandLine leaves &&, || and a pipe as literal arguments", () => {
  assert.deepEqual(tokenizeCommandLine("docker ps && touch /tmp/x"), ["docker", "ps", "&&", "touch", "/tmp/x"]);
  assert.deepEqual(tokenizeCommandLine("docker ps || touch /tmp/x"), ["docker", "ps", "||", "touch", "/tmp/x"]);
  assert.deepEqual(tokenizeCommandLine("docker ps | sh"), ["docker", "ps", "|", "sh"]);
});

test("tokenizeCommandLine leaves a redirection as a literal argument", () => {
  assert.deepEqual(tokenizeCommandLine("docker version > /tmp/x"), ["docker", "version", ">", "/tmp/x"]);
});

test("tokenizeCommandLine leaves a command substitution unexpanded", () => {
  assert.deepEqual(tokenizeCommandLine("docker version $(id -u)"), ["docker", "version", "$(id", "-u)"]);
  assert.deepEqual(tokenizeCommandLine("docker version `id -u`"), ["docker", "version", "`id", "-u`"]);
});

test("tokenizeCommandLine leaves a variable reference and a glob unexpanded", () => {
  assert.deepEqual(tokenizeCommandLine("docker ps $HOME *.tar"), ["docker", "ps", "$HOME", "*.tar"]);
});

test("tokenizeCommandLine treats a newline as plain whitespace rather than a second command line", () => {
  assert.deepEqual(tokenizeCommandLine("docker version\ntouch /tmp/x"), ["docker", "version", "touch", "/tmp/x"]);
});

// console-command.md — "Rejects ... when the line is blank, or when its first token is not `docker`"
test("parseCliCommandLine answers the argv of a docker command line", () => {
  assert.deepEqual(parseCliCommandLine("docker system df -v"), ["docker", "system", "df", "-v"]);
});

test("parseCliCommandLine rejects a blank line", () => {
  assert.throws(() => parseCliCommandLine("   "), ConsoleInputError);
});

test("parseCliCommandLine rejects a line that does not start with docker", () => {
  for (const line of ["rm -rf /tmp/x", "sh -c 'docker ps'", "/bin/sh", "sudo docker ps", "DOCKER ps", "docker-compose up"]) {
    assert.throws(() => parseCliCommandLine(line), ConsoleInputError, `expected ${line} to be refused`);
  }
});

// console-command.md — the console has to keep reachable what no screen of its own carries: these
// lines are accepted and dispatched as the argv they were typed as, never blocked
test("parseCliCommandLine accepts the commands no dedicated screen carries, unaltered", () => {
  assert.deepEqual(parseCliCommandLine("docker build -t myimage:latest ."), ["docker", "build", "-t", "myimage:latest", "."]);
  assert.deepEqual(parseCliCommandLine("docker stack deploy -c docker-compose.yml mystack"), [
    "docker",
    "stack",
    "deploy",
    "-c",
    "docker-compose.yml",
    "mystack",
  ]);
  assert.deepEqual(parseCliCommandLine("docker buildx build --cache-to type=local,dest=./cache ."), [
    "docker",
    "buildx",
    "build",
    "--cache-to",
    "type=local,dest=./cache",
    ".",
  ]);
  assert.deepEqual(parseCliCommandLine('docker context create remote --docker "host=tcp://host:2376,ca=./ca.pem"'), [
    "docker",
    "context",
    "create",
    "remote",
    "--docker",
    "host=tcp://host:2376,ca=./ca.pem",
  ]);
});

// console-command.md — the Engine API entry grammar: `[METHOD] /path[?query] [body]`
test("parseApiCommandLine defaults the method to GET when the first token is a path", () => {
  assert.deepEqual(parseApiCommandLine("/containers/json?all=1"), { method: "GET", path: "/containers/json?all=1" });
});

test("parseApiCommandLine reads an explicit method, upper-casing it, and keeps the query on the path", () => {
  assert.deepEqual(parseApiCommandLine("delete /containers/abc?v=1&force=0"), {
    method: "DELETE",
    path: "/containers/abc?v=1&force=0",
  });
});

// console-command.md — "The body is the rest of the line as typed, trimmed at both ends — not a
// re-join of tokens — so a JSON body typed unquoted keeps its own quotes and its own spacing"
test("parseApiCommandLine takes an unquoted JSON body as typed, quotes included", () => {
  const parsed = parseApiCommandLine('POST /containers/create {"Image":"alpine:3.20"}');
  assert.equal(parsed.method, "POST");
  assert.equal(parsed.path, "/containers/create");
  assert.equal(parsed.body, '{"Image":"alpine:3.20"}');
});

test("parseApiCommandLine keeps the body's own spacing", () => {
  const body = '{"Image": "alpine:3.20",  "Cmd": ["sleep", "30"]}';
  assert.equal(parseApiCommandLine(`POST /containers/create?name=x ${body}`).body, body);
});

test("parseApiCommandLine trims the body at both ends", () => {
  assert.equal(parseApiCommandLine('POST /x    {"a":1}   ').body, '{"a":1}');
});

test("parseApiCommandLine keeps the query on the path and the body after it", () => {
  const parsed = parseApiCommandLine('POST /containers/create?name=demo {"Image":"alpine:3.20"}');
  assert.equal(parsed.path, "/containers/create?name=demo");
  assert.equal(parsed.body, '{"Image":"alpine:3.20"}');
});

// console-command.md — "The one exception: a body wrapped in a single pair of quotes was quoted the
// way a shell would be, so those outer quotes are removed"
test("parseApiCommandLine removes a single pair of outer quotes around the body", () => {
  assert.equal(parseApiCommandLine(`POST /containers/create '{"Image":"alpine:3.20"}'`).body, '{"Image":"alpine:3.20"}');
  assert.equal(parseApiCommandLine('POST /x "hello world"').body, "hello world");
});

test("parseApiCommandLine keeps quotes that are part of the body rather than wrapping it", () => {
  const body = '{"Name":"a", "Other":"b"}';
  assert.equal(parseApiCommandLine(`POST /x ${body}`).body, body);
});

test("parseApiCommandLine leaves the body out when nothing follows the path", () => {
  assert.equal(parseApiCommandLine("GET /info").body, undefined);
});

test("parseApiCommandLine rejects a blank line and a path that does not start with a slash", () => {
  assert.throws(() => parseApiCommandLine("  "), ConsoleInputError);
  assert.throws(() => parseApiCommandLine("containers/json"), ConsoleInputError);
  assert.throws(() => parseApiCommandLine("GET containers/json"), ConsoleInputError);
});

// console-command.md — carriesSecret: the credential flags, bare or `=`-joined
test("carriesSecret recognises every credential flag it names, bare and =-joined", () => {
  for (const flag of ["--password", "--password-stdin", "--token", "--registry-token", "--secret", "--api-key", "--auth"]) {
    assert.equal(carriesSecret(`docker login ${flag} hunter2 registry.example.com`), true, `${flag} bare`);
    assert.equal(carriesSecret(`docker login ${flag}=hunter2 registry.example.com`), true, `${flag}=`);
  }
});

test("carriesSecret recognises a credential assignment inside any token, whatever its case", () => {
  for (const token of ["PASSWORD=hunter2", "passwd=hunter2", "TOKEN=abc", "secret=abc", "api_key=abc", "API-KEY=abc", "credential=abc"]) {
    assert.equal(carriesSecret(`docker run -e ${token} alpine:3.20`), true, token);
  }
});

// console-command.md — "-p ... counts only on a login command"; on `docker run` it is the port flag
test("carriesSecret treats -p as a secret on a login command", () => {
  assert.equal(carriesSecret("docker login -p hunter2 registry.example.com"), true);
  assert.equal(carriesSecret("docker login -p=hunter2 registry.example.com"), true);
});

test("carriesSecret does not treat -p as a secret on a docker run command", () => {
  assert.equal(carriesSecret("docker run -d -p 8080:80 --name web alpine:3.20"), false);
  assert.equal(carriesSecret("docker run -p 8080:80 -p 9090:90 alpine:3.20"), false);
});

// console-command.md — "True for a body key naming a credential — password, passwd,
// identity_token, registry_token, registryauth, auth, token, secret, credential, api_key
// (case-insensitive, with or without its quotes, followed by :)"
test("carriesSecret recognises a credential key in an API body, quoted", () => {
  for (const key of ["password", "passwd", "identity_token", "registry_token", "registryauth", "auth", "token", "secret", "credential", "api_key"]) {
    assert.equal(carriesSecret(`POST /auth {"Username":"u","${key}":"hunter2"}`), true, `"${key}" quoted`);
    assert.equal(carriesSecret(`POST /auth {"Username":"u","${key.toUpperCase()}":"hunter2"}`), true, `"${key}" upper-cased`);
  }
});

test("carriesSecret recognises a credential key in an API body written without quotes", () => {
  for (const key of ["password", "identity_token", "registryauth", "api_key"]) {
    assert.equal(carriesSecret(`POST /auth {${key}: hunter2}`), true, `${key} bare`);
  }
});

test("carriesSecret recognises the plain Engine API auth call", () => {
  assert.equal(carriesSecret('POST /auth {"Username":"u","Password":"p"}'), true);
  assert.equal(carriesSecret('POST /images/create?fromImage=x X-Registry-Auth: {"identitytoken":"abc"}'), true);
});

// console-command.md — "A word only counts as a body key when a : follows it, so a query filter
// (filters={"status":["running"]}) and a subcommand (docker secret ls) are not mistaken for one."
test("carriesSecret does not mistake a subcommand, a filter or a plain name for a credential key", () => {
  for (const line of [
    "docker secret ls",
    "docker secret inspect my-secret",
    'docker ps --filter status=running --format {{.Names}}',
    'GET /containers/json?filters={"status":["running"]}',
    'GET /volumes?filters={"dangling":["true"]}',
    "docker logs token",
    "docker inspect token",
    "docker rm -f my-token-container",
    "GET /containers/token/json",
  ]) {
    assert.equal(carriesSecret(line), false, `${line} was taken for a credential`);
  }
});

test("carriesSecret answers false for an ordinary read-only command", () => {
  assert.equal(carriesSecret("docker ps -a"), false);
  assert.equal(carriesSecret("GET /containers/json?all=1"), false);
});

// console-command.md — "True for a line that cannot be tokenized at all: an unread line is assumed
// to carry one."
test("carriesSecret answers true for a line it cannot tokenize", () => {
  assert.equal(carriesSecret(`docker login --password "hunter2`), true);
  assert.equal(carriesSecret(`docker ps 'unterminated`), true);
});

// console-command.md — CLI classification: prune, swarm leave, rm/rmi/remove, kill, stop
test("classifyCommand marks a prune destructive wherever the word appears", () => {
  for (const line of ["docker system prune -a", "docker image prune", "docker prune", "docker volume prune --force"]) {
    const classification = classifyCommand("cli", line);
    assert.equal(classification.destructive, true, line);
    assert.ok((classification.reason ?? "").length > 0, `${line} states no reason`);
  }
});

test("classifyCommand marks a swarm leave destructive, and swarm alone not", () => {
  assert.equal(classifyCommand("cli", "docker swarm leave --force").destructive, true);
  assert.equal(classifyCommand("cli", "docker swarm init").destructive, false);
  assert.equal(classifyCommand("cli", "docker node ls").destructive, false);
});

test("classifyCommand marks a removal destructive whichever noun it is scoped to", () => {
  for (const line of [
    "docker rm my-container",
    "docker rmi alpine:3.20",
    "docker volume rm my-volume",
    "docker network rm my-network",
    "docker plugin remove my-plugin",
  ]) {
    assert.equal(classifyCommand("cli", line).destructive, true, line);
  }
});

// console-command.md — "the reason additionally says it is forced when the line carries --force or a
// short flag containing f, clustered ones included — -fv forces just as -f does"
test("classifyCommand says a forced removal is forced, clustered short flags included", () => {
  for (const line of [
    "docker rm -f my-container",
    "docker rm --force my-container",
    "docker rm --force=true my-container",
    "docker rm -fv my-container",
    "docker rm -vf my-container",
    "docker rmi -F my-image",
  ]) {
    assert.match(classifyCommand("cli", line).reason ?? "", /forc/i, line);
  }
});

test("classifyCommand does not call a removal forced when nothing forces it", () => {
  for (const line of ["docker rm my-container", "docker rm -v my-container", "docker volume rm my-volume"]) {
    assert.doesNotMatch(classifyCommand("cli", line).reason ?? "", /forc/i, line);
  }
});

// console-command.md — a force flag is not what makes a line destructive: `-f` is `docker build`'s
// Dockerfile flag, and that line has no removal verb in it
test("classifyCommand leaves a build with a -f flag non-destructive", () => {
  const build = classifyCommand("cli", "docker build -f Dockerfile.prod -t myimage:latest .");
  assert.equal(build.destructive, false);
  assert.equal(build.reason, undefined);
});

test("classifyCommand marks kill and stop destructive", () => {
  assert.equal(classifyCommand("cli", "docker kill my-container").destructive, true);
  assert.equal(classifyCommand("cli", "docker stop my-container").destructive, true);
  assert.equal(classifyCommand("cli", "docker container stop my-container").destructive, true);
});

// console-command.md — "Anything else is not destructive — including build, stack deploy, buildx
// build and context create, which are exactly the commands this console has to keep reachable."
test("classifyCommand leaves the commands this console exists to keep reachable non-destructive", () => {
  for (const line of [
    "docker build -t myimage:latest .",
    "docker stack deploy -c docker-compose.yml mystack",
    "docker buildx build --cache-to type=local,dest=./cache .",
    'docker context create remote --docker "host=tcp://host:2376,ca=./ca.pem,cert=./cert.pem,key=./key.pem"',
    "docker manifest inspect alpine:3.20",
    "docker sbom alpine:3.20",
    "docker buildx bake --print",
    "docker system df -v",
    "docker ps -a",
  ]) {
    const classification = classifyCommand("cli", line);
    assert.equal(classification.destructive, false, `${line} was classified destructive`);
    // "reason is present exactly when destructive is true"
    assert.equal(classification.reason, undefined, `${line} carries a reason without being destructive`);
  }
});

// console-command.md — API classification: DELETE, /prune, /swarm/leave, /kill, /stop
test("classifyCommand marks a DELETE call destructive whatever it targets", () => {
  const classification = classifyCommand("api", "DELETE /containers/abc");
  assert.equal(classification.destructive, true);
  assert.ok((classification.reason ?? "").length > 0);
});

test("classifyCommand marks a prune, a swarm leave, a kill and a stop path destructive", () => {
  for (const line of [
    "POST /containers/prune",
    "POST /images/prune?filters={}",
    "POST /swarm/leave?force=1",
    "POST /containers/abc/kill",
    "POST /containers/abc/stop",
  ]) {
    assert.equal(classifyCommand("api", line).destructive, true, line);
  }
});

test("classifyCommand leaves a read-only or starting API call non-destructive", () => {
  for (const line of ["GET /info", "GET /containers/json?all=1", "POST /containers/abc/start", "POST /build?t=x", "/version"]) {
    const classification = classifyCommand("api", line);
    assert.equal(classification.destructive, false, line);
    assert.equal(classification.reason, undefined, line);
  }
});

// console-command.md — the classification carries the credential judgement for both channels
test("classifyCommand reports carriesSecret alongside the destructive judgement", () => {
  assert.equal(classifyCommand("cli", "docker login --password hunter2 registry.example.com").carriesSecret, true);
  assert.equal(classifyCommand("cli", "docker ps").carriesSecret, false);
  assert.equal(classifyCommand("api", "GET /info").carriesSecret, false);
});

// console-command.md — "Classification never rewrites the line: it only says what it is."
test("classifyCommand answers nothing but the judgement, never a rewritten command", () => {
  assert.deepEqual(Object.keys(classifyCommand("cli", "docker ps")).sort(), ["carriesSecret", "destructive"]);
  assert.deepEqual(Object.keys(classifyCommand("cli", "docker rm -f x")).sort(), ["carriesSecret", "destructive", "reason"]);
});
