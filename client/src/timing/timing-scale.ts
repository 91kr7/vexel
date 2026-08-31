// The one place a client cadence is declared from (plan-docker_management_app-timing_scale/REQ-12).
// A tolerance — a reconnect backoff, a request timeout — never passes through here.

let scale = 1;

/** Called once by the entry point, before any module holding a cadence is imported. */
export function setTimingScale(value: number): void {
  scale = Number.isFinite(value) && value > 0 ? value : 1;
}

/** The declared cadence on this page's clock, never below a millisecond. */
export function cadence(ms: number): number {
  return Math.max(1, Math.round(ms * scale));
}
