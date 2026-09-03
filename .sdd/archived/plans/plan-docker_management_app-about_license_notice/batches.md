---
slug: docker_management_app-about_license_notice
date: 2026-08-09
spec: .sdd/analysis/docker_management_app-about_license_notice.md
requirements: .sdd/plans/plan-docker_management_app-about_license_notice/requirements.md
status: validated
---

# Batches — About screen and identity/legal notice

Evolution of a certified product. Two features in the spec, two batches; neither is enabling. Order
is the reading order of the table: the screen is renamed first, then the notice lands on it — so a
stop after batch 1 still leaves a coherent product, and batch 2 never has to guess what the screen
is called.

Batch numbers and `REQ-n` ids are **local to this plan**. `1 · about-screen-rename` is not batch 1
of `plan-docker_management_app`, and `REQ-1` here is not that plan's `REQ-1`. Requirements of the
reference plan are always cited with their path prefix.

| Batch | Feature | REQ closed | Depends | Status | Human acceptance |
| --- | --- | --- | --- | --- | --- |
| 1 · about-screen-rename | F1 — The application's own screen becomes "About" | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5 | — | certified | The last entry of the "Full coverage" navigation group reads "About"; opening it shows a header titled "About" whose one-line description names the functional coverage matrix; the CLI availability, daemon event stream and local storage cards are all still there, and so is the matrix under its own "Docker capability coverage" heading. Starting the application over a `~/.vexel` preferences file written by the previous version (with the screen persisted as last active) reopens this screen with nothing to redo and no migration. `npm run test -w client` and the e2e suite pass, the e2e helper that addresses the screen by its internal id being untouched. Searching the client's operator-visible strings and the reference plan's requirements for "Coverage matrix" as the *name of the screen* returns nothing. |
| 2 · identity-legal-notice | F2 — Identity and legal notice | REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-18, REQ-19, REQ-20, REQ-21, REQ-22 | 1 | certified | The About screen shows, above the CLI availability card, one visually self-contained block stating: the product name Vexel; the copyright of Christian Mariani, 2026; that it is licensed under the GNU Affero General Public License version 3 with additional terms permitted by section 7, with two one-step routes reaching `LICENSE` and `LICENSE-ADDITIONAL-TERMS.md`; that there is no warranty; that the operator may convey the work under this licence; a route to `https://github.com/91kr7/vexel` that is both clickable in one step and readable as plain text, with the running version `0.1.0` next to it; that whoever modifies Vexel and exposes it over a network must offer their users the source of that version and preserve the author attribution; and that no rights in the name "Vexel" are granted. Every name, year, licence identifier and URL on screen matches `LICENSE`, `LICENSE-ADDITIONAL-TERMS.md` and `NOTICE`. With the machine offline and the network panel open, the block renders identically and issues no request of any kind. No setting, preference or configuration file hides, empties or changes it, and it never blocks work — no dialog, no acknowledgement, no first-run wall. Bumping the version in the root `package.json` and rebuilding changes the displayed version with no edit to the notice. The screen still shows everything batch 1 left on it. |

Batch statuses (`todo | in progress | implemented | certified`) are advanced only by the
orchestrators of the later phases.

## Assumptions and decisions

- **The plan is written against the committed state, `HEAD = 7354211`, with a clean working tree.**
  An earlier prototype of this change (an about panel, an external-link control, a text primitive)
  was removed before the workflow started, precisely so nothing unspecified would be planned over.
  Everything the notice needs is therefore a `create`; `client/src/shell/Shell.tsx`,
  `client/src/shell/navigation.ts` and `client/src/ui/index.ts` are modified from their committed
  state.
- **`.sdd/.archi` describes the original bare scaffold and has not tracked the product since.**
  Placement decisions here follow `.sdd/modules/` (which is current) plus the non-negotiable rule of
  `CLAUDE.md`: `client/src/ui/` is the UI library — the only place allowed raw DOM tags and CSS —
  and every other area of `client/src/` is feature code that composes it.
- **One new UI primitive only: the external link.** The library has no control that presents a URL,
  and REQ-11/REQ-14 need one. It is the only genuine gap: the notice's prose can be carried by
  `Callout` (a persistent, non-dismissible banner whose body is arbitrary content — semantically a
  standing fact about the screen, which is exactly what a legal notice is) inside a `Card`, with
  `Stack` for the paragraphs. If the prose turns out to need typography the library does not
  express, `CLAUDE.md` applies: extend an existing component with a variant, never add a
  near-duplicate and never inline a one-off.
- **The version comes from the root `package.json`, injected into the client at build time.**
  Decided with the committer: no server call, nothing to fetch, correct on an air-gapped host, and
  bumped by the same act that cuts a release — which is what REQ-15 and the analysis's
  "hardcoded string nobody bumps" risk ask for. The chosen number is **`0.1.0`**, not `1.0.0`: the
  product does not yet commit to the semver stability `1.0.0` would promise.
- **`client/package.json` and `server/package.json` deliberately stay at `0.0.0`.** This is not an
  oversight and INT-2 of batch 2 says so on the spot. The two workspace packages are private and
  never published; leaving them unversioned keeps **one** place to bump, so no two version strings
  in this repository can ever disagree about what the running build is — the same drift argument
  that REQ-18 makes about the licence files.
- **`CoverageMatrixScreen` keeps its name and its path.** The frozen internal identity of REQ-2 is
  the screen id `coverage-matrix`; the component name is a separate matter, and after this change it
  is still accurate — the component renders the coverage matrix, which is now one half of the About
  screen, the notice being the other. Renaming it would be churn against no requirement. The same
  reasoning keeps the `coverage` module and its specs where they are; what changes in the
  documentation is every sentence calling *the screen* "Coverage matrix".
- **Retitling F29 of a certified plan is intended, not a violation of its frozen state.** The spec
  asks for it explicitly and REQ-5 carries it. The edit is a retitle plus a cross-reference to this
  plan's F2; no requirement text is copied and no id is renumbered, so
  `plan-docker_management_app/REQ-105` and `/REQ-106` keep their meaning.
- **The screen's glyph may change or stay.** No requirement depends on it. If an existing glyph of
  `client/public/icons.svg` suits an identity screen, use it; otherwise keep the current one rather
  than inventing an asset.
- **Nothing new is persisted and no server code is touched.** The notice is a constant of the build;
  the whole change lives in the client plus the root `package.json`.

## Departures from the spec

None. The three open questions the analysis left were all answered on the analyst's own proposed
defaults (version shown: yes; full licence texts in-app: no, external route only; 7(c) self-declaration
mechanism: no), and the two decisions taken during validation — the version number `0.1.0` and two
distinct routes to the two licence documents — refine the spec rather than contradict it.

## Coverage check

**Every REQ is served by at least one INT**, and every REQ closes inside the batch that lists it —
no requirement is split across the two batches.

| REQ | Batch | Interventions serving it |
| --- | --- | --- |
| REQ-1 | 1 | INT-1 |
| REQ-2 | 1 | INT-1, INT-3, INT-4 |
| REQ-3 | 1 | INT-4 |
| REQ-4 | 1 | INT-1, INT-4 |
| REQ-5 | 1 | INT-2, INT-3, INT-5, INT-6 |
| REQ-6 | 2 | INT-4, INT-5 |
| REQ-7 | 2 | INT-5 |
| REQ-8 | 2 | INT-4 |
| REQ-9 | 2 | INT-4 |
| REQ-10 | 2 | INT-4 |
| REQ-11 | 2 | INT-1, INT-4 |
| REQ-12 | 2 | INT-4 |
| REQ-13 | 2 | INT-4 |
| REQ-14 | 2 | INT-1, INT-4 |
| REQ-15 | 2 | INT-2, INT-3, INT-4 |
| REQ-16 | 2 | INT-4 |
| REQ-17 | 2 | INT-4 |
| REQ-18 | 2 | INT-4, INT-6 |
| REQ-19 | 2 | INT-3, INT-4, INT-6 |
| REQ-20 | 2 | INT-4 |
| REQ-21 | 2 | INT-4 |
| REQ-22 | 2 | INT-4 |

**Every INT serves at least one REQ.** No enabling intervention is declared: there is none.

| Batch | INT | REQ served |
| --- | --- | --- |
| 1 | INT-1 | REQ-1, REQ-2, REQ-4 |
| 1 | INT-2 | REQ-5 |
| 1 | INT-3 | REQ-2, REQ-5 |
| 1 | INT-4 | REQ-2, REQ-3, REQ-4 |
| 1 | INT-5 | REQ-5 |
| 1 | INT-6 | REQ-5 |
| 2 | INT-1 | REQ-11, REQ-14 |
| 2 | INT-2 | REQ-15 |
| 2 | INT-3 | REQ-15, REQ-19 |
| 2 | INT-4 | REQ-6, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-18, REQ-19, REQ-20, REQ-21, REQ-22 |
| 2 | INT-5 | REQ-6, REQ-7 |
| 2 | INT-6 | REQ-18, REQ-19 |

**Two notes on concentration**, both deliberate rather than a cutting mistake:

- Batch 2's INT-4 serves sixteen REQs because REQ-9 to REQ-17 are the *clauses of one block of text*.
  The analysis's highest-consequence risk is a notice missing one clause of the section 0 definition,
  which is why they are separate requirements and must be checkable one by one; but there is only one
  place to write them, so splitting the intervention would split a single paragraph across INTs.
- Batch 1's REQ-3 is a preservation requirement: no intervention adds it, INT-4 is the check that the
  rename took nothing away. It is listed as served rather than left unserved because a requirement
  whose whole content is "this must still be true afterwards" is closed by the check that says so.
