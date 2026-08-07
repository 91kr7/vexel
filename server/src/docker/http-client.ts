// Minimal HTTP/1.1 request/stream helpers over a DockerEndpoint. Reuses Node's
// own http module (header parsing, chunked transfer decoding, streaming) by
// handing it an already-dialed socket through a custom Agent, so unix, TCP(+TLS)
// and ssh endpoints are all served by the same request path.
import http from "node:http";
import type { ClientRequestArgs } from "node:http";
import type { Duplex, Readable } from "node:stream";
import { dial } from "./transport.js";
import { DockerDaemonError } from "./errors.js";
import type { DockerEndpoint } from "./types.js";

class EndpointAgent extends http.Agent {
  constructor(private readonly endpoint: DockerEndpoint) {
    super({ keepAlive: false });
  }

  override createConnection(_options: ClientRequestArgs, callback: (error: Error | null, socket: Duplex) => void): undefined {
    dial(this.endpoint)
      .then((socket) => callback(null, socket))
      .catch((error: Error) => callback(error, undefined as unknown as Duplex));
    return undefined;
  }
}

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

function send(endpoint: DockerEndpoint, options: DockerRequestOptions): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const agent = new EndpointAgent(endpoint);
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

export async function requestBuffered(endpoint: DockerEndpoint, options: DockerRequestOptions): Promise<BufferedResponse> {
  const response = await send(endpoint, options);
  const body = await readAll(response);
  if ((response.statusCode ?? 0) >= 400) {
    throw new DockerDaemonError(
      "DaemonRejected",
      extractDaemonMessage(body) ?? `Daemon returned HTTP ${response.statusCode}`,
      undefined,
      response.statusCode,
    );
  }
  return { statusCode: response.statusCode ?? 0, headers: response.headers, body };
}

export async function requestStream(endpoint: DockerEndpoint, options: DockerRequestOptions): Promise<http.IncomingMessage> {
  const response = await send(endpoint, options);
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
  for await (const chunk of response) chunks.push(chunk as Buffer);
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

function describeConnectionError(error: NodeJS.ErrnoException): string {
  if (error.code === "ENOENT") return "Docker socket not found — is Docker running?";
  if (error.code === "ECONNREFUSED") return "Connection refused by the Docker endpoint";
  return error.message;
}
