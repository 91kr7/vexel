---
slug: docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse
date: 2026-09-02
spec: .sdd/analysis/docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse.md
status: validated
---

# Requirements — one channel pushes the values the server holds

The browser stops asking on a clock for the twelve values the server's background refresh already
holds. The server sends them on one SSE channel per window, and sends a value only when it changes.
Everything else stays as it is: Features 6 and 7 state what must not move.

## Feature 1 — One channel carries every held value

| ID | Requirement |
|----|-------------|
| REQ-1 | A window opens exactly one SSE channel to the server. No converted value opens a channel of its own, and the daemon events that travel on a channel today travel on this one. |
| REQ-2 | The converted set is every value the server's background refresh holds: containers, images, volumes, networks, compose projects, builders, build cache, contexts, volume sizes, connection status, plugins and registries. A held value this census missed is converted with the rest. |
| REQ-3 | Each message names which value it carries, so the client routes it to the right screen without opening a second channel. |
| REQ-39 | The channel is the only source of the converted values in the client. No screen reads one of them from a list endpoint, on any trigger. |

> **REQ-2 is defined by the property, not by the list.** The census of twelve comes from the
> analyses on file. The batch that builds this confirms it against the registered refresh kinds, and
> a value the census missed is in scope — the human's decision of 2026-09-02. The volume sizes are
> one of the twelve and travel on the channel like the rest; no screen shows anything new for them.
>
> **REQ-39 is the human's decision of 2026-09-02**: one source of truth. Every trigger the client
> keeps — the manual refresh control, the context switch, the re-read after an action — produces its
> result on the channel. The wiring that called the list endpoints one by one is reworked.

## Feature 2 — The server pushes a value when it changes

| ID | Requirement |
|----|-------------|
| REQ-4 | The server pushes a converted value only when that value has changed since the last time it was pushed on that channel. |
| REQ-5 | Daemon events that arrive together produce one push, not one push each. |
| REQ-6 | A value that changes often does not delay a value that changes rarely. One busy value must not hold up the rest of the channel. |
| REQ-7 | The push is produced from what the background refresh already holds. It adds no reading of Docker: the server keeps its own schedule, its own periods and its own reaction to daemon events. |

## Feature 3 — Opening and reconnecting leave every screen current

| ID | Requirement |
|----|-------------|
| REQ-8 | When the channel opens, the server sends the current value of every converted value, so a screen shows data without waiting for the next change. |
| REQ-9 | The channel reconnects on its own when it drops, as the daemon event stream does today. |
| REQ-10 | After a reconnection the server sends the current values again, and every screen shows current data with the operator doing nothing. |
| REQ-11 | While the channel is not delivering, the interface tells the operator with the indication it already has for a connection that is down. No new element and no wording of its own. |
| REQ-12 | A value sent again unchanged replaces nothing on screen. What the operator has opened, typed, selected or scrolled to stays as it was. |
| REQ-40 | A channel that opens before the server holds anything leaves the screen in the loading state it already has today, and the screen fills as soon as the first values arrive. This is the first window after the server starts: the open channel is what starts the reading. No element is added for this case. |

## Feature 4 — The open channel is what keeps the server reading

| ID | Requirement |
|----|-------------|
| REQ-13 | An open channel renews the interest that keeps the background refresh running. While a window holds a channel, no converted value's refresh expires, and every screen keeps receiving pushes. |
| REQ-14 | With no channel open, the server reads the daemon for none of the converted values. |
| REQ-15 | Closing the window closes the channel and releases its interest. A window that closes badly does not leave the server reading the daemon for nobody. |
| REQ-16 | The number of open windows does not change how often the server reads Docker. One reading serves every open channel. |

> **REQ-13 is the single failure this step must not have.** The refresh expires when nothing asks
> for a value, and today the browser's poll is what asks. If an open channel does not renew that
> interest, the cache stops changing, no push is produced, and every screen quietly stands still.

## Feature 5 — The browser's clock for the converted values goes

| ID | Requirement |
|----|-------------|
| REQ-17 | The browser holds no clock for a converted value. No screen asks the server for one of them on a period. |
| REQ-18 | No poll is kept as a safety net behind the channel. A browser that cannot hold the channel gets the stated disconnected state of REQ-11, and a manual refresh control that asks for the channel again. No hidden clock. |
| REQ-19 | The browser stops asking for the connection status on a period. The server keeps reading it with a real call to Docker, because only a real call returns the negotiated API and engine versions. |
| REQ-20 | The client cadences of the converted values are removed with the polls that used them. `VEXEL_TIMING_SCALE` keeps every server cadence it scales today. |
| REQ-21 | Nothing unused is left standing. A client refresh facility whose only caller was a removed poll is removed, not left exported for a later caller. |
| REQ-22 | The technical-debt entry on response sequencing is brought up to date: it describes what is left of the problem after the polls are gone, or it is removed from the register if nothing is left. |

> **REQ-22 follows the register's own rule**, not a decision taken here. Pushed values arrive on one
> ordered channel, so an older answer cannot overwrite a newer one for a converted value. What
> remains of the debt, if anything, is whatever still reads on demand.

## Feature 6 — Every other trigger survives, and nothing else moves

| ID | Requirement |
|----|-------------|
| REQ-23 | The manual refresh control reloads everything it reloads today, on every screen that offers it. What it produces reaches the screen on the channel. |
| REQ-24 | A context switch re-reads everything it re-reads today, and the new context's values reach the screen on the channel. After a switch, no value of the previous context reaches the screen. |
| REQ-25 | The client keeps the re-read it performs after the operator's own action, on every screen that performs one today, and its result reaches the screen on the channel. |
| REQ-26 | The Dashboard's event feed keeps working on the channel, with no change the operator can see. |
| REQ-27 | The Dashboard's overview figures keep the browser clock they were given on 2026-09-01. They are not converted here. |
| REQ-28 | The container detail's clock and its Processes tab clock stay as they are. They read one object, which is not a held value. |
| REQ-29 | The five views with no automatic trigger keep waiting for the operator: the disk-usage view of System & prune, and the details of an image, an image's layers, a network and a volume. |
| REQ-30 | The per-object live streams keep their own connections: container logs, container statistics, build output, transfer progress, and the console and terminal sessions. |
| REQ-31 | The list endpoints stay available and answer as they do today. No endpoint is removed or changed in shape. |
| REQ-32 | The client tells the server nothing about which values the current screen needs. Every channel carries every converted value. |

> **REQ-31 and REQ-39 are not in conflict.** The list endpoints keep answering as they do today, for
> any caller outside the interface. What changes is that no screen of the interface reads them.

## Feature 7 — Nothing the operator sees changes

| ID | Requirement |
|----|-------------|
| REQ-33 | The operator sees the same screens, the same contents and the same controls. The only difference is that data arrives sooner. |
| REQ-34 | No screen reacts more slowly than today. The result of an action, of the manual refresh control and of a context switch appears no later than it does now. |
| REQ-35 | The interface adds no setting and no indicator for the channel beyond the connected state of REQ-11. |

## Feature 8 — The checks follow the push

| ID | Requirement |
|----|-------------|
| REQ-36 | A check that waited out a poll period drives the push instead, or drives the trigger that remains. None is given a longer budget to sit out a period that no longer exists. |
| REQ-37 | No check is weakened: no assertion softened, none dropped, no coverage deleted with the poll it used. |
| REQ-38 | The channel is covered by checks that drive it: the first values on open, a change pushed with the operator doing nothing, a reconnection leaving every screen current, the first window after a server start finding nothing held, and the server reading nothing while no channel is open. |
