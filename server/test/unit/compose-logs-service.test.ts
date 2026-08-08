import { test } from "node:test";
import assert from "node:assert/strict";
import { streamComposeLogs } from "../../src/compose/compose-logs-service.js";

// compose-logs-service.md — "onError fires ... on a ... spawn failure; onEnd fires when the
// process ends cleanly". `runCliCommand`'s own `done` still resolves after a spawn failure
// (docker-access/specs/cli-runner.md), so this guards against onError from onSpawnError being
// followed by a spurious onEnd once `done` settles.
test("streamComposeLogs fires exactly one terminal handler when the docker binary cannot be spawned", async () => {
  const originalPath = process.env.PATH;
  process.env.PATH = "";
  try {
    const terminalCalls: string[] = [];
    streamComposeLogs("irrelevant-project", ["/tmp/does-not-matter.yml"], {
      onLine: () => undefined,
      onError: (message) => terminalCalls.push(`error:${message}`),
      onEnd: () => terminalCalls.push("end"),
    });

    // Long enough for both the spawn-error listener and the later `done`
    // resolution to have had their chance to fire.
    await new Promise((resolve) => setTimeout(resolve, 500));

    assert.equal(terminalCalls.length, 1, `expected exactly one terminal call, got ${JSON.stringify(terminalCalls)}`);
    assert.ok(terminalCalls[0]!.startsWith("error:"));
  } finally {
    process.env.PATH = originalPath;
  }
});
