import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  defaultLocalSocket,
  isExplicitEndpoint,
  onActiveEndpointChanged,
  parseEndpointUrl,
  resolveActiveEndpoint,
  setActiveEndpoint,
} from "../../src/docker/endpoint.js";

// The Active endpoint is process-wide module state (docker-access/specs/
// active-endpoint.md), so every test restores it — and the environment it reads
// its highest-precedence source from — to what it found.
const originalDockerHost = process.env.DOCKER_HOST;
const originalTlsVerify = process.env.DOCKER_TLS_VERIFY;
const originalCertPath = process.env.DOCKER_CERT_PATH;

function clearDockerEnv(): void {
  delete process.env.DOCKER_HOST;
  delete process.env.DOCKER_TLS_VERIFY;
  delete process.env.DOCKER_CERT_PATH;
}

function restoreDockerEnv(): void {
  if (originalDockerHost === undefined) delete process.env.DOCKER_HOST;
  else process.env.DOCKER_HOST = originalDockerHost;
  if (originalTlsVerify === undefined) delete process.env.DOCKER_TLS_VERIFY;
  else process.env.DOCKER_TLS_VERIFY = originalTlsVerify;
  if (originalCertPath === undefined) delete process.env.DOCKER_CERT_PATH;
  else process.env.DOCKER_CERT_PATH = originalCertPath;
}

beforeEach(() => {
  clearDockerEnv();
  setActiveEndpoint(undefined);
});

afterEach(() => {
  setActiveEndpoint(undefined);
  restoreDockerEnv();
});

// active-endpoint.md — "unix:// / npipe:// -> a socket endpoint"
test("parseEndpointUrl reads a unix URL as a socket endpoint", () => {
  assert.deepEqual(parseEndpointUrl("unix:///var/run/docker.sock"), {
    kind: "unix",
    socketPath: "/var/run/docker.sock",
  });
});

test("parseEndpointUrl reads a Windows named pipe URL as a socket endpoint", () => {
  assert.deepEqual(parseEndpointUrl("npipe:////./pipe/docker_engine"), {
    kind: "unix",
    socketPath: "//./pipe/docker_engine",
  });
});

// active-endpoint.md — "ssh:// -> an SSH destination"
test("parseEndpointUrl reads an ssh URL as an SSH destination", () => {
  assert.deepEqual(parseEndpointUrl("ssh://operator@build-host"), {
    kind: "ssh",
    destination: "operator@build-host",
  });
});

// active-endpoint.md — "tcp://, http://, https:// -> host and port"
test("parseEndpointUrl reads a tcp URL as host and port", () => {
  const endpoint = parseEndpointUrl("tcp://198.51.100.7:2376");

  assert.equal(endpoint.kind, "tcp");
  assert.deepEqual(endpoint, { kind: "tcp", host: "198.51.100.7", port: 2376, tls: undefined });
});

test("parseEndpointUrl reads an https URL as a tcp endpoint too", () => {
  const endpoint = parseEndpointUrl("https://198.51.100.7:2376");

  assert.equal(endpoint.kind, "tcp");
});

// active-endpoint.md — "defaulting to 2376 with TLS material and 2375 without"
test("parseEndpointUrl defaults a portless tcp endpoint to 2375 without TLS material", () => {
  assert.deepEqual(parseEndpointUrl("tcp://198.51.100.7"), {
    kind: "tcp",
    host: "198.51.100.7",
    port: 2375,
    tls: undefined,
  });
});

test("parseEndpointUrl defaults a portless tcp endpoint to 2376 when TLS material is supplied", () => {
  const tls = { ca: "/tls/ca.pem", cert: "/tls/cert.pem", key: "/tls/key.pem" };

  assert.deepEqual(parseEndpointUrl("tcp://198.51.100.7", tls), {
    kind: "tcp",
    host: "198.51.100.7",
    port: 2376,
    tls,
  });
});

// active-endpoint.md — "anything else -> the platform's default local socket"
test("parseEndpointUrl falls back to the platform's default local socket for an unrecognised URL", () => {
  assert.deepEqual(parseEndpointUrl("nonsense-not-a-url"), defaultLocalSocket());
});

// active-endpoint.md — resolution order: DOCKER_HOST -> the published endpoint -> the platform default
test("resolveActiveEndpoint falls back to the platform default when nothing has been published", () => {
  assert.deepEqual(resolveActiveEndpoint(), defaultLocalSocket());
});

test("resolveActiveEndpoint returns the endpoint last published by setActiveEndpoint", () => {
  setActiveEndpoint({ kind: "ssh", destination: "operator@build-host" });

  assert.deepEqual(resolveActiveEndpoint(), { kind: "ssh", destination: "operator@build-host" });
});

test("setActiveEndpoint(undefined) returns to the platform default", () => {
  setActiveEndpoint({ kind: "ssh", destination: "operator@build-host" });

  setActiveEndpoint(undefined);

  assert.deepEqual(resolveActiveEndpoint(), defaultLocalSocket());
});

test("an operator-set DOCKER_HOST takes precedence over the published endpoint", () => {
  setActiveEndpoint({ kind: "ssh", destination: "operator@build-host" });
  process.env.DOCKER_HOST = "unix:///tmp/other-docker.sock";

  assert.deepEqual(resolveActiveEndpoint(), { kind: "unix", socketPath: "/tmp/other-docker.sock" });
});

// active-endpoint.md — "with DOCKER_TLS_VERIFY/DOCKER_CERT_PATH when present"
test("DOCKER_HOST carries the TLS material named by DOCKER_TLS_VERIFY and DOCKER_CERT_PATH", () => {
  process.env.DOCKER_HOST = "tcp://198.51.100.7";
  process.env.DOCKER_TLS_VERIFY = "1";
  process.env.DOCKER_CERT_PATH = "/tls";

  const endpoint = resolveActiveEndpoint();

  assert.equal(endpoint.kind, "tcp");
  assert.deepEqual(endpoint, {
    kind: "tcp",
    host: "198.51.100.7",
    port: 2376,
    tls: { ca: "/tls/ca.pem", cert: "/tls/cert.pem", key: "/tls/key.pem" },
  });
});

// active-endpoint.md — "Notifies every listener only when the resolved active endpoint actually changes"
test("setActiveEndpoint notifies the listeners when the resolved endpoint changes", () => {
  let notifications = 0;
  const unsubscribe = onActiveEndpointChanged(() => (notifications += 1));
  try {
    setActiveEndpoint({ kind: "ssh", destination: "operator@build-host" });

    assert.equal(notifications, 1);
  } finally {
    unsubscribe();
  }
});

test("publishing the same endpoint twice notifies nobody the second time", () => {
  let notifications = 0;
  const unsubscribe = onActiveEndpointChanged(() => (notifications += 1));
  try {
    setActiveEndpoint({ kind: "unix", socketPath: "/tmp/one.sock" });
    setActiveEndpoint({ kind: "unix", socketPath: "/tmp/one.sock" });

    assert.equal(notifications, 1);
  } finally {
    unsubscribe();
  }
});

test("publishing an endpoint while DOCKER_HOST is set notifies nobody, since that variable keeps precedence", () => {
  process.env.DOCKER_HOST = "unix:///tmp/forced.sock";
  let notifications = 0;
  const unsubscribe = onActiveEndpointChanged(() => (notifications += 1));
  try {
    setActiveEndpoint({ kind: "ssh", destination: "operator@build-host" });

    assert.equal(notifications, 0);
    assert.deepEqual(resolveActiveEndpoint(), { kind: "unix", socketPath: "/tmp/forced.sock" });
  } finally {
    unsubscribe();
  }
});

// active-endpoint.md — "onActiveEndpointChanged(listener) ... returns its unsubscribe function"
test("an unsubscribed listener is no longer notified", () => {
  let notifications = 0;
  const unsubscribe = onActiveEndpointChanged(() => (notifications += 1));
  unsubscribe();

  setActiveEndpoint({ kind: "ssh", destination: "operator@build-host" });

  assert.equal(notifications, 0);
});

// active-endpoint.md — "isExplicitEndpoint(): true only when DOCKER_HOST is set in the environment"
test("isExplicitEndpoint is false without DOCKER_HOST, even once an endpoint has been published", () => {
  setActiveEndpoint({ kind: "ssh", destination: "operator@build-host" });

  assert.equal(isExplicitEndpoint(), false);
});

test("isExplicitEndpoint is true when DOCKER_HOST is set", () => {
  process.env.DOCKER_HOST = "unix:///tmp/forced.sock";

  assert.equal(isExplicitEndpoint(), true);
});

// active-endpoint.md — "defaultLocalSocket(): the platform's default local socket"
test("defaultLocalSocket names the platform's own default socket", () => {
  const expected = process.platform === "win32" ? "\\\\.\\pipe\\docker_engine" : "/var/run/docker.sock";

  assert.deepEqual(defaultLocalSocket(), { kind: "unix", socketPath: expected });
});
