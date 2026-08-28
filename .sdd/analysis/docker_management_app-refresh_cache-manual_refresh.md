---
request_slug: docker_management_app-refresh_cache-manual_refresh
date: 2026-08-28
type: evolution
size: ordinary
reference: .sdd/analysis/docker_management_app-refresh_cache.md
---

## Request

> Aggiungere un tasto di refresh manuale nella top bar dell'applicazione, che ricarica tutto: ogni
> listato che l'interfaccia mostra torna a essere letto dal daemon e la schermata corrente si
> aggiorna. Contesto: il server ora tiene i valori dei listati e li rinfresca da solo (refresh
> cache); gli oggetti creati fuori dall'applicazione — un contesto o un builder creato da terminale
> — restano invisibili per un intero periodo, fino a 5 minuti, perché Docker non pubblica eventi per
> quei generi. L'umano ha deciso il 2026-08-28 che quel comportamento va bene così, e che la
> risposta è dare all'operatore un modo esplicito di dire "ricarica adesso". Il tasto è anche la
> seam che manca alla suite e2e: 7 spec creano un contesto o un builder da CLI e poi si aspettano di
> vederlo elencato, e senza un comando manuale non hanno modo di passare in tempi sensati.

## Reference

Evolution of [`docker_management_app-refresh_cache.md`](docker_management_app-refresh_cache.md).
That analysis moved the decision of when to question Docker from the browser to the server. A
background task reads each list on a schedule the server owns, and the list endpoints answer from
the value held in memory. It also decided the mechanism stays invisible: "no indicator, no control,
no setting".

**Changes**: the operator gets one control over it. A button in the top bar makes the server read
every held list again, and the current screen shows the result. The schedule, the periods and the
automatic behaviour are untouched. Only the "no control" assumption is reversed, and only for a
reload the operator asks for.

## Business goal

Docker publishes events for containers, images, volumes and networks. It publishes none for
contexts and builders. Those two lists are therefore only as current as their period, which is up to
5 minutes. An operator who creates a context or a builder from the terminal does not see it in the
application, and has no way to ask for it.

The human decided on 2026-08-28 that this period stays. The gap is closed on demand by the operator,
instead of by a shorter period paid on every daemon all the time.

The e2e suite has the same problem. 7 specs create a context or a builder from the CLI and then
expect to see it listed, and today they can only wait out the period. The control gives them a
supported way to reload, through the product's own path instead of a test-only hook.

## Requirements

### Functional

- The top bar carries a refresh control, present and operable on every screen.
- Pressing it makes the server read again, from the daemon, every list value it holds.
- When the reload finishes, the current screen shows the reloaded data, with no further action from
  the operator.
- The control shows that it is working while the reload runs, and that the reload has finished.
- While a reload runs, pressing the control again starts no second reload.
- If the daemon cannot be reached, the last good values are kept and the operator is told the reload
  failed.

### Non-functional

- The finished state is observable, so waiting for the reload needs no arbitrary delay.
- The reload replaces data only. It does not navigate, does not close what is open, and does not
  reset scroll position or selection.
- The interface stays usable while the reload runs.
- The refresh cache keeps its schedule, its periods and its event triggers.
- Nothing else in the interface changes.

## Assumptions

- Only the values the server currently holds are read again. A value nobody has asked for is started
  by the next request anyway, so reading it now would be work nobody wants.
- A detail view open at that moment reads again too, because it is part of the current screen.
- One control for everything, not one per list. The operator's question is "is what I see current",
  not "is this one list current".
- The cost of a press is one full read of every held list, the heavy `/system/df` included. That is
  accepted because it happens only when the operator asks for it.
- The control reports that the reload ran. It does not report what changed.
- The control stays available while the daemon is unreachable, since a reload is one way the
  operator finds out that it is reachable again.

## Risks

- **Finished before the data arrives.** If the control reports finished while the screen still shows
  the previous values, the operator judges it broken, and the 7 specs become unreliable. Finished
  must mean the current screen already shows the reloaded data.
- **Repeated presses.** A control that starts one reload per press turns a full read of every list
  into a load spike on the operator's own daemon.
- **A success nobody can see.** Most reloads change nothing on screen. Without a visible start and
  end, the operator presses again, or decides the control does nothing.
- **A reload that resets the screen.** If it loses scroll, selection or an open panel, the operator
  stops using it.

## Scope

**In scope**

- a refresh control in the top bar, on every screen;
- a server-side reload of every held list value, on the operator's request;
- the current screen showing the reloaded data, an open detail view included;
- the working, finished and failed states of the control;
- the 7 e2e specs using the control instead of waiting out the period.

**Out of scope**

- any change to the periods, the schedule or the event handling of the refresh cache;
- making contexts and builders event-driven, which Docker does not support;
- a refresh control per screen or per list;
- a setting for the periods, or any other way to configure the refresh cache;
- an automatic reload on window focus, on tab return or on any other implicit signal;
- a keyboard shortcut for the control;
- an endpoint or a hook that exists only for the tests;
- showing the held values as a cache, or letting the operator clear them;
- any change to the live streams and to detail reads outside the current screen.
