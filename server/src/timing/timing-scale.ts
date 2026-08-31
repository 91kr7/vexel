// The one place a server cadence is declared from (plan-docker_management_app-timing_scale/REQ-6).
// A tolerance — a bet on how slow the outside world may be — never passes through here.

const VARIABLE = "VEXEL_TIMING_SCALE";
const MIN_SCALE = 0.1;
const MAX_SCALE = 10;

// Stricter than `Number()`, which reads the typo "02" as 2 instead of refusing it.
const PLAIN_DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

function readScale(): number {
  const raw = process.env[VARIABLE]?.trim();
  if (raw === undefined || raw === "") return 1;
  if (!PLAIN_DECIMAL.test(raw)) {
    throw new Error(
      `${VARIABLE} must be a plain decimal number between ${MIN_SCALE} and ${MAX_SCALE} (for example "0.2"); got "${raw}".`,
    );
  }
  const value = Number(raw);
  if (value < MIN_SCALE || value > MAX_SCALE) {
    throw new Error(`${VARIABLE} must be between ${MIN_SCALE} and ${MAX_SCALE}; got "${raw}".`);
  }
  return value;
}

/** Read at import: every server cadence is computed from it before anything else runs. */
export const timingScale = readScale();

/** The declared cadence on this process's clock, never below a millisecond. */
export function cadence(ms: number): number {
  return Math.max(1, Math.round(ms * timingScale));
}
