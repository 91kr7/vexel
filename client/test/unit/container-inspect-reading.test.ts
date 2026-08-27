/**
 * What a key of the container inspect payload means — `containers/specs/container-inspect-reading.md`,
 * serving `…-inspect_full_payload/REQ-15`, REQ-16, REQ-17, REQ-18, REQ-27, REQ-35.
 */
import { describe, expect, it } from 'vitest';
import { readContainerInspectValue } from '../../src/containers/container-inspect-reading';
import { stateTone } from '../../src/containers/container-status';

function read(path: string[], value: unknown) {
  return readContainerInspectValue(path, value);
}

describe('container inspect reading — the state and the health outcome (REQ-16)', () => {
  // REQ-16 — the state reads as a pill, in the tone the module's one state reading gives it
  it.each([
    ['running', 'success'],
    ['exited', 'neutral'],
    ['paused', 'warning'],
    ['dead', 'danger'],
    ['created', 'neutral'],
  ])('reads the state of a %s container as a pill in its own tone', (status, tone) => {
    expect(read(['State', 'Status'], status)).toEqual({ text: status.toUpperCase(), pill: true, tone });
    expect(stateTone(status), 'the reading and the module reading disagree about the tone').toBe(tone);
  });

  // REQ-16 — the health outcome reads as a pill in that outcome's own tone
  it.each([
    ['healthy', 'success'],
    ['unhealthy', 'danger'],
    ['starting', 'warning'],
  ])('reads a %s health outcome as a pill in its own tone', (status, tone) => {
    expect(read(['State', 'Health', 'Status'], status)).toEqual({ text: status.toUpperCase(), pill: true, tone });
  });

  // container-inspect-reading.md — an outcome the table does not name is drawn neutral
  it('reads an unknown health outcome as a neutral pill', () => {
    expect(read(['State', 'Health', 'Status'], 'none')).toEqual({ text: 'NONE', pill: true, tone: 'neutral' });
  });

  // container-inspect-reading.md — the reading is keyed by the whole path, not by the last key alone
  it('reads a Status key sitting somewhere else in the payload as nothing at all', () => {
    expect(read(['Config', 'Status'], 'running')).toBeUndefined();
  });
});

describe('container inspect reading — the exit code (REQ-16, REQ-18)', () => {
  // REQ-16 — a non-zero exit code is toned as bad news, and the literal itself carries the tone
  it('tones a non-zero exit code as danger and adds no words to it', () => {
    expect(read(['State', 'ExitCode'], 137)).toEqual({ tone: 'danger' });
  });

  // REQ-18 — a zero exit code gets no reading at all: the number is the number
  it('gives a zero exit code no reading whatever', () => {
    expect(read(['State', 'ExitCode'], 0)).toBeUndefined();
  });
});

describe('container inspect reading — instants (REQ-16, REQ-18)', () => {
  // REQ-16, REQ-17 — an instant reads as a readable date beside the literal, never in place of it
  it.each(['Created', 'StartedAt', 'FinishedAt', 'Start', 'End'])('reads %s as a readable date', (key) => {
    const literal = '2026-01-02T03:04:05.678901234Z';

    const reading = read(['State', key], literal);

    expect(reading?.text, `${key} carries no readable date`).toBeDefined();
    expect(reading!.text).not.toBe(literal);
    expect(reading!.text).toContain('2026');
    expect(reading!.pill, 'an instant is drawn as a pill').toBeUndefined();
  });

  // REQ-18 — Go's zero time is the one documented instant sentinel, and it reads as `never`
  it("reads Go's zero time as never", () => {
    expect(read(['State', 'FinishedAt'], '0001-01-01T00:00:00Z')).toEqual({ text: 'never' });
  });

  // container-inspect-reading.md — an unparseable or empty instant yields no reading rather than a wrong one
  it('gives an unparseable or empty instant no reading', () => {
    expect(read(['State', 'StartedAt'], 'not-a-date')).toBeUndefined();
    expect(read(['State', 'StartedAt'], '')).toBeUndefined();
  });
});

describe('container inspect reading — byte counts, CPUs and durations (REQ-16, REQ-18)', () => {
  // REQ-16 — a byte count reads with a unit
  it.each(['Memory', 'MemorySwap', 'MemoryReservation', 'KernelMemory', 'ShmSize', 'SizeRw', 'SizeRootFs'])(
    'reads %s as a count of bytes with a unit',
    (key) => {
      const reading = read(['HostConfig', key], 536870912);

      expect(reading?.text, `${key} carries no byte reading`).toBeDefined();
      expect(reading!.text).toMatch(/^[\d.]+ (B|KB|MB|GB|TB)$/);
    },
  );

  // REQ-18 — `0` is annotated as "no limit" only on the resource limits the daemon documents that way
  it.each(['Memory', 'MemorySwap', 'MemoryReservation', 'KernelMemory', 'NanoCpus'])('reads a zero %s as no limit', (key) => {
    expect(read(['HostConfig', key], 0)).toEqual({ text: 'no limit' });
  });

  // REQ-18 — and every other zero is a zero: `ShmSize` and a restart count are not sentinels
  it('annotates no other zero as a sentinel', () => {
    expect(read(['HostConfig', 'ShmSize'], 0)?.text, 'a zero shm size is read as a sentence').not.toBe('no limit');
    expect(read(['HostConfig', 'ShmSize'], 0)?.text).toMatch(/^0 B$/);
    expect(read(['RestartCount'], 0), 'a zero restart count is annotated').toBeUndefined();
    expect(read(['SizeRw'], 0)?.text).not.toBe('no limit');
  });

  // REQ-16 — a nanosecond CPU quota reads in CPUs
  it('reads a CPU quota in CPUs', () => {
    expect(read(['HostConfig', 'NanoCpus'], 1_500_000_000)).toEqual({ text: '1.5 CPUs' });
  });

  // REQ-16 — a nanosecond duration reads as a duration
  it.each(['Interval', 'Timeout', 'StartPeriod', 'StartInterval'])('reads %s as a duration', (key) => {
    const reading = read(['Config', 'Healthcheck', key], 30_000_000_000);

    expect(reading?.text, `${key} carries no duration`).toBeDefined();
    expect(reading!.text).toBe('30s');
  });

  // REQ-18 — a zero duration is not a sentinel and gets no reading
  it('gives a zero duration no reading', () => {
    expect(read(['Config', 'Healthcheck', 'Interval'], 0)).toBeUndefined();
  });
});

describe('container inspect reading — booleans and port bindings (REQ-16)', () => {
  // REQ-16 — a boolean anywhere reads as yes/no
  it('reads any boolean as yes or no, wherever it sits', () => {
    expect(read(['HostConfig', 'Privileged'], true)).toEqual({ text: 'yes' });
    expect(read(['HostConfig', 'Privileged'], false)).toEqual({ text: 'no' });
    expect(read(['SomethingNobodyHasSeen', 'Deeply', 'Nested'], false)).toEqual({ text: 'no' });
  });

  // REQ-16 — a port binding reads host → container, under both keys the payload carries them
  it.each([
    ['NetworkSettings', 'Ports'],
    ['HostConfig', 'PortBindings'],
  ])('reads a binding under %s.%s as host to container', (root, key) => {
    expect(read([root, key, '80/tcp', '[0]'], { HostIp: '127.0.0.1', HostPort: '8080' })).toEqual({
      text: '127.0.0.1:8080 → 80/tcp',
    });
  });

  // container-inspect-reading.md — an unbound entry gets no binding reading
  it('gives an unbound entry no binding reading', () => {
    expect(read(['NetworkSettings', 'Ports', '80/tcp', '[0]'], { HostIp: '', HostPort: '' })).toBeUndefined();
    expect(read(['NetworkSettings', 'Ports', '80/tcp'], null)).toBeUndefined();
  });
});

describe('container inspect reading — what it refuses to read (REQ-15, REQ-18, REQ-35)', () => {
  // REQ-15 — a key it does not recognise gets no reading, so the daemon's literal stands alone
  it('returns nothing for a key it does not recognise', () => {
    expect(read(['Id'], 'a1b2c3')).toBeUndefined();
    expect(read(['Platform'], 'linux')).toBeUndefined();
    expect(read(['SomethingNobodyHasSeen'], 'a value')).toBeUndefined();
    expect(read(['Config', 'Image'], 'alpine:3.20')).toBeUndefined();
  });

  // REQ-35 — an environment variable carrying a secret is read like any other string: not at all
  it('reads a secret-carrying environment variable exactly as any other string', () => {
    expect(read(['Config', 'Env', '[0]'], 'DATABASE_PASSWORD=s3cr3t')).toBeUndefined();
  });

  // container-inspect-reading.md — pure and total: a wrongly-typed value yields no reading rather than a throw
  it('reads a wrongly-typed value as nothing at all, without throwing', () => {
    expect(() => read(['State', 'Status'], 42)).not.toThrow();
    expect(read(['State', 'Status'], 42)).toBeUndefined();
    expect(read(['State', 'ExitCode'], 'not a number')).toBeUndefined();
    expect(read([], null)).toBeUndefined();
  });
});
