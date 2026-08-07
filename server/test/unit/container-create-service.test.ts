import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DockerDaemonError } from "../../src/docker/errors.js";
import type { ImageTransferStep } from "../../src/images/image-transfer-service.js";

// The service reaches the daemon only through the shared EngineClient and the
// images module's pull. Both are mocked so the service's own decisions —
// image resolution, payload shape, network attachment order, start mode and
// refusal reporting — are the only things observable here.
interface RecordedRequest {
  path: string;
  method?: string;
  body?: string;
}

let requests: RecordedRequest[] = [];
/** Per-path canned outcome; a function may throw to simulate a daemon refusal. */
let responder: (path: string, options: { method?: string; body?: string }) => { statusCode: number; body: string } = () => ({
  statusCode: 200,
  body: JSON.stringify({ Id: "created-id", Warnings: [] }),
});

let pullCalls: { reference: string; platform?: string }[] = [];
/** Steps the mocked pull emits before it ends; an error message makes it fail. */
let pullSteps: ImageTransferStep[] = [];
let pullFailure: string | undefined;

mock.module(new URL("../../src/connectivity/connection-status-service.ts", import.meta.url).href, {
  namedExports: {
    getEngineClient: () => ({
      request: async (path: string, options: { method?: string; body?: string } = {}) => {
        requests.push({ path, method: options.method, body: options.body });
        return responder(path, options);
      },
    }),
  },
});

mock.module(new URL("../../src/images/image-transfer-service.ts", import.meta.url).href, {
  namedExports: {
    pullImage: async (
      reference: string,
      platform: string | undefined,
      handlers: { onStep: (step: ImageTransferStep) => void; onError: (message: string) => void; onEnd: () => void },
    ) => {
      pullCalls.push({ reference, platform });
      for (const step of pullSteps) handlers.onStep(step);
      if (pullFailure !== undefined) handlers.onError(pullFailure);
      else handlers.onEnd();
    },
  },
});

const { createContainer } = await import("../../src/containers/container-create-service.js");
type CreateSpec = Parameters<typeof createContainer>[0];
type CreateResult = Parameters<Parameters<typeof createContainer>[1]["onCreated"]>[0];

beforeEach(() => {
  requests = [];
  pullCalls = [];
  pullSteps = [];
  pullFailure = undefined;
  responder = (path) => {
    if (path.startsWith("/images/")) return { statusCode: 200, body: "{}" };
    return { statusCode: 201, body: JSON.stringify({ Id: "created-id", Warnings: [] }) };
  };
});

interface Recorded {
  events: string[];
  pullStepsSeen: ImageTransferStep[];
  imagePulled?: boolean;
  result?: CreateResult;
  error?: string;
}

/** Runs a creation, recording every handler call in the order it fired. */
async function run(spec: CreateSpec): Promise<Recorded> {
  const recorded: Recorded = { events: [], pullStepsSeen: [] };
  await createContainer(spec, {
    onPullStep: (step) => {
      recorded.events.push("pull-step");
      recorded.pullStepsSeen.push(step);
    },
    onImageResolved: (pulled) => {
      recorded.events.push("image-resolved");
      recorded.imagePulled = pulled;
    },
    onCreated: (result) => {
      recorded.events.push("created");
      recorded.result = result;
    },
    onError: (message) => {
      recorded.events.push("error");
      recorded.error = message;
    },
  });
  return recorded;
}

function createRequest(): RecordedRequest | undefined {
  return requests.find((request) => request.path.startsWith("/containers/create"));
}

function createPayload(): Record<string, any> {
  return JSON.parse(createRequest()?.body ?? "{}");
}

// container-create-service.md — a blank image is refused before the daemon is touched at all
test("createContainer refuses a blank image reference without issuing any daemon request", async () => {
  const recorded = await run({ image: "  " });

  assert.deepEqual(recorded.events, ["error"]);
  assert.ok(recorded.error && recorded.error.length > 0);
  assert.equal(requests.length, 0);
  assert.equal(pullCalls.length, 0);
});

// container-create-service.md — a name that does not match [a-zA-Z0-9][a-zA-Z0-9_.-]* is refused before the daemon is touched
test("createContainer refuses an invalid container name without issuing any daemon request", async () => {
  const recorded = await run({ image: "nginx:1.27", name: "-bad name!" });

  assert.deepEqual(recorded.events, ["error"]);
  assert.match(recorded.error ?? "", /-bad name!/);
  assert.equal(requests.length, 0);
});

// container-create-service.md — a name matching the pattern is accepted and reaches the daemon
test("createContainer accepts a valid container name and passes it to the daemon", async () => {
  const recorded = await run({ image: "nginx:1.27", name: "web.frontend-1" });

  assert.deepEqual(recorded.events, ["image-resolved", "created"]);
  assert.match(createRequest()?.path ?? "", /name=web\.frontend-1/);
});

// container-create-service.md — a reference the daemon already holds is used as-is: no pull, no pull step, imagePulled false
test("createContainer uses a locally present image without pulling it", async () => {
  const recorded = await run({ image: "nginx:1.27" });

  assert.equal(pullCalls.length, 0);
  assert.deepEqual(recorded.events, ["image-resolved", "created"]);
  assert.equal(recorded.imagePulled, false);
  assert.equal(recorded.result?.imagePulled, false);
});

// container-create-service.md — a missing reference (404 on the lookup) is pulled first, with its steps, then the container is created
test("createContainer pulls a missing image first, reporting its steps before the image is resolved", async () => {
  responder = (path) => {
    if (path.startsWith("/images/")) throw new DockerDaemonError("DaemonRejected", "No such image", undefined, 404);
    return { statusCode: 201, body: JSON.stringify({ Id: "created-id", Warnings: [] }) };
  };
  pullSteps = [
    { id: "layer-1", status: "Downloading", currentBytes: 10, totalBytes: 100 },
    { id: "layer-1", status: "Download complete" },
  ];

  const recorded = await run({ image: "nginx:1.27", platform: "linux/arm64" });

  assert.deepEqual(pullCalls, [{ reference: "nginx:1.27", platform: "linux/arm64" }]);
  assert.deepEqual(recorded.events, ["pull-step", "pull-step", "image-resolved", "created"]);
  assert.equal(recorded.imagePulled, true);
  assert.equal(recorded.result?.imagePulled, true);
});

// container-create-service.md — only a 404 on the image lookup turns into a pull; any other refusal is reported as an error
test("createContainer reports a non-404 image lookup refusal as an error instead of pulling", async () => {
  responder = (path) => {
    if (path.startsWith("/images/")) throw new DockerDaemonError("DaemonRejected", "permission denied on the image store", undefined, 403);
    return { statusCode: 201, body: JSON.stringify({ Id: "created-id", Warnings: [] }) };
  };

  const recorded = await run({ image: "nginx:1.27" });

  assert.deepEqual(recorded.events, ["error"]);
  assert.equal(recorded.error, "permission denied on the image store");
  assert.equal(pullCalls.length, 0);
  assert.equal(createRequest(), undefined);
});

// container-create-service.md — a failing pull is reported with the daemon's own message, and nothing is created
test("createContainer reports a failing pull with the daemon's own message and creates nothing", async () => {
  responder = (path) => {
    if (path.startsWith("/images/")) throw new DockerDaemonError("DaemonRejected", "No such image", undefined, 404);
    return { statusCode: 201, body: JSON.stringify({ Id: "created-id", Warnings: [] }) };
  };
  pullFailure = "manifest for nowhere/nothing:1 not found";

  const recorded = await run({ image: "nowhere/nothing:1" });

  assert.deepEqual(recorded.events, ["error"]);
  assert.equal(recorded.error, "manifest for nowhere/nothing:1 not found");
  assert.equal(createRequest(), undefined);
});

// container-create-service.md — a create refusal is reported verbatim, and exactly one terminal handler fires
test("createContainer reports the daemon's own refusal message on create, and never also reports success", async () => {
  responder = (path) => {
    if (path.startsWith("/images/")) return { statusCode: 200, body: "{}" };
    throw new DockerDaemonError("DaemonRejected", 'Conflict. The container name "/web" is already in use', undefined, 409);
  };

  const recorded = await run({ image: "nginx:1.27", name: "web" });

  assert.deepEqual(recorded.events, ["image-resolved", "error"]);
  assert.equal(recorded.error, 'Conflict. The container name "/web" is already in use');
  assert.equal(recorded.result, undefined);
});

// container-create-service.md — the failing step is never masked: a refusal on start is reported with the daemon's own message
test("createContainer reports a refusal on start with the daemon's own message", async () => {
  responder = (path) => {
    if (path.startsWith("/images/")) return { statusCode: 200, body: "{}" };
    if (path.endsWith("/start")) throw new DockerDaemonError("DaemonRejected", "driver failed programming external connectivity", undefined, 500);
    return { statusCode: 201, body: JSON.stringify({ Id: "created-id", Warnings: [] }) };
  };

  const recorded = await run({ image: "nginx:1.27", start: true });

  assert.deepEqual(recorded.events, ["image-resolved", "error"]);
  assert.equal(recorded.error, "driver failed programming external connectivity");
});

// container-create-service.md — create-and-start mode also starts the container
test("createContainer starts the container in create-and-start mode", async () => {
  const recorded = await run({ image: "nginx:1.27", start: true });

  const start = requests.find((request) => request.path === "/containers/created-id/start");
  assert.ok(start, "expected a start request for the created container");
  assert.equal(start!.method, "POST");
  assert.equal(recorded.result?.started, true);
});

// container-create-service.md — create-only mode leaves the container stopped
test("createContainer issues no start request in create-only mode", async () => {
  const recorded = await run({ image: "nginx:1.27", start: false });

  assert.equal(
    requests.find((request) => request.path.endsWith("/start")),
    undefined,
  );
  assert.equal(recorded.result?.started, false);
});

// container-create-service.md — the first network is attached at creation; the remaining ones before the start
test("createContainer attaches the first network at creation and the others before starting", async () => {
  await run({ image: "nginx:1.27", networks: ["front", "back", "ops"], start: true });

  const payload = createPayload();
  assert.deepEqual(Object.keys(payload.NetworkingConfig?.EndpointsConfig ?? {}), ["front"]);

  const order = requests.map((request) => request.path);
  const backIndex = order.indexOf("/networks/back/connect");
  const opsIndex = order.indexOf("/networks/ops/connect");
  const startIndex = order.indexOf("/containers/created-id/start");
  assert.ok(backIndex > -1 && opsIndex > -1, "expected the remaining networks to be connected");
  assert.ok(backIndex < startIndex && opsIndex < startIndex, "expected every network to be attached before the start");
  const connectBody = JSON.parse(requests[backIndex]!.body ?? "{}");
  assert.equal(connectBody.Container, "created-id");
});

// container-create-service.md — cpus is expressed as a quota over a 100 ms period; memoryBytes is passed as-is
test("createContainer expresses a CPU limit as a quota over a 100 ms period and passes the memory limit as-is", async () => {
  await run({ image: "nginx:1.27", resourceLimits: { cpus: 1.5, memoryBytes: 536870912 } });

  const hostConfig = createPayload().HostConfig;
  assert.equal(hostConfig.CpuPeriod, 100000);
  assert.equal(hostConfig.CpuQuota, 150000);
  assert.equal(hostConfig.Memory, 536870912);
});

// container-create-service.md — the daemon's non-fatal notes travel back with the result
test("createContainer reports the daemon's warnings with the created container", async () => {
  responder = (path) => {
    if (path.startsWith("/images/")) return { statusCode: 200, body: "{}" };
    return { statusCode: 201, body: JSON.stringify({ Id: "created-id", Warnings: ["platform mismatch"] }) };
  };

  const recorded = await run({ image: "nginx:1.27" });

  assert.deepEqual(recorded.result?.warnings, ["platform mismatch"]);
  assert.equal(recorded.result?.id, "created-id");
});

// container-create-service.md — creation never mutates an existing container: no request targets anything but the new one
test("createContainer touches no container other than the one it creates", async () => {
  await run({ image: "nginx:1.27", name: "web", start: true });

  const containerRequests = requests.filter((request) => request.path.startsWith("/containers/"));
  for (const request of containerRequests) {
    assert.ok(
      request.path.startsWith("/containers/create") || request.path.startsWith("/containers/created-id"),
      `unexpected request to ${request.path}`,
    );
  }
});
