// The raw console's command history, kept in the local store so it outlives a
// restart (REQ-102, REQ-114). A line that could carry a credential is never
// written here: the console must not become the place a password ends up on
// disk (REQ-104).
import { randomUUID } from "node:crypto";
import { readNamespace, writeNamespace } from "../persistence/local-store.js";
import { carriesSecret, type ConsoleChannel } from "./console-command.js";

/** Kept bounded so a long-lived installation's history file stays small. */
const MAX_ENTRIES = 200;
/** Per entry; enough to read back what a command answered without storing a whole image build. */
const MAX_OUTPUT_CHARS = 8192;
const TRUNCATION_MARKER = "\n… output truncated";

export interface ConsoleHistoryEntry {
  id: string;
  channel: ConsoleChannel;
  /** Exactly what the operator typed. */
  command: string;
  /** ISO-8601 instant the entry ended. */
  timestamp: string;
  /** How it ended, in the channel's own terms: "exit 0", "HTTP 404", "cancelled". */
  status?: string;
  succeeded?: boolean;
  output?: string;
}

export type NewConsoleHistoryEntry = Omit<ConsoleHistoryEntry, "id" | "timestamp"> & { timestamp?: string };

export function readConsoleHistory(): ConsoleHistoryEntry[] {
  const stored = readNamespace<unknown>("console-history", []);
  if (!Array.isArray(stored)) return [];
  return stored.filter(isHistoryEntry);
}

/**
 * Appends one entry and answers with the history as it now stands. An entry
 * whose command could carry a credential, and an entry with no command, are
 * dropped: the answer is then the unchanged history.
 */
export async function appendConsoleHistoryEntry(entry: NewConsoleHistoryEntry): Promise<ConsoleHistoryEntry[]> {
  const existing = readConsoleHistory();
  if (typeof entry.command !== "string" || entry.command.trim() === "") return existing;
  if (carriesSecret(entry.command)) return existing;

  const stored: ConsoleHistoryEntry = {
    id: randomUUID(),
    channel: entry.channel === "api" ? "api" : "cli",
    command: entry.command,
    timestamp: entry.timestamp ?? new Date().toISOString(),
    ...(entry.status ? { status: entry.status } : {}),
    ...(entry.succeeded === undefined ? {} : { succeeded: entry.succeeded }),
    ...(entry.output ? { output: truncate(entry.output) } : {}),
  };

  const next = [...existing, stored].slice(-MAX_ENTRIES);
  await writeNamespace("console-history", next);
  return next;
}

function truncate(output: string): string {
  return output.length <= MAX_OUTPUT_CHARS ? output : `${output.slice(0, MAX_OUTPUT_CHARS)}${TRUNCATION_MARKER}`;
}

function isHistoryEntry(candidate: unknown): candidate is ConsoleHistoryEntry {
  if (typeof candidate !== "object" || candidate === null) return false;
  const entry = candidate as Partial<ConsoleHistoryEntry>;
  return typeof entry.id === "string" && typeof entry.command === "string" && (entry.channel === "cli" || entry.channel === "api");
}
