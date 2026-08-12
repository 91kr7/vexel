// The one rule every list of named objects is ordered by. It knows nothing about
// Docker: it is given a name and an identity and returns an order.
// REQ ids below are those of plan-docker_management_app-list_ordering (REQ-1).

export type Comparator<T> = (left: T, right: T) => number;

/** A name to compare, or the segments of a composite one, compared in order. */
export type NameKey = string | readonly string[];

/** `null` when the row carries no name of its own — it is then grouped last. */
export type OptionalNameKey = NameKey | null | undefined;

/** A creation instant: epoch-based number, or an ISO-8601 timestamp. */
export type CreationKey = number | string | null | undefined;

export interface NameOrderKey<T> {
  /** Ascending rank compared before the name, for a list that groups (REQ-24). */
  group?: (item: T) => number;
  name: (item: T) => NameKey;
  identity: (item: T) => string;
}

export interface UnnamedGroupOrderKey<T> {
  name: (item: T) => OptionalNameKey;
  createdAt: (item: T) => CreationKey;
  identity: (item: T) => string;
}

// A stated locale, never the host's: the same pair must compare the same way on
// every machine (REQ-4). Base sensitivity ignores case and diacritics (REQ-2),
// numeric collation reads runs of digits as numbers (REQ-3). Built once, because
// `localeCompare` builds a collator on every call and these lists reach
// thousands of rows (REQ-7).
const nameCollator = new Intl.Collator("en-US", { usage: "sort", sensitivity: "base", numeric: true });

export function compareNames(left: NameKey, right: NameKey): number {
  const leftSegments = typeof left === "string" ? [left] : left;
  const rightSegments = typeof right === "string" ? [right] : right;
  const shared = Math.min(leftSegments.length, rightSegments.length);
  for (let index = 0; index < shared; index += 1) {
    const order = nameCollator.compare(leftSegments[index], rightSegments[index]);
    if (order !== 0) return order;
  }
  return leftSegments.length - rightSegments.length;
}

// The exact comparison that separates what compareNames calls equal — `Data`
// from `data`, `app-1` from `app-01` — so no two distinct rows ever tie (REQ-5).
// Code-unit order, so it depends on the two values and on nothing else (REQ-4).
export function compareIdentities(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

export function byNameThenIdentity<T>(key: NameOrderKey<T>): Comparator<T> {
  const { group, name, identity } = key;
  return (left, right) => {
    if (group !== undefined) {
      const groupOrder = group(left) - group(right);
      if (groupOrder !== 0) return groupOrder;
    }
    const nameOrder = compareNames(name(left), name(right));
    if (nameOrder !== 0) return nameOrder;
    return compareIdentities(identity(left), identity(right));
  };
}

export function byNamedThenUnnamedNewest<T>(key: UnnamedGroupOrderKey<T>): Comparator<T> {
  const { name, createdAt, identity } = key;
  return (left, right) => {
    const leftName = name(left) ?? null;
    const rightName = name(right) ?? null;

    if (leftName !== null && rightName !== null) {
      const nameOrder = compareNames(leftName, rightName);
      if (nameOrder !== 0) return nameOrder;
      return compareIdentities(identity(left), identity(right));
    }
    if (leftName !== null) return -1;
    if (rightName !== null) return 1;

    const creationOrder = compareCreationNewestFirst(createdAt(left), createdAt(right));
    if (creationOrder !== 0) return creationOrder;
    return compareIdentities(identity(left), identity(right));
  };
}

function compareCreationNewestFirst(left: CreationKey, right: CreationKey): number {
  if (left === null || left === undefined) return right === null || right === undefined ? 0 : 1;
  if (right === null || right === undefined) return -1;
  if (typeof left === "number" && typeof right === "number") return right - left;
  return compareIdentities(String(right), String(left));
}
