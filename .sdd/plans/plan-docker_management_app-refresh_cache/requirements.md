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
