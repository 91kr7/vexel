// Engine API client for the active context's endpoint: negotiates the API
// version once reachability is confirmed, then prefixes every request path
// with the negotiated version (mirrors the Docker CLI's own negotiation).
import type { IncomingMessage } from "node:http";
import { DockerDaemonError } from "./errors.js";
import { hijack, requestBuffered, requestStream, type HijackedConnection } from "./http-client.js";
import type { DockerEndpoint } from "./types.js";

// The highest Engine API version this client was written against.
const CLIENT_MAX_API_VERSION = "1.43";

export interface EngineVersion {
  apiVersion: string;
  engineVersion: string;
  minApiVersion?: string;
}

export class EngineClient {
  constructor(private readonly endpoint: DockerEndpoint) {}

  /** Queries `/version` and negotiates the API version to use for subsequent requests. */
  async getVersion(): Promise<EngineVersion> {
    const response = await requestBuffered(this.endpoint, { path: "/version" });
    const payload = JSON.parse(response.body) as { ApiVersion?: string; Version?: string; MinAPIVersion?: string };
    if (!payload.ApiVersion) {
      throw new DockerDaemonError("UnsupportedApiVersion", "Daemon did not report an Engine API version");
    }
    const negotiated = negotiateApiVersion(payload.ApiVersion, payload.MinAPIVersion);
    return {
      apiVersion: negotiated,
      engineVersion: payload.Version ?? "unknown",
      minApiVersion: payload.MinAPIVersion,
    };
  }

  async request(path: string, options: { method?: string; body?: string } = {}): Promise<{ statusCode: number; body: string }> {
    const version = await this.getVersion();
    const response = await requestBuffered(this.endpoint, {
      method: options.method,
      path: `/v${version.apiVersion}${path}`,
      headers: options.body ? { "content-type": "application/json" } : undefined,
      body: options.body,
    });
    return { statusCode: response.statusCode, body: response.body };
  }

  async requestStream(path: string, options: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<IncomingMessage> {
    const version = await this.getVersion();
    return requestStream(this.endpoint, {
      method: options.method,
      path: `/v${version.apiVersion}${path}`,
      headers: options.body ? { "content-type": "application/json", ...options.headers } : options.headers,
      body: options.body,
    });
  }

  /** Opens a hijacked (exec start, attach) raw duplex stream against the negotiated API version. */
  async hijack(path: string, options: { method?: string; body?: string } = {}): Promise<HijackedConnection> {
    const version = await this.getVersion();
    return hijack(this.endpoint, {
      method: options.method ?? "POST",
      path: `/v${version.apiVersion}${path}`,
      headers: options.body ? { "content-type": "application/json" } : undefined,
      body: options.body,
    });
  }
}

function negotiateApiVersion(daemonApiVersion: string, daemonMinApiVersion: string | undefined): string {
  let negotiated = compareApiVersions(daemonApiVersion, CLIENT_MAX_API_VERSION) < 0 ? daemonApiVersion : CLIENT_MAX_API_VERSION;
  if (daemonMinApiVersion && compareApiVersions(negotiated, daemonMinApiVersion) < 0) {
    negotiated = daemonMinApiVersion;
  }
  return negotiated;
}

function compareApiVersions(a: string, b: string): number {
  const [aMajor, aMinor] = a.split(".").map(Number);
  const [bMajor, bMinor] = b.split(".").map(Number);
  return aMajor !== bMajor ? aMajor - bMajor : aMinor - bMinor;
}
