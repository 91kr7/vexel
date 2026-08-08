import { test } from "node:test";
import assert from "node:assert/strict";
import { runComposeUp } from "../../src/compose/compose-lifecycle-service.js";

// compose-lifecycle-service.md — "exactly one of onResult ... or onError ... fires once, at the
// end". `runCliCommand`'s own `done` still resolves after a spawn failure (docker-access/specs/
// cli-runner.md), so this guards against onError from onSpawnError being followed by a second,
// spurious terminal call once `done` settles.
test("runComposeUp fires exactly one terminal handler when the docker binary cannot be spawned", async () => {
  const originalPath = process.env.PATH;
  process.env.PATH = "";
  try {
    const terminalCalls: string[] = [];
    runComposeUp("irrelevant-project", ["/tmp/does-not-matter.yml"], {
      onOutput: () => undefined,
      onResult: () => terminalCalls.push("result"),
      onError: (message) => terminalCalls.push(`error:${message}`),
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
