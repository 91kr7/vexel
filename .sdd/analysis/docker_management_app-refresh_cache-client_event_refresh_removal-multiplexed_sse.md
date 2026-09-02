---
request_slug: docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse
date: 2026-09-02
type: evolution
size: ordinary
reference: .sdd/analysis/docker_management_app-refresh_cache-client_event_refresh_removal.md
---

## Request

Two messages. The second narrows the first, and this analysis follows the second.

> I want to remove the client-side polling refresh strategy and set up SSE (Server-Sent Events)
> communication by evolving the current one!
>
> The communication must be multiplexed, meaning a single channel carrying different messages:
> events, containers, images (everything that currently travels via polling).
>
> It is absolutely necessary to open only one communication channel because the browser has a limit
> of 6 concurrent open HTTP requests.
>
> In addition to the polling strategy, I believe it is also possible to remove, for example, the
> on-demand call to containers after starting a new container (please analyze any other areas that
> can be migrated to SSE).

> i'm not agree with the analysis.
> lets start with a small changed!
> lets start converting the 12 (if i remember correctly) lists service call that are active by
> default when a client is connected to the application.
> the changes to do is.
> the client open a SSE channel with the backend.
> the backend continue to use the background daemon that refresh datas and put in cache
> when a cache change the backend need something that push the change in the SSE channel

## Reference

Evolution of
[`docker_management_app-refresh_cache-client_event_refresh_removal.md`](docker_management_app-refresh_cache-client_event_refresh_removal.md).
That analysis removed the daemon event as a trigger in the browser and left the clock as the only
automatic one. It named five views with no automatic trigger at all, and said the mechanism that
replaces the event trigger is a later step with its own analysis. This is that step, cut to its
first slice.

**Changes**: the browser stops asking on a clock for the values the server already holds, and the
server pushes them on one channel per window. Everything else survives untouched. The five views
keep waiting for the operator. The detail views and the Dashboard figures keep their own clocks. The
client keeps re-reading after its own actions.

## Summary

Replace the browser clock with a push, for the twelve values the server's background daemon already
holds. The server keeps its refresh and its cache; when a held value changes, it is sent on one SSE
channel.

## Business goal

- **The connection budget.** A browser allows about six concurrent HTTP/1.1 connections per origin.
  Ten list polls and the connection probe (censused in
  [`docker_management_app-timing_scale.md`](docker_management_app-timing_scale.md)) compete for
  those six slots with the log stream, the statistics stream and the build output a screen may have
  open. A request that waits for a slot delays every other request the screen needs. One channel is
  what gets the interface under the limit.
- **The request volume.** Those polls run at 3, 5 and 15 seconds. An idle window with nothing
  happening on the daemon issues roughly a hundred requests a minute to the server. A second window
  doubles it. With push, an unchanged daemon costs no requests at all, and one server reading serves
  every window.
- **The delay.** A change made outside the application reaches the screen after the server's period
  plus the browser's poll. Push removes the second half. Docker publishes no events for contexts,
  builders, build cache, plugins and registries, so for those the server's own period still bounds
  how current a push can be.
- **Ordering.** An older answer overwriting a newer one is an open debt of the client
  (`no-response-sequencing-guard`). On one ordered channel, pushed data cannot arrive out of order.

## Requirements

### Functional

- **The converted set is the twelve values the background daemon holds and refreshes today**:
  containers, images, volumes, networks, compose projects, builders, build cache, contexts, volume
  sizes, connection status, plugins, registries. Nothing outside this set is converted in this step.
- The browser opens exactly one SSE channel to the server, and the converted values travel on the
  same channel as the daemon events already on it.
- Each message names which value it carries, so the client routes it without opening a second
  channel.
- The server pushes a value only when it has changed since the last push.
- Daemon events that arrive together produce one push, not one each.
- When the channel opens, the server sends the current state of every converted value, so a screen
  shows data without waiting for the next change.
- After the channel drops and reconnects, the server sends those current values again, and every
  screen shows current data with no action from the operator.
- An open channel is the signal of interest that keeps the background refresh running for the
  converted values. Today the browser's poll is that signal, and this step removes it.
- When no channel is open, the server reads the daemon for none of the converted values.
- The browser holds no clock for a converted value.
- The connection status is one of the twelve and travels on the channel like the rest. The server
  keeps reading it with a real call to Docker, because only a real call returns the negotiated API
  and engine versions. What goes is the browser asking for it every five seconds.
- Every other trigger the client has today survives untouched: the manual refresh control, the
  context switch, and the re-read the client already performs after the operator's own action.
- The channel reconnects on its own, as the daemon event stream does today, and the operator is told
  while it is not delivering.
- The Dashboard event feed keeps working on that channel, with no change the operator can see.

### Non-functional

- Nothing the operator sees changes, except that data arrives sooner. Same screens, same contents,
  same controls.
- No screen reacts more slowly than today. The result of an action must not take longer to appear
  than it does now.
- The server keeps its own schedule, its own periods and its own reaction to daemon events. This
  request changes who asks the server, not how the server asks Docker.
- One busy value must not delay another on the channel.
- The channel is closed and its interest released when the window closes.
- Checks that wait out a poll are rewritten against the push, never weakened.

## Assumptions

- **The census of twelve is deduced from the analyses on file, not read from the code.** It rests on
  the reference analysis, which says plugins and registries become held values "like the other ten":
  those ten are the eight polled listings, the volume sizes and the connection status. The later
  phases confirm the set against the code before building on it. A refreshed value the census missed
  is in scope, by the human's decision of 2026-09-02.
- **Two values the server reads once are out**: which CLI programs are installed, and the platform of
  an image. The background daemon does not refresh them, so there is nothing to push.
- **Volumes and networks are in**, even though since 2026-09-01 they are read only on their own
  screen. The daemon holds them, which is what defines the set.
- **The volume sizes are in the set, and the browser never asks for them on its own.** How that value
  reaches the screen is a design decision for the later phases.
- **The client keeps its re-read after its own action.** The first message asked to remove it. Keeping
  it is what guarantees that no action feels slower than today, and removing it is a later step.
- **No poll is kept as a safety net** for a converted value. A browser that cannot hold the channel
  gets a stated disconnected state and the manual refresh control, not a hidden clock.
- **The per-object live streams stay on their own connections**: logs, container statistics, build
  output and transfer progress. They already push, they run only while one view is open, and the
  polls this step removes free the slots they need. Decided by the human on 2026-09-02.
- **The list endpoints stay available.** Whether a screen's first read comes from the channel or from
  an endpoint is a design decision for the later phases.
- **An open window keeps its interest whether it is visible or hidden**, as it does today.
- **`VEXEL_TIMING_SCALE` keeps its server cadences.** The client cadences of the converted values
  disappear with the polls that use them.

## Risks

- **The server stops refreshing what nobody asks for.** That is by design, and the browser's poll is
  what asks today. If an open channel does not renew that interest, the background refresh expires,
  the cache stops changing, no push is produced, and every screen quietly stands still. Nothing on
  screen says so. This is the single failure that would make the step worse than the poll it
  replaces.
- **One channel is one point of failure.** With no poll behind it, a channel that stops delivering
  freezes all twelve values at once, and a silent stream looks exactly like a daemon on which nothing
  is happening. This is why the channel's health is a requirement above.
- **Slower than the poll it replaces.** If a push waits behind a grouping window and a server read,
  a change the operator provokes feels slower than today's re-read. That is the trade this step must
  not make.
- **Head-of-line blocking.** Everything on one channel means one large or frequent message can delay
  the rest.
- **Interest that is never released.** A window that closes badly leaves the server reading the
  daemon for nobody, which is the cost the refresh cache exists to avoid.
- **The test suite.** Many checks wait out a poll period or press the manual refresh control. A check
  that used to pass because a poll fired will keep passing for the wrong reason.

## Scope

In:

- one SSE channel per window, carrying the twelve values named in Requirements and the daemon events
  already on it;
- a push produced when one of those values changes, with events arriving together grouped into one
  push;
- the current values sent when the channel opens and after it reconnects;
- the open channel as the signal of interest that keeps the background refresh running;
- removing the browser clock of the converted values, and only of those;
- reconnection, resynchronisation, and what the operator is told while the channel is down;
- the checks that depend on those clocks.

Out:

- the server's background refresh: its schedule, its periods, its reaction to daemon events, and the
  cache itself, all kept as they are;
- **the Dashboard's overview figures, which keep the browser clock they were given on 2026-09-01.**
  They are a summary the server composes from held values, not a held value, so the twelve do not
  cover them. Converting them is a later step. Decided by the human on 2026-09-02;
- the container detail clock and its Processes tab clock, which read one object and are not held
  values;
- the client's re-read after its own action, the manual refresh control and the context switch, all
  kept as they are;
- a protocol where the client tells the server which values the current screen needs;
- the five views with no automatic trigger: the disk-usage view of System & prune, and the details of
  an image, an image's layers, a network and a volume;
- the per-object live streams, and the console and terminal sessions;
- any change to what a screen shows or to how it is operated;
- a setting or an indicator for the channel beyond its connected state;
- moving the application to HTTP/2, and using WebSocket instead of Server-Sent Events.
