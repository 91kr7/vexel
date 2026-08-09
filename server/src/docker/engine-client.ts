// Engine API client for the active context's endpoint: negotiates the API
// version once reachability is confirmed, then prefixes every request path
// with the negotiated version (mirrors the Docker CLI's own negotiation).
import type { IncomingMessage } from "node:http";
import type { Readable } from "node:stream";
import { onActiveEndpointChanged, resolveActiveEndpoint } from "./endpoint.js";
import { DockerDaemonError } from "./errors.js";
import { hijack, requestBuffered, requestBufferedRaw, requestStream, type HijackedConnection } from "./http-client.js";
import type { DockerEndpoint } from "./types.js";

// The highest Engine API version this client was written against.
const CLIENT_MAX_API_VERSION = "1.43";

export interface RawEngineResponse {
  /** The path the request was actually made on, version prefix included. */
  path: string;
  statusCode: number;
  body: string;
  contentType?: string;
}

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

  /**
   * Issues an arbitrary request and hands back what the daemon answered — the
   * status and the body as they came, an error status included, plus the path
   * actually dialed (REQ-101). A path that already carries a version prefix is
   * sent as typed; any other is prefixed with the negotiated one.
   */
  async requestRaw(path: string, options: { method?: string; body?: string } = {}): Promise<RawEngineResponse> {
    const versioned = /^\/v\d+(\.\d+)?\//.test(path);
    const effectivePath = versioned ? path : `/v${(await this.getVersion()).apiVersion}${path}`;
    const response = await requestBufferedRaw(this.endpoint, {
      method: options.method,
      path: effectivePath,
      headers: options.body ? { "content-type": "application/json" } : undefined,
      body: options.body,
    });
    return {
      path: effectivePath,
      statusCode: response.statusCode,
      body: response.body,
      ...(typeof response.headers["content-type"] === "string" ? { contentType: response.headers["content-type"] } : {}),
    };
  }

  async requestStream(
    path: string,
    options: { method?: string; headers?: Record<string, string>; body?: string | Readable } = {},
  ): Promise<IncomingMessage> {
    const version = await this.getVersion();
    // A streamed (non-string) body carries its own Content-Type (e.g. a
    // tarball upload); only a JSON string body gets the default here.
    const headers = typeof options.body === "string" ? { "content-type": "application/json", ...options.headers } : options.headers;
    return requestStream(this.endpoint, {
      method: options.method,
      path: `/v${version.apiVersion}${path}`,
      headers,
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

let sharedClient: EngineClient | undefined;

/**
 * The Engine API client of the active context, shared by every server module.
 * It is discarded and rebuilt as soon as another context becomes active, so no
 * caller ever keeps talking to the previous daemon (REQ-93).
 */
export function getEngineClient(): EngineClient {
  if (!sharedClient) sharedClient = new EngineClient(resolveActiveEndpoint());
  return sharedClient;
}

onActiveEndpointChanged(() => {
  sharedClient = undefined;
});

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
