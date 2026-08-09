import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { buildApp, createSleepingContainer, removeContainerQuietly, startApp } from "../support/fixtures.js";

const execFileAsync = promisify(execFile);

// The one place a destructive console entry is actually executed. The console
// runs whatever the operator types with the server's own privileges, so the
// only command allowed to run here is one scoped to a container this file
// created and removes — never a prune, never an unscoped removal. It lives in
// the exclusive pass because it is the destructive half of the console's
// contract (REQ-112) and is scheduled apart from everything else.
process.env.VEXEL_DATA_DIR = mkdtempSync(join(tmpdir(), "vexel-console-destructive-"));

const { consoleRouter } = await import("../../src/console/console-routes.js");

async function containerExists(name: string): Promise<boolean> {
  const { stdout } = await execFileAsync("docker", ["ps", "-aq", "--filter", `name=^${name}$`]).catch(() => ({ stdout: "" }));
  return stdout.trim().length > 0;
}

// plan-docker_management_app/REQ-112 — a destructive entry is recognised as such, and the command
// that then runs is the one that was named; console-cli-service.md — "The command runs exactly as it
// was typed ... never rewritten, re-ordered or supplemented with flags of the application's own."
test("a destructive CLI entry is classified as such and, once run, removes exactly what it named", async () => {
  const caseName = "console-destructive-cli";
  const { url, close } = await startApp(buildApp("/api/console", consoleRouter));
  let name = "";
  try {
    ({ name } = await createSleepingContainer(caseName));
    const command = `docker rm -fv ${name}`;

    const classified = await fetch(`${url}/api/console/classify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: "cli", command }),
    });
    const judgement = (await classified.json()) as { destructive: boolean; reason?: string };
    assert.equal(judgement.destructive, true);
    // console-command.md — "-fv forces just as -f does": the clustered short flag is what the
    // project's own convention types, so the operator must be told the removal is forced.
    assert.match(judgement.reason ?? "", /forc/i);
    // Classification alone runs nothing.
    assert.equal(await containerExists(name), true);

    const run = await fetch(`${url}/api/console/cli`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command }),
    });
    assert.equal(run.status, 200);
    const events = (await run.text())
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as { type: string; exitCode?: number | null });
    assert.equal(events[events.length - 1]?.type, "exit");
    assert.equal(events[events.length - 1]?.exitCode, 0);

    assert.equal(await containerExists(name), false, "the confirmed command did not remove the container it named");
  } finally {
    if (name) await removeContainerQuietly(name);
    await close();
  }
});

// plan-docker_management_app/REQ-101, REQ-112 — the API channel's destructive entry: a DELETE is
// recognised, and what runs is the call as it was typed, query included
test("a destructive API entry is classified as such and, once run, deletes exactly what it named", async () => {
  const caseName = "console-destructive-api";
  const { url, close } = await startApp(buildApp("/api/console", consoleRouter));
  let name = "";
  try {
    ({ name } = await createSleepingContainer(caseName));
    const command = `DELETE /containers/${name}?force=1&v=1`;

    const classified = await fetch(`${url}/api/console/classify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: "api", command }),
    });
    const judgement = (await classified.json()) as { destructive: boolean; reason?: string };
    assert.equal(judgement.destructive, true);
    assert.ok((judgement.reason ?? "").length > 0);
    assert.equal(await containerExists(name), true);

    const run = await fetch(`${url}/api/console/api`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command }),
    });
    assert.equal(run.status, 200);
    const payload = (await run.json()) as { method: string; status: number };
    assert.equal(payload.method, "DELETE");
    assert.equal(payload.status, 204, "the daemon did not accept the call as typed");

    assert.equal(await containerExists(name), false, "the container the call named is still there");
  } finally {
    if (name) await removeContainerQuietly(name);
    await close();
  }
});
