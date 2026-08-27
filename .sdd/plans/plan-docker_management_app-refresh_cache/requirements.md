---
slug: docker_management_app-refresh_cache
date: 2026-08-28
spec: .sdd/analysis/docker_management_app-refresh_cache.md
status: draft
---

# Requirements — refresh cache

> This plan changes how data reaches the interface, never what the interface shows. Every
> requirement below is written so that it can be answered yes or no by watching the application or
> the daemon, and the last feature exists to state what must **not** move.

## Feature — Values that cannot change are read once

| ID | Requirement |
|----|-------------|
| REQ-1 | Which CLI programs are installed, and their versions, are determined once for as long as the server runs and reused from then on: answering that question a second time launches no program. |
| REQ-2 | The platform of an image is determined once per image identity and reused: listing images does not ask the daemon to inspect an image whose platform has already been determined. |
| REQ-3 | Both keep answering exactly as they do today — the same values reach the screen, and a value that cannot be determined is reported in the same way it is now, not as an error and not as a blank. |

## Feature — One connection to the daemon is reused

| ID | Requirement |
|----|-------------|
| REQ-4 | Calls to the daemon reuse an already-open connection instead of establishing one per call. On a remote context this is observable at the operating system: a run of calls starts no new `ssh` process each and performs no new TLS handshake each. |
| REQ-5 | A reused connection belongs to the endpoint it was opened for and is never used for another: after the operator changes the active context, no call reaches the previous daemon. |

## Feature — A detail view re-reads only for the object it shows

| ID | Requirement |
|----|-------------|
| REQ-6 | A daemon event identifies the object it concerns by that object's identifier, in addition to the name it already carries. |
| REQ-7 | A detail view re-reads only for events concerning the object it is showing: an event about another object of the same kind leaves it untouched, and the daemon is not asked about the shown object because of it. |
| REQ-8 | A detail view still re-reads for every event that does concern its object, and still shows what the daemon reports at that moment. |

## Feature — The lists are answered from values the server keeps current

| ID | Requirement |
|----|-------------|
| REQ-9 | A list endpoint answers from a value the server already holds, without calling the daemon while the client waits. Only a value that has never been read is fetched with the client waiting. |
| REQ-10 | A value that is being refreshed is still served meanwhile: a refresh in flight never delays an answer, and never turns one into an error. |
| REQ-11 | A background refresher keeps each held value current on a schedule the server owns, **one refresher per kind of data**, so a slow or blocked read of one kind delays only that kind and leaves every other list answering normally. |
| REQ-12 | A daemon event marks the values it affects as due, and they are re-read without waiting for the timer. Events arriving together produce **one** re-read of an affected value, not one per event. |
| REQ-13 | An operation the operator performs through the application marks the values it affects as due, so its result is visible without waiting for a timer or for an event. |
| REQ-14 | A value nobody has asked for within a bounded period stops being refreshed, and the next request for it starts it again. While no client is asking, the application makes no call to the daemon on behalf of any held value. |
| REQ-15 | When the daemon cannot be reached, the last good value is kept and served together with the time it was read, instead of the endpoint failing. |
| REQ-16 | A change of active context discards every held value, so no value that describes the previous daemon can reach the interface. |
| REQ-17 | Two clients asking for the same list cost the daemon what one costs: the number of open windows does not multiply the work the daemon does. |

## Feature — Volume sizes are read on their own schedule

| ID | Requirement |
|----|-------------|
| REQ-18 | The size of a volume is read on a schedule of its own, separate from and much less frequent than the volume list: listing volumes no longer makes the daemon compute its whole disk usage. |
| REQ-19 | Volumes are still listed with their size and with the containers mounting them, exactly as they are today. |

## Feature — Nothing else moves

| ID | Requirement |
|----|-------------|
| REQ-20 | No screen changes what it shows, how it is operated, or how quickly it reflects the operator's own actions. An operator who used the application before this change notices nothing except that it is not slower. |
| REQ-21 | The client's list hooks keep the public shape they expose to the screens, their intervals and their event subscriptions: the client goes on asking, and only who answers changes. |
| REQ-22 | Detail reads stay direct, with no value held on the server for them: a detail view shows the object as the daemon reports it at that moment. |
| REQ-23 | The live streams are untouched in behaviour: container logs, container statistics, build and transfer output, compose logs, and the daemon event stream's own subscription, backlog and reconnection. |
