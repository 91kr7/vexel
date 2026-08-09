import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { CLIENT_MAX_API_VERSION } from "../../src/docker/engine-client.js";
import type { DaemonInfo } from "../../src/contexts/daemon-info-service.js";

// BaselineService states the Docker baseline the coverage claim was written
// against, next to the daemon currently connected (baseline-service.md). The
// daemon-information reading is mocked, so what is under test is only the
// service's own decisions: where the declared half comes from, how the two
// readings are compared, and what an unreachable daemon does to the answer.
//
// No version is written into an assertion: the declared one is read from the
// Engine client's own maximum — proving the invariant that the number is
// declared once — and the daemon's are derived from it, so the file says
// nothing about the machine it runs on.

let daemonInfoResult: () => Promise<DaemonInfo> = async () => daemonInfoWith({});
let daemonInfoCalls = 0;

mock.module(new URL("../../src/contexts/daemon-info-service.ts", import.meta.url).href, {
  namedExports: {
    getDaemonInfo: () => {
      daemonInfoCalls += 1;
      return daemonInfoResult();
    },
  },
});

const { getBaselineReport } = await import("../../src/system/baseline-service.js");

function daemonInfoWith(overrides: Partial<DaemonInfo>): DaemonInfo {
  return {
    version: "27.0.0",
    apiVersion: CLIENT_MAX_API_VERSION,
    minApiVersion: "1.24",
    storageDriver: "overlay2",
    cgroupDriver: "systemd",
    operatingSystem: "Test OS",
    osType: "linux",
    kernelVersion: "6.0.0",
    architecture: "x86_64",
    rootDirectory: "/var/lib/docker",
    containers: { total: 0, running: 0, paused: 0, stopped: 0 },
    ...overrides,
  };
}

/** An Engine API version `steps` minor releases away from the declared baseline. */
function apiVersionOffsetBy(steps: number): string {
  const [major, minor] = CLIENT_MAX_API_VERSION.split(".").map(Number);
  return `${major}.${minor + steps}`;
}

/** An Engine API version `steps` major releases away from the declared baseline. */
function majorVersionOffsetBy(steps: number): string {
  const [major, minor] = CLIENT_MAX_API_VERSION.split(".").map(Number);
  return `${major + steps}.${minor}`;
}

beforeEach(() => {
  daemonInfoCalls = 0;
  daemonInfoResult = async () => daemonInfoWith({});
});

// plan-docker_management_app/REQ-106; baseline-service.md — "The declared Engine API baseline is
// read from the Engine client's own maximum, never restated"
test("declares the Engine API the client itself talks, next to a docker CLI release line", async () => {
  const report = await getBaselineReport();

  assert.equal(report.declared.engineApiVersion, CLIENT_MAX_API_VERSION);
  assert.equal(typeof report.declared.cliVersion, "string");
  assert.ok(report.declared.cliVersion.length > 0, "the declared CLI release line must be stated");
});

// baseline-service.md — "same major and minor -> match"
test("reports a match when the daemon serves exactly the declared Engine API", async () => {
  daemonInfoResult = async () => daemonInfoWith({ apiVersion: CLIENT_MAX_API_VERSION, version: "24.0.7" });

  const report = await getBaselineReport();

  assert.equal(report.comparison, "match");
  assert.deepEqual(report.daemon, { version: "24.0.7", apiVersion: CLIENT_MAX_API_VERSION, minApiVersion: "1.24" });
  assert.equal(report.daemonUnavailableDetail, undefined);
});

// baseline-service.md — "daemon above the declared baseline -> daemon-newer"
test("reports the daemon as newer when it serves a higher Engine API than the declared one", async () => {
  for (const apiVersion of [apiVersionOffsetBy(1), apiVersionOffsetBy(10), majorVersionOffsetBy(1)]) {
    daemonInfoResult = async () => daemonInfoWith({ apiVersion });

    const report = await getBaselineReport();

    assert.equal(report.comparison, "daemon-newer", `expected ${apiVersion} to read as newer than ${CLIENT_MAX_API_VERSION}`);
  }
});

// baseline-service.md — "daemon below the declared baseline -> daemon-older"
test("reports the daemon as older when it serves a lower Engine API than the declared one", async () => {
  for (const apiVersion of [apiVersionOffsetBy(-1), apiVersionOffsetBy(-10), majorVersionOffsetBy(-1)]) {
    daemonInfoResult = async () => daemonInfoWith({ apiVersion });

    const report = await getBaselineReport();

    assert.equal(report.comparison, "daemon-older", `expected ${apiVersion} to read as older than ${CLIENT_MAX_API_VERSION}`);
  }
});

// baseline-service.md — "either version not '<major>.<minor>' -> unknown"
test("cannot compare a daemon whose Engine API is not a major.minor version", async () => {
  for (const apiVersion of ["", "1", "1.43.2", "v1.43", "latest"]) {
    daemonInfoResult = async () => daemonInfoWith({ apiVersion });

    const report = await getBaselineReport();

    assert.equal(report.comparison, "unknown", `expected ${JSON.stringify(apiVersion)} to be incomparable`);
  }
});

// plan-docker_management_app/REQ-106; baseline-service.md — "An unreachable daemon never fails the
// reading ... The failure travels in daemonUnavailableDetail, and comparison is then unknown"
test("still declares the baseline when the daemon cannot be read, carrying the failure in the body", async () => {
  daemonInfoResult = async () => {
    throw new Error("Connection refused by the Docker endpoint");
  };

  const report = await getBaselineReport();

  assert.equal(report.declared.engineApiVersion, CLIENT_MAX_API_VERSION);
  assert.equal(report.daemon, undefined);
  assert.equal(report.daemonUnavailableDetail, "Connection refused by the Docker endpoint");
  assert.equal(report.comparison, "unknown");
});

// baseline-service.md — "minApiVersion: ... the oldest it accepts" is reported only when the daemon
// gives it; "daemonUnavailableDetail ... present exactly when daemon is absent"
test("omits the oldest accepted Engine API when the daemon does not report one, and stays available", async () => {
  daemonInfoResult = async () => {
    const info = daemonInfoWith({});
    delete info.minApiVersion;
    return info;
  };

  const report = await getBaselineReport();

  assert.ok(report.daemon, "the daemon half must still be present");
  assert.equal(report.daemon?.minApiVersion, undefined);
  assert.equal(report.daemonUnavailableDetail, undefined);
});

// baseline-service.md — "The daemon's versions come from the existing daemon-information reading of
// the active context, so the version is never queried a second way"
test("reads the daemon exactly once, through the daemon-information reading", async () => {
  await getBaselineReport();

  assert.equal(daemonInfoCalls, 1);
});
