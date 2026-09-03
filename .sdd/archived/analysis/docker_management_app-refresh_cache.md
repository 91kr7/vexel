---
request_slug: docker_management_app-refresh_cache
date: 2026-08-28
type: evolution
size: ordinary
reference: .sdd/analysis/docker_management_app.md
---

## Request

> voglio iniziare l'attività di rework che mi hai descritto nel file `polling-redesign.html`

That design is in `.sdd/analysis/studies/polling-redesign.html`. The measurements behind it are in
`.sdd/analysis/studies/refresh-and-polling.html`. Each problem is recorded with its file and line in
`.sdd/tech-debt/`.

## Reference

Evolution of [`docker_management_app.md`](docker_management_app.md). That analysis said the
interface shows the daemon's live state and refreshes itself. It did not say how. It was built as a
poll owned by the browser: eleven data hooks and one connection service hold a timer, and six of
them are mounted in the shell, so they run on every screen. Each tick calls the server, and the
server calls Docker.

**Changes**: the server decides when to question Docker, not the browser. A background task reads
the daemon on a schedule the server owns and keeps the answer in memory. The list endpoints answer
from that memory. The operator sees the same data, as quickly as today.

## Business goal

The application questions Docker much more than the operator's use of it requires. The cost is paid
on the operator's own daemon, the one their work runs on.

Idle, with one window open and nobody touching anything, it makes **212 Engine API calls and starts
64 processes every minute**. Two windows double both, because nothing on the server joins two
clients asking for the same list.

The single most expensive call is `/system/df`. It is the heaviest endpoint Docker answers, and the
application calls it every three seconds to show the size of each volume. The product already
decided not to poll it for the disk-usage view, and the reason is written in a comment there.

The operator gains no new feature, and that is the point. They get the same product, on a daemon
doing an order of magnitude less work for it. The saving is largest on a laptop running on battery,
on a busy daemon, and on a remote context. It also removes the multiplication by the number of open
windows, which is the only cost here that grows as the product is used more.

## Requirements

### Functional

- A list endpoint answers from a value held on the server. It does not call Docker while the client
  waits. The exception is a value that has never been read.
- A background task keeps each held value current, on a schedule the server owns.
- The task reacts to daemon events, not only to its timer. When Docker announces a change, the
  affected value is read again without waiting for the next tick. Events that arrive together
  produce one read, not one each.
- The task stops when nobody asks. A value nobody has requested for a while stops being refreshed,
  and the next request starts it again. With no client connected, the application calls Docker for
  none of these values.
- An operation the operator performs through the application is visible without waiting for a timer
  or an event. The route that performs it marks the affected values as due.
- When Docker cannot be reached, the last good value is kept and served with the time it was read.
  The endpoint does not fail.
- Values that cannot change while the application runs are read once: which CLI programs are
  installed, and the platform of an image.
- The size of a volume is read on its own schedule, separate from the volume list.
- A detail view reads again only for events about the object it shows. This needs the event to carry
  the object's identifier, not only its name.
- Calls to the daemon reuse one open connection instead of opening a new one for each call.

### Non-functional

- **The operator must not notice the difference, except that nothing is slower.** Every screen shows
  the same data, with the same freshness, and reacts to their actions as fast as today. A design
  that costs less and reacts more slowly does not satisfy this request.
- The client's list hooks do not change. Same public shape, same intervals, same event
  subscriptions. The client keeps asking; only the answer changes.
- One background task per kind of data, never one task refreshing everything in sequence. Today a
  slow read delays only its own list, and that stays true.
- No area changes behaviour or appearance. The screens, their controls and their contents stay as
  they are.
- The live streams do not change: logs, container statistics, build output, file transfers, and the
  daemon event stream itself.
- Detail reads stay direct, with no value held on the server. A detail view shows one object at a
  time, and must show it as the daemon reports it now.
- A value being read again is still served while the read runs. One blocked call must not freeze the
  interface.

## Assumptions

- **The daemon event stream is a dependable trigger.** It is already open, shared and reconnecting,
  and every list that matters already subscribes to it. The timers cover what the daemon does not
  announce, and the case where the stream has dropped. They are not the main mechanism, so they can
  be much longer than the three seconds used today.
- **A request is a good enough signal of interest.** The client already asks on its own interval, so
  no subscription protocol has to be invented. Asking for a value renews interest in it, and silence
  expires it.
- **Freshness is bounded by the client's interval anyway.** Even a perfectly current server value
  reaches the screen only when the client next asks. So the client's intervals stay as they are, and
  the server's schedule is chosen against them.
- **The connection status keeps a real probe.** The design study suggested reading daemon
  reachability from the event stream's health. The stream's state is a good liveness signal, but the
  status also reports the negotiated API and engine versions, and only a real call returns those. So
  the probe stays and becomes much less frequent.
- **Nothing here is a cache the operator can see or clear.** It is a held value with a schedule. No
  indicator, no control, no setting.

## Risks

- **Trading speed for cost.** If this is built wrong, the application costs less but reacts more
  slowly. The operator stops a container and the row does not change. Two mistakes cause it: serving
  a value only after reading it again, and not marking values due on the operator's own actions. The
  mechanism is therefore proved on one list before the others use it.
- **A timer that is too long.** Long timers are affordable only while events keep arriving. If a
  stream drop goes unnoticed, the operator sees old data for as long as the timer, not for three
  seconds. The timers are chosen short enough to be tolerable on their own.
- **One shared task freezing everything.** A single task refreshing all values in sequence would let
  one slow `/system/df`, or one wedged `compose ls`, stop every list at once. Today that cannot
  happen, and the design must not introduce it.
- **A held value outliving the daemon it describes.** The active context can change, and the values
  then describe a daemon that is no longer shown. The event stream already discards its backlog on
  that signal, and the held values must do the same.
- **A change with no visible feature is hard to accept.** Nothing on screen proves it worked.
  Acceptance therefore rests on what the operator can still do, plus a measurable claim about the
  daemon's load that a check can hold to.

## Scope

**In scope**

- a held value per list on the server, read again by a background task on its own schedule;
- that task marked due by daemon events, with events arriving together grouped into one read;
- that task stopped while nobody asks for the value;
- the application's own write operations marking the affected values due;
- the list endpoints answering from the held value;
- the volume size read separated from the volume list;
- CLI availability and image platform read once;
- the object identifier published in daemon events, and the detail views filtering on it;
- one reused connection to the daemon.

**Out of scope**

- any change to what a screen shows or how it is operated;
- any change to the client's list hooks, their intervals or their subscriptions;
- pushing values to the browser instead of the browser asking;
- a cache the operator can see, configure or clear;
- caching detail reads;
- any change to the live streams or to the daemon event stream itself;
- the guard against an older response overwriting a newer one, which stays in `.sdd/tech-debt/`
  because it belongs to the client's request handling;
- persisting any held value across a restart of the server.
