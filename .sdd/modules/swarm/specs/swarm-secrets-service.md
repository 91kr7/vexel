---
module: swarm
component: SwarmSecretsService
type: backend service
---

# SwarmSecretsService

**Purpose** → the swarm's secrets and configs: listed with their name and age, created, inspected as
metadata and removed. **A secret's value is write-only**: it is accepted once, handed to the daemon
and never read back by anything (REQ-84).

## Contract

Every operation takes the kind it applies to — `'secret' | 'config'` — and behaves the same for
both, over the daemon's corresponding collection.

- `listSwarmData(kind) → SwarmListing<SwarmDataItem>`
  - `SwarmDataItem` = `{ kind, id, name, createdAt, updatedAt?, version, labels, stack? }`.
  - `stack` → the stack the object belongs to, when it carries the namespace label.
  - **Ordered by name** under the list-order rule (`compareNames`), with the item's **id** as the
    final comparison, so two secrets (or two configs) whose names differ only in case or in leading
    zeros never tie; the same objects produce the same sequence on every read.
  - off a manager: no items and the stated reason.
- `getSwarmDataMetadata(kind, id) → SwarmDataItem`
  - the same metadata as the listing, for one object; **never any data**.
  - rejects if the daemon is not a manager, and with the daemon's message for an unknown id.
- `createSwarmData(kind, { name, value, labels? }) → SwarmDataItem`
  - effect: the object exists in the cluster's store holding `value`.
  - answers with the created object's **metadata only** — never the value it was just given.
  - rejects on an empty name or an empty value; on a name already taken, and on any other daemon
    refusal, with the daemon's own message.
- `removeSwarmData(kind, id) → void`
  - effect: the object is gone from the cluster's store.
  - rejects if the daemon is not a manager, and with the daemon's message when a service still uses
    it.

## Rules and invariants

- **No value ever leaves this service** — not in a listing, not in an inspection, not in a creation
  answer, not in an error message, not in a log line. The daemon itself never returns a secret's
  data; a config's data, which the daemon *does* return, is stripped here for the same reason: the
  application shows metadata, and only metadata (REQ-84).
- The value is base64-encoded on its way to the daemon, which is the encoding the Engine API takes,
  and the encoded form is dropped as soon as the request is built.
- The value travels in a request body, never in a path or a query string — the parts of a request
  that get logged.
- Secrets and configs are immutable in the daemon: a change is a new object, not an update, so no
  update operation exists here.

## Dependencies

- swarm: SwarmStateService (manager scoping), SwarmServicesService (the namespace label)
- docker-access: EngineClient (active context)
- list-order: List order (`byNameThenIdentity`)

## Requirements served

- plan-docker_management_app/REQ-84
- plan-docker_management_app-list_ordering/REQ-23
- plan-docker_management_app-list_ordering/REQ-25
