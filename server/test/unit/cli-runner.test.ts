import { test } from "node:test";
import assert from "node:assert/strict";
import { detectCliAvailability, runCliCommand } from "../../src/docker/cli-runner.js";
import type { DockerEndpoint } from "../../src/docker/types.js";

const localEndpoint: DockerEndpoint = { kind: "unix", socketPath: "/var/run/docker.sock" };

// docker-access/specs/cli-runner.md — a tool missing from PATH reports available:false rather than throwing
test("detectCliAvailability reports docker/compose/buildx unavailable, without throwing, when nothing is on PATH", async () => {
  const originalPath = process.env.PATH;
  process.env.PATH = "";
  try {
    const availability = await detectCliAvailability();
    assert.deepEqual(availability.docker, { available: false });
    assert.deepEqual(availability.compose, { available: false });
    assert.deepEqual(availability.buildx, { available: false });
  } finally {
    process.env.PATH = originalPath;
  }
});

// docker-access/specs/cli-runner.md — a present tool reports available:true with its version
test("detectCliAvailability reports the docker CLI available with a version when it is on PATH", async () => {
  const availability = await detectCliAvailability();
  assert.equal(availability.docker.available, true);
  assert.match(availability.docker.version ?? "", /\d+\.\d+\.\d+/);
});

// docker-access/specs/cli-runner.md — runCliCommand streams stdout and resolves done with the process exit code
test("runCliCommand streams stdout and resolves done with the process exit code", async () => {
  const handle = runCliCommand("docker", ["--version"], localEndpoint);
  let stdout = "";
  handle.onStdout((chunk) => {
    stdout += chunk;
  });

  const result = await handle.done;

  assert.equal(result.exitCode, 0);
  assert.ok(stdout.length > 0);
});

// docker-access/specs/cli-runner.md — cancel() kills the child process; done resolves with a null exit code
test("runCliCommand.cancel() interrupts the process instead of waiting for it to finish", async () => {
  const handle = runCliCommand("sleep", ["5"], localEndpoint);
  const start = Date.now();

  handle.cancel();
  const result = await handle.done;
  const elapsedMs = Date.now() - start;

  assert.equal(result.exitCode, null);
  assert.ok(elapsedMs < 4000, `expected cancellation to interrupt the process well before its 5s duration, took ${elapsedMs}ms`);
});
