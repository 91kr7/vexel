---
request_slug: docker_management_app-refresh_cache-client_event_refresh_removal
date: 2026-09-01
type: evolution
size: ordinary
reference: .sdd/analysis/docker_management_app-refresh_cache.md
---

## Request

> in questa sessione faremo un refactor al meccanismo di refresh e recupero delle info del client.
> andremo per step distruggendo prima di ricreare.
> scrivimi un analisi scrivendoci centro che bisogna completamente rimuovere dal client ogni
> meccanismo che refresha i dati sulla base di eventi docker!
> mi raccomando. del CLIENT!

## Reference

Evolution of [`docker_management_app-refresh_cache.md`](docker_management_app-refresh_cache.md).
That analysis moved the decision of *when to question Docker* from the browser to the server: a
background task keeps each list current and the endpoints answer from what the server holds. It left
untouched a second decision, older than it, that lives entirely in the browser: **every view also
re-reads itself when a daemon event arrives**. So the interface today has two triggers — a clock and
the daemon's events — and nobody chose to have both.

**Changes**: the browser stops reacting to daemon events. Events keep arriving in the browser and
keep being shown to the operator; they stop deciding when data is read. The server is not touched by
this request, in any part: not the event stream it publishes, not the schedule it owns, not the way
it reacts to events itself.

## Summary

Remove from the client every re-read caused by a Docker event. This is the demolition half of a
rework of how the interface obtains its data; what replaces it is decided in a later step and is
not this analysis's subject.

## Business goal

The event trigger is the half of the client's refresh that costs the most to keep correct and, since
the refresh cache, returns the least. Three debts already on file measure it:

- **Detail views re-read on events about other objects** (`detail-views-reread-on-unrelated-events`,
  severity high). With a volume's detail open, *every container event* re-reads that volume — and a
  volume read pulls the most expensive endpoint the application has. Watching one container while
  another starts and stops re-reads the first one seven times.
- **A burst of events becomes a burst of reads** (`polled-hooks-do-not-coalesce-events`). One
  container lifecycle emits nine events, which the lists turn into eleven extra reads inside one
  second — on top of the clock, which never stopped.
- **Half the mechanism was never wired** (`object-type-invalidation-registry-unused`). A
  by-object-type invalidation facility exists in the client, is offered as available, and has no
  caller.

There is also a correctness argument. The client has no guard on the order in which answers come
back (`no-response-sequencing-guard`): an older answer landing last overwrites a newer one, and the
operator sees state that has already been superseded. Two independent triggers firing at once is
exactly how that is provoked; removing one halves the occasions.

Removing before rebuilding is the point of this step. With a single trigger left, what the
interface actually needs from a refresh mechanism becomes visible and measurable, instead of being
guessed beside a second mechanism nobody can switch off.

## Requirements

### Functional

- No view in the interface re-reads its data because a Docker event arrived. This holds for every
  kind of event and every screen, with no exception left behind for a particular view.
- The interface keeps receiving daemon events and keeps showing them. The Dashboard's recent-events
  panel behaves exactly as today, and the operator sees no change in it.
- Every other trigger the interface has today survives untouched: the clock on the lists that carry
  one, with the same periods; the manual refresh control, reloading everything it reloads today; the
  context switch, re-reading everything it re-reads today.
- Where the application already re-reads after its own action, it still does, and the result is
  still shown immediately. No re-read is added anywhere to make up for the trigger that goes: this
  step removes and adds nothing.
- The views that today have the event as their only automatic trigger — the Dashboard's overview
  figures, the disk-usage view of System & prune, and the details of a container, an image, an
  image's layers, a network and a volume — refresh when opened, when the operator asks and on a
  context switch. Between those moments they show what they last read.
- Nothing in the interface tells the operator that its data comes from events, and nothing tells
  them it no longer does: this step adds no indicator, no control and no setting.
- The client keeps no unused refresh facility standing after this step. What is not called is
  removed, not left exported for a later caller.

### Non-functional

- The Dashboard's event feed is the only subscriber to the daemon event stream left in the client,
  and no other place in the client subscribes to it for any purpose. Nothing is measured and no
  request is counted: this is read off the code.
- The checks that cover the product are adjusted to the behaviour decided here, never weakened to
  keep passing: a check that waited for a view to follow an event now waits for the trigger that
  remains, or is removed with its behaviour.

## Assumptions

- **A temporary loss of automatic freshness is accepted**, for the seven views listed above and for
  the duration of the rework. The request is explicit that this is a step of a demolition, and the
  human is present for the step that rebuilds. Were this step to ship on its own, that gap would be
  the reason not to.
- **The event feed is a feature, not a refresh mechanism**, and stays. Confirmed by the human on
  2026-09-01: only the wiring from an event to a re-read is removed.
- **The interface stays connected to the daemon's event stream** — the feed needs it — so this step
  changes what the browser does with an event, not what it receives.
- **Two requirements above were corrected on 2026-09-01**, during the validation of the plan and on
  the human's decision: the one on an action's result, which read "immediately, always" and would
  have required adding a re-read to the seven views; and the one on the number of requests, which
  asked for a measurement nobody was going to take.
- The clock periods are not revisited here. They were set by the timing-scale work and any change to
  them belongs to the step that decides the new mechanism.

## Risks

- **A view stops following the daemon and nobody notices.** The lists keep their clock, so the loss
  is invisible on the busiest screens and shows only on the seven quiet ones. The mitigation is that
  the requirement above names them one by one, so the rebuilding step inherits an explicit list
  rather than a discovery.
- **The e2e suite depends on the removed behaviour.** Specs that provoke a daemon change and then
  wait for the screen to follow have been passing on the event trigger. Some will need the manual
  refresh control the product already offers. This is expected work of the step, not a signal to
  keep the mechanism.
- **The demolition is left standing.** A half-done rework is worse than either end of it: the
  interface would keep a freshness behaviour that nobody designed. The step that rebuilds is part of
  the same session, by the human's own framing.

## Scope

In:

- The client only: every re-read of data it performs because a Docker event arrived, wherever it is
  written, plus any client-side facility that exists solely to serve that trigger.
- The checks that cover the removed behaviour.

Also in, **added on 2026-09-01** on the human's decision, after the removal was implemented and its
one visible loss was seen: **the Dashboard's overview figures get a clock**. They were the only view
whose loss was worth closing at once — with no trigger left they stand still above a container panel
that keeps moving. The clock is a poll in the browser, and a tick must ask the daemon for nothing the
server already holds, which makes the server's assembly of those figures part of this request too.

Out:

- The Dashboard's event feed and everything the operator sees of it.
- The clock, the manual refresh control and the context switch: kept as they are, not redesigned.
- The rest of the server: the event stream it publishes, the values it holds, its schedule and its
  own reaction to events. Only what the Dashboard's figures are assembled from is touched, and no
  endpoint is added, removed or changed in shape.
- The mechanism that will replace the event trigger for the six views the addition above does not
  cover. It is a later step, with its own analysis.
- The live streams that are not list data — logs, stats, console and terminal sessions, transfer and
  build progress — which follow their own subscriptions and are not a refresh of a listing.
