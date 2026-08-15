---
module: ui-library
component: Payload wrapping
type: UI behaviour
---

# Payload wrapping

**Purpose** → the one rule for laying out a raw daemon payload over several lines. A daemon body
arrives as a single line with no spaces in it, so the only wrap a browser can find on its own is an
arbitrary one wherever the edge of the box happens to fall — in the middle of a digest, an image
reference or a mount path. This is where the break opportunities the payload actually offers are
placed, so that the block wraps at its own token boundaries and no value is cut in half.

Carried by the two blocks that draw a raw payload: `CodeViewer` and the output lines of
`ConsoleSurface`.

## Contract

- `splitAtTokenBoundaries(text) → string[]` — the text cut at its break opportunities and nowhere
  else; concatenating the result returns the input, character for character.
  - A boundary sits **after** a character that separates one token from the next, outside any
    quoted string:
    - `,` and `;` → one item from the next;
    - `{` and `[` → a container from its first item;
    - `:` **only** where it separates a key from its value, i.e. immediately after a closing `"`.
  - No boundary anywhere else. In particular:
    - a double-quoted string is **one token whatever it contains**, so a `:` or a `,` inside it is
      not a boundary (`"sha256:1f2e…"`, `"/var/lib/docker/volumes/data/_data"` stay whole), a `\"`
      inside it does not end it, and an unbalanced `"` merely leaves the rest of the line without
      boundaries;
    - a `:` inside a bare word is part of the word (`alpine:3.20`, `0.0.0.0:8080->80/tcp`);
    - a closing `}` or `]` stays attached to the token it closes;
    - no boundary is emitted where the next character is whitespace (whitespace already is a wrap
      opportunity), nor at the very end of the text.
- `<TokenWrappedText text />` — the text with those opportunities rendered.
  - Renders exactly the characters of `text` and no others: the opportunities are `<wbr>` elements,
    which carry no character, so the block's text content, what an `innerText` read returns and what
    a mouse selection yields are the payload itself.
  - Where the text carries no boundary it renders as the plain string.

## Rules and invariants

- **The text is never altered.** No character is inserted, removed, replaced or reordered, and no
  ellipsis, clamp or truncation is applied: what the daemon sent is what the block holds, and a
  value can be selected out of it in one piece.
- **A wrap falls on a break opportunity the text itself offers** — one of the boundaries above, a
  whitespace, or a hyphen the text contains, which the browser recognises in any text of the product.
- **A token is split only when no line can hold it** — a run longer than the block's own width, e.g.
  a 64-character digest inside a card at the phone width. That is the single case where staying
  inside the surface and staying whole cannot both hold, and staying inside the surface wins:
  nothing overflows the surface, nothing scrolls sideways to be read, nothing is hidden.
- The block's minimum width is unchanged by this rule: a long token does not widen the surface that
  holds it.
- The split is computed once per distinct line of text and the rendering is memoised: a payload can
  be tens of thousands of characters, and a transcript around it re-renders on every incoming chunk.

## Requirements served

- plan-ui-coherence-optimisation/REQ-76
