---
request_slug: docker_management_app-single_process_serving
date: 2026-08-10
type: evolution
reference: .sdd/analysis/docker_management_app.md
---

## Request

> Serve the whole Vexel application from a single npm server process instead of requiring two (Vite
> dev server + Express API server). In production the Express server must serve the client's built
> static assets and the SPA history fallback from the same origin and port as the API, so one root
> command builds and runs the complete app. The two-process flow stays available for local
> development only (Vite dev server with its /api proxy and HMR). The API surface, the WebSocket
> upgrade handling and the SSE event stream must not change.

(Note: the request also pointed at repository files — `.sdd/.archi`, `server/src/index.ts`,
`client/vite.config.ts` — as context. Those are technical artefacts describing the *how*; this
analysis is deliberately derived from the request itself and from the existing analyses in
`.sdd/analysis/`, and states nothing that depends on reading implementation files.)

## Reference

Previous analysis: [`.sdd/analysis/docker_management_app.md`](docker_management_app.md).
Sibling evolution: [`.sdd/analysis/docker_management_app-about_license_notice.md`](docker_management_app-about_license_notice.md).

**Starting point.** Vexel is a single-operator, local-first client that exposes the full functional
surface of a Docker installation — containers, images, volumes, networks, Compose, Swarm,
registries, builds, contexts, system administration, plugins, plus deep layer and filesystem
inspection — behind a consistently applied "liquid glass" interface. The reference analysis
established the product as something the operator runs themselves against a daemon they control,
and set two standing non-functional themes that this change touches directly: **real-time
responsiveness** (live logs, live stats, event-driven state, which in the delivered product means
long-lived streams and interactive sessions) and **local-first control** (not a hosted
multi-tenant service). It said nothing about how the product is started, packaged or reached: the
delivery shape was never a stated requirement, and the two-process arrangement in use today is an
artefact of how the product was developed rather than a decision anyone took about how it should be
run. The sibling evolution added the product's in-interface identity and legal notice, which
presupposes an operator who can reach the interface at a known address.

**Changes:**

- The way the operator obtains and runs the product becomes an explicit product concern. Where the
  reference analysis was silent, this analysis states that the delivered application is **one
  process, one origin, one port**, obtained from **one root command**.
- The development arrangement (two processes, hot reload, a proxy from the interface to the API) is
  reclassified: from "how Vexel runs" to "how Vexel is developed". It stays fully supported for
  developers and stops being what an operator is asked to do.
- Nothing in the reference analysis's functional scope, requirements, risks or constraints is
  withdrawn, and nothing is added to the operator's feature set. This change is about **delivery
  shape only**: the same product, reached differently.
- One reference-analysis expectation is tightened rather than changed: "real-time responsiveness"
  now carries an explicit non-regression obligation, because live streams and interactive sessions
  are the capabilities most exposed to a change in how requests reach the server.

## Summary

Make Vexel run as a single server process that serves both the interface and the API from the same
address, so an operator builds and starts the whole product with one command at the repository
root; keep the existing two-process, hot-reloading arrangement for development only, with no change
to what the product does or to how any of its live capabilities behave.

## Business goal

**The product currently cannot be run by anyone who is not developing it.** To use Vexel today an
operator must start two long-lived processes, keep both alive, and know that one of the two
addresses is "the application" while the other is "the part the application talks to". Everything
about that arrangement exists to serve a developer's inner loop — instant feedback on a source edit
— and nothing about it serves the person the reference analysis identified as the customer: a
technical operator who wants to point a management tool at their own daemon.

Four concrete costs follow from that, and they are the value this change recovers.

**Installation stops being a procedure and becomes a command.** Two processes mean two terminals or
a process manager, two failure modes at start-up, and an ordering dependency the operator has to
learn. One command that produces a runnable application and one command that runs it is the whole
instruction set. For a tool whose audience explicitly chooses self-hosted software to avoid
operational ceremony, the size of the "getting started" section is a real feature.

**One address makes the product deployable at all.** A self-hosted administrative tool is routinely
put behind a reverse proxy, bound to a specific interface, restricted by firewall rule, reached over
an SSH tunnel or from another machine on the LAN. Every one of those is a per-origin operation.
With two origins, the operator has to arrange all of it twice and additionally make the two halves
agree about each other across the proxy — a configuration surface that has nothing to do with
Docker and that they did not ask for. With one origin, the entire exposure decision is a single
address the operator already knows how to control. It also removes an entire class of confusion
("it loads but every action fails") that arises when the interface is reachable and the API is not.

**It closes the gap between what is tested and what is run.** Today the only arrangement the
product is ever exercised in is the development one. Whatever an operator would run has, by
definition, never been verified, because nobody runs it. Making the single-process form the
delivered form makes it the form that can be — and must be — checked. This matters more here than
it would for a passive application: Vexel performs destructive, irreversible operations on the
operator's daemon, so "works in the shape it ships in" is not a nicety.

**It makes packaging possible later.** A container image, a service unit, a single published
artefact — the obvious next steps for a self-hosted tool — all assume one process with one
entrypoint and one exposed port. None of them can be built on top of a two-process arrangement
without first doing this work. This change does not deliver any of those artefacts, but it is the
precondition for all of them, and doing it now avoids the alternative of discovering the constraint
while trying to package.

There is also a smaller, non-obvious benefit for the sibling evolution: the identity and legal
notice added to the About screen asserts what the running instance is and where its source lives.
An instance with one unambiguous address is a coherent thing to make that assertion about; an
instance that is two processes on two ports is not.

The counterweight, and the reason the change is bounded: **a developer's inner loop is a real asset
and must not be paid for.** Losing hot reload, or forcing a full build before every source edit could
be seen, would trade a one-time operator benefit for a permanent development cost. Hence the two
arrangements coexist, each in its own place.

## Requirements

### Functional

- **One command at the repository root produces a runnable application, and one command runs it.**
  After that, the operator has a working Vexel without any further step, without starting anything
  else, and without being told which of several processes matters.
- **The interface and the API answer at the same address and the same port.** The operator knows one
  address; there is no second address to configure, expose, proxy or remember.
- **Everything the product does today keeps working, identically.** Every screen, every operation,
  every live capability — streaming logs, live resource stats, the daemon event stream, interactive
  shell and attach sessions, long-running analyses such as filesystem extraction and per-layer
  changesets. This change alters where the product is reached, not what it does. Any observable
  difference in behaviour is a defect of this change, not a consequence of it.
- **Anything already written against the product's API keeps working unchanged.** The set of
  operations, their addresses relative to the API root, their inputs and their responses are
  untouched. An existing caller only ever has to change the host and port it points at, and only if
  it was pointing at the development arrangement.
- **Reloading, bookmarking or deep-linking any screen lands the operator on that screen.** The
  interface's internal navigation must survive a browser reload and a pasted address, rather than
  producing a "not found" from the server. This interacts with the existing behaviour that persists
  the last active screen (reported as REQ-115): both must hold, and neither must fight the other.
- **A request to an address the product does not recognise must fail as what it is.** Under the API
  path, an unknown operation must still answer as an API error that a program can detect — never
  with the interface's page, which would turn a mistyped call into a silent, undetectable success
  from the caller's point of view. Outside the API path, only ordinary page requests are answered
  with the interface.
- **The development arrangement stays, unchanged, for developers.** Editing client source shows the
  result immediately, without a build and without restarting anything; the development interface
  continues to reach the API. Nothing about this change may make the daily development loop slower
  or more ceremonious.
- **The server starts and serves its API even when no built interface is present.** A developer or
  an operator who starts the server without having built is not left with a process that refuses to
  run; the API remains available and any API-driven use of the product still works.
- **When the interface is missing, the operator can tell why.** The absence must be reported in a way
  that names the cause and the remedy ("the interface has not been built"), not as a blank page, a
  generic error, or a silent nothing. A missing build is the single most likely first-run mistake
  this change introduces, and it must be self-diagnosing.
- **The location of the built interface can be pointed elsewhere at run time.** So the same server
  can be packaged with a different layout on disk — a container image, an installed service — without
  rebuilding it. This is the packaging hook the goal above depends on; nothing else about the
  product's behaviour changes with it.
- **The project's own instructions describe how the product is actually run.** The commands stated at
  the repository root are the ones an operator and a developer will each use, with the two
  arrangements plainly distinguished, so nobody follows the development instructions into
  production.

### Non-functional

- **No regression in live behaviour is acceptable.** The reference analysis made near-real-time state
  a standing requirement; long-lived streams and interactive sessions are precisely the traffic most
  sensitive to a change in how requests reach the server. Log follow, stats, the event stream and
  terminal sessions must remain as responsive, as promptly established and as durable as they are
  today.
- **The product must be verified in the form it is delivered.** Automated checking must exercise the
  single-process arrangement, because that is the one the operator runs; checking only the
  development arrangement leaves the shipped product unverified. Existing checks must keep passing
  in whichever arrangement they target, and the existing testing discipline — a test cleans up after
  itself and assumes nothing about the daemon's or the application's prior state — is unaffected by
  this change and continues to apply.
- **The security posture is unchanged, and unchanged means unchanged.** Vexel gains no
  authentication, no authorisation and no transport security from this change; it also loses none.
  Exposure remains entirely the operator's decision, as the reference analysis's local-first
  positioning requires. What changes is that the decision is now taken once instead of twice.
- **Start-up must stay fast and predictable.** Starting the product must not become perceptibly
  slower, and must not become dependent on anything that can fail intermittently. An administrative
  tool that is slow to come up is one the operator hesitates to restart.
- **The build step must be honest about itself.** Whatever "build" does, the operator must be able to
  tell whether it succeeded and whether what is being served is the result of the latest build,
  rather than discovering a stale or partial build through odd behaviour in the interface.
- **No new runtime prerequisite for the operator.** Running the product must not start requiring
  anything the operator did not already need. The point of the change is to remove steps, not to
  swap one set for another.
- **English only**, consistent with the project's language convention.

## Assumptions

- **This is an evolution of the existing product analysis, not a new product and not a fix.** Stated
  by the requester, and consistent with the change adding no operator-facing capability: it is not
  repairing broken behaviour, it is establishing a delivery shape that was never specified.
- **The interface is a pre-built static bundle.** Nothing in the request suggests server-rendered
  pages or per-request page generation; "built static assets" is taken literally. Rationale: this is
  what the current development arrangement already produces conceptually, and anything else would be
  a far larger change than the request describes.
- **The single-process arrangement is the only one an operator is asked to use.** The request is
  explicit that the two-process flow is "local development only". Consequently, any operator-facing
  documentation, instruction or claim refers to the single-process form.
- **The address the server listens on stays configurable exactly as it is today.** The change is
  about collapsing two origins into one, not about how that one is chosen. The development
  interface's own address remains a development-only concern.
- **No packaging artefact is delivered by this change.** No container image, no installer, no
  published package, no service definition. The request asks for a single process reachable at a
  single origin; those artefacts are the payoff this enables and each is a separate decision with
  its own scope. Recorded as an assumption rather than a question because the request's own wording
  ("one root command builds and runs") describes a repository-level command, not a distribution.
- **The product remains single-operator and local-first.** Serving from one origin makes remote
  access easier to arrange but does not make the product a hosted service; the reference analysis's
  exclusion of multi-tenant operation and of user/role management stands untouched.
- **Only ordinary page requests are ever answered with the interface.** A request that is not a page
  fetch — a submission, a deletion, a programmatic call to an address that does not exist — is
  answered as an error, not with the interface's page. Rationale: answering everything with the page
  turns every client-side mistake into a response that looks successful, which is the classic defect
  of this arrangement and the one most expensive to diagnose later.
- **Browser caching of the interface is standard-behaviour territory, not a stated requirement.** No
  special upgrade or cache-invalidation mechanism is assumed to be part of this change; the
  consequence is recorded under Risks so it is a known, accepted exposure rather than an oversight.
- **Nothing about the operator's persisted state changes.** The last active screen, the analysis
  cache and any other stored preference survive this change untouched; an operator upgrading to the
  single-process form finds the product as they left it. Rationale: those are properties of the
  product, not of how it is served, and the request asks for no behavioural change.
- **"Must not change" is read strictly.** For the API, the upgrade handling behind interactive
  sessions and the event stream, the acceptance criterion is that an existing consumer cannot tell
  the difference. Not "equivalent", not "improved" — identical.

## Constraints

- **Product constraint — the API surface, the interactive-session upgrade handling and the event
  stream are frozen.** Stated by the requester as a boundary of the change. Any temptation to tidy,
  rename, restructure or "improve while we are in there" falls outside this change and belongs to a
  separate request.
- **Product constraint — the development loop must not regress.** Hot reload and immediate feedback
  on a source edit are the reason the two-process arrangement exists; the change is only worth making
  if it costs the developer nothing.
- **Product constraint — the two arrangements must not silently diverge.** Two ways of serving the
  same product create two behaviours that can drift (path handling, deep links, streaming, error
  responses). Whatever keeps them aligned is a standing obligation of the project from this change
  onward, not a one-off task.
- **Product constraint — one port means one exposure decision.** After this change there is no way to
  expose the interface without exposing the API, or the reverse. That is the intended simplification,
  and it is also a hard property: an operator who wanted to reach one and not the other no longer
  can. Given the interface is only a client of that same API, nothing is actually lost, but the
  property should be stated rather than discovered.
- **Product constraint — existing automated checks address the running application by known
  entry points.** The end-to-end suite drives the product through its interface and pins the screen
  it needs; whatever changes about how the application is reached must keep those entry points
  working, or update them deliberately.
- **Domain constraint — the operator's environment may be constrained.** Air-gapped hosts, restricted
  outbound access, non-standard ports and reverse proxies are ordinary conditions for a Docker
  administration tool. The delivered arrangement must work without outbound network access at run
  time.
- **Repository constraint — commands are run from the repository root** (npm workspaces), so the
  single command this change promises is a root-level command, consistent with the project's existing
  convention.

## Market trends

Relevant, and researched: how a self-hosted operational tool is served and started is a settled
convention in this product category, and the reference analysis already positions Vexel against
named competitors in it.

- **The Vite dev server is explicitly not intended for production**, and the documented workflow is
  to build the assets and have a backend serve the built output. The current two-process arrangement
  is therefore not a design choice Vexel is departing from — it is the development-time half of a
  documented pattern being used past its intended boundary, and this change completes the pattern
  rather than inventing one.
  ([Vite, Backend Integration](https://vite.dev/guide/backend-integration);
  [Vite deployment and production overview](https://deepwiki.com/vitejs/vite/8-deployment-and-production))
- **Serving a single-page interface and its API from one server, with a history fallback for
  client-side routes, is the standard arrangement** for this class of application. The recurring
  documented benefit is precisely the one at stake here: because the same origin serves both, the
  interface addresses the API relatively and there is nothing per-deployment to configure. The
  equally recurring documented pitfall is the ordering of static assets against the catch-all
  fallback — which is why the "unknown API address must fail as an API error" requirement above is
  stated explicitly rather than assumed.
  ([Hosting a SPA using Node and Express](https://brianchildress.co/blog/hosting-your-single-page-application-using-node-and-express/);
  [Deploying a SPA served by a Node backend](https://azureossd.github.io/2023/05/17/Deploying-a-SPA-served-by-a-Node-backend-on-the-same-Linux-App-Service/))
- **Portainer — the closest functional competitor named in the reference analysis — is a single
  container on a single web port** (9443 by default), and its deployment story is a single `docker
  run`. Every guide to it is one command plus a volume. That is the bar Vexel's installation
  instructions are implicitly compared against by the same audience.
  ([Portainer default port guide](https://brainvoyage.blog/portainer-default-port);
  [Portainer CE deployment overview](https://chns.tech/posts/2026/04-04-portainer-ce-docker-container-management-platform/))
- **The self-hosted audience treats "one process, one port" as the norm**, and popularity in the
  category tracks how little ceremony a tool demands: Uptime Kuma serves its interface on a single
  port from a single container, and single-binary tools are promoted specifically on that property.
  A tool that asks for two processes reads, to this audience, as not finished rather than as
  flexible.
  ([Uptime Kuma](https://github.com/louislam/uptime-kuma);
  [self-hosted monitoring comparison](https://botmonster.com/self-hosting/build-status-page-self-hosted-services-gatus/))
- **Running behind a reverse proxy is the expected production posture** for a Node-based server, and
  it is a per-origin arrangement. Collapsing to one origin therefore halves the configuration the
  operator has to write and removes the cross-origin agreement between the two halves entirely.
  ([Hosting a SPA using Node and Express](https://brianchildress.co/blog/hosting-your-single-page-application-using-node-and-express/))

## Risks

- **Silent divergence between the development and delivered arrangements.** Two ways of serving the
  same product means a defect can exist in one and not the other — a deep link that resolves in
  development but not when delivered, an error shape that differs, a stream that behaves differently.
  The dangerous direction is the one nobody looks at: a defect only present in the arrangement the
  operator uses and the developer never sees. This is the principal risk of the change and the
  reason the "verify the delivered form" requirement exists.
- **Regression in live capabilities.** Log follow, stats, the daemon event stream and interactive
  terminal sessions are long-lived and are the part of the product most sensitive to how a request
  reaches the server. A regression here is highly visible (a terminal that will not open, logs that
  stop updating) and directly attacks the reference analysis's real-time responsiveness requirement.
- **The fallback swallowing genuine "not found" responses.** If every unrecognised address is
  answered with the interface, a mistyped API call returns something that looks like a successful
  page, a caller sees a success where there was a failure, and the interface itself may render a
  blank screen instead of an error. Diagnosing this after the fact is disproportionately expensive
  relative to preventing it.
- **First run without a build.** The most likely first mistake is starting the server before building
  the interface. If that produces a blank page or an unexplained error, the change makes the product
  look broken at exactly the moment an evaluator forms their opinion of it.
- **Stale interface after an upgrade.** An operator whose browser holds the previous interface while
  the server has been updated gets a mismatched pair, with symptoms that look like arbitrary
  malfunction. Not addressed by this change, and accepted; worth stating because "clear your cache"
  is a support answer nobody wants to give for an administrative tool.
- **Instructions that outlive their accuracy.** With two supported ways to start the product, any
  documentation, README, script or habit still describing the old one sends someone down the wrong
  path — most damagingly, an operator following developer instructions and unknowingly exposing a
  development server.
- **Scope leak.** "It is served from one place now" is an inviting moment to also add authentication,
  transport security, a container image or a published artefact. Each is a legitimate future request
  and none is this one; conflating them would turn a bounded delivery change into an open-ended one.
- **Over-collapsing the two arrangements.** The opposite failure: simplifying so aggressively that
  the development loop loses hot reload or starts requiring a build. That trades a permanent cost for
  a one-time benefit and would make the change a net loss for the project.
- **False confidence from an unchanged API.** The API surface being frozen does not by itself
  guarantee unchanged behaviour, because what changes is how requests arrive at it. "We did not touch
  the API" is not evidence that the API still behaves identically; only exercising it in the new
  arrangement is.

## Scope

**In scope:** delivering Vexel as a single server process that serves both the built interface and
the API from one address and port; a single repository-root command that builds the product and a
single one that runs it; correct handling of interface reloads and deep links so any screen survives
a browser refresh or a pasted address; keeping unrecognised API addresses failing as API errors
rather than being answered with the interface; keeping the server and its API usable when no built
interface is present, with a self-explanatory indication of why the interface is absent; the ability
to point the server at a different location for the built interface at run time so the product can
be repackaged without rebuilding; retaining the existing two-process, hot-reloading arrangement
unchanged for local development; verifying the delivered single-process form, not only the
development one; and updating the project's own stated commands so operator and developer
instructions each describe the arrangement they belong to.

**Out of scope** (unless a future request extends it): any change to the API surface, to the
interactive-session upgrade handling or to the event stream; any new operator-facing feature,
screen or Docker capability; authentication, authorisation, user accounts or any access-control
layer; transport security, certificate handling or reverse-proxy configuration shipped as part of
the product; producing a container image, installer, service definition, published package or any
other distribution artefact; multi-instance, clustered or hosted multi-tenant operation; asset
caching, versioning or upgrade-invalidation mechanisms beyond ordinary behaviour; changes to
persisted operator state, to the last-active-screen behaviour or to the analysis cache; performance
optimisation of the interface or the API beyond not regressing; and any rework of the interface,
the UI library or the existing screens occasioned by the change of serving arrangement.
