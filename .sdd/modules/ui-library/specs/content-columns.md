---
module: ui-library
component: ContentColumns
type: UI component
---

# ContentColumns

**Purpose** → the library's one answer to *"how many of these fit here"*: a list of bands arranged in
as many columns as the container's **own box** can carry at the band's content class minimum. It is
the shared rule; `DefinitionList` consumes it for label→value pairs and this component is its form
for a list of single values (the `Config` tab's environment · mounts list).

## Contract

- `<ContentColumns contentClass? children? />`
  - `contentClass?: 'short-scalar' | 'long-single-line' | 'free-text'` — default `'short-scalar'`.
  - Each child is one band and occupies one column track.
  - **No count, no track template and no length is accepted from the caller**, and none can be: a
    caller cannot know the width it will be given.
- `contentColumnsClassName(form, contentClass)` (library-internal, `layout/content-columns.ts`) — the
  same rule for a component that carries its own element, with `form: 'pair' | 'value'`.

Shows:
- As many bands per line as fit at the class's minimum band width, computed against the element's own
  measured width; the count rises as the element widens and never falls.
- The bands fill the width: the rightmost band's right edge lands on the element's right edge (the
  tracks are `1fr`, so the surplus of a fractional column is distributed into the tracks).

## Rules and invariants

- **The count follows the element's own box, never the viewport.** Two instances on one screen at one
  instant — one at full panel width, one in a half-width card — show different counts.
- **The mechanism is intrinsic**: `repeat(auto-fit, minmax(min(<class minimum>, 100%), 1fr))` resolved
  by the layout engine. **No viewport media query, no container query, no `ResizeObserver`, no layout
  read in JavaScript, nothing recomputed per frame.** These sections sit in the scrolled main view.
- **A minimum wider than the container degrades to the container's width** (`min(…, 100%)`) instead of
  pushing a track through it: a long-single-line list in a ~400px card is one 400px column, never a
  560px track overflowing a 400px box.
- **A single band fills the whole width.** `auto-fit` collapses the tracks no band occupies, so a
  one-item list is as wide as the element, exactly as a stack was.
- The column gap is `--space-6` for every class; the row gap is the consumer's, through
  `--content-columns-row-gap` (default `--space-2`; `DefinitionList` sets `--space-1` to keep its
  delivered band step).
- The class minima and maxima are design values in `tokens.css`, derived from the content and never
  written at a call site. A band of a **pair** carries ~125px more than a band of a **value** alone:
  the longest label in the product's property sections (~85px), the label→value gap (`--space-4`) and
  the band's horizontal padding (2 × `--space-3`).

| Content class | Minimum, pair | Minimum, value | Maximum of the label→value run | Where the figure comes from |
| --- | --- | --- | --- | --- |
| `short-scalar` (default) | 360px | 240px | 500px | the longest single-line scalar in these sections, `Created` at 30 characters (~216px of 12px monospace), plus the label run |
| `long-single-line` | 560px | 460px | 700px | an environment or label value routinely past 60 characters (~435px), plus the label run; the maximum carries the same **additive** ~140px of headroom as the short class, so it absorbs a fractional column's surplus |
| `free-text` | one column, full width | one column, full width | none | a whole Dockerfile instruction against a timestamp label is not a column |

- **Why a class has two minima, and where the second one came from.** The plan stated one minimum
  per class and put the long-single-line second column at 1144px — a figure computed for a band that
  carries a label. The `Config` tab's environment · mounts list carries none: each band is one env or
  mount line on its own. Measured on the delivered frame, that column is **1083px at 2560 × 1440**,
  so under the pair minimum it would have stayed one entry per line at every width in existence and
  the report's own outcome (REQ-19) would have been unreachable. The resolution is not a fourth class
  but the same content arithmetic applied to what the band actually holds: **minimum = value +
  padding**, plus the ~125px label run **only when there is a label**. At the value minimum of 460px
  that column carries two entries from 944px onward — one at 1280 and 1920, two at 2560, which is
  exactly where the report says the defect lives.
- With the `--space-6` gap and the 360px short-scalar minimum the count is `floor((W + 24) / 384)`:
  **600px → 1, 900px → 2, 1300px → 3, 1700px → 4**, transitions at 744 / 1128 / 1512px. Long
  single-line pairs reach a second column at 1144px, single values at 944px. Measured on the delivered
  frame, a section at 720px of viewport is 630px wide and therefore one column — the phone-width
  presentation falls out of the arithmetic and needs no breakpoint.

## Dependencies

- Design tokens (`--band-min-*`, `--band-run-max-*`, `--space-6`)

## Requirements served

- plan-docker_management_app-detail_property_columns/REQ-2
- plan-docker_management_app-detail_property_columns/REQ-3
- plan-docker_management_app-detail_property_columns/REQ-4
- plan-docker_management_app-detail_property_columns/REQ-5
- plan-docker_management_app-detail_property_columns/REQ-6
- plan-docker_management_app-detail_property_columns/REQ-7
- plan-docker_management_app-detail_property_columns/REQ-11
- plan-docker_management_app-detail_property_columns/REQ-12
- plan-docker_management_app-detail_property_columns/REQ-13
- plan-docker_management_app-detail_property_columns/REQ-19
- plan-docker_management_app-detail_property_columns/REQ-20
- plan-docker_management_app-detail_property_columns/REQ-24

## The content class of every call site

Recorded so the next screen is written against the rule rather than against a guess. "Default" means
the file states nothing and takes short scalar deliberately, not by accident.

| Call site | Class | Why |
| --- | --- | --- |
| `ImageDetailPanel` — the nine properties | short scalar (default) | id, tags, digest, platform, size, created, entrypoint, command, ports |
| `ImageDetailPanel` — `Environment` | long single-line | `PATH=…` values pass 60 characters |
| `ImageDetailPanel` — `Labels` | long single-line | URLs and licence strings |
| `ImageDetailPanel` — `History` | free text | a whole Dockerfile instruction against a timestamp label |
| `ContainerDetailPanel` — `Inspect`, the ten properties | short scalar (default) | scalars, the longest being `Created` |
| `ContainerDetailPanel` — `Networks` | short scalar (default) | a network name against an IP address |
| `ContainerDetailPanel` — `Labels` | long single-line | as the image panel's |
| `ContainerDetailPanel` — `Health` | short scalar (default) | a status word and a counter |
| `ContainerDetailPanel` — `Config`, runtime configuration | short scalar (default) | restart policy, limits, ports, health command, networks |
| `ContainerDetailPanel` — `Config`, environment · mounts | long single-line (**value** form) | one env line or mount line per band, no label beside it |
| `VolumesPanel` | short scalar (default) | driver, scope, dates and counts; the mountpoint wraps inside its band as it already did |
| `NetworksPanel` | short scalar (default) | driver, scope, subnet, gateway, range |
| `PluginsScreen` — plugin inspect | short scalar (default) | name, id, reference, state |
| `RegistriesScreen` — pull reference | short scalar (default) | one band, which fills the width on its own |
| `SystemScreen` — daemon info | short scalar (default) | versions, drivers, counts |
| `ContextsScreen` — daemon of the active context | short scalar (default) | the same list |
| `LayerExplorer` — build step | short scalar (default) | one band, which fills the width on its own, so the class changes nothing for it |
| `ImageDiffView` — the two sides' metadata | short scalar (default) | size, permissions, owner, link target |
| `FilesystemBrowser` — entry metadata | short scalar (default) | path, type, size, permissions, owner, modified — in a narrow pane, so one column, unchanged |
| `SwarmServicesPanel` — tasks | short scalar (default) | a task state against its node |
| `SwarmConfigsStacksPanel` — stack services | short scalar (default) | a service name against its replica count |
| `SwarmServicesPanel` / `SwarmSecretsPanel` / `SwarmConfigsStacksPanel` / `SwarmNodesPanel` / `CoverageMatrixScreen` — the five `columns={2}` lists | **none: they state a count** | a caller-stated count, retired by the work that takes it off them; until then they keep the delivered arrangement exactly |
