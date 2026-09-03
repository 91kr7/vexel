// The gate on the per-container stats sampler: holding the socket open is the whole signal, and no
// frame carries anything either way (plan-docker_management_app-containers_card_view-stats_gate_websocket/REQ-1, REQ-2, REQ-3).
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import { cadence } from "../timing/timing-scale.js";
import { acquireStatsDemand } from "./stats-demand-registry.js";

const SUBSCRIPTION_PATH = "/api/containers/stats/subscription";
const PING_INTERVAL_MS = cadence(10000);
const PONG_TIMEOUT_MS = cadence(5000);

const wss = new WebSocketServer({ noServer: true });

/** Claims the upgrade request if it targets the stats gate, false otherwise. */
export function handleStatsSubscriptionUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): boolean {
  const url = new URL(request.url ?? "", "http://stats-subscription");
  if (url.pathname !== SUBSCRIPTION_PATH) return false;

  wss.handleUpgrade(request, socket, head, holdStatsDemand);
  return true;
}

function holdStatsDemand(ws: WebSocket): void {
  const release = acquireStatsDemand();
  let pongTimer: ReturnType<typeof setTimeout> | undefined;

  // An end that vanished without closing never answers a ping, and is closed here rather than
  // holding the sampler open for ever (plan-docker_management_app-containers_card_view-stats_gate_websocket/REQ-9, REQ-10).
  const pingTimer = setInterval(() => {
    pongTimer ??= setTimeout(() => ws.terminate(), PONG_TIMEOUT_MS);
    ws.ping();
  }, PING_INTERVAL_MS);

  ws.on("pong", () => {
    clearTimeout(pongTimer);
    pongTimer = undefined;
  });

  const end = () => {
    clearInterval(pingTimer);
    clearTimeout(pongTimer);
    release();
  };
  ws.on("close", end);
  ws.on("error", end);
}
