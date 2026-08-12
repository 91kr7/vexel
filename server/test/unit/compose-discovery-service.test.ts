import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Compose project discovery (compose/specs/compose-discovery-service.md,
// REQ-75), and the order it lists what it discovers in
// (plan-docker_management_app-list_ordering/REQ-35, REQ-36, REQ-43). The
// `docker compose` CLI channel is the service's only boundary, so the shared
// runner is mocked and the payloads below are handed over deliberately out of
// order: a compose installation gives no order guarantee of its own, which is
// exactly what the ordering exists to remove.
//
// The name comparison ignores case and reads digit runs as numbers, so names
// that tie under it are the normal case rather than an edge one, and the only
// check that can detect a missing tiebreak is that the *same* payload, supplied
// both ways round, produces one result (REQ-6). An assertion that the result is
// merely alphabetical would pass on a comparator that had dropped it.
interface FakeResult {
  stdout?: string;
  exitCode?: number;
}

let handler: (args: string[]) => FakeResult = () => ({ stdout: "", exitCode: 0 });

mock.module(new URL("../../src/docker/cli-runner.ts", import.meta.url).href, {
  namedExports: {
    runCliCommand: (_command: string, args: string[]) => {
      const { stdout = "", exitCode = 0 } = handler(args);
      return {
        cancel: () => undefined,
        onStdout: (listener: (chunk: string) => void) => {
          if (stdout) listener(stdout);
        },
        onStderr: () => undefined,
        onSpawnError: () => undefined,
        done: Promise.resolve({ exitCode }),
      };
    },
    detectCliAvailability: async () => ({
      docker: { available: true },
      compose: { available: true },
      buildx: { available: true },
    }),
  },
});

const { listComposeProjects, getComposeProject } = await import("../../src/compose/compose-discovery-service.js");

interface FakeProject {
  name: string;
  /** The service names `docker compose ps` reports for this project, in the order it reports them. */
  services: string[];
}

/** Answers `compose ls` and `compose -p <name> ps` with the given projects, verbatim. */
function installProjects(projects: FakeProject[]): void {
  handler = (args) => {
    if (args.includes("ls")) {
      const listing = projects.map((project) => ({ Name: project.name, ConfigFiles: `/srv/${project.name}/compose.yml` }));
      return { stdout: `${listing.map((entry) => JSON.stringify(entry)).join("\n")}\n`, exitCode: 0 };
    }
    const requested = args[args.indexOf("-p") + 1];
    const project = projects.find((entry) => entry.name === requested);
    const rows = (project?.services ?? []).map((service) => ({ Service: service, State: "running", Image: "alpine:3.20" }));
    return { stdout: `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, exitCode: 0 };
  };
}

/** The same projects listed the other way round, services included. */
function reversed(projects: FakeProject[]): FakeProject[] {
  return [...projects].reverse().map((project) => ({ name: project.name, services: [...project.services].reverse() }));
}

beforeEach(() => {
  handler = () => ({ stdout: "", exitCode: 0 });
});

// compose-discovery-service.md — "ComposeProjectSummary: { name, configFiles, state, services }";
// "services: ComposeServiceSummary[] — { name, image, state, replicas }; replicas is the number of
// container instances currently backing that service"
test("listComposeProjects reports each project with its config files, state and services", async () => {
  installProjects([{ name: "blog", services: ["web", "web", "worker"] }]);

  const [project] = await listComposeProjects();

  assert.equal(project!.name, "blog");
  assert.deepEqual(project!.configFiles, ["/srv/blog/compose.yml"]);
  assert.equal(project!.state, "running");
  assert.deepEqual(
    project!.services.map((service) => ({ name: service.name, replicas: service.replicas })),
    [
      { name: "web", replicas: 2 },
      { name: "worker", replicas: 1 },
    ],
  );
});

// compose-discovery-service.md — "Ordered by project name under the list-order rule (compareNames):
// web-2 before web-10, Api next to api-gateway rather than in a second alphabet" (REQ-35)
test("listComposeProjects reads digit runs in a project name as numbers, and keeps case together", async () => {
  installProjects([
    { name: "web-10", services: [] },
    { name: "WEB-3", services: [] },
    { name: "web-2", services: [] },
    { name: "Api", services: [] },
    { name: "api-gateway", services: [] },
  ]);

  const projects = await listComposeProjects();

  assert.deepEqual(
    projects.map((project) => project.name),
    ["Api", "api-gateway", "web-2", "WEB-3", "web-10"],
  );
});

// compose-discovery-service.md — "The services listed within a compose project are ordered by
// service name under the same rule" (REQ-36)
test("listComposeProjects reads digit runs in a service name as numbers, and keeps case together", async () => {
  installProjects([{ name: "blog", services: ["worker-10", "WORKER-3", "worker-2"] }]);

  const [project] = await listComposeProjects();

  assert.deepEqual(
    project!.services.map((service) => service.name),
    ["worker-2", "WORKER-3", "worker-10"],
  );
});

// compose-discovery-service.md — "A project carries no identifier other than its name, so the final
// comparison is that same name compared exactly, which separates two projects whose names differ
// only in case or in leading zeros (app-1 from app-01)"; the same for a service name (REQ-35,
// REQ-36), and "the same projects produce the same sequence on every read, whatever order
// docker compose ls listed them in" (REQ-43, REQ-6).
test("listComposeProjects produces one sequence for tying project and service names, in either input order", async () => {
  const discovered: FakeProject[] = [
    { name: "app-01", services: ["api-1", "api-01"] },
    { name: "App-1", services: ["Cache", "cache"] },
  ];
  const expected = [
    { project: "App-1", services: ["Cache", "cache"] },
    { project: "app-01", services: ["api-01", "api-1"] },
  ];
  const read = async () =>
    (await listComposeProjects()).map((project) => ({ project: project.name, services: project.services.map((service) => service.name) }));

  installProjects(discovered);
  const asDiscovered = await read();

  installProjects(reversed(discovered));
  const theOtherWayRound = await read();

  assert.deepEqual(asDiscovered, expected);
  assert.deepEqual(theOtherWayRound, expected, "the same projects must come out the same way in either input order");
});

// compose-discovery-service.md — the services are ordered "in getComposeProject exactly as in
// listComposeProjects" (REQ-36, REQ-43)
test("getComposeProject orders the services of the single project it re-reads", async () => {
  const discovered: FakeProject[] = [{ name: "blog", services: ["web-1", "web-01", "Cache", "cache"] }];

  installProjects(discovered);
  const asDiscovered = await getComposeProject("blog");

  installProjects(reversed(discovered));
  const theOtherWayRound = await getComposeProject("blog");

  assert.deepEqual(
    asDiscovered.services.map((service) => service.name),
    ["Cache", "cache", "web-01", "web-1"],
  );
  assert.deepEqual(
    theOtherWayRound.services.map((service) => service.name),
    ["Cache", "cache", "web-01", "web-1"],
    "a single project's services must come out the same way in either input order",
  );
});
