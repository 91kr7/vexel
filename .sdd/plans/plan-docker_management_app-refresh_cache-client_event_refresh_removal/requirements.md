---
slug: docker_management_app-refresh_cache-client_event_refresh_removal
date: 2026-09-01
spec: .sdd/analysis/docker_management_app-refresh_cache-client_event_refresh_removal.md
status: validated
---

# Requirements — the client stops refreshing on Docker events

This plan removes one thing: the wiring that makes a view in the browser read again because a Docker
event arrived. Everything else stays as it is. Features 5 and 6 state what must not move.

> **The plan was extended three times on 2026-09-01**, each time after the human saw the previous
> batches implemented, and each time by appending features: Feature 7, the Dashboard's overview
> figures on a clock; Feature 8, the container detail following the container it shows; and Features
> 9, 10 and 11, three independent reductions of what the interface reads and redraws. Features 1 to 6
> are closed by the first batch, 7 by the second, 8 by the third, 9 by the fourth, 10 by the fifth and
> 11 by the sixth. Nothing already validated is edited: those ids are stable and say what their own
> batch did.
>
> **Extended a fourth time on 2026-09-02**: Features 12 and 13 record work carried out outside
> the batches, while the six above were being made green. REQ-74 reverses the second half of
> REQ-58 and does not edit it; the note under Feature 13 says why.

## Feature 1 — No view reads again because of a Docker event

| ID | Requirement |
|----|-------------|
| REQ-1 | No view of the interface reads its data again because a Docker event arrived. This holds for every kind of event and for every screen, with no view left subscribed. |
| REQ-2 | The seven views whose only automatic trigger was the event — the Dashboard's overview figures, the disk-usage view of System & prune, and the details of a container, an image, an image's layers, a network and a volume — read when they are opened, when the operator asks and on a context switch. Between those moments they show what they last read. |
| REQ-13 | The Dashboard's event feed is the only subscriber to the daemon event stream left in the client. No other place in the client subscribes to it, for any purpose. |

> **REQ-13 is how REQ-1 is checked.** The human asked for a statement that can be read off the code
> rather than a measurement of requests: after this step one subscriber remains, and it is the feed.
>
> REQ-2 names the seven views one by one because the loss is invisible: the lists keep their clock,
> so nothing on the busy screens changes. The step that rebuilds inherits this list.
>
> **This step removes and adds nothing.** No re-read is introduced anywhere to make up for the
> trigger being gone — human decision of 2026-09-01. Where a view already re-reads after its own
> action it keeps doing so (REQ-9); the seven views above get no new trigger.

## Feature 2 — Nothing unused is left standing

| ID | Requirement |
|----|-------------|
| REQ-3 | The client holds no refresh facility without a caller after this step. What served only the event trigger is removed from the client, not left exported for a later caller. |

## Feature 3 — The event feed is untouched

| ID | Requirement |
|----|-------------|
| REQ-4 | The interface stays connected to the daemon's event stream and keeps receiving events, with the same subscription, backlog and reconnection it has today. |
| REQ-5 | The Dashboard's recent-events panel behaves exactly as today: the same events, in the same form, at the same moment. The operator sees no change in it. |

## Feature 4 — Every other trigger survives

| ID | Requirement |
|----|-------------|
| REQ-6 | Every list that polls today keeps polling, with the same periods. |
| REQ-7 | The manual refresh control reloads everything it reloads today, on every screen that offers it. |
| REQ-8 | A context switch re-reads everything it re-reads today. |
| REQ-9 | Where the application already re-reads after its own action, it still does, and the result is still shown immediately: the list screens, and the container's configuration update inside the container detail. No re-read after an action is added anywhere, and none is removed. |

## Feature 5 — Nothing else moves

| ID | Requirement |
|----|-------------|
| REQ-10 | Nothing in the interface tells the operator that its data comes from events, and nothing tells them it no longer does: this step adds no indicator, no control and no setting. |
| REQ-11 | The live streams keep their behaviour: container logs, container statistics, console and terminal sessions, transfer and build progress. They follow their own subscriptions and are not a refresh of a listing. |
| REQ-12 | The server is unchanged: the event stream it publishes, the values it holds, its schedule and its own reaction to events all behave exactly as today. |

## Feature 6 — The checks follow the behaviour decided here

| ID | Requirement |
|----|-------------|
| REQ-14 | A check that waited for a view to follow a daemon event now drives the trigger that remains — the manual refresh control, the clock, the context switch or an action in the application — or is removed together with the behaviour it covered. |
| REQ-15 | No check is weakened to keep passing: no assertion softened, none dropped, and no step given a longer budget to sit out a period. |

## Feature 7 — The Dashboard's overview figures move on a clock

Added 2026-09-01, on the human's decision after seeing the first batch implemented. The overview
figures were the one loss of the demolition worth closing now: with no trigger left, the tiles stand
still above a container panel that keeps moving on its own poll.

| ID | Requirement |
|----|-------------|
| REQ-16 | The Dashboard's overview figures read again on their own, at a fixed period, while the Dashboard is on screen: the five summary tiles and the disk-usage breakdown beside them. The operator who leaves the Dashboard open sees them follow the host without asking. |
| REQ-17 | The clock runs only while the Dashboard is on screen and stops when it is not, exactly as the clock of a list screen does. |
| REQ-18 | The period is one figure, declared in one place, and is a cadence of the product: an automated pass runs it at the same factor it runs every other cadence at. |
| REQ-19 | The three triggers the overview figures already have keep working as today: the read when the Dashboard is opened, the manual refresh control, and the context switch. The clock is added beside them. |
| REQ-20 | Nothing on the Dashboard says the figures are on a clock: no indicator, no "last updated", no control, no setting. The figures change in place. |
| REQ-21 | No other view gains a trigger here. The disk-usage view of System & prune and the five detail views named by REQ-2 stay as the first batch left them. |
| REQ-22 | A tick of this clock asks the daemon for nothing the server already holds. The disk-usage accounting, the compose projects, the builders and the build cache behind these figures are read on the server's own schedule — once per host, whatever the number of open windows — and not once per tick. |
| REQ-23 | Nothing else of the server moves: no endpoint is added or removed, the interface receives the same payload it receives today, and no other screen's data changes. |
| REQ-24 | The clock is covered by a check that drives it: the figures follow the host with the operator doing nothing, and the declared period is the one that runs. REQ-15 binds this check like every other. |

> **REQ-21 is about this step and no other**, as its own wording says. The third batch gives a clock
> to the container detail, and does not contradict it: REQ-21 records what the second batch did.
>
> **REQ-22 is server work, and REQ-12 above says the server is unchanged.** REQ-12 is therefore read
> as scoped to the first batch — the record of what that batch did — and the second batch is allowed
> the server work REQ-22 needs, bounded by REQ-23. The reading, the figures behind it and the
> alternative it refuses are in `batches.md` under "The scope of REQ-12".

## Feature 8 — The container detail follows the container it shows

Added 2026-09-01, on the human's decision after seeing the second batch implemented and running the
application. With a container's detail open on the Inspect tab they paused the container from
outside: the dialog's header read PAUSED while the payload below it read `Status: running`,
`Paused: false` — two contradictory statements on one screen at one moment. The header is fresh
because it comes from the container summary the screen polls; the payload was frozen because the
first batch took its trigger away and the second gave a clock to the Dashboard alone. `State` is one
of the sections the payload opens on, so this is the first thing in view.

| ID | Requirement |
|----|-------------|
| REQ-25 | With a container's detail open, the dialog does not contradict itself: what its header says about the container and what its payload says do not describe two different moments for longer than one period. |
| REQ-26 | The container's inspect data reads again on its own, at a fixed period, while a tab that shows it is open — the Inspect tab and the Config tab. |
| REQ-27 | The container's process listing reads again on its own, at the same period, while the Processes tab is open and the container is running. A container that is not running is not asked for its processes at all. |
| REQ-28 | Each clock runs only while the tab that shows its data is on screen, and that data is read the moment the operator opens that tab. On the other tabs neither reading is taken. |
| REQ-29 | A tick that finds nothing changed changes nothing on screen: what the operator has opened, typed, selected or scrolled to stays exactly as it was. |
| REQ-30 | A tick that finds something changed replaces the values where they stand: the sections the operator opened stay open, the find keeps filtering, the position in a long payload or a long process list is kept, and nothing is closed, collapsed or reset. |
| REQ-31 | An edit in progress on the Config tab is never disturbed by a tick: the form is not rebuilt and no value the operator has typed is replaced. |
| REQ-32 | A tick that fails leaves on screen what was last read and does not change how a failure is told to the operator. A container that has ceased to exist is still reported the way it is today. |
| REQ-33 | The period is one figure, declared in one place, and is a cadence of the product: an automated pass runs it at the factor it runs every other cadence at. |
| REQ-34 | Every trigger these two views have today keeps working: the read when the detail is opened on a container, the manual refresh control in the top bar, the Processes tab's own refresh, the reload signal, and the re-read after a configuration update. |
| REQ-35 | Nothing on the detail says its data is on a clock: no indicator, no "last updated", no control and no setting. The Processes tab keeps the refresh control it already offers. |
| REQ-36 | Logs, Stats, Exec and Attach are untouched: they keep the live streams and the sessions they have. |
| REQ-37 | No other view gains a clock: the disk-usage view of System & prune and the image, image-layer, network and volume details stay as they are. The check that guards this keeps guarding the views that still hold none, and names the two that no longer do. |
| REQ-38 | The server is unchanged: the inspect data and the process listing stay pull-based — read when they are asked for, nothing held for them on the server, no endpoint added. |
| REQ-39 | The clocks are covered by checks that drive them, and no check is weakened to accommodate them. |

> **REQ-29 and REQ-30 are the price of this clock, and they are why it is not simply an interval.**
> The Inspect tab draws several hundred fields, with sections the operator opens, a find that filters
> them and a raw payload they select text out of. A view redrawn every period whether or not anything
> changed takes all of that away from them, and takes it away silently.
>
> **REQ-37 supersedes nothing.** REQ-21 says no other view gains a trigger *in that step*, and this is
> another step. What this step does invalidate is the check that closed REQ-21, and REQ-37's last
> sentence says what becomes of it: it keeps testing something true rather than being deleted.

## Feature 9 — The volume and network listings are read only on their own screen

Added 2026-09-01, on the human's decision after seeing the third batch implemented. The shell mounts
`useVolumes()` and `useNetworks()` for every screen, and both poll every three seconds wherever the
operator is. The only consumers are the Volumes & networks screen and the Networks panel inside it;
no count in the rail and no figure on the Dashboard is fed by either.

| ID | Requirement |
|----|-------------|
| REQ-40 | The volume listing and the network listing are read only while the Volumes & networks screen is on screen. On every other screen the interface asks for neither. |
| REQ-41 | With nobody on that screen the server stops reading them from the daemon too: after the expiry window each reading stops and what was held is dropped. Until the screen is opened again neither is read at all, whatever happens on the host. |
| REQ-42 | Opening the screen reads both. After an absence longer than that window the first painting waits for a real reading of the daemon instead of being served from what the server held — once per visit, and accepted. |
| REQ-43 | While the screen is open every trigger it has today keeps working: the poll on both listings at the periods they have, the context switch, the reload signal, and the re-read after each of the screen's own actions. The manual refresh control behaves as it does for every held value — reading again what the server holds, skipping what it does not. |
| REQ-44 | Nothing outside that screen loses data: no count, badge, tile or figure elsewhere in the interface was fed by either listing, and none of them changes. |
| REQ-45 | The operator sees the same screen: the same two lists, the same columns, the same details, the same actions and the same layout, in the same places. Nothing is added to say where the data now comes from. |
| REQ-46 | The checks that cover the two panels drive them through the screen that mounts them, and none is weakened: no assertion softened, none dropped, no budget lengthened. |

## Feature 10 — A reading equal to the one in hand replaces nothing

Added 2026-09-01, on the human's decision. The polled list hooks store every reading they receive.
The array is newly parsed each time, so its identity always changes and the table redraws twenty
times a minute even when the answer is byte-for-byte the one already on screen.

| ID | Requirement |
|----|-------------|
| REQ-47 | A reading that comes back equal to the one already in hand does not replace it, and nothing downstream is redrawn. This holds for the six polled list hooks: containers, images, volumes, networks, compose projects and plugins. |
| REQ-48 | A reading that differs does replace it, and what the operator sees follows within the same period as today. No reading is delayed, skipped or coalesced. |
| REQ-49 | Each tick serialises one reading: the one that has just arrived. What is already in hand is never serialised a second time — its serialisation is kept beside it by the tick that stored it. |
| REQ-50 | The container's inspect data and its process listing are brought to that same form. What they already contract keeps holding: a tick that finds nothing changed changes nothing on screen (REQ-29), and a tick that finds something changed replaces the values where they stand (REQ-30). |
| REQ-51 | Nothing else about these hooks moves: the first read, the failure reporting, the loaded flag, the poll periods, the context switch, the reload signal and every re-read after an action behave exactly as today. |
| REQ-52 | No guard on the order of answers is added here. Two answers arriving out of order behave exactly as they do today, and the debt that records this stays in the register with its evidence. |
| REQ-53 | The rule is covered by checks that drive it — an equal reading redrawing nothing, a different one arriving — and no check is weakened to accommodate it. |

## Feature 11 — The plugins and the registries are held by the server

Added 2026-09-01, on the human's decision. These are the last two listings the interface polls that
the server holds nothing for: every request reaches the local Docker installation and the daemon,
once per open window. Their hooks are already mounted by their own screen alone, so the client half
of "read it only while it is being looked at" is in place and this closes the server half.

| ID | Requirement |
|----|-------------|
| REQ-54 | The plugins reading and the registries inventory are held by the server and served from what it holds. However many windows are open, the local Docker installation and the daemon are read once per period, not once per request. |
| REQ-55 | Each is read only while it is being asked for: with nobody on the Plugins screen and nobody on the Registries screen, neither is read at all. A whole expiry window without a request stops the reading and drops what was held, so the next request reads fresh. |
| REQ-56 | The plugins reading stays one round: the CLI inventory and the daemon inventory are read together and held together, so the two panels never show two different moments of the same installation. Each side keeps carrying its own stated unavailability. |
| REQ-57 | An action taken through the application is reflected at once: after installing, enabling, disabling or removing a plugin, and after a log in or a log out, the listing the screen reads back describes the change and never a state read before it. |
| REQ-58 | Each period is one figure, declared in one place, beside the kind it belongs to. It is a bare figure like every other kind's period, not a scaled cadence: on the server only the grouping window, the demand expiry and the stats sampler move with the pass factor. |
| REQ-59 | The delay this puts under a change made outside the application is bounded and stated: a `docker login`, a `docker logout` or a `docker plugin` command run from a terminal is noticed within the period plus the screen's own poll. |
| REQ-60 | Both endpoints answer with the body they answer with today and carry the read-time headers every held value carries. No endpoint is added, removed or changed in shape, and neither screen changes. |
| REQ-61 | Both behave like every other held value in the three cases the cache already decides: the operator's manual reload reads them again when they are held and skips them when they are not; a read that fails leaves the last value standing and is reported as staleness rather than as a failure; a context switch drops both. |
| REQ-62 | The two held values are covered by checks that drive them, and no check is weakened to accommodate them. |

> **REQ-52 is a statement about an absence, on purpose.** The missing response-sequencing guard is a
> separate piece of work, already scoped elsewhere and not asked for here. The comparison Feature 10
> adds touches the same line of code, so without REQ-52 the debt could be closed by accident and lose
> its entry.
>
> **REQ-59 is a cost, written as a requirement so it is decided rather than discovered.** The
> registries inventory is not only a daemon call: it reads the local Docker configuration and the
> credential store, which is how a `docker login` typed in a terminal reaches the screen at all.
>
> **REQ-58's second half was corrected on 2026-09-01, hours after it was written and before any batch
> closed it.** It first said the period was "a cadence of the product", copied across from REQ-18 and
> REQ-33 without checking that the server does what the client does. It does not: every polled hook in
> the browser calls `cadence()`, while all ten registered kinds declare `periodMs` as a bare figure,
> and only three server figures are scaled at all. This is the current plan being finished on a true
> premise, not a past one being rewritten — no batch had been built on the sentence it replaces.

## Feature 12 — Every daemon-backed test file starts from a daemon it emptied itself

Added 2026-09-02, after the fact. The work was carried out on 2026-09-01 and 2026-09-02, outside the
batches of this plan, to get the checks of the six batches above green; it is appended here as a
further feature rather than edited into any of them. The requirements below state what the product's
checks now do, and the batch that closes them carries that into the artifacts.

| ID | Requirement |
|----|-------------|
| REQ-63 | Every test file of both daemon-backed trees — the end-to-end specs and the server api tests — empties Docker before it runs. Containers, images, volumes, networks, build cache, build records, plugins, every builder that is not the daemon's own, and every context that is neither `default` nor the current one are removed. |
| REQ-64 | The reset empties the machine it runs on and is not scoped to the suite's own objects: the operator's containers, images, volumes, networks, builders and plugins go with the suite's, named volumes included. It is the one place in the repository allowed to do that, and no fixture may do it on its own. |
| REQ-65 | Three things survive every reset, each because it is in use: the run's own registry container, the volume holding what has been pushed into it, and the `registry:2` image the registry runs from. `registry:2` is the one image that cannot be restored from the registry, because the registry is started from it. |
| REQ-66 | The base images are put back at the end of every reset, and they are pulled out of the run's own registry, never from Docker Hub. A spec writes a Docker Hub name and gets the mirrored copy re-tagged under that name, because specs assert on that string. |
| REQ-67 | The two trees are wired differently because they run differently. One Playwright worker serves every spec, so each spec registers the reset as its own first `beforeAll`. `node --test` gives every server file a process of its own, so the reset is a preload, at that module's top level and not in a hook: a root hook starts ahead of the file's module scope without blocking it, and the files that ensure their images at module scope would be pruned mid-preparation. |
| REQ-68 | The unit trees reset nothing and must not: they mock the Docker call and never reach a daemon. |
| REQ-69 | A file does not clean up after itself at the end. What an `afterAll` may still hold is only what the reset cannot reach, because none of it is Docker: a fixture server running inside the test process, a temporary directory, an environment variable, a patched prototype, and the operator's active context, which a test that switched it switches back. |
| REQ-70 | No preparation step runs ahead of a pass. The two commands that put the base images and the run's registry in place stay as commands an operator types, idempotent end to end, so one file run on its own gets the same arrangement rather than a second one. |
| REQ-71 | The host-wide tests are no longer kept apart in any form: no separate directory, no separate command, no separate Playwright project. Every file prunes the host now, so the distinction no longer names anything. |
| REQ-72 | Forgetting the reset is not left to memory. A build-time guard, run by the lint and by the test command at the repository root, fails on an end-to-end spec that does not register the reset, on one that registers any other hook ahead of it, and on a server api command that stops preloading it. There is no exception marker. |
| REQ-73 | The artifacts describe this arrangement and no other: the architecture file, the module indexes and specs it touches, the knowledge base and the technical-debt register name the commands, the files and the paths that exist, and none that were removed. |

## Feature 13 — A kind's period runs on the process's clock

Added 2026-09-02, after the fact, for the same reason as Feature 12.

| ID | Requirement |
|----|-------------|
| REQ-74 | A refresh kind's declared period is put on this process's clock, like every other server cadence. A caller declares the figure it wants at the operator's factor and the cache scales it; a kind cannot be declared off the clock the rest of the process runs on. |
| REQ-75 | The component spec of the cache states that, so a caller reading the contract knows what the figure it passes becomes. |

> **REQ-74 reverses the second half of REQ-58, and does not edit it.** REQ-58 said a kind's period was
> a bare figure and not a scaled cadence, and that was true of the product when it was written. It
> stopped being true on 2026-09-02: under a suite running five times faster the build-cache listing
> stayed thirty seconds stale, and a check waiting twenty seconds for a record the daemon announces
> lost the race. REQ-58 stands as the record of what its own batch built; REQ-74 is what the product
> does now.
