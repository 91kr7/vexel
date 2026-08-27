---
request_slug: docker_management_app-refresh_cache
date: 2026-08-28
type: evolution
size: ordinary
reference: .sdd/analysis/docker_management_app.md
---

## Request

> voglio iniziare l'attività di rework che mi hai descritto nel file `polling-redesign.html`

The design that request points at is `.sdd/analysis/studies/polling-redesign.html`, and the
measurements behind it are in `.sdd/analysis/studies/refresh-and-polling.html`. The findings are
recorded, one file and line each, in `.sdd/tech-debt/`.

## Reference

Evolution of [`docker_management_app.md`](docker_management_app.md), which established that the
interface reflects the daemon's live state and refreshes itself, and left *how* that refresh is
obtained to the implementation. It was built as a poll owned by the browser: eleven data hooks and
one connection service hold a `setInterval`, six of them mounted in the shell so they run on every
screen. Each tick calls the server, and the server calls Docker.

**Changes**: the interface stops being what sets the rate at which Docker is questioned. A
background refresher on the server reads the daemon on its own schedule and keeps the answer in
memory; the list endpoints answer from that memory. What the operator sees, and how quickly they
see it, does not change.

## Business goal

The application questions Docker far more than the operator's use of it requires, and the cost is
paid on the operator's own daemon — the one their work runs on. Idle, with one window open and
nobody touching anything, it makes **212 Engine API calls and starts 64 processes every minute**;
two windows double both, because nothing on the server joins two clients asking for the same list.
The heaviest single item is `/system/df`, Docker's most expensive endpoint, called every three
seconds to show the size of each volume — a decision the product already took the other way for the
disk-usage view, and recorded there in a comment.

None of this is visible as a feature, and that is the point: the operator gets exactly what they get
today, on a daemon that is doing an order of magnitude less work for it. The saving is largest
precisely where the application is least welcome — a laptop on battery, a busy daemon, a remote
context — and it removes the multiplication by the number of open windows, which is the only part
that gets worse as the product is used more.

## Requirements

### Functional

- A list endpoint must answer from a value held on the server, not by calling Docker while the
  client waits. The only exception is the first request for a value that has never been read.
- A background refresher must keep each of those values current, on a schedule the server owns.
- The refresher must react to daemon events, not only to its own timer: when Docker announces a
  change, the affected value is re-read without waiting for the next tick. Events arriving together
  must produce one re-read, not one each.
- The refresher must stop when nobody is asking. A value nobody has requested for a while stops
  being refreshed, and the next request starts it again. With no client connected, the application
  must ask Docker for nothing.
- An operation the operator performs through the application must be reflected without waiting for
  a timer or an event: the route that performs it marks the affected values as due.
- When Docker cannot be reached, the last good value must be kept and served, together with when it
  was read, rather than replaced by an error.
- Values that cannot change while the application runs must be read once: which CLI programs are
  installed, and the platform of an image, which is fixed by the image's own identity.
- The size of a volume must be read on a schedule of its own, separate from the volume list.
- A detail view must re-read only for events concerning the object it is showing, which requires the
  event to carry the object's identifier and not only its name.
- One connection to the daemon must be reused across calls rather than opened and closed for each.

### Non-functional

- **The operator must not be able to tell the difference, except that it is not slower.** Every
  screen shows the same data, with the same freshness, and reacts to their own actions as quickly as
  it does today. A design that costs less and reacts more slowly does not satisfy this request.
- The list hooks of the client are not changed: their public shape, their intervals and their event
  subscriptions stay as they are. The client keeps asking; what changes is who answers.
- One refresher per kind of data, never one pass refreshing everything in sequence: today a slow
  read delays only its own list, and that must remain true.
- No area changes behaviour or appearance. The screens, their controls and their contents are
  untouched.
- The live streams are untouched: logs, container statistics, build output, file transfers, and the
  daemon event stream itself.
- Detail reads stay direct, with no value held on the server. A detail view shows one object, one at
  a time, and must show it exactly as the daemon reports it now.
- The refresher must not become a way for one wedged call to freeze the interface: a value being
  re-read is still served while the read is in flight.

## Assumptions

- **The daemon event stream is a dependable trigger.** It is already open, shared and reconnecting,
  and every list that matters already subscribes to it. The timers are the safety net for what the
  daemon does not announce and for a stream that has dropped; they are not the primary mechanism,
  which is why they can be far longer than today's three seconds.
- **A request is a good enough signal of interest.** The client already asks on its own interval, so
  no subscription protocol has to be invented: asking for a value renews interest in it, and silence
  expires it. This is what makes "stop when nobody is watching" cost nothing to build.
- **Freshness is bounded by the client's own interval anyway.** Even a perfectly current server value
  reaches the screen only when the client next asks. The client's intervals therefore stay as they
  are, and the refresher's schedule is chosen against them, not independently of them.
- **The connection status keeps a real probe.** The design study suggested deriving daemon
  reachability from the event stream's own health. That is a sound liveness signal, but the status
  also reports the negotiated API and engine versions, which only a real call returns — so the probe
  stays and merely becomes much less frequent, with the event stream's connection state marking it
  due when it drops or recovers.
- **Nothing here is a cache the operator can see or clear.** It is a held value with a schedule, not
  a feature: no indicator, no control, no setting.

## Risks

- **Trading speed for cost.** The failure mode of this design is an application that costs less and
  feels slower — the operator stops a container and the row does not change. It is caused by getting
  two things wrong: serving a value only after refreshing it, and not marking values due on the
  operator's own actions. This is the risk the whole design is shaped around, and it is why the
  mechanism is proved on one list before the others adopt it.
- **A safety net stretched too far.** Longer timers are affordable only while events are arriving.
  If a stream drop goes unnoticed, the operator sees stale data for as long as the timer, not for
  three seconds. The timers are therefore chosen short enough to be tolerable on their own.
- **One shared refresher freezing everything.** A single pass refreshing all values in sequence would
  let one slow `/system/df` or one wedged `compose ls` stop every list at once. Today that cannot
  happen, and the design must not introduce it.
- **A held value outliving the daemon it describes.** The active context can change, and the values
  then describe a daemon that is no longer the one being shown. The event stream already discards its
  backlog on that signal; the held values must do the same, or the interface briefly shows another
  machine's objects.
- **A performance change with no visible feature is hard to accept.** Nothing on screen proves it
  worked. The acceptance therefore rests on what the operator can still do — every screen behaves as
  before — plus a stated, measurable claim about the daemon's load that a check can hold to.

## Scope

**In scope**: a held value per list on the server, refreshed by a background task on its own
schedule, invalidated by daemon events with bursts grouped, gated on whether anyone is asking, and
marked due by the application's own write operations; the list endpoints answering from it; the
volume size read separated from the volume list; CLI availability and image platform read once;
the object identifier published in daemon events and the detail views filtering on it; one reused
connection to the daemon.

**Out of scope**: any change to what a screen shows or how it is operated; any change to the client's
list hooks, their intervals or their subscriptions; pushing values to the browser instead of it
asking; a cache the operator can see, configure or clear; caching detail reads; touching the live
streams or the event stream's own behaviour; the ordering guard against an older response overwriting
a newer one, which stays recorded in `.sdd/tech-debt/` because it belongs to the client's request
handling and is not what this request is about; persisting any held value across a restart of the
server.
