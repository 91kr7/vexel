// Resolves the Engine API endpoint of the active Docker context.
//
// Context management (batch F25) is not built yet: for now the "active context"
// is read from the standard Docker environment variables (DOCKER_HOST,
// DOCKER_TLS_VERIFY, DOCKER_CERT_PATH), falling back to the platform's default
// local socket — the same defaults the `docker` CLI itself uses.
import { join } from "node:path";
import type { DockerEndpoint, TlsOptions } from "./types.js";

export function resolveActiveEndpoint(): DockerEndpoint {
  const dockerHost = process.env.DOCKER_HOST;
  return dockerHost ? parseDockerHost(dockerHost) : defaultLocalSocket();
}

function defaultLocalSocket(): DockerEndpoint {
  const socketPath = process.platform === "win32" ? "\\\\.\\pipe\\docker_engine" : "/var/run/docker.sock";
  return { kind: "unix", socketPath };
}

function parseDockerHost(value: string): DockerEndpoint {
  if (value.startsWith("unix://")) {
    return { kind: "unix", socketPath: value.slice("unix://".length) };
  }
  if (value.startsWith("ssh://")) {
    return { kind: "ssh", destination: value.slice("ssh://".length) };
  }
  if (value.startsWith("tcp://") || value.startsWith("http://") || value.startsWith("https://")) {
    const url = new URL(value.replace(/^tcp:\/\//, "http://"));
    const tls = readTlsOptionsFromEnv();
    return { kind: "tcp", host: url.hostname, port: Number(url.port) || (tls ? 2376 : 2375), tls };
  }
  return defaultLocalSocket();
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
