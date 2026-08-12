// Compose project discovery through the CLI channel (REQ-75): project name,
// compose file path(s) — discovered from the daemon's own
// `com.docker.compose.project.config_files` label via `docker compose ls`,
// never typed — and overall/per-service state via `docker compose ps`.
import { byNameThenIdentity } from "../list-order/list-order.js";
import { runComposeJsonArray } from "./compose-cli.js";

export interface ComposeServiceSummary {
  name: string;
  image: string;
  state: string;
  /** Number of container instances currently backing this service. */
  replicas: number;
}

export type ComposeProjectState = "running" | "partial" | "stopped" | "unknown";

export interface ComposeProjectSummary {
  name: string;
  /** Discovered from the project's own config_files label; a project brought up with several `-f` files carries several entries. */
  configFiles: string[];
  state: ComposeProjectState;
  services: ComposeServiceSummary[];
  /** The daemon's own message, set only when this project's services could not be read. */
  error?: string;
}

interface RawComposeProjectListing {
  Name: string;
  ConfigFiles?: string;
}

interface RawComposeServiceStatus {
  Service: string;
  State: string;
  Image: string;
}

export async function listComposeProjects(): Promise<ComposeProjectSummary[]> {
  const listing = await runComposeJsonArray<RawComposeProjectListing>(["ls", "--all", "--format", "json"]);
  const projects = await Promise.all(listing.map((project) => toProjectSummary(project.Name, splitConfigFiles(project.ConfigFiles))));
  // A project has no identifier but its name, so the last comparison is that
  // same name compared exactly.
  return projects.sort(byNameThenIdentity({ name: (project) => project.name, identity: (project) => project.name }));
}

/** Re-reads a single project's own status, e.g. right after a lifecycle action. */
export async function getComposeProject(name: string): Promise<ComposeProjectSummary> {
  const listing = await runComposeJsonArray<RawComposeProjectListing>(["ls", "--all", "--format", "json"]);
  const match = listing.find((project) => project.Name === name);
  return toProjectSummary(name, splitConfigFiles(match?.ConfigFiles));
}

function splitConfigFiles(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((path) => path.trim())
    .filter((path) => path !== "");
}

async function toProjectSummary(name: string, configFiles: string[]): Promise<ComposeProjectSummary> {
  try {
    const raw = await runComposeJsonArray<RawComposeServiceStatus>(["-p", name, "ps", "--all", "--format", "json"]);
    const services = groupServices(raw);
    return { name, configFiles, state: overallState(services), services };
  } catch (error) {
    return { name, configFiles, state: "unknown", services: [], error: (error as Error).message };
  }
}

function groupServices(raw: RawComposeServiceStatus[]): ComposeServiceSummary[] {
  const byService = new Map<string, RawComposeServiceStatus[]>();
  for (const row of raw) {
    const rows = byService.get(row.Service) ?? [];
    rows.push(row);
    byService.set(row.Service, rows);
  }
  // A service has no identifier but its name within the project, so the last
  // comparison is that same name compared exactly.
  return [...byService.entries()]
    .map(([name, rows]) => ({
      name,
      image: rows[0]?.Image ?? "",
      state: rows.some((row) => row.State === "running") ? "running" : (rows[0]?.State ?? "unknown"),
      replicas: rows.length,
    }))
    .sort(byNameThenIdentity({ name: (service) => service.name, identity: (service) => service.name }));
}

function overallState(services: ComposeServiceSummary[]): ComposeProjectState {
  if (services.length === 0) return "unknown";
  const runningCount = services.filter((service) => service.state === "running").length;
  if (runningCount === 0) return "stopped";
  if (runningCount === services.length) return "running";
  return "partial";
}
