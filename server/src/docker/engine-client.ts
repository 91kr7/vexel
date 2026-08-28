// Engine API client for the active context's endpoint: prefixes every request
// path with the negotiated API version (mirrors the Docker CLI's own
// negotiation), which it negotiates once and holds — while `getVersion()` stays
// a real call, since it is also the reachability probe.
import type { IncomingMessage } from "node:http";
import type { Readable } from "node:stream";
import { onActiveEndpointChanged, resolveActiveEndpoint } from "./endpoint.js";
import { DockerDaemonError } from "./errors.js";
import { hijack, requestBuffered, requestBufferedRaw, requestStream, type HijackedConnection } from "./http-client.js";
import type { DockerEndpoint } from "./types.js";

// The pool of daemon connections is an internal of the transport; the seam that
// discards it is part of this client's surface (refresh_cache/REQ-5).
export { resetConnectionPools } from "./http-client.js";

// The highest Engine API version this client was written against. Exported
// because it is also the Engine API baseline the product's coverage statement
// refers to (REQ-106): the number is declared once, here, and read from there.
export const CLIENT_MAX_API_VERSION = "1.43";

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
  /**
   * The version the request paths are composed with, or the negotiation in
   * flight while there is one (refresh_cache/REQ-31). Held **on the instance**:
   * the shared client is discarded when the active endpoint changes, so it
   * cannot outlive the daemon it was negotiated with (refresh_cache/REQ-34).
   */
  private heldApiVersion?: Promise<string>;

  constructor(private readonly endpoint: DockerEndpoint) {}

  /**
   * Queries `/version` and negotiates the API version — **a real call on every
   * invocation**, because this is also how reachability is probed and the only
   * way to report the daemon's own versions (refresh_cache/REQ-32). A
   * negotiation that reached the daemon becomes what the paths are composed
   * with from then on (refresh_cache/REQ-33); one that failed leaves the held
   * value untouched and is raised to the caller.
   */
  async getVersion(): Promise<EngineVersion> {
    const version = await this.negotiateWithDaemon();
    this.heldApiVersion = Promise.resolve(version.apiVersion);
    return version;
  }

  /**
   * The version a request path is composed with: the held one, negotiated once
   * on a miss (refresh_cache/REQ-31). Calls arriving while a negotiation is in
   * flight wait on that one instead of each starting their own. A failure is
   * never held (refresh_cache/REQ-35): the next call negotiates again.
   */
  private async pathApiVersion(): Promise<string> {
    const held = this.heldApiVersion;
    if (held) return held;
    const negotiating = this.negotiateWithDaemon().then((version) => version.apiVersion);
    this.heldApiVersion = negotiating;
    try {
      return await negotiating;
    } catch (error) {
      if (this.heldApiVersion === negotiating) this.heldApiVersion = undefined;
      throw error;
    }
  }

  private async negotiateWithDaemon(): Promise<EngineVersion> {
    const response = await requestBuffered(this.endpoint, { path: "/version" });
    const payload = parseVersionPayload(response.body);
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
    const apiVersion = await this.pathApiVersion();
    const response = await requestBuffered(this.endpoint, {
      method: options.method,
      path: `/v${apiVersion}${path}`,
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
    const effectivePath = versioned ? path : `/v${await this.pathApiVersion()}${path}`;
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
    const apiVersion = await this.pathApiVersion();
    // A streamed (non-string) body carries its own Content-Type (e.g. a
    // tarball upload); only a JSON string body gets the default here.
    const headers = typeof options.body === "string" ? { "content-type": "application/json", ...options.headers } : options.headers;
    return requestStream(this.endpoint, {
      method: options.method,
      path: `/v${apiVersion}${path}`,
      headers,
      body: options.body,
    });
  }

  /** Opens a hijacked (exec start, attach) raw duplex stream against the negotiated API version. */
  async hijack(path: string, options: { method?: string; body?: string } = {}): Promise<HijackedConnection> {
    const apiVersion = await this.pathApiVersion();
    return hijack(this.endpoint, {
      method: options.method ?? "POST",
      path: `/v${apiVersion}${path}`,
      headers: options.body ? { "content-type": "application/json" } : undefined,
      body: options.body,
    });
  }
}

let sharedClient: EngineClient | undefined;

/**
 * The Engine API client of the active context, shared by every server module.
 * It is discarded and rebuilt as soon as another context becomes active, so no
 * caller ever keeps talking to the previous daemon (REQ-93) — and the version it
 * held goes with it, since that version is the previous daemon's
 * (refresh_cache/REQ-34).
 */
export function getEngineClient(): EngineClient {
  if (!sharedClient) sharedClient = new EngineClient(resolveActiveEndpoint());
  return sharedClient;
}

onActiveEndpointChanged(() => {
  sharedClient = undefined;
});

interface VersionPayload {
  ApiVersion?: string;
  Version?: string;
  MinAPIVersion?: string;
}

// A negotiation is how an endpoint is first reached, so one answering /version
// with something other than JSON would otherwise surface as a parse failure of
// ours rather than as the typed daemon error the callers already handle.
function parseVersionPayload(body: string): VersionPayload {
  try {
    return JSON.parse(body) as VersionPayload;
  } catch {
    throw new DockerDaemonError("UnsupportedApiVersion", "Daemon answered /version with a body that is not valid JSON");
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
