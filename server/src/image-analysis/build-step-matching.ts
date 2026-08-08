// Pure, daemon-free normalization that makes an image's recorded build step
// and a buildx build-cache record's description comparable (REQ-68, REQ-69).
// The two sides spell the same step differently: history records
// `RUN /bin/sh -c foo # buildkit`, the cache records `mount / from exec
// /bin/sh -c foo`. Both reduce to the same key here.

/** Trailing marker buildkit appends to every history entry it records. */
const BUILDKIT_MARKER = /\s*#\s*buildkit\s*$/;
/** Leading step marker of a cache description, e.g. `[3/3] ` or `[stage-1 1/1] `. */
const CACHE_STEP_MARKER = /^\[[^\]]*\]\s*/;
/** Prefix the cache gives an executed step, e.g. `mount / from exec `. */
const CACHE_EXEC_PREFIX = /^mount\s+\S+\s+from\s+exec\s+/;
/** Legacy metadata-only marker, e.g. `/bin/sh -c #(nop) CMD ["/bin/sh"]`. */
const NOP_MARKER = /#\(nop\)/;

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Comparable key for an image history entry's recorded command, or
 * `undefined` when the entry records no executable step (blank command, or a
 * metadata-only `#(nop)` step).
 */
export function buildStepKeyFromHistory(createdBy: string | undefined): string | undefined {
  if (createdBy === undefined) return undefined;
  const text = createdBy.replace(BUILDKIT_MARKER, "").trim();
  if (text === "" || NOP_MARKER.test(text)) return undefined;
  const withoutRun = text.startsWith("RUN ") ? text.slice("RUN ".length) : text;
  return collapseWhitespace(withoutRun) || undefined;
}

/**
 * Comparable key for a build-cache record's description, or `undefined` when
 * the record carries none.
 */
export function buildStepKeyFromCacheDescription(description: string | undefined): string | undefined {
  if (description === undefined) return undefined;
  const withoutMarker = description.trim().replace(CACHE_STEP_MARKER, "");
  const key = collapseWhitespace(withoutMarker.replace(CACHE_EXEC_PREFIX, ""));
  return key === "" ? undefined : key;
}
