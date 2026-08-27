import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";

/**
 * **The inspect reading is the container's publications and only those**
 * (`containers/specs/containers-service.md`,
 * `…-tabs_composition_refactor/REQ-59`).
 *
 * **This file asserted the opposite until 2026-08-27, and the rule reversed rather than moved.** It
 * was written against REQ-52 as first read — "a port exposed without being published is carried by
 * the inspect data" — and against the `NetworkSettings.Ports` *supplement* that carried it. REQ-58
 * widened that to `Config.ExposedPorts` and was withdrawn the same day: `EXPOSE` binds no host port,
 * so such a row said "declared by somebody else, reachable from nowhere". REQ-59 replaced both. Each
 * check below states which reading it now pins, so the reversal is legible rather than silently
 * re-pointed.
 *
 * The mock stands in for the shared EngineClient because **the shape of the daemon's answer is the
 * whole subject**: `-P` fills no bindings at all, `-p 80` fills one with an empty host port, and a
 * single publication is recorded once per IP stack. Every payload below is a **verbatim reading
 * taken from Docker 29.7.2** (`docker inspect --format '{{json .HostConfig.PortBindings}}'` and the
 * same for `.NetworkSettings.Ports`), so what is stubbed is what a daemon sends; that the daemon
 * still sends it is checked against a real one in `server/test/api/containers-routes.test.ts`.
 */
let inspectBody = "{}";

mock.module(new URL("../../src/connectivity/connection-status-service.ts", import.meta.url).href, {
  namedExports: {
    getEngineClient: () => ({
      request: async (path: string) => {
        if (path.startsWith("/containers/") && path.endsWith("/json")) return { statusCode: 200, body: inspectBody };
        throw new Error(`unexpected path: ${path}`);
      },
    }),
  },
});

const { getContainerInspect } = await import("../../src/containers/containers-service.js");

beforeEach(() => {
  inspectBody = "{}";
});

interface RawPayload {
  HostConfig?: { PortBindings?: Record<string, { HostIp?: string; HostPort?: string }[] | null> };
  NetworkSettings?: { Ports?: Record<string, { HostIp?: string; HostPort?: string }[] | null> };
}

async function portsFrom(payload: RawPayload) {
  inspectBody = JSON.stringify({ Id: "c-1", Name: "/fixture", Config: {}, ...payload });
  return (await getContainerInspect("c-1")).ports;
}

/**
 * The three fields a check names when the **host IP is not its subject**.
 *
 * A binding the operator wrote without an address (`-p 80`, `-p X:X`) arrives with `HostIp: ""` and
 * is carried through as an empty string, which no reader of this shape draws: the Config tab's port
 * group states a container port and a host port and nothing else. The contract speaks of the host
 * IP only where it is load-bearing — an explicit publication keeps it, an entry reaching the list
 * through `NetworkSettings.Ports` has none — so those two cases assert the whole entry, and these
 * assert what the requirement is about.
 */
function numbersOf(ports: { containerPort: number; protocol: string; hostPort?: number }[]) {
  return ports.map(({ containerPort, protocol, hostPort }) => ({ containerPort, protocol, hostPort }));
}

// REQ-59 — "every port published on the host is shown […] including where the operator named none
// and the daemon chose it (`-p 80`, `-P`)". The reading `docker run --expose 5000 -P` produces: the
// bindings are an **empty object**, and the whole publication — with the port the daemon picked —
// lives in `NetworkSettings.Ports`. A reading confined to the bindings reports nothing for a
// container that is published, which is why that map is a source and not only a resolver.
test("getContainerInspect reports a -P publication, whose bindings map is empty and whose host port only the daemon knows", async () => {
  const ports = await portsFrom({
    HostConfig: { PortBindings: {} },
    NetworkSettings: { Ports: { "5000/tcp": [{ HostIp: "0.0.0.0", HostPort: "55502" }] } },
  });

  assert.deepEqual(ports, [{ containerPort: 5000, protocol: "tcp", hostPort: 55502 }]);
});

// REQ-59 — the same sentence, on the case the operator publishes explicitly without naming a host
// port. `docker run -p 80` fills the binding with an empty host port; before REQ-59 the tab read
// `not published` on a port that was published, while the container's own card showed the number.
test("getContainerInspect resolves the host port the daemon chose for a -p 80 publication", async () => {
  const ports = await portsFrom({
    HostConfig: { PortBindings: { "80/tcp": [{ HostIp: "", HostPort: "" }] } },
    NetworkSettings: {
      Ports: {
        "80/tcp": [
          { HostIp: "0.0.0.0", HostPort: "50390" },
          { HostIp: "::", HostPort: "50390" },
        ],
      },
    },
  });

  assert.deepEqual(numbersOf(ports), [{ containerPort: 80, protocol: "tcp", hostPort: 50390 }]);
});

/**
 * `containers-service.md` — "**'You choose' has two spellings and both are read as one**: an empty
 * `HostPort` (`-p 80`, `-P`) and a `HostPort` of `0` (`-p 0:5432`), which the daemon stores exactly
 * as written. A host port of `0` is therefore not a host port in force, and a binding carrying
 * either is completed from the observed map."
 *
 * The third spelling, and the one the suite's own fixtures use throughout: read as a host port, `0`
 * made a published port state `0` — and the client's reading of it, `not published`. The payload is
 * a verbatim reading of `docker run -p 0:5432` on Docker 29.7.2.
 */
test("getContainerInspect completes a binding whose host port the daemon stored as a literal 0", async () => {
  const ports = await portsFrom({
    HostConfig: { PortBindings: { "5432/tcp": [{ HostIp: "", HostPort: "0" }] } },
    NetworkSettings: {
      Ports: {
        "5432/tcp": [
          { HostIp: "0.0.0.0", HostPort: "55527" },
          { HostIp: "::", HostPort: "55527" },
        ],
      },
    },
  });

  assert.deepEqual(numbersOf(ports), [{ containerPort: 5432, protocol: "tcp", hostPort: 55527 }]);
});

// containers-service.md — "One publication is one entry." `NetworkSettings.Ports` records a
// publication once per IP stack, so `-p 41999:41999` is one binding and two records; a container
// port already accounted for is never added again.
test("getContainerInspect keeps one publication one entry, though the daemon records it once per IP stack", async () => {
  const ports = await portsFrom({
    HostConfig: { PortBindings: { "41999/tcp": [{ HostIp: "", HostPort: "41999" }] } },
    NetworkSettings: {
      Ports: {
        "41999/tcp": [
          { HostIp: "0.0.0.0", HostPort: "41999" },
          { HostIp: "::", HostPort: "41999" },
        ],
      },
    },
  });

  assert.deepEqual(numbersOf(ports), [{ containerPort: 41999, protocol: "tcp", hostPort: 41999 }]);
});

// containers-service.md — "A publication the **operator** made twice — two host IPs, two host ports
// — is two bindings in `PortBindings` and stays the two it is: that is the certified behaviour this
// rule leaves untouched." The reading is `-p 127.0.0.1:42001:80 -p 0.0.0.0:42002:80`, and the host
// IPs are what tells the two apart, so they survive intact.
test("getContainerInspect keeps an explicit publication on two host IPs as the two entries it is, host IPs intact", async () => {
  const bindings = [
    { HostIp: "127.0.0.1", HostPort: "42001" },
    { HostIp: "0.0.0.0", HostPort: "42002" },
  ];
  const ports = await portsFrom({
    HostConfig: { PortBindings: { "80/tcp": bindings } },
    NetworkSettings: { Ports: { "80/tcp": bindings } },
  });

  assert.deepEqual(ports, [
    { containerPort: 80, protocol: "tcp", hostPort: 42001, hostIp: "127.0.0.1" },
    { containerPort: 80, protocol: "tcp", hostPort: 42002, hostIp: "0.0.0.0" },
  ]);
});

// REQ-59's other half — "and only those. […] A port that is merely declared is not an entry here."
// **The reversal**: this exact payload — `docker run --expose 5000`, bindings empty, the exposed
// port recorded in `NetworkSettings.Ports` with a null binding list — used to be asserted here as
// one entry carrying no host port. An entry of that map with no host port is an exposure, and
// `EXPOSE` publishes nothing on the host.
test("getContainerInspect reports no entry for a port exposed without being published", async () => {
  const ports = await portsFrom({
    HostConfig: { PortBindings: {} },
    NetworkSettings: { Ports: { "5000/tcp": null } },
  });

  assert.deepEqual(ports, []);
});

// REQ-59 — the same rule where the container publishes something as well, which is where an
// exposure could most easily be smuggled in beside a publication. The reading is
// `--expose 9000 -p 42003:80`: this daemon keeps the exposed port out of both port maps once the
// container publishes, so the payload also carries it the way an older daemon might — a null entry
// in `NetworkSettings.Ports` — and it must still contribute nothing.
test("getContainerInspect reports the publications alone when a container both exposes and publishes", async () => {
  const ports = await portsFrom({
    HostConfig: { PortBindings: { "80/tcp": [{ HostIp: "", HostPort: "42003" }] } },
    NetworkSettings: {
      Ports: {
        "80/tcp": [
          { HostIp: "0.0.0.0", HostPort: "42003" },
          { HostIp: "::", HostPort: "42003" },
        ],
        "9000/tcp": null,
      },
    },
  });

  assert.deepEqual(numbersOf(ports), [{ containerPort: 80, protocol: "tcp", hostPort: 42003 }]);
});

// REQ-48 — "A binding the daemon publishes nowhere says so rather than reading as an empty value",
// and this is the state that still produces one under REQ-59: a container created and never
// started. The operator asked for a publication, the daemon has bound nothing yet, and
// `NetworkSettings.Ports` is empty, so there is no number to resolve. The entry is the binding's,
// with no host port.
test("getContainerInspect reports a binding of a container that has never run, with no host port to state", async () => {
  const ports = await portsFrom({
    HostConfig: { PortBindings: { "80/tcp": [{ HostIp: "", HostPort: "" }] } },
    NetworkSettings: { Ports: {} },
  });

  assert.deepEqual(numbersOf(ports), [{ containerPort: 80, protocol: "tcp", hostPort: undefined }]);
});

// containers-service.md — the protocol travels with the port, and a publication over UDP is a
// publication here too.
test("getContainerInspect carries the protocol of a published port", async () => {
  const ports = await portsFrom({
    HostConfig: { PortBindings: { "514/udp": [{ HostIp: "", HostPort: "" }] } },
    NetworkSettings: { Ports: { "514/udp": [{ HostIp: "0.0.0.0", HostPort: "51400" }] } },
  });

  assert.deepEqual(numbersOf(ports), [{ containerPort: 514, protocol: "udp", hostPort: 51400 }]);
});

// containers-service.md — "`ports` is ordered by this service […] by private port, then public
// port, then protocol", the daemon's own order being unstable across reads. The payload states the
// three publications in none of those orders, including one that arrives only through
// `NetworkSettings.Ports`.
test("getContainerInspect orders the publications by container port, whatever order the daemon states them in", async () => {
  const ports = await portsFrom({
    HostConfig: {
      PortBindings: {
        "443/tcp": [{ HostIp: "", HostPort: "8443" }],
        "22/tcp": [{ HostIp: "", HostPort: "2222" }],
      },
    },
    NetworkSettings: {
      Ports: {
        "443/tcp": [{ HostIp: "0.0.0.0", HostPort: "8443" }],
        "22/tcp": [{ HostIp: "0.0.0.0", HostPort: "2222" }],
        "8080/tcp": [{ HostIp: "0.0.0.0", HostPort: "58080" }],
      },
    },
  });

  assert.deepEqual(
    ports.map((port) => port.containerPort),
    [22, 443, 8080],
  );
});
