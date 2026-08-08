// Build-cache inventory and prune through the CLI channel (REQ-91): record
// id, type, size and usage state, and reclaiming unused records.
import { parseHumanSize, runBuildxCapture, runBuildxJsonArray } from "./buildx-cli.js";

export type BuildCacheUsageState = "shared" | "in-use" | "reclaimable";

export interface BuildCacheRecord {
  id: string;
  type: string;
  sizeBytes: number;
  usageState: BuildCacheUsageState;
}

export interface BuildCachePruneResult {
  reclaimedBytes: number;
}

interface RawCacheRecord {
  ID: string;
  Type: string;
  Size: string;
  Shared: boolean;
  Reclaimable: boolean;
}

export async function listBuildCache(): Promise<BuildCacheRecord[]> {
  const raw = await runBuildxJsonArray<RawCacheRecord>(["du", "--format", "json"]);
  return raw.map(toCacheRecord);
}

/** Prunes reclaimable build-cache records, reporting the space reclaimed. */
export async function pruneBuildCache(): Promise<BuildCachePruneResult> {
  const output = await runBuildxCapture(["prune", "--force"]);
  return { reclaimedBytes: parseReclaimedBytes(output) };
}

function toCacheRecord(raw: RawCacheRecord): BuildCacheRecord {
  return { id: raw.ID, type: raw.Type, sizeBytes: parseHumanSize(raw.Size), usageState: usageStateOf(raw) };
}

/** A record still attached to a build in progress is not reclaimable regardless of whether it is also shared. */
function usageStateOf(raw: RawCacheRecord): BuildCacheUsageState {
  if (!raw.Reclaimable) return "in-use";
  return raw.Shared ? "shared" : "reclaimable";
}

function parseReclaimedBytes(output: string): number {
  const match = output.match(/Total:\s*([\d.]+\s*[A-Za-z]+)/);
  if (!match) throw new Error(`Could not parse buildx prune output: "${output.trim()}"`);
  return parseHumanSize(match[1]);
}
