// How a held value is written to an HTTP response: the body is the value and
// nothing else, so no endpoint's shape moves; when it was read travels in
// headers (plan-docker_management_app-refresh_cache/REQ-15).
import type { HeldValue } from "./refresh-cache.js";

/** The part of an HTTP response this needs — stated structurally, so the cache stays free of the web framework. */
export interface HeldValueResponse {
  setHeader(name: string, value: string): unknown;
  json(body: unknown): unknown;
}

export const READ_AT_HEADER = "X-Vexel-Read-At";
export const AGE_HEADER = "X-Vexel-Age-Ms";
export const STALE_HEADER = "X-Vexel-Stale";

export function sendHeld<T>(response: HeldValueResponse, held: HeldValue<T>): void {
  response.setHeader(READ_AT_HEADER, new Date(held.readAt).toISOString());
  response.setHeader(AGE_HEADER, String(held.ageMs));
  if (held.stale) response.setHeader(STALE_HEADER, "true");
  response.json(held.value);
}
