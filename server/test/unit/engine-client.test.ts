import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlinkSync } from "node:fs";
import { EngineClient } from "../../src/docker/engine-client.js";
import { DockerDaemonError } from "../../src/docker/errors.js";

interface DaemonStub {
  socketPath: string;
  close: () => Promise<void>;
}

function startDaemonStub(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<DaemonStub> {
  const socketPath = join(tmpdir(), `vexel-engine-client-test-${randomUUID()}.sock`);
  const server = createServer(handler);
  return new Promise((resolve) => {
    server.listen(socketPath, () => {
      resolve({
        socketPath,
        close: () =>
          new Promise((closeResolve) => {
            server.close(() => {
              try {
                unlinkSync(socketPath);
              } catch {
                // best-effort cleanup
              }
              closeResolve();
            });
          }),
      });
    });
  });
}

function jsonResponse(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

// docker-access/specs/engine-client.md — DaemonUnreachable when the endpoint cannot be reached
test("getVersion rejects with a DaemonUnreachable DockerDaemonError when the socket does not exist", async () => {
  const client = new EngineClient({ kind: "unix", socketPath: join(tmpdir(), `vexel-no-daemon-${randomUUID()}.sock`) });

  await assert.rejects(
    () => client.getVersion(),
    (error: unknown) => {
      assert.ok(error instanceof DockerDaemonError);
      assert.equal(error.code, "DaemonUnreachable");
      assert.ok(error.message.length > 0);
      return true;
    },
  );
});

// docker-access/specs/engine-client.md — UnsupportedApiVersion when the daemon reports no API version
test("getVersion rejects with an UnsupportedApiVersion DockerDaemonError when /version omits ApiVersion", async () => {
  const daemon = await startDaemonStub((_req, res) => jsonResponse(res, 200, { Version: "24.0.0" }));
  try {
    const client = new EngineClient({ kind: "unix", socketPath: daemon.socketPath });
    await assert.rejects(
      () => client.getVersion(),
      (error: unknown) => {
        assert.ok(error instanceof DockerDaemonError);
        assert.equal(error.code, "UnsupportedApiVersion");
        return true;
      },
    );
  } finally {
    await daemon.close();
  }
});

// docker-access/specs/engine-client.md — negotiates to the lower of the daemon's version and this client's own maximum
test("getVersion caps the negotiated API version instead of adopting an implausibly high daemon-reported version", async () => {
  const daemon = await startDaemonStub((_req, res) => jsonResponse(res, 200, { ApiVersion: "9.99", Version: "99.0.0" }));
  try {
    const client = new EngineClient({ kind: "unix", socketPath: daemon.socketPath });
    const version = await client.getVersion();
    assert.notEqual(version.apiVersion, "9.99");
    assert.ok(Number(version.apiVersion) < 9.99);
  } finally {
    await daemon.close();
  }
});

// docker-access/specs/engine-client.md — raised to the daemon's MinAPIVersion when that floor is higher
test("getVersion raises the negotiated API version to the daemon's MinAPIVersion floor", async () => {
  const daemon = await startDaemonStub((_req, res) => jsonResponse(res, 200, { ApiVersion: "5.00", MinAPIVersion: "5.00", Version: "99.0.0" }));
  try {
    const client = new EngineClient({ kind: "unix", socketPath: daemon.socketPath });
    const version = await client.getVersion();
    assert.equal(version.apiVersion, "5.00");
    assert.equal(version.engineVersion, "99.0.0");
  } finally {
    await daemon.close();
  }
});

// docker-access/specs/engine-client.md — request() prefixes the path with /v{negotiated} and maps >=400 to DaemonRejected, preserving the daemon's message verbatim
test("request() targets the negotiated API version and preserves the daemon's own error message on rejection", async () => {
  let receivedPath = "";
  const daemon = await startDaemonStub((req, res) => {
    if (req.url === "/version") {
      jsonResponse(res, 200, { ApiVersion: "1.41", Version: "24.0.0" });
      return;
    }
    receivedPath = req.url ?? "";
    jsonResponse(res, 404, { message: "no such container: missing-one" });
  });
  try {
    const client = new EngineClient({ kind: "unix", socketPath: daemon.socketPath });
    await assert.rejects(
      () => client.request("/containers/missing-one/json"),
      (error: unknown) => {
        assert.ok(error instanceof DockerDaemonError);
        assert.equal(error.code, "DaemonRejected");
        assert.equal(error.statusCode, 404);
        assert.equal(error.message, "no such container: missing-one");
        return true;
      },
    );
    assert.equal(receivedPath, "/v1.41/containers/missing-one/json");
  } finally {
    await daemon.close();
  }
});

// docker-access/specs/engine-client.md — requestRaw(): "The daemon's answer as it came: no error is
// raised for a status >= 400 and the body is returned unaltered" (REQ-101)
test("requestRaw() answers a >= 400 status instead of raising, with the body exactly as the daemon sent it", async () => {
  const rawBody = '{"message":"No such container: missing-one"}\n';
  const daemon = await startDaemonStub((req, res) => {
    if (req.url === "/version") {
      jsonResponse(res, 200, { ApiVersion: "1.41", Version: "24.0.0" });
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(rawBody);
  });
  try {
    const client = new EngineClient({ kind: "unix", socketPath: daemon.socketPath });
    const response = await client.requestRaw("/containers/missing-one/json");

    assert.equal(response.statusCode, 404);
    assert.equal(response.body, rawBody);
    assert.equal(response.contentType, "application/json");
  } finally {
    await daemon.close();
  }
});

// docker-access/specs/engine-client.md — "any other is prefixed with the negotiated version. The
// path returned is the one actually dialed."
test("requestRaw() prefixes an unversioned path with the negotiated version and reports the path dialed", async () => {
  let receivedPath = "";
  const daemon = await startDaemonStub((req, res) => {
    if (req.url === "/version") {
      jsonResponse(res, 200, { ApiVersion: "1.41", Version: "24.0.0" });
      return;
    }
    receivedPath = req.url ?? "";
    jsonResponse(res, 200, { ok: true });
  });
  try {
    const client = new EngineClient({ kind: "unix", socketPath: daemon.socketPath });
    const response = await client.requestRaw("/containers/json?all=1");

    assert.equal(receivedPath, "/v1.41/containers/json?all=1");
    assert.equal(response.path, "/v1.41/containers/json?all=1");
  } finally {
    await daemon.close();
  }
});

// docker-access/specs/engine-client.md — "A path that already carries a version prefix (/v1.43/…) is
// sent as typed"
test("requestRaw() sends a path that already carries a version prefix as typed", async () => {
  let receivedPath = "";
  const daemon = await startDaemonStub((req, res) => {
    if (req.url === "/version") {
      jsonResponse(res, 200, { ApiVersion: "1.41", Version: "24.0.0" });
      return;
    }
    receivedPath = req.url ?? "";
    jsonResponse(res, 200, { ok: true });
  });
  try {
    const client = new EngineClient({ kind: "unix", socketPath: daemon.socketPath });
    const response = await client.requestRaw("/v1.24/info");

    assert.equal(receivedPath, "/v1.24/info");
    assert.equal(response.path, "/v1.24/info");
  } finally {
    await daemon.close();
  }
});

// raw-console/specs/console-api-service.md — "A body given on the entry line travels as typed, with
// Content-Type: application/json"
test("requestRaw() sends the body verbatim with a JSON content type", async () => {
  const typedBody = '{"Image":"alpine:3.20","Cmd":["true"]}';
  let received = { body: "", contentType: "", method: "" };
  const daemon = await startDaemonStub((req, res) => {
    if (req.url === "/version") {
      jsonResponse(res, 200, { ApiVersion: "1.41", Version: "24.0.0" });
      return;
    }
    let body = "";
    req.on("data", (chunk) => {
      body += chunk as string;
    });
    req.on("end", () => {
      received = { body, contentType: String(req.headers["content-type"] ?? ""), method: req.method ?? "" };
      jsonResponse(res, 201, { Id: "created" });
    });
  });
  try {
    const client = new EngineClient({ kind: "unix", socketPath: daemon.socketPath });
    const response = await client.requestRaw("/containers/create", { method: "POST", body: typedBody });

    assert.equal(response.statusCode, 201);
    assert.equal(received.method, "POST");
    assert.equal(received.body, typedBody);
    assert.equal(received.contentType, "application/json");
  } finally {
    await daemon.close();
  }
});

// docker-access/specs/engine-client.md — "Still rejects with a DockerDaemonError (code
// DaemonUnreachable) when the endpoint cannot be reached at all"
test("requestRaw() rejects with DaemonUnreachable when the endpoint cannot be reached at all", async () => {
  const client = new EngineClient({ kind: "unix", socketPath: join(tmpdir(), `vexel-no-daemon-${randomUUID()}.sock`) });

  await assert.rejects(
    () => client.requestRaw("/info"),
    (error: unknown) => {
      assert.ok(error instanceof DockerDaemonError);
      assert.equal(error.code, "DaemonUnreachable");
      return true;
    },
  );
});

// docker-access/specs/engine-client.md — requestStream() applies the same version prefix and error mapping as request()
test("requestStream() targets the negotiated API version and returns the raw streamed response on success", async () => {
  const daemon = await startDaemonStub((req, res) => {
    if (req.url === "/version") {
      jsonResponse(res, 200, { ApiVersion: "1.41", Version: "24.0.0" });
      return;
    }
    if (req.url === "/v1.41/events") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"Type":"network","Action":"create"}\n');
      return;
    }
    res.writeHead(500);
    res.end();
  });
  try {
    const client = new EngineClient({ kind: "unix", socketPath: daemon.socketPath });
    const stream = await client.requestStream("/events");
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    assert.match(Buffer.concat(chunks).toString("utf8"), /"Type":"network","Action":"create"/);
  } finally {
    await daemon.close();
  }
});
