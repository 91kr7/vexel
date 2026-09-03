---
request_slug: docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload
date: 2026-08-27
type: evolution
size: ordinary
reference: .sdd/analysis/docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor.md
---

## Request

> Voglio rivedere completamente il tab inspect del dettagli container. In particolare, voglio che
> venga spostato dopo il tab config. Voglio che venga rifatto completamente. Deve contenere una
> rappresentazione grafica user friendly di ogni singolo campo presente nel JSON che restituisce il
> docker inspect. Eventuali attributi o campi vuoti o blank vanno comunque renderizzati blank
> identificandoli come vuoti sostanzialmente. a questo punto i test relativi a questo tab puoi
> cancellarli completamente? e riscriverle da zero. Ocupati tu di pensare a come renderizzare il Json
> Al fine di renderlo esplorabile in modo user friendly. Potenzialmente puoi creare tante sezioni
> quante sono le main keys del Json

What it asks, in order: (1) rebuild the container detail's **Inspect** tab completely; (2) move it
**immediately after Config**; (3) render **every single field** of the `docker inspect` payload in a
user-friendly graphical form; (4) render empty or blank fields too, **marked as empty**; (5) delete
this tab's tests outright and rewrite them from scratch — phrased as a question, answered here as an
instruction; (6) the composition is **delegated to the analysis**, the human's own suggestion being
*potentially* one section per top-level key of the JSON.

## Reference

Evolution of
[`…-tabs_composition_refactor.md`](docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor.md),
whose nine change points recomposed the seven tabs of the detail modal to a commissioned mock.

**Starting point.** Its **F6b** is the delivered Inspect tab: ten curated properties (`Id`, `Name`,
`Image`, `Command`, `Entrypoint`, `Created`, `State`, `Started at`, `Finished at`, `Exit code`)
grouped into Identity and Lifecycle, `State` as a pill, a non-zero exit code as bad news, the
`Networks`, `Labels` and `Health` collapsible sections, and the raw payload block made collapsible
like the rest. **F1b** put Config first and open on entry.

**Changes.** F6b is superseded outright: ten hand-picked fields become the whole payload, and the tab
moves from fifth position to second. Every other point of the predecessor stands untouched.

## Summary

The Inspect tab becomes a complete, explorable rendering of the container's `docker inspect` payload
— every field, empty ones included and marked as such — sectioned from the payload's own top-level
keys, and it sits immediately after Config.

## Business goal

**Today the tab answers ten questions and the payload holds several hundred.** An operator who needs
`RestartPolicy`, `NanoCpus`, `Ulimits`, `LogPath`, the DNS list or the IP of one of three networks
finds none of them among the ten properties, and falls back to reading a raw JSON block by scrolling
and eyeballing — which is worse than the terminal they came from, because the terminal has `grep` and
`--format`. The graphical client is losing to the command it replaces on the one surface whose entire
purpose is reading that command's output.

**Rendering only the fields somebody remembered is why the gap exists**, and it will reopen the next
time the daemon adds a key. What the human is asking for is the stronger property: the tab shows what
the daemon sent, whatever the daemon sent. Moving it after Config puts it second in the order an
operator actually works — what is configured, then what is actually running.

## Requirements

### Functional

- **Inspect is the second tab, immediately after Config**, and Config remains the tab open on entry.
- **Every field present in the daemon's inspect payload is rendered**, including keys the application
  has no specific knowledge of, so a field a newer daemon adds appears without a code change.
- **A field whose value is empty is rendered in its own place and explicitly marked empty** — `null`,
  `""`, `[]` and `{}` are shown as blank-and-identified, never omitted and never silently collapsed.
- **`0`, `false` and `"0"` are values, not blanks**, and read as themselves: an `ExitCode` of 0 and a
  `Privileged` of false are answers, and marking them empty would state the opposite of the truth.
- **The tab never invents a field the payload does not carry**: "empty" means present-and-blank, so a
  key absent from the response (`SizeRw` when sizes were not requested) is simply absent.
- **The tab is divided into sections derived from the payload's own top-level keys** — each composite
  top-level value gets its own section, and the scalar top-level values are gathered into one leading
  section — so a top-level key nobody anticipated still lands somewhere.
- **Nested structures are rendered as nested groups, never as stringified JSON**: an object becomes a
  labelled group and an array a counted list of items, to whatever depth the payload has.
- **Each section is independently collapsible and states how much it holds** before it is opened.
- **A field is identified by the daemon's own key name**, so what is on screen can be matched against
  `docker inspect` output and the Engine API documentation; a friendlier wording may accompany that
  name, never replace it.
- **Recognised values are rendered in the operator's terms**: timestamps as readable dates, byte
  counts with a unit, nanosecond durations as durations, booleans as yes/no, state and health as
  pills, a non-zero exit code as bad news, port bindings as host→container.
- **A formatted value never replaces the daemon's literal**, which stays readable on the same surface
  — the tab exists to check what a field exactly says.
- **The operator can find a field by key name or by value across the whole payload**, without opening
  every section by hand.
- **The raw payload stays as the last section**, collapsed, unchanged and selectable, as the fidelity
  fallback when the rendering and the truth are in doubt.

### Non-functional

- **The tab inherits the modal's stable height** and scrolls inside it: selecting Inspect, opening a
  section or filtering must not move the dialog's frame.
- **Opening the tab and typing in its filter stay responsive on a real payload** — hundreds of fields,
  a container on several networks with many port bindings — inside a dialog that may also be holding
  a live stream.
- **No copy affordance is introduced anywhere**: every copy control was deliberately removed from this
  product, and selection with mouse and keyboard remains the only route to a value.
- **Nothing changes about what is asked of the daemon**: no new endpoint, no extra inspect option, no
  cadence change.
- **Every visual element comes from the UI library**, extended first where it does not cover a point;
  the generic rendering carries no Docker vocabulary, and which key means what stays in feature code.
- **The tab stays usable at 375×812**: label and value stack, nesting stays legible, no value clipped.
- **The rewritten coverage re-establishes what is still true of the tab**, not only what is new, and
  must fail on the delivered build.
- **Checks drive a real pointer at the visible control's coordinates and assert geometry beside
  content** — a payload rendered into a surface dragged out of the viewport still has every field.
- **Verified against the real daemon** under the project's test discipline: own labelled fixtures,
  cleanup in a `finally`, `docker rm -fv`, nothing assumed of the daemon or of inherited application
  state, every spec passing on its own. **Interface strings stay English.**

## Assumptions

- **The sections come from the payload, not from a hand-written inventory**, because the field set
  varies with the daemon version, the platform and the API version; a curated list is exactly how the
  completeness the human asked for is lost again six months from now.
- **The ten curated properties do not survive as a separate summary block.** Each appears inside the
  payload-derived sections, and the modal header already carries name, short id, state and health, so
  a summary would be a third copy of the same facts.
- **Open by default: the leading scalars section and `State`; everything else closed.** All open is a
  wall of several hundred rows, all closed is a click for every question.
- **Order is the payload's own** — top-level keys in the order the daemon sends them, scalars section
  first, raw payload last — so the tab reads like the output it represents.
- **Sentinel values are annotated only where the meaning is documented and unambiguous** (`0` as "no
  limit" on a resource field); anywhere else the number is shown as the number.
- **"Delete the tests" means this tab's client-side coverage**; the server's inspect API coverage is
  untouched, the API being unchanged.
- **Containers only.** The raw payload views on images, volumes, networks and plugins keep what they
  have; whatever the library gains here serves them later, on request.

## Constraints

- **The predecessor's certified points stand**: the stable dialog height, the identity-bearing header,
  Config first and open on entry, and one uniform treatment for all seven tabs. The reorder moves
  Inspect and nothing else.
- **The library's property-list rules govern the presentation**: a bounded label→value band, a column
  count derived from the section's own measured width and its content class, and values that wrap
  rather than truncate — never an ellipsis or a tooltip-only value.
- **The payload's schema is not the product's to fix.** The exact set of keys is the daemon's, differs
  by version and platform, and the rendering may not assume a shape it has seen.
- **The request is in Italian; the interface is not.** Every string drawn on screen is English.

## Market trends

- **The category default is a generic tree plus raw text.** Portainer shows the inspect data as a
  tree whose parameters can be selected for more detail, with a `Text` toggle to raw JSON.
  ([Portainer — Inspect a container](https://docs.portainer.io/user/docker/containers/inspect))
- **Docker Desktop's Inspect tab is formatted JSON with a search**, presented as the convenience over
  reading raw JSON in a terminal — search, not labelling, being what it adds.
  ([Docker Desktop dashboard](https://oneuptime.com/blog/post/2026-02-08-how-to-use-docker-desktop-dashboard-effectively/view))
- **Newer entrants are still adding the raw view, not surpassing it** — Arcane's 2026 addition to its
  container detail is a *raw* inspect tab.
  ([getarcaneapp/arcane#2368](https://github.com/getarcaneapp/arcane/pull/2368))
- **Two conclusions.** A per-field graphical rendering is above the category's bar, which is where
  this product says it competes; and **every one of them ships a search over the payload**, which is
  why finding a field is a requirement here and not a nicety.

## Risks

- **Completeness regresses invisibly.** A rendering assembled from known keys looks complete on the
  developer's container and drops fields on another daemon; the check has to compare what is rendered
  against the payload itself, never against an expected list of names.
- **A prettier raw dump.** Several hundred labelled rows in one scroll is a different failure from the
  one being fixed; the sections, the counts, the collapse and the search are what stand between the
  two, and they are the parts most likely to be cut for time.
- **Formatting that misleads on the tab whose purpose is exactness** — a `0` interpreted as
  "unlimited" where it is not, a rounded byte count, a localised date read as the literal value.
- **Secrets become easy to find.** `Config.Env` routinely carries passwords and tokens; the payload
  already showed them, but labelling and searching them makes them prominent rather than buried.
- **Deleting the coverage takes certified assertions with it** — the modal's own requirements on this
  tab, the property-band geometry, the absence of a copy control — unless the rewrite re-establishes
  them deliberately.
- **The reorder breaks every check that names a tab by position**, here and in the predecessor's own
  coverage; they are rewritten, not deleted.
- **Hundreds of nodes plus a live filter inside a modal** is the first thing in this dialog with a
  real chance of making it feel slow.

## Scope

**In scope:** the Inspect tab of the container detail modal, rebuilt as a complete rendering of the
daemon's inspect payload — payload-derived sections, nested groups, empty fields marked as empty,
recognised values formatted without hiding their literals, per-section collapse with counts, and a
find across the whole payload; the raw payload kept as the last section; the tab's move to second
position, immediately after Config; the library components that rendering requires; and the deletion
and rewriting from scratch of this tab's client-side coverage.

**Out of scope:** what the application asks of the daemon and every API behind it; the other six tabs,
their content, controls and sessions; the modal's frame, header, height and close behaviour; the
containers screen, its cards, actions and filters; the raw payload views of images, volumes, networks
and plugins; any copy or export affordance; and the server's inspect coverage.
