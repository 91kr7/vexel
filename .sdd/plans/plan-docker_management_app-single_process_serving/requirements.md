---
slug: docker_management_app-single_process_serving
date: 2026-08-10
spec: .sdd/analysis/docker_management_app-single_process_serving.md
status: validated
---

# Requirements — Single-process serving

Evolution of the existing, working product. The reference plan is
[`plan-docker_management_app`](../plan-docker_management_app/requirements.md) (33 batches,
certified), and the sibling evolution is
[`plan-docker_management_app-about_license_notice`](../plan-docker_management_app-about_license_notice/requirements.md).
This plan covers the **delivery shape only**: no screen, no Docker capability and no API operation is
added, removed or altered by it.

Requirements are observable, individually verifiable behaviours, grouped by feature; each feature
becomes one vertical batch. Ids are local to this plan: `REQ-1` below is *not*
`plan-docker_management_app/REQ-1`. Requirements of the reference plan are always cited with their
path prefix.

Several requirements below are **preservation requirements** — "this must still be true afterwards".
They are stated as requirements rather than left implicit because this change alters the path every
request takes to the server, so nothing that depends on that path can be assumed to survive without
being checked.

Two readings were fixed by the human at validation and are load-bearing for what follows:

- **No screen of the interface has a URL of its own, and none gains one.** Screens are internal state
  restored from the persisted last-active preference (`plan-docker_management_app/REQ-115`).
  REQ-3 is therefore about the server never answering a page request with "not found"; client-side
  routing and URL-addressable screens are out of scope, and the app shell's navigation is not
  touched by this plan.
- **The delivered form is the only form the automated checks drive.** The end-to-end suite moves onto
  the single-process server (F3); the two-process Vite flow survives for manual development with hot
  reload and is no longer what any check targets.

## F1 — The server is the whole application: one process, one origin

| ID | Requirement |
| --- | --- |
| REQ-1 | The interface and the API answer at the same address and the same port, served by one process: the operator starts one thing and configures one address, with no second origin to expose, proxy or remember. |
| REQ-2 | The interface addresses the API relative to the origin it was served from — no base URL, no configured host, no cross-origin arrangement — so it works unchanged at whatever address the process is bound to, including behind a reverse proxy, on another interface of the machine or through a tunnel. |
| REQ-3 | An ordinary page request that is not under the API path is answered with the interface, so reloading the browser, opening a bookmark or pasting the instance's address lands the operator in the running application instead of a server "not found"; the screen they land on is the one the application already persists as last active (`plan-docker_management_app/REQ-115`), whose behaviour this change leaves untouched. |
| REQ-4 | An unrecognised address under the API path still fails as an API error a program can detect — never with the interface's page — so a mistyped, misspelled or removed call cannot look like a success to its caller. |
| REQ-5 | A request outside the API path that is not an ordinary page fetch — a submission, a deletion, a programmatic call to an address that does not exist — is answered as an error, not with the interface. |
| REQ-6 | Every live capability behaves in the single-process form exactly as it does through the development proxy: the daemon event stream, log follow, live resource statistics, interactive shell and attach sessions, and the long-running analyses (filesystem extraction, per-layer changesets) are established as promptly and stay as durable, with no buffering, truncation, delay or premature close introduced by the way requests now reach the server. |
| REQ-7 | The API surface is unchanged for anything already written against it: the same operations at the same addresses relative to the API root, the same inputs, the same responses and the same status codes; an existing caller changes nothing but the host and port, and only if it was pointing at the development arrangement. |
| REQ-8 | The server starts and serves its whole API when no built interface is present: a fresh checkout, or a developer running the server alone, gets a process that runs rather than one that refuses to. |
| REQ-9 | When the interface is absent, the server reports it in terms that name the cause and the remedy — that the interface has not been built, and what to run to build it — rather than a blank page, a generic error or silence. |
| REQ-10 | The location of the built interface can be pointed elsewhere at run time, without rebuilding the server, so the same server can be run against a different layout on disk. |
| REQ-11 | Serving the interface introduces no run-time prerequisite and no start-up fragility: no additional process, no reverse proxy, no new runtime dependency, no outbound network access, and no start-up work that makes the process perceptibly slower to come up or able to fail intermittently. |
| REQ-12 | The product gains no authentication, authorisation or transport security from this change, and loses none: the single address is the operator's only exposure decision, and there is no way to expose the interface without the API or the reverse. |

## F2 — One command builds it, one runs it; the development loop is untouched

| ID | Requirement |
| --- | --- |
| REQ-13 | One command at the repository root builds the complete application and runs it, on one port, with nothing else to start and no ordering the operator has to learn. |
| REQ-14 | Running an application that is already built is its own command and costs no rebuild, so restarting the process is not paid for in build time. |
| REQ-15 | The build is honest about itself: the command's outcome tells the operator whether it succeeded, the interface is built before the process that serves it, and what the running process serves is the output of the latest build rather than a stale or partial one. |
| REQ-16 | The development arrangement is unchanged and still available for manual development: the same commands, two processes with hot reload, an edit to client source visible immediately without a build and without restarting anything, and the development interface still reaching the API, the event stream and the interactive-session upgrades through its proxy. |
| REQ-17 | Neither arrangement requires a step belonging to the other: the development flow needs no build of the interface, and the delivered flow needs no development server. |
| REQ-18 | The project's stated commands at the repository root describe the two arrangements plainly distinguished — which one an operator runs, which one a developer runs, and that the development one is for manual work with hot reload only — and no instruction anywhere in the repository still presents the development arrangement as the way to run the product. |

## F3 — The delivered form is the form that is verified

| ID | Requirement |
| --- | --- |
| REQ-19 | The end-to-end suite drives the delivered single-process form and only that one: the interface is built, the single process serves it at the API's port, and every existing specification runs against it — including the live capabilities (streamed logs, live statistics, the daemon event stream, interactive sessions) — so the form the operator runs is the form that is verified, and no specification still targets the development server. |
| REQ-20 | The checks pin the failure modes this change introduces: an unknown API address answering as an API error rather than as the interface, an ordinary page request answering with the interface, and the server running API-only with its stated reason when no built interface is present. |
| REQ-21 | Moving the suite costs it none of its guarantees: it still starts what it needs itself, against its own throwaway data directory rather than the operator's, with the base images pulled once up front, a single worker, and the destructive specifications last and apart; every check still cleans up what it created and assumes nothing about the daemon's or the application's prior state. |
| REQ-22 | Every check that is not end-to-end keeps passing untouched — the server's typecheck, unit, API and exclusive passes and the client's unit, typecheck and UI-boundary passes — so moving the end-to-end suite costs nothing elsewhere. |
