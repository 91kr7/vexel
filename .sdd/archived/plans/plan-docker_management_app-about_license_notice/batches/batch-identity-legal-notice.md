---
batch: 2 · identity-legal-notice
feature: F2 — Identity and legal notice
closed_req: [REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-18, REQ-19, REQ-20, REQ-21, REQ-22]
depends: [1]
---

# Batch 2 — Identity and legal notice

The About screen gains the block that says what this application is, whose it is, under what terms
and where its source lives.

## Why the content is not negotiable, clause by clause

REQ-9 to REQ-17 are not a wish list. Section 0 of the AGPL defines "Appropriate Legal Notices" as a
display carrying a copyright notice, the absence of warranty, the right to convey, and how to view
the licence; section 5(d) then exempts a downstream modifier from adding notices the original
interface never displayed. A block missing one of those clauses is arguably not such a display at
all — in which case every fork keeps the 5(d) exemption, the section 7(b) attribution term has
nothing to preserve, and the whole change achieves nothing while looking as though it had worked.
That is why each clause is its own requirement and each must be checkable on its own.

The other side of the same coin is REQ-21. Section 7 attribution is bounded by a reasonableness
standard, and in this product category a notice that reads as branding gets contested and removed.
The block is a legal statement, not a banner for the author.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client, UI library (`client/src/ui/`) | The one primitive the library is missing: a control presenting a URL as a route that is followed in one step **and** legible as plain text, so it stays useful on a host with no outbound network (REQ-14). Domain-agnostic, styled from the library's tokens, opening outside the application safely. Exported from the library entry point (`client/src/ui/index.ts`) before any feature code imports it, with its own component spec and its row in the ui-library index. | REQ-11, REQ-14 | — |
| INT-2 | modify | root `package.json` | `version`: `0.0.0` → `0.1.0`. This is the product's single source of truth for the running version. **`client/package.json` and `server/package.json` stay at `0.0.0` on purpose, and the change must say so where a reader will find it**: both are private and never published, and leaving them unversioned keeps one place to bump, so two version strings in this repository can never disagree about what the running build is. `0.1.0` rather than `1.0.0` is the committer's choice: the product does not yet promise semver stability. | REQ-15 | — |
| INT-3 | modify | `client/vite.config.ts`, `client/vitest.config.ts` | Inject the root `package.json` version into the client as a build-time constant, read at config time — not fetched, not asked of the server, so the notice is complete offline (REQ-19). Two traps to close in the same intervention: the constant must be defined for the **vitest** config too, or the notice renders an undefined version under unit test while passing in the browser; and it needs an ambient type declaration, or `npm run test:typecheck -w client` fails on it. | REQ-15, REQ-19 | INT-2 |
| INT-4 | create | client, application shell area (`client/src/shell/`) | The notice itself: one self-contained block (REQ-6) carrying, in this spirit and in English, the product name (REQ-9), the author's copyright (REQ-10), the licence and how to view its full text and the section 7 additional terms — two distinct one-step routes, one per document, not a link to the repository root (REQ-11) —, the absence of warranty (REQ-12), the right to convey the work under this licence (REQ-13), the route to the source repository legible as text (REQ-14) with the running version beside it (REQ-15), the network-modification warning (REQ-16) and the reservation of the name (REQ-17). Built from library components only — `Card` around a `Callout` whose body is the prose, `Stack` for the paragraphs, INT-1 for the routes: no raw tag, no CSS, no hard-coded colour or spacing, which is also what keeps REQ-20 true. It reads from nothing: no preference, no fetch, no props an operator can influence, which is what makes REQ-8 and REQ-19 structural rather than promised. Every name, year, licence identifier and URL is copied from `LICENSE`, `LICENSE-ADDITIONAL-TERMS.md` and `NOTICE` (REQ-18). No feature list, no release date, nothing that rots (REQ-22); no promotion (REQ-21). | REQ-6, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-18, REQ-19, REQ-20, REQ-21, REQ-22 | INT-1, INT-3 |
| INT-5 | modify | `client/src/shell/Shell.tsx` | Render the notice as the **first** card of the branch that serves the screen id `coverage-matrix`, above the "CLI availability" card. Nothing already there is removed, emptied or reordered — batch 1's REQ-3 must survive this batch. Placing it on a screen of the permanent navigation, with no dialog, no acknowledgement and no first-run gate, is what closes REQ-7. | REQ-6, REQ-7 | INT-4 |
| INT-6 | create | client test suite (`client/test/`) | An automated check that the notice agrees with the shipped files: the author, the year, the licence identifier and the source URL the block displays are read back out of `LICENSE`, `LICENSE-ADDITIONAL-TERMS.md` and `NOTICE` and compared (REQ-18), and rendering the block issues no network request (REQ-19). Both are drift risks that a human reviewer catches once and then stops catching — the interface and the licence files are edited by different hands months apart, and two contradictory legal statements about the same product are worse than one. | REQ-18, REQ-19 | INT-4 |

## Out of this batch

Explicitly out of scope, from the spec: a licence footer on every screen; an in-app reader or offline
copy of the licence texts; a first-run or blocking acknowledgement; any setting to hide or edit the
notice; a third-party dependency/SBOM listing; any mechanism for a fork to declare itself modified
under section 7(c); an update check, release feed or telemetry attached to the version; changes to
the licence files themselves; translation of the notice. No server code is touched.

## Human acceptance

The About screen shows, above the CLI availability card, one visually self-contained block stating:
Vexel; the copyright of Christian Mariani, 2026; that it is licensed under the GNU Affero General
Public License version 3 with additional terms permitted by section 7, with two one-step routes
reaching `LICENSE` and `LICENSE-ADDITIONAL-TERMS.md`; that there is no warranty; that the operator
may convey the work under this licence; a route to `https://github.com/91kr7/vexel` both clickable
in one step and readable as plain text, with the running version `0.1.0` next to it; that whoever
modifies Vexel and exposes it over a network must offer their users the source of that version and
preserve the author attribution; and that no rights in the name "Vexel" are granted. Every name,
year, licence identifier and URL matches the three licence files. Offline, with the network panel
open, the block renders identically and issues no request. Nothing in the application hides, empties
or edits it, and it never blocks work. Bumping the version in the root `package.json` and rebuilding
changes the displayed version with no edit to the notice. Everything batch 1 left on the screen is
still there.
