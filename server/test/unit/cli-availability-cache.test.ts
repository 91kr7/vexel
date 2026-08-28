import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectCliAvailability, resetCliAvailabilityCache } from "../../src/docker/cli-runner.js";

/** A stand-in `docker` on `PATH` that records every invocation and fails `failingArgument`: the probes are only countable from outside the process. */
async function withRecordingDocker(run: (invocations: () => Promise<number>) => Promise<void>, failingArgument?: string): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "vexel-cli-probe-"));
  const logPath = join(directory, "invocations.log");
  const failure = failingArgument === undefined ? "" : `if [ "$1" = "${failingArgument}" ]; then exit 1; fi\n`;
  const script = `#!/bin/sh\necho "$@" >> "${logPath}"\n${failure}echo "Docker version 27.0.0, build abcdef"\n`;
  await writeFile(join(directory, "docker"), script, { mode: 0o755 });
  const originalPath = process.env.PATH;
  process.env.PATH = directory;
  try {
    await run(async () => {
      const log = await readFile(logPath, "utf8").catch(() => "");
      return log.split("\n").filter((line) => line !== "").length;
    });
  } finally {
    process.env.PATH = originalPath;
    await rm(directory, { recursive: true, force: true });
  }
}

beforeEach(resetCliAvailabilityCache);

// plan-docker_management_app-refresh_cache/REQ-1, plan-docker_management_app-refresh_cache/REQ-3
test("detectCliAvailability runs the three programs on the first call and none on the next, answering the same thing", async () => {
  await withRecordingDocker(async (invocations) => {
    const first = await detectCliAvailability();
    const afterFirst = await invocations();
    const second = await detectCliAvailability();

    assert.equal(afterFirst, 3, "the first call is expected to probe docker, compose and buildx once each");
    assert.equal(await invocations(), 3, "a later call is expected to start no process at all");
    assert.equal(first.docker.available, true);
    assert.deepEqual(second, first);
  });
});

// plan-docker_management_app-refresh_cache/REQ-1
test("detectCliAvailability called again while the first call is still in flight probes only once", async () => {
  await withRecordingDocker(async (invocations) => {
    const [first, second] = await Promise.all([detectCliAvailability(), detectCliAvailability()]);

    assert.equal(await invocations(), 3, "two concurrent callers are expected to share one probe");
    assert.deepEqual(second, first);
  });
});

// plan-docker_management_app-refresh_cache/REQ-3
test("detectCliAvailability keeps and reuses a degraded answer, without probing again for the absent tool", async () => {
  await withRecordingDocker(async (invocations) => {
    const first = await detectCliAvailability();
    const second = await detectCliAvailability();

    assert.deepEqual(first.buildx, { available: false });
    assert.equal(first.docker.available, true);
    assert.equal(await invocations(), 3, "the degraded entry is expected to be kept, not probed again");
    assert.deepEqual(second, first);
  }, "buildx");
});

// plan-docker_management_app-refresh_cache/REQ-1, plan-docker_management_app-refresh_cache/REQ-3
test("detectCliAvailability reports the version the program printed, and reports it again unchanged", async () => {
  await withRecordingDocker(async () => {
    const first = await detectCliAvailability();
    const second = await detectCliAvailability();

    for (const tool of [first.docker, first.compose, first.buildx]) {
      assert.equal(tool.available, true);
      assert.ok(typeof tool.version === "string" && tool.version.includes("27.0.0"), "the version is expected to come from what the program printed");
    }
    assert.deepEqual(second, first);
  });
});

// plan-docker_management_app-refresh_cache/REQ-1 — what is kept is the probe's own answer:
// discarding it probes the three programs again and yields the same thing.
test("detectCliAvailability probes the three programs again once the remembered answer is discarded", async () => {
  await withRecordingDocker(async (invocations) => {
    const first = await detectCliAvailability();
    resetCliAvailabilityCache();
    const second = await detectCliAvailability();

    assert.equal(await invocations(), 6, "a discarded answer is expected to cost one more probe of the three programs");
    assert.deepEqual(second, first);
  });
});
