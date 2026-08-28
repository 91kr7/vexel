---
slug: docker_management_app-refresh_cache
date: 2026-08-28
spec: .sdd/analysis/docker_management_app-refresh_cache.md
status: validated
---

# Requirements — refresh cache

> This plan changes how data reaches the interface, never what the interface shows. The last feature
> states what must not move.

## Feature — Values that cannot change are read once

| ID | Requirement |
|----|-------------|
| REQ-1 | Which CLI programs are installed, and their versions, are determined once for as long as the server runs; asking again launches no program. |
| REQ-2 | The platform of an image is determined once per image identity; listing images does not inspect an image whose platform is already known. |
| REQ-3 | Both keep answering as they do today: the same values reach the screen, and a value that cannot be determined is reported as it is now, not as an error and not as a blank. |

## Feature — One connection to the daemon is reused

| ID | Requirement |
|----|-------------|
| REQ-4 | Calls to the daemon reuse an open connection instead of opening one per call; on a remote context, a run of calls starts no new `ssh` process each and performs no new TLS handshake each. |
| REQ-5 | A reused connection belongs to the endpoint it was opened for; after the operator changes the active context, no call reaches the previous daemon. |

## Feature — A detail view re-reads only for the object it shows

| ID | Requirement |
|----|-------------|
| REQ-6 | A daemon event carries the identifier of the object it concerns, in addition to the name it already carries. |
| REQ-7 | A detail view reads again only for events about the object it shows; an event about another object of the same kind leaves it alone, and the daemon is not asked about the shown object. |
| REQ-8 | A detail view still reads again for every event about its own object, and still shows what the daemon reports at that moment. |

## Feature — The lists are answered from values the server keeps current

| ID | Requirement |
|----|-------------|
| REQ-9 | A list endpoint answers from a value the server already holds, without calling the daemon while the client waits; only a value never read before is fetched with the client waiting. |
| REQ-10 | A value being read again is still served meanwhile: a read in flight never delays an answer and never turns one into an error. |
| REQ-11 | One background task per kind of data keeps each held value current on a schedule the server owns, so a slow or blocked read of one kind delays only that kind. |
| REQ-12 | A daemon event marks the values it affects as due, and they are read again without waiting for the timer; events that arrive together produce one read, not one per event. |
| REQ-13 | An operation the operator performs through the application marks the values it affects as due, so its result is visible without waiting for a timer or an event. |
| REQ-14 | A value nobody has asked for within a bounded period stops being refreshed, and the next request starts it again; while no client is asking, the application calls the daemon for none of these values. |
| REQ-15 | When the daemon cannot be reached, the last good value is kept and served with the time it was read, instead of the endpoint failing. |
| REQ-16 | A change of active context discards every held value, so no value describing the previous daemon reaches the interface. |
| REQ-17 | Two clients asking for the same list cost the daemon what one costs. |

## Feature — Volume sizes are read on their own schedule

| ID | Requirement |
|----|-------------|
| REQ-18 | The size of a volume is read on its own schedule, separate from and much less frequent than the volume list; listing volumes no longer makes the daemon compute its whole disk usage. |
| REQ-19 | Volumes are still listed with their size and with the containers mounting them, as they are today. |

## Feature — Nothing else moves

| ID | Requirement |
|----|-------------|
| REQ-20 | No screen changes what it shows, how it is operated, or how fast it reflects the operator's actions. |
| REQ-21 | The client's list hooks keep the public shape their screens use, their intervals and their event subscriptions. |
| REQ-22 | Detail reads stay direct, with no value held on the server for them. |
| REQ-23 | The live streams keep their behaviour: container logs, container statistics, build and transfer output, compose logs, and the daemon event stream's own subscription, backlog and reconnection. |

## Feature — The server is warm before it accepts requests

> Appended on 2026-08-28, after a full pass showed a server started seconds earlier answering a list
> endpoint with a failure against a reachable daemon.

| ID | Requirement |
|----|-------------|
| REQ-24 | The server accepts no request until the active Docker endpoint has been resolved and set, so no held value is ever discarded by the startup resolution while a request is being served. |
| REQ-25 | Before accepting requests, the server reads once the values it holds, so the first screen an operator opens is answered from a held value instead of paying for its own first read. |
| REQ-26 | A value warmed at startup is subject to the same demand expiry as any other: if nobody asks for it within the expiry window it is dropped, so a client connecting long after startup is never served a value of unknown age. |
| REQ-27 | A read disowned by a discard does not leave the waiting caller with neither a value nor an error. |
| REQ-28 | The volume-size value is not warmed at startup: it is read by the first request that wants it, as it is today. |
| REQ-29 | A daemon that cannot be reached at startup does not stop the server from accepting requests: the port opens and the failure is served the way it is today. |

> **Two departures, stated here because they are read with these requirements**; both are recorded in
> `batches.md` under Departures. **REQ-14** says that while no client is asking, the application calls
> the daemon for none of these values, and REQ-25 calls it with no client asking. It is one read at
> process start, it does not recur, and REQ-26 keeps REQ-14's own scenario — a closed application asks
> nothing — true. REQ-14 is not changed. **The plan's assumption** that a restart reads what it needs
> on the first request is reversed by REQ-25: a restart now reads before serving. Nothing is persisted
> either way, and the assumption is not changed.

## Feature — The remaining checks reload through the control

| ID | Requirement |
|----|-------------|
| REQ-30 | A check that creates a context, a builder or a build-cache record out of band sees it by pressing the refresh control, not by waiting out a period; what each check asserts does not change. |
