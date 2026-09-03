---
request_slug: docker_management_app-push_failure_reporting
date: 2026-08-27
type: fix
size: narrow
reference: .sdd/analysis/docker_management_app.md
---

## Request

> Quando si spinge un'immagine verso un registry che non risponde, il daemon rifiuta l'operazione —
> misurato a mano il 2026-08-27: `docker push` verso `localhost:1/...` fallisce in **30 secondi
> netti** con `dial tcp [::1]:1: i/o timeout`. Ma chi sta guardando l'interfaccia non riceve mai la
> notizia: lo stream del push non emette alcun evento di errore. Il controllo che lo verifica aspetta
> fino a 45 secondi — quindi con quindici secondi di margine sul rifiuto del daemon — e non vede
> arrivare niente; fallisce in modo riproducibile, identico su due esecuzioni consecutive.
>
> L'operatore quindi lancia un push verso un registry irraggiungibile e resta a guardare qualcosa che
> non gli dirà mai che è andato storto.
>
> La prima ipotesi ovvia — che il controllo sia semplicemente troppo impaziente — è stata verificata
> ed è falsa: il rifiuto arriva in 30 secondi, dentro il limite. Alzare il limite avrebbe nascosto il
> problema invece di risolverlo.
>
> Va stabilito se l'errore si perde nel percorso che va dal daemon allo stream verso il client,
> oppure se è il controllo a essere scritto male, e va sistemato quello che risulta rotto.

## Reference

Fix of [`docker_management_app.md`](docker_management_app.md): pushing an image is delivered there,
and long operations must be observable. **Changes:** a refused push now ends in a stated failure.

## Summary

The daemon refuses a push to an unreachable registry in 30 seconds and the interface is never told, so
a write towards a remote system stays apparently alive in front of an operator who will never learn it
failed. The outcome must reach them, and the check must be one that can fail.

## Requirements

### Functional

- Report a refused push as a failure the moment the refusal arrives, carrying the daemon's own
  message: `dial tcp [::1]:1: i/o timeout` names the address and the cause, "push failed" neither.
- Leave no push running once the daemon's stream has ended — an end without a stated success is a
  failure — and conclude success only from a stated success, never from the absence of an error.
- Impose no deadline of the interface's own: it waits exactly as long as the daemon does.
- Show the failure where the push's progress is already reported, until the operator dismisses it.
- Correct the outcome reporting where it is shared with the other streamed operations, pull first of
  all, so the same silence cannot survive next door.
- Leave a successful push exactly as delivered.

### Non-functional

- Establish which of the two is broken before changing anything, record the finding, correct only it.
- Make the check fail on the delivered product and pass on the corrected one, driven through the
  product's own path with a real pointer, asserting the failure is **shown** rather than that time
  passed eventlessly, and observing from before the push starts.
- Keep the check's budget above the refusal time: the 45 seconds stand; raising them is no remedy.
- Reproduce the refusal offline, with an unreachable address (the measured `localhost:1`).

## Assumptions

- The 30 seconds belong to the daemon and that host; nothing built here depends on the value.
- The correction covers every refusal — unreachable host, denied credentials, unknown repository.

## Scope

**In scope**

- The outcome of a push reaching the operator: the failure with its cause, and nothing left running.
- The same correction wherever that outcome reporting is shared with other streamed operations.
- A check that reproduces the refusal offline and fails on the delivered product.

**Out of scope**

- What a push does, how it is started, and how it reports progress while it succeeds.
- Retrying, and any configurable or shortened timeout.
- Registry credential and configuration management, and any other reported defect.
