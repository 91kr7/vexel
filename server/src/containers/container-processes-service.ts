// Processes running inside a container (REQ-33), read on demand from the
// Engine API's top endpoint and normalised into pid / user / command.
import { getEngineClient } from "../connectivity/connection-status-service.js";

export interface ContainerProcess {
  pid: number;
  user: string;
  command: string;
  cpuPercent?: number;
  memoryPercent?: number;
}

export interface ContainerProcessList {
  /** The column titles reported by the daemon, in their original order. */
  titles: string[];
  processes: ContainerProcess[];
}

interface RawTop {
  Titles?: string[];
  Processes?: string[][];
}

const PID_TITLES = ["PID"];
const USER_TITLES = ["USER", "UID", "OWNER"];
const COMMAND_TITLES = ["COMMAND", "CMD", "ARGS"];

export async function listContainerProcesses(id: string): Promise<ContainerProcessList> {
  const engine = getEngineClient();
  const response = await engine.request(`/containers/${encodeURIComponent(id)}/top`);
  const raw = JSON.parse(response.body) as RawTop;
  const titles = raw.Titles ?? [];
  const pidIndex = findColumn(titles, PID_TITLES);
  const userIndex = findColumn(titles, USER_TITLES);
  const commandIndex = findColumn(titles, COMMAND_TITLES);
  const cpuIndex = findColumn(titles, ["%CPU"]);
  const memoryIndex = findColumn(titles, ["%MEM"]);

  const processes = (raw.Processes ?? []).map((row) => ({
    pid: toNumber(cell(row, pidIndex, titles.length)) ?? 0,
    user: cell(row, userIndex, titles.length) ?? "",
    command: cell(row, commandIndex, titles.length) ?? "",
    cpuPercent: toNumber(cell(row, cpuIndex, titles.length)),
    memoryPercent: toNumber(cell(row, memoryIndex, titles.length)),
  }));

  return { titles, processes };
}

function findColumn(titles: string[], candidates: string[]): number {
  return titles.findIndex((title) => candidates.includes(title.trim().toUpperCase()));
}

/**
 * Reads a column of a process row. When the row carries more fields than there
 * are titles, the surplus belongs to the last column (an unquoted command with
 * spaces), so it is joined back onto it.
 */
function cell(row: string[], index: number, titleCount: number): string | undefined {
  if (index < 0 || index >= row.length) return undefined;
  if (index === titleCount - 1 && row.length > titleCount) return row.slice(index).join(" ");
  return row[index];
}

function toNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}
