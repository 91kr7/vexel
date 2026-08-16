---
batch: 7
feature: F7 — registries
closed_req: [REQ-36, REQ-37, REQ-38]
depends: [5]
---

# Batch 7 — registries

Two `CardList` call sites (`RegistriesScreen.tsx:229` registries, `:261` repositories). The screen's
own defects are small and specific: each row carries a trailing one-off `Log in` / `Log out` button
rather than a row action, and the rows alternate in height because `authenticated · credential store:
desktop` wraps to two lines while `not authenticated` occupies one.

**This screen holds the empty state the analysis calls correct** — `Search Docker Hub` with its
explanatory line. It is preserved, in the primitive's form, and is the model for the ones repaired
elsewhere.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client e2e suite, registries area | The check, written and run **first**: with an authenticated and an unauthenticated registry both present, assert their **row boxes are equal in height** at 1440×1000 and 1280×800; assert the empty state renders a title, one line and its action; drive `Log in` / `Log out` with a **real pointer click**. Report the row heights before and after. | REQ-36, REQ-37, REQ-38 | — |
| INT-2 | modify | `client/src/registries/RegistriesScreen.tsx` (:229) | Migrate the registry list to the object list's comfortable variant, deleting the row-content builder. Host, account, credential store, authentication state and the plain-http flag keep their values and their order; the authentication line stops wrapping and stops dragging its row's height with it. `Log in` / `Log out` become row actions of the cluster. | REQ-36, REQ-37 | INT-1 |
| INT-3 | modify | `client/src/registries/RegistriesScreen.tsx` (:261) | The same for the repository/tag browser list, keeping the per-tag sizes, the search and the pull of a selected tag exactly as delivered. | REQ-36 | INT-1 |
| INT-4 | modify | `client/src/registries/RegistriesScreen.tsx` | Express the delivered empty state through the primitive — same words, `Search Docker Hub` plus its explanatory line, plus the action that resolves it. | REQ-38 | INT-2, INT-3 |
| INT-5 | modify | `.sdd/modules/registries/specs/registries-screen.md`, `.sdd/modules/registries/index.md` | Record the screen's new shape. English only. | REQ-36, REQ-38 | INT-2 … INT-4 |
| INT-6 | modify | client unit and e2e suites covering this screen | Update the coverage the migration invalidates; keep every assertion about logging in, logging out, searching, listing tags with their sizes and pulling one. | REQ-36 | INT-2 … INT-4 |

## Measured at implementation — three of this batch's four premises did not survive the code

Figures taken on the delivered build and on this one, built and served side by side against the same
daemon, at 1440×1000, 1280×800 and 375×812. The fixture is a throwaway `DOCKER_CONFIG` of 8
registries (4 authenticated, 3 of them `*.azurecr.io`, 2 reached over plain http) and a throwaway
`VEXEL_DATA_DIR`: the operator's `~/.docker` and `~/.vexel` were neither read nor written, nothing
was created on the daemon, and the credential helper's `list` verb was never invoked. The fixture's
store is named `docker config file`, which is longer than the `desktop` of the machine the defect was
reported from, so every truncation figure below is the worst case rather than that machine's.

**1. The ragged heights were already gone, so REQ-37's real job was not to reintroduce them — and the
first attempt at this migration did.** `.ui-card-list__subtitle` has carried `ui-truncating-line`
since batch 4 (`5f94080`, whose own record states "a subtitle that could wrap now truncates: 11 rows
at 1440 and 18 at 1280 lose one 17.4px line"). Measured on the delivered build with an authenticated
and an unauthenticated registry both present: **all 8 rows 76px at 1440×1000 and 1280×800, all 8 rows
129px at 375×812**. The authentication line was not wrapping to a second line; it was **cut** — 267px
of painted box at 1440 for a string that lays out at **396px**, and 195px at 1280, losing 129px and
201px of text to the ellipsis. So what the analysis saw as two lines had already become one line and a
tooltip, one batch earlier.

The first migration written here then **recreated the alternation the requirement forbids**: putting
the account in `TwoLineCell`'s subtitle gave rows with an account a second line and rows without none
— measured **70px against 61px**, alternating down the column, worse than the delivered 76px
throughout. It was rebuilt on a rule the remaining migrations need and which was written down
nowhere: **every cell of a row is a fixed number of lines whatever the object's state**. A value whose
*presence* depends on the state — here the credential store, absent on an unauthenticated registry —
cannot live on a line that another value shares; it becomes a column of its own, where its absence is
the column's "–" and costs no height. After the rebuild: **70px on every row at all three
viewports**, and 0 colliding cell pairs over 32, 28 and 21 painted cells (batch 4's clipped-rect
instrument, which is the only one that reads an ellipsised line correctly).

**2. The selected row's highlight is one value behind four rules; what differed was the box being
tinted.** `.ui-card-list__item--selected`, `.ui-data-table__row--selected`,
`.ui-tree-view__row--selected` and `.ui-grouped-rows-panel__header--selected` each declare
`background: var(--color-accent-tint)` and nothing else. The `docker.io` row read as a different
treatment because a card list tints a **card-sized** row while a table tints a row inside its card —
a difference in what is tinted, not in the style applied. Nothing was changed for it; the migration
carries the same token through the table's own rule.

**3. The inventory of never-collapsing `Grid` templates was short by two, and it is enumerated here
rather than carried forward.** Batch 4 named three fixed templates and pinned them to batches 6, 9
and 14; `RegistriesScreen.tsx:222` (`1fr 1.2fr`) was a fourth, which is what made this screen at
375×812 a **143px** panel holding a 77px list whose authentication line painted **15px** wide, with
the `Log in` button ending 20px past the panel's edge. Fixed here with the one-prop fix batch 4 itself
named, `Grid arrangement="pair"`; measured after: panel **335px**, list 269px, rows 70px, the table
panning by 89px, which is batch 2's contract rather than a compression.

The complete list, assembled by **sweeping every `columns="` in feature code** rather than by reading
forward from batch 4's three:

| call site | template | collapses? | batch that owns the screen | pinned before this sweep? |
| --- | --- | --- | --- | --- |
| `ContextsScreen.tsx:156` | `1.2fr 1fr` | no | 9 | yes |
| `PluginsScreen.tsx:218` | `1fr 1fr` | no | 10 | **no — missed by batch 4 and by batch 5** |
| `ComposeScreen.tsx:205` | `2fr 1fr` | no | 11 | yes (batch 5) |
| `SystemScreen.tsx:176` | `1fr 1.2fr` | no | 14 | yes |
| `RegistriesScreen.tsx:222` | `1fr 1.2fr` | no | 7 | no — **fixed here** |
| `VolumesNetworksScreen.tsx:17` | `1fr 1fr` | no | 6 | yes — **`Grid` removed with the screen's pair** |
| `LayerEfficiencyView.tsx:155` | `repeat(auto-fit, minmax(200px, 1fr))` | **yes** | — | not a defect: named here so it is not re-swept |
| `ContainerStatsView.tsx:57` | `repeat(auto-fit, minmax(220px, 1fr))` | **yes** | — | not a defect: named here so it is not re-swept |

Batch 10 would otherwise have inherited exactly the 15px-wide painted text measured here. **A list of
this kind is only trustworthy when it is enumerated**: the same lesson the plan already carries about
the `CardList` call sites, where a count copied from a total nearly let a removal go unnoticed, which
is why that budget fails on a number that is lower as well as higher.

**4. The one premise that held**: the trailing `Log in` / `Log out` really was an affordance of its
own — a full-size `Button` in the row's meta slot, 89×37 and 81×37 — and is now a cluster button,
58×27 and 51×27, whose click cannot also select the row.

### One observation left standing, for batch 19

**The merge that makes REQ-37 work leaves "authenticated" said in a colour, for the rows that name an
account.** Checked in the code rather than assumed: `StatusDotCell` (`client/src/ui/data/TableCells.tsx:13`)
renders

```
<span className="ui-table-status-dot-cell">
  <span className={`ui-table-status-dot ui-table-status-dot--tone-${tone}`} />
  {label}
</span>
```

— the dot is an **empty element**, its tone reaches the DOM only as a class name, and the class only
sets `background` (`data-table.css:184`). There is no `aria-label`, no `role`, no `title` and no
visually hidden text anywhere on it. So for `ghcr.io / octocat` the state is carried by colour alone;
for `contososhared.azurecr.io / not authenticated` it is carried in words. The one textual trace of
the authenticated case is the row action reading `Log out` — an inference from what one may do, not a
statement of what is.

Deliberately **not fixed here**: the fix is a library one — `StatusDotCell` is used by containers,
images and the dashboard as well — and it is outside this batch's interventions. The library already
holds the component that does state a tone in words (`StatusPill`, dot + label), which is what makes
this a decision rather than an omission: either the dot names its tone, or a cell that carries state
alone is required to be a pill. **Batch 19 owns it** (`REQ-81`, the cross-screen invariants): a
product that says one half of a binary state in words and the other half in a colour has answered the
question twice, which is the shape of defect that batch exists to remove.

### Accepted with the batch, so they are not revisited

- **The desktop panels go from 1 : 1.2 to equal** — registries 500 → 548px, repositories 600 → 548px
  at 1440×1000 — as the price of the one-prop collapse fix.
- **`Type a search term`** as the empty state's resolving action: it says what to do rather than
  naming a feature. `Search Docker Hub` and its explanatory line are untouched (REQ-38), and the
  control really moves the cursor — driven with a real pointer, `document.activeElement` becomes the
  field labelled `Search repositories`.
- **One `ScreenToolbar` on this screen**, which is the answer batch 6's pin expected: the registries
  panel has no page-level action, everything an operator does to a registry being done from that
  registry's row.

### Other figures worth keeping

- Registries panel / list width: 500/434 → 548/482 at 1440, 427/361 → 468/402 at 1280, 143/77 →
  335/269 at 375.
- Truncation after the migration, **on the fixture described above and only on it**: nothing was cut
  at 1440×1000; at 1280×800 three hosts and the four `docker config file` values were, each with its
  tooltip. The zero is a property of that fixture, not of the screen — the tester's, with nine
  registries including `localhost:5000 · not authenticated · plain http` and a longer store name,
  still clips 26px and 39px at 1440. Truncation with a tooltip is the contract (batch 4), so neither
  reading is a defect; what would be wrong is to read the zero as a guarantee. Against the delivered
  build the comparison holds on either fixture: the joined line lost 129px at 1440 and 201px at 1280
  where the split values lose tens of pixels or nothing.
- The repositories list stays content-ragged — 125/146 before against 129/141/172 after at 1440,
  125/146/178 before against 160/172 after at 1280 — because a repository without a description
  genuinely holds less. That is not REQ-37's defect and INT-3 keeps that list as delivered.
- `SearchField`'s and `TextField`'s new `ref` is a library change serving one screen; the reason it
  belongs to the library is recorded in `ui-library/specs/search-field.md`, so the next migration
  that needs a control to reach a field finds the reasoning instead of inventing a second mechanism.

## Constraints on this batch

- **No secret is ever held by the application** — login and logout are delegated to the host
  credential store, and nothing in this migration may cache, echo or log a credential.
- Nothing about the search, the tag sizes or the pull changes; this batch changes how the screen is
  drawn, not what it reaches.
- **Lower the `CardList` call-site budget in `client/scripts/check-ui-conformance.mjs` by the two
  sites removed here.** The check fails if the count is higher **or** lower than expected, so the
  budget is lowered deliberately or the batch does not go green.
- Feature code composes library components and nothing else.
