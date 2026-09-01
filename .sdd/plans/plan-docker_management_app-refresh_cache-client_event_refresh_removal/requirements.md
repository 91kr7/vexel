---
slug: docker_management_app-refresh_cache-client_event_refresh_removal
date: 2026-09-01
spec: .sdd/analysis/docker_management_app-refresh_cache-client_event_refresh_removal.md
status: validated
---

# Requirements — the client stops refreshing on Docker events

This plan removes one thing: the wiring that makes a view in the browser read again because a Docker
event arrived. Everything else stays as it is. The last two features state what must not move.

## Feature 1 — No view reads again because of a Docker event

| ID | Requirement |
|----|-------------|
| REQ-1 | No view of the interface reads its data again because a Docker event arrived. This holds for every kind of event and for every screen, with no view left subscribed. |
| REQ-2 | The seven views whose only automatic trigger was the event — the Dashboard's overview figures, the disk-usage view of System & prune, and the details of a container, an image, an image's layers, a network and a volume — read when they are opened, when the operator asks and on a context switch. Between those moments they show what they last read. |
| REQ-13 | The Dashboard's event feed is the only subscriber to the daemon event stream left in the client. No other place in the client subscribes to it, for any purpose. |

> **REQ-13 is how REQ-1 is checked.** The human asked for a statement that can be read off the code
> rather than a measurement of requests: after this step one subscriber remains, and it is the feed.
>
> REQ-2 names the seven views one by one because the loss is invisible: the lists keep their clock,
> so nothing on the busy screens changes. The step that rebuilds inherits this list.
>
> **This step removes and adds nothing.** No re-read is introduced anywhere to make up for the
> trigger being gone — human decision of 2026-09-01. Where a view already re-reads after its own
> action it keeps doing so (REQ-9); the seven views above get no new trigger.

## Feature 2 — Nothing unused is left standing

| ID | Requirement |
|----|-------------|
| REQ-3 | The client holds no refresh facility without a caller after this step. What served only the event trigger is removed from the client, not left exported for a later caller. |

## Feature 3 — The event feed is untouched

| ID | Requirement |
|----|-------------|
| REQ-4 | The interface stays connected to the daemon's event stream and keeps receiving events, with the same subscription, backlog and reconnection it has today. |
| REQ-5 | The Dashboard's recent-events panel behaves exactly as today: the same events, in the same form, at the same moment. The operator sees no change in it. |

## Feature 4 — Every other trigger survives

| ID | Requirement |
|----|-------------|
| REQ-6 | Every list that polls today keeps polling, with the same periods. |
| REQ-7 | The manual refresh control reloads everything it reloads today, on every screen that offers it. |
| REQ-8 | A context switch re-reads everything it re-reads today. |
| REQ-9 | Where the application already re-reads after its own action, it still does, and the result is still shown immediately: the list screens, and the container's configuration update inside the container detail. No re-read after an action is added anywhere, and none is removed. |

## Feature 5 — Nothing else moves

| ID | Requirement |
|----|-------------|
| REQ-10 | Nothing in the interface tells the operator that its data comes from events, and nothing tells them it no longer does: this step adds no indicator, no control and no setting. |
| REQ-11 | The live streams keep their behaviour: container logs, container statistics, console and terminal sessions, transfer and build progress. They follow their own subscriptions and are not a refresh of a listing. |
| REQ-12 | The server is unchanged: the event stream it publishes, the values it holds, its schedule and its own reaction to events all behave exactly as today. |

## Feature 6 — The checks follow the behaviour decided here

| ID | Requirement |
|----|-------------|
| REQ-14 | A check that waited for a view to follow a daemon event now drives the trigger that remains — the manual refresh control, the clock, the context switch or an action in the application — or is removed together with the behaviour it covered. |
| REQ-15 | No check is weakened to keep passing: no assertion softened, none dropped, and no step given a longer budget to sit out a period. |
