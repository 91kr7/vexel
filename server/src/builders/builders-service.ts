// buildx builder inventory and management through the CLI channel (REQ-88,
// REQ-89): name, driver, endpoint, supported platforms, status and cache
// size, which builder is active, plus select-active, create and remove.
import { parseHumanSize, runBuildxCapture, runBuildxJsonArray } from "./buildx-cli.js";

export interface BuilderSummary {
  name: string;
  driver: string;
  endpoint: string;
  platforms: string[];
  status: string;
  /** Whether this is the builder `docker buildx build` uses by default. */
  active: boolean;
  /** Total build-cache size for this builder; omitted when it could not be read (e.g. the builder is not running). */
  cacheBytes?: number;
}

export interface CreateBuilderInput {
  name: string;
  driver: string;
  /** Context name or remote endpoint (e.g. `tcp://build01:1234`); omitted for a local, context-less builder. */
  endpoint?: string;
  platforms: string[];
}

interface RawBuilderNode {
  Endpoint: string;
  Platforms?: string[];
  Status?: string;
}

interface RawBuilder {
  Name: string;
  Driver: string;
  Current: boolean;
  Nodes?: RawBuilderNode[];
}

interface RawCacheRecord {
  Size: string;
}

export async function listBuilders(): Promise<BuilderSummary[]> {
  const raw = await runBuildxJsonArray<RawBuilder>(["ls", "--format", "json"]);
  return Promise.all(raw.map(toBuilderSummary));
}

export async function createBuilder(input: CreateBuilderInput): Promise<BuilderSummary> {
  const args = ["create", "--name", input.name, "--driver", input.driver];
  for (const platform of input.platforms) args.push("--platform", platform);
  if (input.endpoint) args.push(input.endpoint);
  await runBuildxCapture(args);
  return getBuilder(input.name);
}

export async function removeBuilder(name: string): Promise<void> {
  await runBuildxCapture(["rm", name]);
}

/** Sets `name` as the builder `docker buildx build` uses by default. */
export async function useBuilder(name: string): Promise<BuilderSummary> {
  await runBuildxCapture(["use", name]);
  return getBuilder(name);
}

async function getBuilder(name: string): Promise<BuilderSummary> {
  const builders = await listBuilders();
  const match = builders.find((builder) => builder.name === name);
  if (!match) throw new Error(`Builder "${name}" was not found`);
  return match;
}

async function toBuilderSummary(raw: RawBuilder): Promise<BuilderSummary> {
  const nodes = raw.Nodes ?? [];
  return {
    name: raw.Name,
    driver: raw.Driver,
    endpoint: nodes[0]?.Endpoint ?? "-",
    platforms: [...new Set(nodes.flatMap((node) => node.Platforms ?? []))],
    status: overallStatus(nodes),
    active: raw.Current,
    cacheBytes: await readCacheBytes(raw.Name),
  };
}

function overallStatus(nodes: RawBuilderNode[]): string {
  if (nodes.length === 0) return "unknown";
  if (nodes.some((node) => node.Status?.toLowerCase() === "running")) return "running";
  return nodes[0]?.Status ?? "unknown";
}

/** `undefined` when the builder's cache could not be read (e.g. not running): the daemon's own reason is not actionable for display here. */
async function readCacheBytes(name: string): Promise<number | undefined> {
  try {
    const records = await runBuildxJsonArray<RawCacheRecord>(["du", "--builder", name, "--format", "json"]);
    return records.reduce((total, record) => total + parseHumanSize(record.Size), 0);
  } catch {
    return undefined;
  }
}
