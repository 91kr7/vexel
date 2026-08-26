import type { StatusTone } from '../ui';
import type { ContainerState } from '../data/containers-client';

/** The one rule the dot, the pill, the accent edge and the metric fills all read. */
export const STATE_TONE: Record<ContainerState, StatusTone> = {
  created: 'neutral',
  running: 'success',
  paused: 'warning',
  restarting: 'warning',
  removing: 'neutral',
  exited: 'neutral',
  dead: 'danger',
};

export interface ContainerHealthOutcome {
  label: string;
  tone: StatusTone;
}

// The daemon states the outcome inside the status sentence it already sends with
// every listed container ("Up 4 minutes (healthy)"), so reading it costs no
// request: a container with no health check carries no such parenthetical, which
// is how "there is no health check" is told from an outcome.
const HEALTH_OUTCOMES: { marker: string; label: string; tone: StatusTone }[] = [
  { marker: '(unhealthy)', label: 'UNHEALTHY', tone: 'danger' },
  { marker: '(healthy)', label: 'HEALTHY', tone: 'success' },
  { marker: '(health: starting)', label: 'STARTING', tone: 'warning' },
];

/** The health outcome the daemon's status sentence states, or `undefined` when it states none. */
export function readHealthOutcome(status: string): ContainerHealthOutcome | undefined {
  const sentence = status.toLowerCase();
  const found = HEALTH_OUTCOMES.find((outcome) => sentence.includes(outcome.marker));
  return found === undefined ? undefined : { label: found.label, tone: found.tone };
}
