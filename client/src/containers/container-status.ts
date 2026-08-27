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

/**
 * The tone of a state the daemon named as a plain string (the inspect payload's
 * own `State.Status`), read off the one table above rather than off a second
 * reading of it. A state the table does not name is drawn neutral.
 */
export function stateTone(status: string): StatusTone {
  return STATE_TONE[status as ContainerState] ?? 'neutral';
}

export interface ContainerHealthOutcome {
  label: string;
  tone: StatusTone;
}

/** The one rule the health outcome is drawn by, whatever surface states it. */
const HEALTH_TONE: Record<string, StatusTone> = {
  healthy: 'success',
  unhealthy: 'danger',
  starting: 'warning',
};

/**
 * The tone of a health outcome the daemon named as a plain string (the inspect
 * payload's own `State.Health.Status`). An outcome the table does not name is
 * drawn neutral.
 */
export function healthTone(status: string): StatusTone {
  return HEALTH_TONE[status.toLowerCase()] ?? 'neutral';
}

// The daemon states the outcome inside the status sentence it already sends with
// every listed container ("Up 4 minutes (healthy)"), so reading it costs no
// request: a container with no health check carries no such parenthetical, which
// is how "there is no health check" is told from an outcome.
const HEALTH_OUTCOMES: { marker: string; label: string; tone: StatusTone }[] = [
  { marker: '(unhealthy)', label: 'UNHEALTHY', tone: healthTone('unhealthy') },
  { marker: '(healthy)', label: 'HEALTHY', tone: healthTone('healthy') },
  { marker: '(health: starting)', label: 'STARTING', tone: healthTone('starting') },
];

/** The health outcome the daemon's status sentence states, or `undefined` when it states none. */
export function readHealthOutcome(status: string): ContainerHealthOutcome | undefined {
  const sentence = status.toLowerCase();
  const found = HEALTH_OUTCOMES.find((outcome) => sentence.includes(outcome.marker));
  return found === undefined ? undefined : { label: found.label, tone: found.tone };
}
