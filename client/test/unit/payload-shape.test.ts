/**
 * The shape reading of an arbitrary JSON payload — `ui-library/specs/payload-shape.md`,
 * serving `…-inspect_full_payload/REQ-4`, REQ-6, REQ-7, REQ-8, REQ-10, REQ-14, REQ-21.
 */
import { describe, expect, it } from 'vitest';
import {
  flattenPayload,
  isEmptyPayloadValue,
  matchPayload,
  payloadCount,
  payloadFields,
  payloadKind,
  payloadLiteral,
  payloadPathKey,
  splitTopLevelKeys,
} from '../../src/ui';

describe('payloadKind (payload-shape.md)', () => {
  // payload-shape.md — an array is `array`, a non-null object is `object`, everything else is `scalar`
  it('reads an array as array, a non-null object as object and everything else — null included — as scalar', () => {
    expect(payloadKind([])).toBe('array');
    expect(payloadKind([1, 2])).toBe('array');
    expect(payloadKind({})).toBe('object');
    expect(payloadKind({ a: 1 })).toBe('object');
    expect(payloadKind(null)).toBe('scalar');
    expect(payloadKind(undefined)).toBe('scalar');
    expect(payloadKind(0)).toBe('scalar');
    expect(payloadKind(false)).toBe('scalar');
    expect(payloadKind('')).toBe('scalar');
  });
});

describe('isEmptyPayloadValue (payload-shape.md, REQ-6, REQ-7)', () => {
  // REQ-6 — `null`, `""`, `[]` and `{}` hold nothing
  it('calls null, undefined, the empty string, the empty list and the empty object empty', () => {
    for (const value of [null, undefined, '', [], {}]) {
      expect(isEmptyPayloadValue(value), `${JSON.stringify(value) ?? 'undefined'} is not read as empty`).toBe(true);
    }
  });

  // REQ-7 — `0`, `false` and `"0"` are values, never emptiness
  it('calls zero, false and the string zero values rather than emptiness', () => {
    for (const value of [0, false, '0', -0, Number.NaN, 'text', [null], { a: undefined }]) {
      expect(isEmptyPayloadValue(value), `${JSON.stringify(value)} is read as empty`).toBe(false);
    }
  });
});

describe('payloadCount (payload-shape.md, REQ-9)', () => {
  // payload-shape.md — a node's own count: items of an array, fields of an object, nothing for a scalar
  it('counts the items of an array, the fields of an object and nothing for a scalar', () => {
    expect(payloadCount([1, 2, 3])).toBe(3);
    expect(payloadCount([])).toBe(0);
    expect(payloadCount({ a: 1, b: 2 })).toBe(2);
    expect(payloadCount({})).toBe(0);
    expect(payloadCount('a long string')).toBe(0);
    expect(payloadCount(42)).toBe(0);
    expect(payloadCount(null)).toBe(0);
  });
});

describe('payloadLiteral (payload-shape.md, REQ-13)', () => {
  // payload-shape.md — a scalar as the text the payload carries, a composite as no literal at all
  it("renders a scalar as the payload's own text and never stringifies a composite", () => {
    expect(payloadLiteral('sha256:abc')).toBe('sha256:abc');
    expect(payloadLiteral(0)).toBe('0');
    expect(payloadLiteral(false)).toBe('false');
    expect(payloadLiteral(true)).toBe('true');
    expect(payloadLiteral(null)).toBe('null');
    expect(payloadLiteral(undefined)).toBe('null');
    expect(payloadLiteral({ a: 1 }), 'an object yields stringified JSON').toBe('');
    expect(payloadLiteral([1, 2]), 'an array yields stringified JSON').toBe('');
  });
});

describe('payloadFields (payload-shape.md, REQ-10, REQ-14)', () => {
  // REQ-10 — an object's fields come in the payload's own key order, never sorted
  it("lists an object's fields in the payload's own key order", () => {
    const payload = { Zeta: 1, Alpha: 2, Mu: 3 };

    expect(payloadFields(payload).map((field) => field.key)).toEqual(['Zeta', 'Alpha', 'Mu']);
  });

  // REQ-14 — an item of an array is identified by its position
  it("keys an array's items by their position", () => {
    expect(payloadFields(['a', 'b'])).toEqual([
      { key: '[0]', value: 'a' },
      { key: '[1]', value: 'b' },
    ]);
  });

  // payload-shape.md — a scalar holds nothing
  it('gives a scalar no fields', () => {
    expect(payloadFields('text')).toEqual([]);
    expect(payloadFields(null)).toEqual([]);
  });
});

describe('splitTopLevelKeys (payload-shape.md, REQ-8, REQ-10)', () => {
  // REQ-8 — every composite top-level value is a section of its own, every scalar one is gathered
  it("gathers the top-level scalars and makes a section of every composite key, in the payload's own order", () => {
    const payload = { Id: 'abc', State: { Status: 'running' }, Created: '2026-01-01T00:00:00Z', Mounts: [], Name: '/web' };

    const split = splitTopLevelKeys(payload);

    expect(split.scalars.map((field) => field.key)).toEqual(['Id', 'Created', 'Name']);
    expect(split.sections.map((field) => field.key)).toEqual(['State', 'Mounts']);
  });

  // REQ-8 — a key the reader has never seen divides exactly like one it has
  it('files an unknown composite key as a section and an unknown scalar key among the scalars', () => {
    const split = splitTopLevelKeys({ SomethingNobodyHasSeen: { a: 1 }, AlsoNew: 7 });

    expect(split.sections.map((field) => field.key)).toEqual(['SomethingNobodyHasSeen']);
    expect(split.scalars.map((field) => field.key)).toEqual(['AlsoNew']);
  });
});

describe('payloadPathKey (payload-shape.md)', () => {
  // payload-shape.md — two different paths never key alike
  it('keys two different paths differently, even where their joined names would collide', () => {
    expect(payloadPathKey(['a', 'b'])).not.toBe(payloadPathKey(['a.b']));
    expect(payloadPathKey(['a', 'b'])).not.toBe(payloadPathKey(['a', 'b', 'c']));
    expect(payloadPathKey(['a', 'b'])).toBe(payloadPathKey(['a', 'b']));
  });
});

describe('flattenPayload (payload-shape.md, REQ-21)', () => {
  // REQ-21 — the whole tree, composite nodes included, each addressable by its path
  it('walks the whole tree in pre-order, holding composite nodes as well as leaves', () => {
    const payload = { Id: 'abc', State: { Status: 'running', Health: { Log: ['first'] } } };

    const nodes = flattenPayload(payload);

    expect(nodes.map((node) => node.path)).toEqual([
      ['Id'],
      ['State'],
      ['State', 'Status'],
      ['State', 'Health'],
      ['State', 'Health', 'Log'],
      ['State', 'Health', 'Log', '[0]'],
    ]);
    expect(nodes.map((node) => node.kind)).toEqual(['scalar', 'object', 'scalar', 'object', 'array', 'scalar']);
    expect(nodes.find((node) => node.key === 'Status')!.literal).toBe('running');
    expect(nodes.find((node) => node.key === 'State')!.literal, 'a composite node carries a literal of its own').toBe('');
  });

  // REQ-21 — an empty composite is a node of the tree like any other
  it('holds an empty object and an empty list as nodes with nothing beneath them', () => {
    const nodes = flattenPayload({ Labels: {}, Dns: [] });

    expect(nodes.map((node) => node.key)).toEqual(['Labels', 'Dns']);
  });
});

describe('matchPayload (payload-shape.md, REQ-19, REQ-20, REQ-21)', () => {
  const payload = {
    Id: 'a1b2c3',
    Name: '/web-nginx',
    State: { Status: 'running', ExitCode: 0 },
    NetworkSettings: { Ports: { '80/tcp': [{ HostIp: '0.0.0.0', HostPort: '8080' }] } },
  };
  const nodes = flattenPayload(payload);

  // REQ-19 — a key name matches, case-insensitively and with the term trimmed
  it('matches on a key name whatever its case, and trims the term', () => {
    const found = matchPayload(nodes, '  exitcode  ');

    expect(found.matchCount).toBe(1);
    expect(found.visiblePaths.has(payloadPathKey(['State', 'ExitCode']))).toBe(true);
    expect(found.visiblePaths.has(payloadPathKey(['State'])), 'the section carrying the match is not on the path').toBe(true);
  });

  // REQ-19 — a literal matches too, so a value the operator expects is searchable
  it('matches on a literal as well as on a key name', () => {
    const found = matchPayload(nodes, '8080');

    expect(found.matchCount).toBe(1);
    expect(found.visiblePaths.has(payloadPathKey(['NetworkSettings', 'Ports', '80/tcp', '[0]', 'HostPort']))).toBe(true);
  });

  // REQ-21 — a value inside a deeply nested array keeps every ancestor that leads to it
  it('keeps every ancestor of a match buried inside a nested array', () => {
    const found = matchPayload(nodes, 'HostIp');

    for (const path of [
      ['NetworkSettings'],
      ['NetworkSettings', 'Ports'],
      ['NetworkSettings', 'Ports', '80/tcp'],
      ['NetworkSettings', 'Ports', '80/tcp', '[0]'],
      ['NetworkSettings', 'Ports', '80/tcp', '[0]', 'HostIp'],
    ]) {
      expect(found.visiblePaths.has(payloadPathKey(path)), `${path.join('.')} is not reachable from its section`).toBe(true);
    }
  });

  // payload-shape.md — a matching composite is shown with everything it holds
  it('shows everything a matching composite holds', () => {
    const found = matchPayload(nodes, 'State');

    expect(found.visiblePaths.has(payloadPathKey(['State', 'Status']))).toBe(true);
    expect(found.visiblePaths.has(payloadPathKey(['State', 'ExitCode']))).toBe(true);
  });

  // REQ-20 — a term nothing carries matches nothing, and says so through its count
  it('reports no match and no path for a term the payload does not carry', () => {
    const found = matchPayload(nodes, 'nothing-carries-this');

    expect(found.matchCount).toBe(0);
    expect(found.visiblePaths.size).toBe(0);
  });

  // payload-shape.md — an empty or blank term is "no filter", not a match of everything
  it('matches nothing at all on an empty or blank term', () => {
    for (const term of ['', '   ']) {
      const found = matchPayload(nodes, term);
      expect(found.matchCount, `the term ${JSON.stringify(term)} matched something`).toBe(0);
      expect(found.visiblePaths.size, `the term ${JSON.stringify(term)} put paths on screen`).toBe(0);
    }
  });

  // REQ-19 — every node that matches is counted, not only the first
  it('counts every node that matches', () => {
    const found = matchPayload(flattenPayload({ A: { Memory: 1 }, B: { MemorySwap: 2 }, C: 'memory' }), 'memory');

    expect(found.matchCount).toBe(3);
  });
});
