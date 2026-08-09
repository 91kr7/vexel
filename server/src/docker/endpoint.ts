// The Engine API endpoint of the active Docker context: the single place every
// server module reads its target daemon from (REQ-93).
//
// Precedence mirrors the Docker CLI's own: an operator-set `DOCKER_HOST` wins
// over everything, then the endpoint of the selected context published by the
// contexts area, and failing both the platform's default local socket.
import { join } from "node:path";
import type { DockerEndpoint, TlsOptions } from "./types.js";

let selectedEndpoint: DockerEndpoint | undefined;
const changeListeners = new Set<() => void>();

export function resolveActiveEndpoint(): DockerEndpoint {
  const dockerHost = process.env.DOCKER_HOST;
  if (dockerHost) return parseDockerHost(dockerHost);
  return selectedEndpoint ?? defaultLocalSocket();
}

/**
 * Publishes the endpoint of the context that has just become active; `undefined`
 * falls back to the platform default. Notifies every listener when the resulting
 * active endpoint actually changes, so the Engine API client and the daemon event
 * stream re-establish themselves against the new daemon (REQ-93).
 */
export function setActiveEndpoint(endpoint: DockerEndpoint | undefined): void {
  const before = resolveActiveEndpoint();
  selectedEndpoint = endpoint;
  const after = resolveActiveEndpoint();
  if (sameEndpoint(before, after)) return;
  changeListeners.forEach((listener) => listener());
}

/** Registers `listener` to run whenever the active endpoint changes; returns the unsubscribe function. */
export function onActiveEndpointChanged(listener: () => void): () => void {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

/**
 * Whether the active endpoint comes from an operator-set `DOCKER_HOST`, as
 * opposed to the selected Docker context or the platform-default local socket.
 * A CLI spawn cares about this distinction: forcing `DOCKER_HOST` on every call
 * makes tools that keep per-context local state (e.g. buildx's current-builder
 * file) key that state on the forced value rather than on the operator's real
 * named Docker context — and the CLI resolves that context by itself, from the
 * very configuration `docker context use` writes.
 */
export function isExplicitEndpoint(): boolean {
  return process.env.DOCKER_HOST !== undefined;
}

/**
 * Turns a Docker endpoint URL (`unix://…`, `ssh://…`, `tcp://…`) into the
 * endpoint the transports dial. `tls` is supplied by the caller, which is the
 * only side that knows where a context stores its TLS material.
 */
export function parseEndpointUrl(value: string, tls?: TlsOptions): DockerEndpoint {
  if (value.startsWith("unix://")) return { kind: "unix", socketPath: value.slice("unix://".length) };
  if (value.startsWith("npipe://")) return { kind: "unix", socketPath: value.slice("npipe://".length) };
  if (value.startsWith("ssh://")) return { kind: "ssh", destination: value.slice("ssh://".length) };
  if (value.startsWith("tcp://") || value.startsWith("http://") || value.startsWith("https://")) {
    const url = new URL(value.replace(/^tcp:\/\//, "http://"));
    return { kind: "tcp", host: url.hostname, port: Number(url.port) || (tls ? 2376 : 2375), tls };
  }
  return defaultLocalSocket();
}

export function defaultLocalSocket(): DockerEndpoint {
  const socketPath = process.platform === "win32" ? "\\\\.\\pipe\\docker_engine" : "/var/run/docker.sock";
  return { kind: "unix", socketPath };
}

function parseDockerHost(value: string): DockerEndpoint {
  return parseEndpointUrl(value, readTlsOptionsFromEnv());
}

function readTlsOptionsFromEnv(): TlsOptions | undefined {
  if (process.env.DOCKER_TLS_VERIFY !== "1") return undefined;
  const certPath = process.env.DOCKER_CERT_PATH;
  if (!certPath) return undefined;
  return {
    ca: join(certPath, "ca.pem"),
    cert: join(certPath, "cert.pem"),
    key: join(certPath, "key.pem"),
  };
}

function sameEndpoint(a: DockerEndpoint, b: DockerEndpoint): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
