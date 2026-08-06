// Opens the raw duplex connection behind a DockerEndpoint: a unix socket, a
// plain or TLS TCP socket, or (for ssh) the daemon's own stdio tunnel, reached
// by running `docker system dial-stdio` on the remote host over ssh — the
// same mechanism the Docker CLI uses for its ssh:// contexts.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import net from "node:net";
import { Duplex } from "node:stream";
import tls from "node:tls";
import type { DockerEndpoint } from "./types.js";

export function dial(endpoint: DockerEndpoint): Promise<Duplex> {
  switch (endpoint.kind) {
    case "unix":
      return dialUnix(endpoint.socketPath);
    case "tcp":
      return dialTcp(endpoint.host, endpoint.port, endpoint.tls);
    case "ssh":
      return dialSsh(endpoint.destination);
  }
}

function dialUnix(socketPath: string): Promise<Duplex> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ path: socketPath });
    socket.once("connect", () => resolve(socket));
    socket.once("error", reject);
  });
}

function dialTcp(host: string, port: number, tlsOptions?: { ca: string; cert: string; key: string }): Promise<Duplex> {
  return new Promise((resolve, reject) => {
    if (tlsOptions) {
      const socket = tls.connect({
        host,
        port,
        ca: readFileSync(tlsOptions.ca),
        cert: readFileSync(tlsOptions.cert),
        key: readFileSync(tlsOptions.key),
      });
      socket.once("secureConnect", () => resolve(socket));
      socket.once("error", reject);
      return;
    }
    const socket = net.connect({ host, port });
    socket.once("connect", () => resolve(socket));
    socket.once("error", reject);
  });
}

function dialSsh(destination: string): Promise<Duplex> {
  return new Promise((resolve, reject) => {
    const child = spawn("ssh", [destination, "docker", "system", "dial-stdio"], { stdio: ["pipe", "pipe", "pipe"] });
    let settled = false;
    child.once("spawn", () => {
      settled = true;
      resolve(duplexFromChildProcess(child));
    });
    child.once("error", (error) => {
      if (!settled) reject(error);
    });
  });
}

function duplexFromChildProcess(child: import("node:child_process").ChildProcessWithoutNullStreams): Duplex {
  const duplex = new Duplex({
    read() {
      // backpressure is driven by the "data" listener below
    },
    write(chunk, encoding, callback) {
      child.stdin.write(chunk, encoding as BufferEncoding, callback);
    },
    final(callback) {
      child.stdin.end(callback);
    },
    destroy(error, callback) {
      child.kill();
      callback(error);
    },
  });
  child.stdout.on("data", (chunk: Buffer) => duplex.push(chunk));
  child.stdout.on("end", () => duplex.push(null));
  child.once("error", (error) => duplex.destroy(error));
  return duplex;
}
