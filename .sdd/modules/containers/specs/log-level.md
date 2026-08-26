---
module: containers
component: Log level reading
type: shared rule
---

# Log level reading

**Purpose** → the one reading of a log line's severity from the text the container wrote, so the
Logs surface can distinguish an error without guessing at a line that never claimed to be one.

It is a **domain reading and a deliberate guess**, which is why it lives in the feature layer and
never in the UI library: the library draws the level it is handed and deduces nothing
(`ui-library/specs/log-stream.md`).

## Contract

- `readLogLevel(text) → 'error' | 'warn' | undefined` — the level the line's own text **states**, or
  `undefined` when it states none.

Three forms are recognised, and nothing else is looked at:

| form | what matches | example |
| --- | --- | --- |
| an upper-case marker token | a marker written entirely in upper case, preceded by the start of the line, a space, or one of `[ ( { < \|`, and followed by the end of the line, a space, or one of `] ) } > : ; , . ! \|` | `ERR pool exhausted`, `[WARN] retrying`, `npm ERR!` |
| a declared level field | a `level`, `lvl` or `severity` key — with or without surrounding quotes — assigned with `=` or `:`, its value read case-insensitively; the key must itself start the line or follow a space, `{`, `,` or `[` | `time="…" level=warning msg="…"`, `{"level":"ERROR",…}` |
| a leading marker with a colon | a marker in any case, as the line's first token, immediately followed by `:` | `error: cannot connect`, `warning: deprecated flag` |

The markers, and nothing besides them:

- **error** → `ERROR`, `ERR`, `FATAL`, `CRITICAL`, `CRIT`, `PANIC`, `SEVERE`, `EMERG`, `ALERT`
- **warn** → `WARN`, `WARNING`

```
line states an error marker in any of the three forms → 'error'
line states a warn marker and no error marker         → 'warn'
otherwise                                             → undefined
```

## Rules and invariants

- **The reading is conservative: `undefined` is the answer to every line that does not carry one of
  the markers above**, and it is a result and not a failure — the caller leaves such a line in the
  neutral treatment rather than colouring it on a hunch
  (`…tabs_composition_refactor/REQ-29`). A wrong colour is worse than no colour, because the first
  misleading line costs the trust in every other.
- **Nothing but an explicit marker is read.** Not an HTTP status code, not an exception or class
  name, not punctuation, not capitalisation, not the sentiment of a word: `POST /v1/payments 500
  42ms`, `Exception in thread "main"`, `connection refused` and `!!! stopped !!!` all state no level
  and all come back `undefined`.
- **A marker is a whole token, not a substring.** `ERRORS`, `MYERROR`, `error-report` and
  `LOG_LEVEL=ERROR` state no level; `/api/error/report` inside a URL states none either, the
  lower-case form being recognised only as the line's own first token followed by a colon.
- **Case is part of the rule** for the bare form: only the upper-case spelling of a marker is a
  marker, so the word `error` inside a sentence or a path is never one. A declared level field is
  read case-insensitively on both its key and its value, because that is how the field is written.
- **Error outranks warn** wherever a line states both.
- The reading is **pure and total**: it looks at one line's text, reads nothing else, writes nothing,
  issues no request, and answers for every string including the empty one.
- **It is the only place the marker set is written.** A surface distinguishing a log line takes its
  level from here rather than declaring markers of its own.
- Widening the marker set is a **product decision**, not a development one: the set above is the one
  the human accepted, and a level inferred from anything other than an explicit marker is outside
  this rule by construction.

## Dependencies

- ui-library: the `LogStreamLevel` type the reading answers in

## Requirements served

- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-29
