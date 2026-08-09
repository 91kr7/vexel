import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Its own data directory: this suite writes the console history, which the
// operator's own `~/.vexel` must never be handed (CLAUDE.md, "Tests").
const dataDir = mkdtempSync(join(tmpdir(), "vexel-console-history-"));
process.env.VEXEL_DATA_DIR = dataDir;

const { appendConsoleHistoryEntry, readConsoleHistory } = await import("../../src/console/console-history-store.js");
const { writeNamespace } = await import("../../src/persistence/local-store.js");

const historyFile = join(dataDir, "console-history.json");

/** The history file's raw text, which is where a credential must never appear. */
function fileText(): string {
  try {
    return readFileSync(historyFile, "utf-8");
  } catch {
    return "";
  }
}

async function resetHistory(): Promise<void> {
  await writeNamespace("console-history", []);
}

// raw-console/specs/console-history-store.md — nothing stored yet reads as an empty history
test("readConsoleHistory answers an empty history before anything has been appended", () => {
  assert.deepEqual(readConsoleHistory(), []);
});

// console-history-store.md — "Answers with the history as it now stands, oldest first"; the id is
// assigned here and the timestamp defaults to now
test("appendConsoleHistoryEntry assigns an id and a timestamp and answers the history oldest first", async () => {
  await resetHistory();
  await appendConsoleHistoryEntry({ channel: "cli", command: "docker ps", status: "exit 0", succeeded: true });
  const entries = await appendConsoleHistoryEntry({ channel: "api", command: "GET /info", status: "HTTP 200", succeeded: true });

  assert.equal(entries.length, 2);
  assert.deepEqual(
    entries.map((entry) => entry.command),
    ["docker ps", "GET /info"],
  );
  assert.notEqual(entries[0]!.id, entries[1]!.id);
  for (const entry of entries) {
    assert.equal(typeof entry.id, "string");
    assert.ok(entry.id.length > 0);
    assert.ok(!Number.isNaN(Date.parse(entry.timestamp)), `${entry.timestamp} is not an ISO-8601 instant`);
  }
  assert.equal(entries[1]!.channel, "api");
  assert.equal(entries[1]!.status, "HTTP 200");
});

// console-history-store.md — "with an optional timestamp (now, when absent)"
test("appendConsoleHistoryEntry keeps a timestamp the caller supplied", async () => {
  await resetHistory();
  const given = "2026-08-09T10:11:12.000Z";
  const [entry] = await appendConsoleHistoryEntry({ channel: "cli", command: "docker version", timestamp: given });
  assert.equal(entry!.timestamp, given);
});

// plan-docker_management_app/REQ-114 — the history survives a restart: a store loaded afresh reads
// back what the previous one wrote
test("a freshly loaded store reads back the entries written before the simulated restart", async () => {
  await resetHistory();
  await appendConsoleHistoryEntry({ channel: "cli", command: "docker system df -v", status: "exit 0", succeeded: true });

  const { readConsoleHistory: readAfterRestart } = await import(
    `../../src/console/console-history-store.js?restart=${Date.now()}`
  );
  const entries = (readAfterRestart as typeof readConsoleHistory)();
  assert.equal(entries.length, 1);
  assert.equal(entries[0]!.command, "docker system df -v");
  assert.equal(entries[0]!.status, "exit 0");
});

// console-history-store.md — "Drops the entry — answering with the unchanged history — when its
// command is blank"
test("appendConsoleHistoryEntry drops a blank command and answers the unchanged history", async () => {
  await resetHistory();
  await appendConsoleHistoryEntry({ channel: "cli", command: "docker ps" });
  const entries = await appendConsoleHistoryEntry({ channel: "cli", command: "   " });
  assert.deepEqual(
    entries.map((entry) => entry.command),
    ["docker ps"],
  );
});

// console-history-store.md — "**A command that could carry a credential is never written to disk.**
// ... The judgement is ConsoleCommand's carriesSecret, applied here rather than trusted from the
// caller, so no route can persist one by omission." Probed on the file itself, not on the answer.
test("appendConsoleHistoryEntry never writes a credential-carrying command to the history file", async () => {
  await resetHistory();
  await appendConsoleHistoryEntry({ channel: "cli", command: "docker ps" });

  const secrets = [
    "docker login -p hunter2-dash-p registry.example.com",
    "docker login --password hunter2-long-flag registry.example.com",
    "docker login --password=hunter2-joined registry.example.com",
    "docker login --password-stdin registry.example.com",
    "docker run -e API_KEY=hunter2-assignment alpine:3.20",
    'docker login --password "hunter2-unterminated',
  ];
  for (const command of secrets) {
    const entries = await appendConsoleHistoryEntry({
      channel: "cli",
      command,
      status: "exit 0",
      succeeded: true,
      output: "Login Succeeded",
    });
    assert.deepEqual(
      entries.map((entry) => entry.command),
      ["docker ps"],
      `${command} reached the history`,
    );
  }

  const onDisk = fileText();
  for (const fragment of ["hunter2", "--password", "API_KEY", "login"]) {
    assert.ok(!onDisk.includes(fragment), `the history file on disk holds ${fragment}`);
  }
});

// console-history-store.md — "That covers both channels: a credential in a CLI flag
// (docker login -p …) and a credential in an API body (POST /auth {"Username":"u","Password":"p"})
// are both refused, since the entry's command is the whole line as typed, body included."
test("appendConsoleHistoryEntry never writes an API body carrying a credential to the history file", async () => {
  await resetHistory();
  await appendConsoleHistoryEntry({ channel: "api", command: "GET /info" });

  const secrets = [
    'POST /auth {"Username":"u","Password":"hunter2-api-quoted"}',
    "POST /auth {password: hunter2-api-bare}",
    'POST /auth {"identity_token":"hunter2-identity"}',
    'POST /auth {"RegistryAuth":"hunter2-registryauth"}',
    'POST /containers/create {"Env":["API_KEY=hunter2-env"]}',
  ];
  for (const command of secrets) {
    const entries = await appendConsoleHistoryEntry({
      channel: "api",
      command,
      status: "HTTP 200",
      succeeded: true,
      output: '{"IdentityToken":"hunter2-answer"}',
    });
    assert.deepEqual(
      entries.map((entry) => entry.command),
      ["GET /info"],
      `${command} reached the history`,
    );
  }

  const onDisk = fileText();
  for (const fragment of ["hunter2", "Password", "identity_token", "RegistryAuth"]) {
    assert.ok(!onDisk.includes(fragment), `the history file on disk holds ${fragment}`);
  }
});

// console-command.md — the false-positive guards: a subcommand, a filter and a plain name are not
// credentials, so those entries are kept like any other
test("appendConsoleHistoryEntry keeps an entry whose words only look like credential keys", async () => {
  await resetHistory();
  const kept = ["docker secret ls", 'GET /containers/json?filters={"status":["running"]}', "docker logs token"];
  for (const command of kept) {
    await appendConsoleHistoryEntry({ channel: "cli", command, status: "exit 0", succeeded: true });
  }

  assert.deepEqual(readConsoleHistory().map((entry) => entry.command), kept);
});

// console-history-store.md — `-p` is a secret only on a login command, so a port mapping is kept
test("appendConsoleHistoryEntry keeps a docker run command whose -p is a port mapping", async () => {
  await resetHistory();
  const entries = await appendConsoleHistoryEntry({
    channel: "cli",
    command: "docker run -d -p 8080:80 alpine:3.20",
    status: "exit 0",
    succeeded: true,
  });
  assert.deepEqual(
    entries.map((entry) => entry.command),
    ["docker run -d -p 8080:80 alpine:3.20"],
  );
  assert.ok(fileText().includes("8080:80"));
});

// console-history-store.md — "The history is capped at the 200 most recent entries; the oldest are dropped."
test("appendConsoleHistoryEntry caps the history at its 200 most recent entries", async () => {
  await resetHistory();
  let entries = [] as Awaited<ReturnType<typeof appendConsoleHistoryEntry>>;
  for (let index = 0; index < 205; index += 1) {
    entries = await appendConsoleHistoryEntry({ channel: "cli", command: `docker ps --filter label=n${index}` });
  }
  assert.equal(entries.length, 200);
  // Oldest first, and the five oldest are the ones that went.
  assert.equal(entries[0]!.command, "docker ps --filter label=n5");
  assert.equal(entries[199]!.command, "docker ps --filter label=n204");
});

// console-history-store.md — "An entry's output is capped at 8192 characters, the remainder replaced
// by a truncation marker"
test("appendConsoleHistoryEntry caps a long output and marks it as truncated", async () => {
  await resetHistory();
  const long = `${"o".repeat(9000)}TAIL-MARKER`;
  const [entry] = await appendConsoleHistoryEntry({ channel: "cli", command: "docker build .", output: long });

  const stored = entry!.output ?? "";
  assert.ok(stored.startsWith("o".repeat(8192)), "the kept head is not the start of the output");
  assert.ok(!stored.includes("TAIL-MARKER"), "the truncated tail is still stored");
  assert.ok(stored.length > 8192, "nothing marks the output as truncated");
  assert.ok(stored.length < 8192 + 200, `the marker is ${stored.length - 8192} characters long`);
});

test("appendConsoleHistoryEntry keeps a short output as it is", async () => {
  await resetHistory();
  const [entry] = await appendConsoleHistoryEntry({ channel: "cli", command: "docker version", output: "Docker version 27.0.0" });
  assert.equal(entry!.output, "Docker version 27.0.0");
});

// console-history-store.md — "A stored record that is not a list ... is left out rather than
// returned: a corrupt file reads as an empty history"
test("readConsoleHistory answers an empty history when the stored record is not a list", async () => {
  await writeNamespace("console-history", { entries: [{ id: "a", channel: "cli", command: "docker ps" }] });
  assert.deepEqual(readConsoleHistory(), []);
});

// console-history-store.md — "any element of it without an id, a command and a known channel, is
// left out rather than returned ... never as a broken entry"
test("readConsoleHistory leaves out an element without an id, a command or a known channel", async () => {
  await writeNamespace("console-history", [
    { id: "kept", channel: "cli", command: "docker ps", timestamp: "2026-08-09T00:00:00.000Z" },
    { channel: "cli", command: "docker ps -a", timestamp: "2026-08-09T00:00:00.000Z" },
    { id: "no-command", channel: "cli", timestamp: "2026-08-09T00:00:00.000Z" },
    { id: "bad-channel", channel: "ftp", command: "docker ps -q", timestamp: "2026-08-09T00:00:00.000Z" },
    "not-an-entry",
    null,
  ]);

  const entries = readConsoleHistory();
  assert.deepEqual(
    entries.map((entry) => entry.id),
    ["kept"],
  );
});
