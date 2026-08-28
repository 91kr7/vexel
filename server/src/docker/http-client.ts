// Minimal HTTP/1.1 request/stream helpers over a DockerEndpoint. Reuses Node's
// own http module (header parsing, chunked transfer decoding, streaming) by
// handing it an already-dialed socket through a custom Agent, so unix, TCP(+TLS)
// and ssh endpoints are all served by the same request path. Buffered calls go
// through a pool of connections held open per endpoint; streams and hijacked
// connections are dialed on their own.
import http from "node:http";
import type { ClientRequestArgs } from "node:http";
import type { Duplex, Readable } from "node:stream";
import { dial } from "./transport.js";
import { onActiveEndpointChanged } from "./endpoint.js";
import { DockerDaemonError } from "./errors.js";
import type { DockerEndpoint } from "./types.js";

class EndpointAgent extends http.Agent {
  constructor(
    private readonly endpoint: DockerEndpoint,
    options: http.AgentOptions = { keepAlive: false },
  ) {
    super(options);
  }

  override createConnection(_options: ClientRequestArgs, callback: (error: Error | null, socket: Duplex) => void): undefined {
    dial(this.endpoint)
      .then((socket) => callback(null, socket))
      .catch((error: Error) => callback(error, undefined as unknown as Duplex));
    return undefined;
  }
}

// Dialing costs a TLS handshake, or a whole `ssh` process, on every call to a
// remote context, so calls share connections that stay open between them
// (plan-docker_management_app-refresh_cache/REQ-4). Bounded: a burst is served
// by at most this many links, and only a few are held once it is over.
const MAX_CONNECTIONS_PER_ENDPOINT = 16;
const MAX_IDLE_CONNECTIONS_PER_ENDPOINT = 4;

// One pool per endpoint, keyed by the endpoint itself: a connection opened for
// one daemon is never handed to a call meant for another (REQ-5).
const pools = new Map<string, EndpointAgent>();

function pooledAgent(endpoint: DockerEndpoint): EndpointAgent {
  const key = JSON.stringify(endpoint);
  let agent = pools.get(key);
  if (!agent) {
    agent = new EndpointAgent(endpoint, {
      keepAlive: true,
      maxSockets: MAX_CONNECTIONS_PER_ENDPOINT,
      maxFreeSockets: MAX_IDLE_CONNECTIONS_PER_ENDPOINT,
    });
    pools.set(key, agent);
  }
  return agent;
}

/**
 * Closes every held connection and empties the pools. Called when the active
 * endpoint changes, so nothing opened for the daemon just left behind survives
 * (REQ-5); also the seam a check uses to start from no connection at all.
 */
export function resetConnectionPools(): void {
  pools.forEach((agent) => agent.destroy());
  pools.clear();
}

onActiveEndpointChanged(resetConnectionPools);

export interface DockerRequestOptions {
  method?: string;
  path: string;
  headers?: Record<string, string>;
  /** A `Readable` streams the request body (e.g. a tarball read from disk) instead of buffering it. */
  body?: string | Readable;
}

export interface BufferedResponse {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

function send(endpoint: DockerEndpoint, options: DockerRequestOptions, agent: http.Agent): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const request = http.request({
      agent,
      method: options.method ?? "GET",
      path: options.path,
      // A Host header is required by HTTP/1.1 even though the socket bypasses DNS.
      headers: { host: "docker", ...options.headers },
    });
    request.once("response", resolve);
    request.once("error", (error: NodeJS.ErrnoException) =>
      reject(new DockerDaemonError("DaemonUnreachable", describeConnectionError(error), error)),
    );
    if (options.body && typeof options.body !== "string") {
      options.body.once("error", (error: Error) => request.destroy(error));
      options.body.pipe(request);
    } else {
      request.end(options.body);
    }
  });
}

/**
 * The daemon's answer as it came, an error status included: for the caller that
 * has to show the status and body themselves (the raw console, REQ-101) rather
 * than have a rejection raised in their place.
 */
export async function requestBufferedRaw(endpoint: DockerEndpoint, options: DockerRequestOptions): Promise<BufferedResponse> {
  const response = await send(endpoint, options, pooledAgent(endpoint));
  const body = await readAll(response);
  return { statusCode: response.statusCode ?? 0, headers: response.headers, body };
}

export async function requestBuffered(endpoint: DockerEndpoint, options: DockerRequestOptions): Promise<BufferedResponse> {
  const response = await requestBufferedRaw(endpoint, options);
  if (response.statusCode >= 400) {
    throw new DockerDaemonError(
      "DaemonRejected",
      extractDaemonMessage(response.body) ?? `Daemon returned HTTP ${response.statusCode}`,
      undefined,
      response.statusCode,
    );
  }
  return response;
}

/**
 * A stream owns its connection for as long as it runs — a log follow lasts
 * minutes — so it is dialed outside the pool and its connection is never
 * offered to another call.
 */
export async function requestStream(endpoint: DockerEndpoint, options: DockerRequestOptions): Promise<http.IncomingMessage> {
  const response = await send(endpoint, options, new EndpointAgent(endpoint));
  if ((response.statusCode ?? 0) >= 400) {
    const body = await readAll(response);
    throw new DockerDaemonError(
      "DaemonRejected",
      extractDaemonMessage(body) ?? `Daemon returned HTTP ${response.statusCode}`,
      undefined,
      response.statusCode,
    );
  }
  return response;
}

export interface HijackedConnection {
  socket: Duplex;
  head: Buffer;
}

/**
 * Sends a request that asks the daemon to hijack the connection (exec start,
 * attach): on success the daemon switches protocols and the raw duplex socket
 * carries the multiplexed/tty stdio directly, with no further HTTP framing.
 * Dialed outside the pool for that reason: the caller keeps the connection.
 */
export function hijack(endpoint: DockerEndpoint, options: DockerRequestOptions): Promise<HijackedConnection> {
  return new Promise((resolve, reject) => {
    const agent = new EndpointAgent(endpoint);
    const request = http.request({
      agent,
      method: options.method ?? "POST",
      path: options.path,
      headers: { host: "docker", connection: "Upgrade", upgrade: "tcp", ...options.headers },
    });
    request.once("upgrade", (_response, socket: Duplex, head: Buffer) => {
      resolve({ socket, head });
    });
    request.once("response", (response) => {
      readAll(response)
        .then((body) =>
          reject(
            new DockerDaemonError(
              "DaemonRejected",
              extractDaemonMessage(body) ?? `Daemon returned HTTP ${response.statusCode}`,
              undefined,
              response.statusCode,
            ),
          ),
        )
        .catch(reject);
    });
    request.once("error", (error: NodeJS.ErrnoException) =>
      reject(new DockerDaemonError("DaemonUnreachable", describeConnectionError(error), error)),
    );
    request.end(options.body);
  });
}

async function readAll(response: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  try {
    for await (const chunk of response) chunks.push(chunk as Buffer);
  } catch (error) {
    // A connection dropped while the body was in flight is a failure of the
    // link to the daemon, not of ours: it must reach the caller as the typed
    // error every other transport failure does, or it is reported as a fault
    // of the application. This is also the only place that reports it — the
    // request's own "error" listener can no longer reject once the response
    // has resolved.
    throw new DockerDaemonError("DaemonUnreachable", describeReadError(error as NodeJS.ErrnoException), error);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function extractDaemonMessage(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { message?: unknown };
    return typeof parsed.message === "string" ? parsed.message : undefined;
  } catch {
    return body.trim() || undefined;
  }
}

function describeReadError(error: NodeJS.ErrnoException): string {
  if (error.code === "ECONNRESET") return "The Docker endpoint closed the connection while the response was being read";
  return `Reading the Docker endpoint's response failed: ${error.message}`;
}

function describeConnectionError(error: NodeJS.ErrnoException): string {
  if (error.code === "ENOENT") return "Docker socket not found — is Docker running?";
  if (error.code === "ECONNREFUSED") return "Connection refused by the Docker endpoint";
  return error.message;
}
