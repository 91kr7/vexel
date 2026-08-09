import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { availabilityTone, formatAge, formatReplicas, nodeStatusTone, taskStateTone, toLabels } from '../../src/swarm/swarm-formatting';

// The few readings every swarm panel shows the same way
// (swarm/specs/swarm-formatting.md, REQ-81, REQ-82, REQ-84).
const NOW = new Date('2026-08-09T12:00:00.000Z');

/** An ISO timestamp the given number of milliseconds before the pinned "now". */
function ago(milliseconds: number): string {
  return new Date(NOW.getTime() - milliseconds).toISOString();
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('formatAge (swarm/specs/swarm-formatting.md)', () => {
  // "an ISO timestamp -> the mockup's shorthand: 3m ago, 5h ago, 18d ago, 4mo ago"
  it('reads an age in the mockup shorthand, in the largest unit that fits', () => {
    expect(formatAge(ago(3 * MINUTE))).toBe('3m ago');
    expect(formatAge(ago(5 * HOUR))).toBe('5h ago');
    expect(formatAge(ago(18 * DAY))).toBe('18d ago');
    expect(formatAge(ago(120 * DAY))).toBe('4mo ago');
  });

  // "under a minute -> just now"
  it('reads an age under a minute as just now', () => {
    expect(formatAge(ago(45_000))).toBe('just now');
    expect(formatAge(ago(0))).toBe('just now');
  });

  // "absent or unparseable -> —"
  it('reads an absent or unparseable timestamp as a dash', () => {
    expect(formatAge(undefined)).toBe('—');
    expect(formatAge('')).toBe('—');
    expect(formatAge('not a timestamp')).toBe('—');
  });
});

describe('formatReplicas (swarm/specs/swarm-formatting.md)', () => {
  // "both known -> running/desired; only the desired -> ?/desired; neither -> —"
  it('reads a replica count from what is known of it', () => {
    expect(formatReplicas(2, 3)).toBe('2/3');
    expect(formatReplicas(0, 3)).toBe('0/3');
    expect(formatReplicas(undefined, 3)).toBe('?/3');
    expect(formatReplicas(undefined, undefined)).toBe('—');
  });
});

describe('toLabels (swarm/specs/swarm-formatting.md)', () => {
  // "the key/value rows of a label editor as the daemon takes them; a row whose key is blank is
  // dropped, and a key is trimmed"
  it('turns the editor rows into the map the daemon takes', () => {
    expect(toLabels([{ key: 'vexel.test.run', value: '123' }, { key: 'owner', value: 'team' }])).toEqual({
      'vexel.test.run': '123',
      owner: 'team',
    });
  });

  it('drops a row whose key is blank, and trims the key it keeps', () => {
    expect(toLabels([{ key: '  ', value: 'orphan' }, { key: '', value: 'orphan' }, { key: '  owner ', value: 'team' }])).toEqual({
      owner: 'team',
    });
  });

  it('keeps a value exactly as typed, spaces and all', () => {
    expect(toLabels([{ key: 'note', value: '  spaced out  ' }])).toEqual({ note: '  spaced out  ' });
  });

  it('reads no rows as no labels', () => {
    expect(toLabels([])).toEqual({});
  });
});

describe('the tones a state maps to (swarm/specs/swarm-formatting.md)', () => {
  // "ready -> success; down / disconnected -> danger; anything else -> warning"
  it('maps a node status to its tone, and never colours an unknown one as healthy', () => {
    expect(nodeStatusTone('ready')).toBe('success');
    expect(nodeStatusTone('down')).toBe('danger');
    expect(nodeStatusTone('disconnected')).toBe('danger');
    expect(nodeStatusTone('unknown')).toBe('warning');
    expect(nodeStatusTone('something-the-daemon-invented')).toBe('warning');
  });

  // "active -> success; pause -> warning; drain -> warning"
  it('maps an availability to its tone', () => {
    expect(availabilityTone('active')).toBe('success');
    expect(availabilityTone('pause')).toBe('warning');
    expect(availabilityTone('drain')).toBe('warning');
  });

  // "running / complete -> success; failed / rejected / orphaned -> danger; anything else
  // (assigned, preparing, starting, shutdown...) -> warning"
  it('maps a task state to its tone, keeping an unfamiliar one a warning', () => {
    expect(taskStateTone('running')).toBe('success');
    expect(taskStateTone('complete')).toBe('success');
    expect(taskStateTone('failed')).toBe('danger');
    expect(taskStateTone('rejected')).toBe('danger');
    expect(taskStateTone('orphaned')).toBe('danger');
    for (const state of ['assigned', 'preparing', 'starting', 'shutdown', 'remove']) {
      expect(taskStateTone(state)).toBe('warning');
    }
  });
});
