---
module: ui-library
component: EmptyState
type: UI component
---

# EmptyState

**Purpose** → placeholder content for a screen, list or panel that currently has nothing to show
(including a screen not yet built by a later batch).

**The one question it answers** → *what does an empty result look like?* One answer, and the
component insists on it rather than rendering whichever subset a caller happened to fill in.

## Contract

- `<EmptyState title description action compact? />`
  - `title: string` — what is empty, in the operator's words.
  - `description: string | null` — **required**: why it is empty, or what it would take to fill it.
    `null` states that the title says everything there is to say, and states it in the source where
    a reader and a later batch can both find it.
  - `action: ReactNode | null` — **required**: the control that resolves the condition. `null`
    states that nothing the operator can do from here would resolve it (a list emptied by a filter,
    a subsystem simply idle).
  - `compact?: boolean` (default `false`) — the placeholder is the height of its own content and sits
    at the top of the space it is given, for a placeholder **inside a pane**.

## Rules and invariants

- **It renders on a surface of the library's own, always** — whatever the caller passes and wherever
  it is placed. An empty result is never bare text floating in the layout, which is what made one
  component look like three: each screen had put the same bare text somewhere different.
- The material is the **nested wash** (`--color-wash-1`, a hairline, the medium radius), not
  `Surface`'s glass, and that is a decision rather than a shortcut: an empty state almost always sits
  *inside* glass already (a Card, a list region, a pane), and a second glass panel at that depth
  reads as a box inside a box. It is the same treatment `FormSection` and the property bands take,
  for the same reason.
- The surface costs **2px of height** — the hairline — in the full-height presentation, in every
  container the product places it in, at 1440×1000, 1280×800 and 375×812.
- **It costs no width where the container gives the box one, and 2px where the container does not.**
  `box-sizing: border-box` is global, but it absorbs a border only into a width that has been
  specified; on an **auto-width, shrink-to-fit** box the width is derived from the content and the
  hairline adds its 2px outside it. Both cases are real here: a box filling a grid track, a flex item
  with `min-width: 0`, or a block in normal flow is unaffected — which is every container but one —
  while a box whose column resolves shrink-to-fit grows by 2px. Stated as an absolute ("the surface
  costs no width") this was **false**, and it was measured false on the first narrow column anybody
  pointed a harness at: `ComposeScreen.tsx:222` (`48×165.56 → 50×167.56`) and `:237`
  (`48×142.38 → 50×144.38`) at 375×812, `x` unchanged.
- Those two boxes are **48px wide**, which is exactly `2 × --space-6` — the component's own padding
  around a content box of **zero** width, with the title wrapping one character per line. The 2px is
  therefore a rounding error on a container that is already broken, and the fault is the caller's
  fixed `Grid` template, not this component's border (see the batch-11 pin). Narrowing the hairline
  to keep a width claim true about a 48px box would be cosmetics over a fracture.
- **The explanation and the resolving action are required props, not optional ones.** This is the
  whole of the component's insistence and the reason it is written this way: the three empty-state
  treatments the product shipped were never three components — they were this one rendering
  whatever it was handed, and an optional prop is what allowed a caller to stop at a title without
  ever deciding to. Written out, `null` is a decision a reader can see, a `grep` can count and a
  migration can be asked to remove; omitted, it was a default nobody took.
- **There is no variant that renders bare text**, and none that renders a control-shaped thing that
  is not a control: an action is a control, passed as one.
- The default is the full-height, centred presentation, and every screen and list keeps it —
  including a tree's own "nothing here" state, which is a placeholder for a whole listing.
- `compact` changes the presentation and nothing else: same wording, same structure, same API — and
  it carries the surface too, "whatever the caller passes" including this presentation. It therefore
  gains a horizontal inset it did not have (`--space-4`), because a panel whose text starts on its
  own border reads as a clipping rather than as a panel. Measured in its one call site's own
  container chain (a large `Modal` → `BandStack` → the trailing pane of a filling `SplitPane`):
  **+10px of height, +17px / +5px of title offset, no width change** at 1440×1000 and 1280×800 (pane
  714px), and **+28.85px of height** at 375×812 (pane 295px), where the 32px of inset costs the
  description its second line. That last figure is a **threshold effect of the pane's width**, not a
  constant.
- **How that one figure was obtained, since it differs from every other in this record**: the compact
  presentation has a single call site (`images/FilesystemBrowser.tsx:331`) whose state — an image with
  an extracted filesystem, the browser open, no entry selected — is **not reachable in a screen
  sweep**, so it was never observed in the running application. It was measured in a headless browser
  against the shipped stylesheet, in the container chain above reconstructed from source. That is
  stronger than arithmetic from the tokens and weaker than an observation, and it is recorded as
  exactly that.
- Why that variant exists: in a pane that fills the height it is given, the centred presentation
  reads as a void the pane could not fill rather than as a pane waiting for a selection.
- A `null` description renders nothing where the description would be, exactly as an omitted
  optional prop did: the change from optional to required-nullable is a change to what a caller must
  say, never to what the operator sees.

## Requirements served

- plan-docker_management_app/REQ-1
- plan-docker_management_app-filesystem_browser_layout/REQ-10
- plan-ui-coherence-optimisation/REQ-25
- plan-ui-coherence-optimisation/REQ-28
- plan-ui-coherence-optimisation/REQ-30
