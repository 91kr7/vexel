// Tolerance, not a cadence: never scaled by the factor, which is the very thing being read.
const READ_TIMEOUT_MS = 2000;

/** Never rejects: a refusal, a failure or a wait that runs out all give 1. */
export async function readTimingScale(): Promise<number> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), READ_TIMEOUT_MS);
  try {
    const response = await fetch("/api/timing-scale", { signal: abort.signal });
    if (!response.ok) return 1;
    const body = (await response.json()) as { scale?: unknown };
    return typeof body.scale === "number" && Number.isFinite(body.scale) && body.scale > 0 ? body.scale : 1;
  } catch {
    return 1;
  } finally {
    clearTimeout(timer);
  }
}
