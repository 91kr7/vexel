// The readings every swarm panel shows the same way: an age, a replica count
// and the tone a node's or a task's state maps to. An unknown state keeps the
// daemon's own word and never reads as healthy.
import type { BadgeTone, KeyValuePair, StatusTone } from '../ui';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;

export function formatAge(iso?: string): string {
  if (!iso) return '—';
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) return '—';
  const elapsed = Date.now() - timestamp;
  if (elapsed < MINUTE) return 'just now';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
  if (elapsed < MONTH) return `${Math.floor(elapsed / DAY)}d ago`;
  return `${Math.floor(elapsed / MONTH)}mo ago`;
}

export function formatReplicas(running?: number, desired?: number): string {
  if (running !== undefined && desired !== undefined) return `${running}/${desired}`;
  if (desired !== undefined) return `?/${desired}`;
  return '—';
}

/** The key/value rows of a label editor as the daemon takes them; a row with no key is dropped. */
export function toLabels(pairs: KeyValuePair[]): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const pair of pairs) {
    if (pair.key.trim() !== '') labels[pair.key.trim()] = pair.value;
  }
  return labels;
}

export function nodeStatusTone(status: string): StatusTone {
  if (status === 'ready') return 'success';
  if (status === 'down' || status === 'disconnected') return 'danger';
  return 'warning';
}

export function availabilityTone(availability: string): BadgeTone {
  return availability === 'active' ? 'success' : 'warning';
}

export function taskStateTone(state: string): StatusTone {
  if (state === 'running' || state === 'complete') return 'success';
  if (state === 'failed' || state === 'rejected' || state === 'orphaned') return 'danger';
  return 'warning';
}
