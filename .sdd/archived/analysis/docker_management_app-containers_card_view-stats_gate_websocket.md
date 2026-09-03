---
request_slug: docker_management_app-containers_card_view-stats_gate_websocket
date: 2026-09-03
type: evolution
size: ordinary
reference: .sdd/analysis/docker_management_app-containers_card_view.md
---

## Request

> Convertire la sottoscrizione che fa da gate al campionamento delle statistiche per container dal
> trasporto SSE al trasporto WebSocket.
>
> Stato attuale: il client apre `GET /api/containers/stats/subscription` come EventSource e la tiene
> aperta per tutto il tempo in cui una schermata mostra le figure campionate (containers e
> dashboard), chiudendola al cambio schermata e quando il tab del browser va in background. La
> connessione non trasporta alcun dato: il server scrive `: subscribed` all'apertura e poi un
> commento `: alive` a ogni intervallo di campionamento, come sonda di liveness scritta a mano,
> perché SSE non ha ping/pong. L'apertura acquisisce una unità di domanda nel registro
> `stats-demand-registry`, la chiusura la rilascia; zero-a-uno avvia il campionatore, uno-a-zero lo
> ferma.
>
> Cosa si vuole ottenere: la stessa semantica di gate su una connessione WebSocket, sostituendo la
> sonda di liveness emulata con il ping/pong del protocollo, e liberando uno slot nel pool HTTP del
> browser (limite di 6 connessioni per origine, il server è HTTP/1.1). Il registro della domanda è
> già indipendente dal trasporto e non deve cambiare.
>
> Vincolo da coprire esplicitamente: EventSource riapre da solo una connessione caduta, WebSocket
> no. Senza una riconnessione lato client, un drop transitorio spegnerebbe il campionamento in
> silenzio finché l'operatore non cambia schermata. La riconnessione qui non ha bisogno di ripresa
> da un punto: l'esistenza della connessione è l'intera informazione trasmessa.
>
> L'infrastruttura WebSocket esiste già nel server per le sessioni exec/attach dei container:
> pacchetto `ws` con `noServer: true` e un unico dispatcher di upgrade che smista per pathname.

## Reference

Evolution of
[`docker_management_app-containers_card_view.md`](docker_management_app-containers_card_view.md).
That analysis created the gate: per-container stats are sampled only while a consumer proves it
exists by holding a connection open. The proof is counted, and the sampler stops on its own when the
count reaches zero. It left the transport to the technical plan, which chose a dedicated SSE stream.

**Changes**: that connection becomes a WebSocket, and the liveness probe written by hand becomes the
protocol's ping/pong. The gate's semantics, the demand registry, the sampling cadence and everything
the operator sees stay as they are. One thing is genuinely new rather than moved: the client must
re-establish a dropped connection, because WebSocket does not do it by itself.

The channel carrying the list values, converted on 2026-09-02
([`…-multiplexed_sse.md`](docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse.md)),
stays SSE. Its scope ruled WebSocket out for itself, and this request does not reopen that.

## Summary

Move the connection that gates per-container stats sampling from SSE to WebSocket. Same gate, same
figures, plus a client-side reconnection that the old transport provided for free.

## Business goal

- **A liveness probe the protocol already provides.** The gate is correct only while the server can
  tell a live connection from a dead one. Today the server writes a comment line every sampling
  interval to find that out. Ping/pong does the same work as a protocol feature, and removes a
  hand-written mechanism from the part of the product whose failure is silent.
- **One slot back in the browser's connection pool.** The server speaks HTTP/1.1, so a browser
  allows six connections per origin. The gate holds one of them for the whole time the operator
  stays on the containers screen or the dashboard, beside the live channel, the log stream and any
  transfer in progress. A WebSocket is not counted against that pool.

## Requirements

### Functional

- A WebSocket connection holds the gate on per-container stats sampling, in place of the SSE stream
  that holds it today.
- The connection carries no application data in either direction. Its existence is the whole signal.
- Opening it acquires one unit of demand and closing it releases one, exactly as today: zero to one
  starts the sampler, one to zero stops it.
- The client opens the connection while a screen showing the sampled figures is displayed, and
  closes it on a screen change and when the tab is hidden. Unchanged from today.
- The server proves the connection is live with the WebSocket protocol's ping/pong, and writes
  nothing to it by hand for that purpose.
- The server closes a connection that stops answering within a stated bound, and releases its unit
  of demand. A connection that died without closing must not hold the sampler open.
- The client re-establishes a connection that drops while the screen still needs the figures, with
  no action from the operator. It does not reconnect one it closed on purpose, on a screen change,
  a hidden tab or a closed window.
- Reconnection resumes nothing: no cursor, no missed state, no replay. A new connection is a new
  unit of demand.
- Reconnection attempts space out and the spacing is capped, so a restarting server is not met by
  every open window at once.
- A sample is taken promptly when the gate opens again after a reconnection, as it is when the
  operator returns to the screen.
- The SSE endpoint that holds the gate today is removed. Two gates must not stand side by side.

### Non-functional

- The operator cannot tell the transport changed. A drop shorter than the staleness bound leaves no
  trace on screen, and a longer one shows the *no sample* state the cards already have.
- The gate holds none of the six HTTP connections the browser allows per origin.
- The ping period and the timeout that follows it scale with `VEXEL_TIMING_SCALE`, like the cadences
  they replace.
- The new upgrade is admitted under the same rules as the exec/attach upgrades already served. The
  server's exposure does not widen.
- The gate works in both arrangements the project runs: the single process that serves the product,
  and the two-process development setup behind the Vite proxy.
- The checks covering the gate are rewritten against the new transport, never weakened. One of them
  proves that sampling resumes after the connection drops, with no action from the operator.

## Assumptions

- **Today's behaviour is taken from the request, not read from the code.** An analysis does not open
  the project files. The later phases confirm the endpoint, the registry and the liveness writes
  against the code before building on them.
- **No indicator is added for a disconnected gate.** The live channel tells the operator when it
  stops delivering, because it carries data. This connection carries none, and a long drop already
  shows as the *no sample* state. A second notice would be noise.
- **Reconnection never gives up on its own.** It stops when the screen stops needing the figures,
  which is the condition that closes the connection normally.
- **Nothing is signalled at unload.** The prohibition of the reference analysis stands: no
  `beforeunload`, no `pagehide`, no beacon. A connection the browser drops on close is the gate
  releasing itself, which is what the mechanism was chosen for.
- **The sampling interval, the staleness bound and the *no sample* presentation do not change.**
  This request changes how the gate is held, not what is sampled or how it is shown.

## Risks

- **A drop that stops the sampling in silence.** This is the failure the request names, and it is a
  new one. EventSource reconnects on its own, so today a transient drop costs a few seconds of
  figures. After this change the product owns that behaviour, and a reconnection that does not work
  leaves every card at `—` until the operator changes screen. Nothing on screen says why.
- **Demand that is never released.** A socket the server believes is live holds the sampler open for
  a reader who has gone, and keeps asking the operator's daemon for stats nobody reads. Ping/pong
  must terminate such a connection, not only notice it.
- **A check that passes for the wrong reason.** A second window, or a connection left over from an
  earlier test, keeps the sampler running on somebody else's unit of demand. A check on the gate has
  to prove the count reached zero, not that figures stopped appearing.
- **A restart met by every window at once.** With no spacing between attempts, a server restart
  turns each open window into a loop of connection attempts.

## Scope

In:

- the transport of the connection that gates per-container stats sampling, on both sides;
- the server accepting the upgrade on the dispatcher that already serves the exec/attach sessions;
- liveness by protocol ping/pong, and the closing of a connection that stops answering;
- the client opening, closing and re-establishing that connection;
- removing the SSE endpoint the gate uses today;
- the checks that cover the gate.

Out:

- the demand registry, which is already independent of the transport;
- the sampling interval, the staleness bound and the *no sample* state;
- the Stats tab of the container detail, which is a separate per-container stream;
- every other stream the client holds: logs, build output, transfer progress, console and terminal
  sessions;
- the multiplexed SSE channel carrying the list values, which stays SSE;
- any indicator, control or setting the operator can see;
- moving the application to HTTP/2.
