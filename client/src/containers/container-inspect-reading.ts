import type { StatusTone } from '../ui';
import { healthTone, stateTone } from './container-status';

/**
 * A value of the container inspect payload read in the operator's terms. It is
 * shown **beside** the daemon's own literal, never in place of it.
 */
export interface ContainerValueReading {
  /** The reading itself; absent where the reading is only a tone on the literal. */
  text?: string;
  /** Drawn as a pill rather than as text. */
  pill?: boolean;
  tone?: StatusTone;
}

/** Keys whose value is an RFC 3339 instant. */
const TIMESTAMP_KEYS = new Set(['Created', 'StartedAt', 'FinishedAt', 'Start', 'End']);

/** Keys whose value is a count of bytes. */
const BYTE_KEYS = new Set(['Memory', 'MemorySwap', 'MemoryReservation', 'KernelMemory', 'ShmSize', 'SizeRw', 'SizeRootFs']);

/** Resource keys where the daemon documents `0` as "no limit", and only those. */
const NO_LIMIT_KEYS = new Set(['Memory', 'MemorySwap', 'MemoryReservation', 'KernelMemory', 'NanoCpus']);

/** Keys whose value is a duration in nanoseconds. */
const NANOSECOND_KEYS = new Set(['Interval', 'Timeout', 'StartPeriod', 'StartInterval']);

/** Go's zero time, which the daemon sends for an instant that never happened. */
const NEVER = '0001-01-01T00:00:00Z';

const BYTE_UNITS = ['KB', 'MB', 'GB', 'TB'];

function formatBytes(bytes: number): string {
  if (Math.abs(bytes) < 1024) return `${bytes} B`;
  let value = bytes / 1024;
  let unitIndex = 0;
  while (Math.abs(value) >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${BYTE_UNITS[unitIndex]}`;
}

function formatNanoseconds(nanos: number): string {
  return `${Number((nanos / 1e9).toFixed(3))}s`;
}

function formatTimestamp(value: string): string | undefined {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toLocaleString('en-GB');
}

/** `HostIp`/`HostPort` under a `<port>/<protocol>` key: the binding, read host → container. */
function readPortBinding(path: readonly string[], value: unknown): ContainerValueReading | undefined {
  if (path.length < 3) return undefined;
  const inPorts = (path[0] === 'NetworkSettings' && path[1] === 'Ports') || (path[0] === 'HostConfig' && path[1] === 'PortBindings');
  if (!inPorts || value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const binding = value as { HostIp?: unknown; HostPort?: unknown };
  if (typeof binding.HostPort !== 'string' || binding.HostPort === '') return undefined;
  const host = typeof binding.HostIp === 'string' && binding.HostIp !== '' ? binding.HostIp : '0.0.0.0';
  return { text: `${host}:${binding.HostPort} → ${path[2]}` };
}

/**
 * What the container inspect payload's keys mean, by key path — the module's
 * one such rule, beside `container-status.ts`. A key it does not recognise is
 * read by nobody: the literal stands on its own.
 */
export function readContainerInspectValue(path: readonly string[], value: unknown): ContainerValueReading | undefined {
  const address = path.join('.');
  const key = path[path.length - 1] ?? '';

  // The state pill and the exit code's danger tone are the module's existing
  // readings, not second ones (`container-status.ts`).
  if (address === 'State.Status' && typeof value === 'string') {
    return { text: value.toUpperCase(), pill: true, tone: stateTone(value) };
  }
  if (address === 'State.Health.Status' && typeof value === 'string') {
    return { text: value.toUpperCase(), pill: true, tone: healthTone(value) };
  }
  if (address === 'State.ExitCode' && typeof value === 'number') {
    return value === 0 ? undefined : { tone: 'danger' };
  }

  const binding = readPortBinding(path, value);
  if (binding) return binding;

  if (TIMESTAMP_KEYS.has(key) && typeof value === 'string' && value !== '') {
    if (value === NEVER) return { text: 'never' };
    const readable = formatTimestamp(value);
    return readable === undefined ? undefined : { text: readable };
  }

  if (typeof value === 'number') {
    // `0` is annotated only where the daemon documents it as "no limit"; anywhere
    // else the number is the number.
    if (value === 0 && NO_LIMIT_KEYS.has(key)) return { text: 'no limit' };
    if (key === 'NanoCpus') return { text: `${Number((value / 1e9).toFixed(3))} CPUs` };
    if (BYTE_KEYS.has(key)) return { text: formatBytes(value) };
    if (NANOSECOND_KEYS.has(key) && value !== 0) return { text: formatNanoseconds(value) };
  }

  if (typeof value === 'boolean') return { text: value ? 'yes' : 'no' };

  return undefined;
}
