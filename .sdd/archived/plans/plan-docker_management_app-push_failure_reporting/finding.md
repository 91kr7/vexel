# Finding — where a refused push is lost

Established by hand on 2026-08-27, before any change, as REQ-7 requires. Every line quoted below was
captured from this machine's daemon, not read out of the code.

**The machine it was measured on** — Docker Engine 29.7.2, storage driver `overlayfs` with the
containerd snapshotter (`driver-type: io.containerd.snapshotter.v1`), arm64. The image store matters
and is recorded here on purpose: the two stores do not word a push the same way, and the classic one
retries a dial failure several times before giving up.

## What the daemon actually emits at the refusal

`alpine:3.20` tagged `localhost:1/vexel-finding-<ts>:v1`, then `POST
/v1.43/images/localhost:1/vexel-finding-<ts>/push?tag=v1` on the daemon socket with the same
anonymous `X-Registry-Auth` the product sends — i.e. exactly the request `pushImage` makes.

- `+0.0s` — HTTP **200**, `content-type: application/json`. The refusal is *not* an HTTP status: the
  stream opens normally.
- `+0.0s` — `{"status":"The push refers to repository [localhost:1/vexel-finding-<ts>]"}`
- `+0.1s … +30.1s` — roughly ten lines a second, ~300 in all, all identical:
  `{"status":"Unavailable","progressDetail":{},"id":"3f26bc2dec0b"}`
- `+30.1s` — the refusal, stated:

  ```json
  {"error":"failed to do request: Head \"https://localhost:1/v2/vexel-finding-<ts>/blobs/sha256:ab3f…35c4\": dial tcp [::1]:1: i/o timeout","errorDetail":{"message":"failed to do request: Head \"https://localhost:1/v2/…\": dial tcp [::1]:1: i/o timeout"}}
  ```

- `+30.1s` — the stream ends (`complete=true`), immediately after the error line.

Three consecutive runs: 30.1s, 30.1s, 30.2s. The daemon states its refusal, in an `error` field, and
does so with roughly fifteen seconds to spare inside the forty-five the check grants.

## Following the outcome link by link

1. **Daemon → `streamTransfer`** (`server/src/images/image-transfer-service.ts`). The `error` line is
   read by `NdjsonDecoder` (the lines are CRLF-terminated; `trim()` handles that) and fires
   `handlers.onError` with the daemon's message verbatim. **Carries it.**
2. **`streamTransfer` → the SSE endpoint** (`server/src/images/images-routes.ts`). `onError` is wired
   to `endWithError`, which writes `event: error` with `{ message }` and ends the response. No
   deadline of its own. **Carries it.**
3. **The endpoint over HTTP.** Driven end to end (the real router on a real port, the real daemon):
   after 302 `step` events, at `+30.2s`:

   ```
   event: error
   data: {"message":"failed to do request: Head \"https://localhost:1/v2/…\": dial tcp [::1]:1: i/o timeout"}
   ```

   **Carries it.**
4. **The client hook** (`client/src/data/use-image-transfer.ts`). Its `error` listener closes the
   `EventSource` and sets `error` from the event's `data`. **Carries it.**
5. **The push dialog** (`client/src/images/ImagesScreen.tsx`). Renders
   `<ErrorBanner title="Push failed" detail={pushTransfer.error} />`; the auto-close effect is
   conditioned on `done && !error`, so the dialog stays open until the operator dismisses it, and
   `submitting` is false once `done`, so nothing is left presented as a push in progress.
   **Draws it.**

## The check

`server/test/api/images-push-routes.test.ts:146` was run on its own and inside the whole pass:

- the file alone: both tests pass — the successful push in 1.2s, the refused push in **30.2s**,
  seeing the `error` event with a non-empty message;
- `npm run test:api -w server` in full: **green**, exit 0.

So the reported red is **not reproducible on this machine today**, and the check is sound in shape:
it watches from before the push starts, asserts an `error` event carrying a message, and its budget
already exceeds the refusal time by fifteen seconds. Nothing in it is condemned, so nothing in it is
touched — the budget least of all.

## The verdict

**Neither link drops a refusal the daemon *states*.** What the path does get wrong is the case the
daemon leaves *unstated*, and it gets it wrong in one single place:

`streamTransfer` calls `handlers.onEnd()` from `response.on("end", …)` having never required a
success to have been declared. Everything that is not an `error` line is a clean completion — a
stream truncated by a daemon restart, a connection closed after the daemon has given up without a
final word, or (on the classic image store, which retries a dial failure and can outlast any
reasonable budget) a push abandoned in silence. Each of those is reported to the operator as a push
that **succeeded**. That is the defect REQ-2 and REQ-6 name, and it sits on the path shared by push
and pull, which is why a pull inherits it identically.

It is also the most plausible reading of the red as it was observed: on a daemon that ends the push
stream without stating an error, the check sees an `end` event where it wanted an `error`, and fails
— on the delivery path, not on the check.

What a success looks like when the daemon does state one, measured on this daemon so that the new
rule refuses nothing that works today:

- push, first time and repeated: `{"status":"v1: digest: sha256:45e0…9e1d size: 1026"}` — the
  `<tag>: digest: <digest> size: <n>` line, preceded by `Pushed` / `Layer already exists` per layer.
- pull, fetched: `{"status":"Status: Downloaded newer image for localhost:5099/…:v1"}`
- pull, already current: `{"status":"Status: Image is up to date for localhost:5099/…:v1"}`
- a refused pull never even opens a stream on this store: `POST /images/create` towards
  `localhost:1` answers **HTTP 500** with
  `{"message":"failed to resolve reference …: dial tcp [::1]:1: i/o timeout"}`, and a missing tag on
  a reachable registry answers **404**. `requestStream` already turns both into a `DockerDaemonError`
  carrying the daemon's message, which `runEventStream` already reports as the stream's `error`
  event.

## What changes as a consequence

One file:

- `server/src/images/image-transfer-service.ts` — `streamTransfer` requires a stated success before
  it may call `onEnd`; an end without one calls `onError` carrying the last message the daemon gave.
  No timer, no watchdog, no fallback measured in seconds is introduced.

And the specs of what changed: `.sdd/modules/images/specs/image-transfer-service.md`.

## What is deliberately not changed, and why

- `server/src/images/images-routes.ts` — measured carrying the failure through as `event: error` and
  ending the stream, with no deadline of its own. INT-3's condition is not met.
- `client/src/data/use-image-transfer.ts` — measured concluding failure from the stream's `error`
  event, and from a dropped connection (the native `EventSource` error, no `data`) too. It closes on
  the stream's word, never on a deadline. INT-4's condition is not met.
- `client/src/images/ImagesScreen.tsx` — confirmed drawing the failure in the push progress dialog
  with the daemon's message legible in it, and holding the dialog open until dismissed. INT-5 is
  therefore a confirmation, not an edit.
- `server/test/api/images-push-routes.test.ts` — passes, and the finding condemns no assertion in it.
  INT-7's condition is not met; the forty-five-second budget stands untouched.
