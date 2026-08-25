// The gate in front of the per-container stats sampler: a count of live
// subscriptions to the sampled figures
// (plan-docker_management_app-containers_card_view/REQ-41, REQ-44, REQ-47).
import { isStatsSamplingActive, startStatsSampling, stopStatsSampling } from "./containers-service.js";

let liveConsumers = 0;

/**
 * Registers one live consumer and returns its release. Zero to one starts the
 * sampler, one to zero stops it; the release is idempotent, since a count that
 * drifts upward samples the daemon for ever and looks perfect
 * (plan-docker_management_app-containers_card_view/REQ-54).
 */
export function acquireStatsDemand(): () => void {
  liveConsumers += 1;
  if (liveConsumers === 1) startStatsSampling();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    liveConsumers -= 1;
    if (liveConsumers === 0) stopStatsSampling();
  };
}

/** How many consumers are proving themselves live right now. */
export function statsDemandCount(): number {
  return liveConsumers;
}

/** Whether the daemon is being sampled — the gate as the daemon sees it. */
export function statsSamplingActive(): boolean {
  return isStatsSamplingActive();
}
