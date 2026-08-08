import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { PassThrough, type Readable } from "node:stream";
import express, { type Express } from "express";
import type { AddressInfo } from "node:net";

// images-endpoints.md / container-transfer-endpoint.md — "cancel the upstream
// Engine API stream as soon as the client disconnects". This is the route
// wiring the fix moved from `req.on("close", ...)` to `res.on("close", ...)`:
// a real client disconnect must still cancel the in-flight daemon operation,
// not just the false-positive case (the upload body finishing) the move was
// fixing. The Engine API is mocked so the cancellation itself — destroying
// the daemon-bound request/response — is directly observable, without
// depending on a real daemon's timing.
interface RecordedStreamRequest {
  path: string;
  body?: Readable;
}
let streamRequests: RecordedStreamRequest[] = [];
let currentResponse: PassThrough | undefined;

mock.module(new URL("../../src/connectivity/connection-status-service.ts", import.meta.url).href, {
  namedExports: {
    getEngineClient: () => ({
      requestStream: async (path: string, options: { body?: Readable } = {}) => {
        streamRequests.push({ path, body: options.body });
        currentResponse = new PassThrough();
        return currentResponse;
      },
    }),
  },
});

const { imagesRouter } = await import("../../src/images/images-routes.js");
const { containersRouter } = await import("../../src/containers/containers-routes.js");

beforeEach(() => {
  streamRequests = [];
  currentResponse = undefined;
});

function startApp(basePath: string, router: express.Router): Promise<{ port: number; close: () => Promise<void> }> {
  const app: Express = express();
  app.use(basePath, router);
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      resolve({ port, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("condition never became true within the timeout");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/**
 * Opens a real POST request, writes a first chunk (so the route has started
 * and called `requestStream`), then abruptly destroys the client socket —
 * a genuine disconnect, distinct from the upload body simply finishing.
 */
async function postThenDisconnect(port: number, path: string): Promise<void> {
  const clientRequest = http.request({ host: "127.0.0.1", port, path, method: "POST", headers: { "content-type": "application/x-tar" } });
  clientRequest.on("error", () => {
    // A destroyed socket mid-request legitimately surfaces as a client-side error; not the assertion here.
  });
  clientRequest.write(Buffer.from("partial-tarball-bytes"));
  await waitFor(() => currentResponse !== undefined);
  clientRequest.destroy();
}

// images-endpoints.md — a genuine client disconnect during POST /api/images/load cancels the upstream Engine API stream
test("POST /api/images/load cancels the upstream Engine API request when the client actually disconnects mid-upload", async () => {
  const { port, close } = await startApp("/api/images", imagesRouter);
  try {
    await postThenDisconnect(port, "/api/images/load");

    await waitFor(() => currentResponse!.destroyed === true);
    await waitFor(() => streamRequests[0]!.body!.destroyed === true);
  } finally {
    await close();
  }
});

// container-transfer-endpoint.md — a genuine client disconnect during POST /api/containers/import cancels the upstream Engine API stream
test("POST /api/containers/import cancels the upstream Engine API request when the client actually disconnects mid-upload", async () => {
  const { port, close } = await startApp("/api/containers", containersRouter);
  try {
    await postThenDisconnect(port, "/api/containers/import");

    await waitFor(() => currentResponse!.destroyed === true);
    await waitFor(() => streamRequests[0]!.body!.destroyed === true);
  } finally {
    await close();
  }
});
