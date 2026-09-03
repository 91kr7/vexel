---
slug: docker_management_app-about_license_notice
date: 2026-08-09
spec: .sdd/analysis/docker_management_app-about_license_notice.md
status: validated
---

# Requirements — About screen and identity/legal notice

Evolution of the existing product. The reference plan is
[`plan-docker_management_app`](../plan-docker_management_app/requirements.md), all 33 live batches
certified; the screen this evolution touches was delivered by its batch 30 and is described by its
`plan-docker_management_app/REQ-105` and `plan-docker_management_app/REQ-106` under the feature
titled F29.

Requirements are observable, individually verifiable behaviours, grouped by feature; each feature
becomes one vertical batch. Ids are local to this plan: `REQ-1` below is *not*
`plan-docker_management_app/REQ-1`. Requirements of the reference plan are always cited with their
path prefix.

Visual reference: the notice is rendered in the product's existing "liquid glass" language; it is
not exempt from the interface rules of `CLAUDE.md` by virtue of being legal text.

## F1 — The application's own screen becomes "About"

| ID | Requirement |
| --- | --- |
| REQ-1 | The navigation entry for the screen the application dedicates to itself is labelled "About" to the operator, and the screen's header carries the matching title and a one-line description; the entry stays the last one of the "Full coverage" group, in the same position and the same group as before. |
| REQ-2 | The screen's internal identity is unchanged by the rename: a "last active screen" value persisted by an earlier version still reopens this screen after the upgrade, with no migration step and nothing the operator has to redo, and automated checks that address the screen by its internal identity keep working untouched. |
| REQ-3 | The screen keeps everything it shows today — CLI availability, daemon event stream status, analysis cache status and the functional coverage matrix — with nothing removed, emptied or moved to another screen. |
| REQ-4 | The coverage statement stays discoverable under the new label: the screen's one-line description names the functional coverage matrix, and the matrix keeps a heading of its own on the screen, so an operator who is looking for "what does this product cover" reaches it from the navigation without knowing the screen's history. |
| REQ-5 | Nothing addressed at a human reader still calls this screen "Coverage matrix": every operator-visible string, every automated check that asserts the visible label, and the requirement of the reference plan reported as F29 name the screen as it is now labelled — that requirement being retitled and extended to cover the notice rather than duplicated by a parallel one. |

## F2 — Identity and legal notice

| ID | Requirement |
| --- | --- |
| REQ-6 | The About screen carries an identity and legal notice presented as a single, self-contained, visually identifiable block: everything the notice says is inside it and it is recognisable as one unit that can be preserved or removed whole. |
| REQ-7 | The notice is available whenever the application is in use — reached in one step from the permanent navigation, not behind a transient state, a modal that can be dismissed for good, or a first-run-only screen — and it never gates, interrupts or delays operational work: no blocking dialog, no acknowledgement to click through, no first-run wall. |
| REQ-8 | The notice cannot be hidden, emptied or edited: no operator setting, preference or configuration file changes what it displays. |
| REQ-9 | The notice states the product name, "Vexel". |
| REQ-10 | The notice states the copyright of the author — Christian Mariani, 2026 — identifying the natural person who holds it. |
| REQ-11 | The notice states that the software is licensed under the GNU Affero General Public License version 3 with additional terms permitted by its section 7, and tells the operator how to view the full text of both: two distinct routes, each reaching its own document in one step, rather than one route to the repository that leaves the operator to search for them. |
| REQ-12 | The notice states that the software comes with no warranty. |
| REQ-13 | The notice states that the operator may convey the work under this licence. |
| REQ-14 | The notice offers a route to the source repository, `https://github.com/91kr7/vexel`: actionable from the interface in a single step, and at the same time legible as plain text, so it remains usable on a host with no outbound network. |
| REQ-15 | The notice identifies the running version of the application, next to the route to the source; the version displayed is the one the project itself declares for the build being run, so publishing a new release changes it without anyone editing the notice. |
| REQ-16 | The notice warns that whoever modifies Vexel and exposes it over a network must offer the users interacting with it the source of that modified version, and must preserve the author attribution. |
| REQ-17 | The notice states that no rights in the name "Vexel" are granted, worded as a reservation of the name and nothing more — it claims no control over forks beyond what the licence permits. |
| REQ-18 | What the notice claims about the product agrees with the files shipped in the repository: the author's name, the year, the licence identifier and the source URL are the same in the interface as in `LICENSE`, `LICENSE-ADDITIONAL-TERMS.md` and `NOTICE`. |
| REQ-19 | The notice renders complete from what the application already holds locally: displaying it performs no network request of any kind — no fetch of its content, no update-availability check, no report of the installation anywhere — and it is identical on a host with no outbound connectivity. |
| REQ-20 | The notice's text is comfortably readable at rest on its glass surface, meeting the same documented minimum contrast the rest of the application is held to (`plan-docker_management_app/REQ-4`). |
| REQ-21 | The notice reads as a legal and identity statement rather than as promotion: no advertising of the author, no branding-led presentation, no call to action beyond the routes the licence itself asks for. |
| REQ-22 | The notice's wording stays correct as the product evolves without being edited: it contains no feature list, no release date and no claim that depends on the current state of the product — the only value that changes over time being the running version of REQ-15. |
