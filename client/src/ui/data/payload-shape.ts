/**
 * The shape reading of an arbitrary JSON payload: what a value is, whether it
 * holds anything, how much it holds, how a payload's own top-level keys divide
 * into sections, and the flattening a find reads.
 *
 * Domain-agnostic: it knows no vocabulary of any product area and fetches
 * nothing. Contract in `.sdd/modules/ui-library/specs/payload-shape.md`.
 */

export type PayloadKind = 'scalar' | 'object' | 'array';

/** A field of an object, or an item of an array identified by its position. */
export interface PayloadField {
  key: string;
  value: unknown;
}

export interface PayloadSplit {
  /** Every top-level scalar, in the payload's own key order. */
  scalars: PayloadField[];
  /** Every top-level object or array, in the payload's own key order. */
  sections: PayloadField[];
}

/** One addressable node of the payload tree, composite nodes included. */
export interface FlatPayloadNode {
  path: string[];
  key: string;
  kind: PayloadKind;
  /** The scalar's value as text; the empty string for a composite. */
  literal: string;
}

export interface PayloadMatch {
  /** The path of every node to draw: the matches, their ancestors and their subtrees. */
  visiblePaths: Set<string>;
  /** How many nodes matched on their own key or literal. */
  matchCount: number;
}

/** A character no JSON text carries, so two different paths can never key alike. */
const PATH_SEPARATOR = '\u0000';

export function payloadPathKey(path: readonly string[]): string {
  return path.join(PATH_SEPARATOR);
}

export function payloadKind(value: unknown): PayloadKind {
  if (Array.isArray(value)) return 'array';
  if (value !== null && typeof value === 'object') return 'object';
  return 'scalar';
}

/**
 * `null`, `""`, `[]` and `{}` hold nothing; `0`, `false` and `"0"` are values
 * and are never empty.
 */
export function isEmptyPayloadValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value as object).length === 0;
  return false;
}

/** A node's own count of fields or items; a scalar counts nothing. */
export function payloadCount(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value !== null && typeof value === 'object') return Object.keys(value as object).length;
  return 0;
}

/** A scalar as the text the payload carries; a composite yields no literal. */
export function payloadLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

/** The fields of an object in the payload's own key order, or the items of an array by position. */
export function payloadFields(value: unknown): PayloadField[] {
  if (Array.isArray(value)) return value.map((item, index) => ({ key: `[${index}]`, value: item }));
  if (value !== null && typeof value === 'object') return Object.entries(value as Record<string, unknown>).map(([key, item]) => ({ key, value: item }));
  return [];
}

/**
 * The payload's top-level keys, in its own order: every composite one is a
 * section of its own and every scalar one is gathered.
 */
export function splitTopLevelKeys(payload: unknown): PayloadSplit {
  const split: PayloadSplit = { scalars: [], sections: [] };
  for (const field of payloadFields(payload)) {
    if (payloadKind(field.value) === 'scalar') split.scalars.push(field);
    else split.sections.push(field);
  }
  return split;
}

/** The whole tree in pre-order, composite nodes included, each addressable by its path. */
export function flattenPayload(payload: unknown): FlatPayloadNode[] {
  const nodes: FlatPayloadNode[] = [];
  function walk(value: unknown, path: string[]) {
    for (const field of payloadFields(value)) {
      const childPath = [...path, field.key];
      const kind = payloadKind(field.value);
      nodes.push({ path: childPath, key: field.key, kind, literal: payloadLiteral(field.value) });
      if (kind !== 'scalar') walk(field.value, childPath);
    }
  }
  walk(payload, []);
  return nodes;
}

function isStrictPrefix(prefix: readonly string[], path: readonly string[]): boolean {
  if (path.length <= prefix.length) return false;
  for (let index = 0; index < prefix.length; index += 1) if (prefix[index] !== path[index]) return false;
  return true;
}

/**
 * The nodes a term matches — on key name or on literal, case-insensitively —
 * with every ancestor that leads to one and everything a matching composite
 * holds, so a match deep inside a collapsed array is reachable from its section.
 */
export function matchPayload(nodes: readonly FlatPayloadNode[], term: string): PayloadMatch {
  const needle = term.trim().toLowerCase();
  const visiblePaths = new Set<string>();
  let matchCount = 0;
  if (needle.length === 0) return { visiblePaths, matchCount };

  let subtreeRoot: string[] | null = null;
  for (const node of nodes) {
    if (subtreeRoot !== null && !isStrictPrefix(subtreeRoot, node.path)) subtreeRoot = null;
    const matched = node.key.toLowerCase().includes(needle) || node.literal.toLowerCase().includes(needle);
    if (matched) matchCount += 1;
    if (!matched && subtreeRoot === null) continue;
    for (let depth = 1; depth <= node.path.length; depth += 1) visiblePaths.add(payloadPathKey(node.path.slice(0, depth)));
    if (matched && subtreeRoot === null) subtreeRoot = node.path;
  }
  return { visiblePaths, matchCount };
}
