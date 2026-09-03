// Turns a value the refresh cache has just stored into a message for every open live channel, and
// holds the cache's demand while at least one is open. Generic: no Docker vocabulary, no HTTP.
import { holdEveryKind, onHeldValuesDiscarded, onReloadEnded, onValueStored } from "../refresh-cache/refresh-cache.js";

/** What the publisher needs of one open channel; stated structurally, so it stays free of the web framework. */
export interface ChannelSink {
  /** One value message, already serialised, naming the value it carries. */
  sendValue(payload: string): void;
  /** The held values are gone: another context is another daemon. */
  sendDiscarded(): void;
  /** A manual reload has ended, every value it changed having been sent first. */
  sendReloadEnded(): void;
}

interface OpenChannel {
  sink: ChannelSink;
  /** The last message sent per value, so an unchanged one is not sent again. */
  lastSent: Map<string, string>;
}

const channels = new Set<OpenChannel>();
/** The last message announced per value, whatever any channel has been sent: what a channel opening is given. */
const announced = new Map<string, string>();
let releaseDemand: (() => void) | undefined;

onValueStored((stored) => {
  const payload = JSON.stringify({ name: stored.key, value: stored.value });
  announced.set(stored.key, payload);
  channels.forEach((channel) => send(channel, stored.key, payload));
});

onHeldValuesDiscarded(() => {
  announced.clear();
  channels.forEach((channel) => {
    // Cleared with the values: what arrives next must reach a channel that was sent it before the switch.
    channel.lastSent.clear();
    channel.sink.sendDiscarded();
  });
});

onReloadEnded(() => channels.forEach((channel) => channel.sink.sendReloadEnded()));

/** The first channel open holds the demand of every kind and the last one to close releases it (REQ-13, REQ-14, REQ-15). */
export function openChannel(sink: ChannelSink): () => void {
  const channel: OpenChannel = { sink, lastSent: new Map() };
  channels.add(channel);
  if (channels.size === 1) releaseDemand = holdEveryKind();
  announced.forEach((payload, key) => send(channel, key, payload));
  return () => {
    if (!channels.delete(channel)) return;
    if (channels.size > 0) return;
    releaseDemand?.();
    releaseDemand = undefined;
  };
}

/** Written per value as it is stored, so a busy value never queues behind a quiet one (REQ-6). */
function send(channel: OpenChannel, key: string, payload: string): void {
  if (channel.lastSent.get(key) === payload) return;
  channel.lastSent.set(key, payload);
  channel.sink.sendValue(payload);
}
