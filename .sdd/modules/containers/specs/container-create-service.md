---
module: containers
component: ContainerCreateService
type: backend service
---

# ContainerCreateService

**Purpose** → creates a container over the Engine API from a full configuration, resolving the
requested image first (local when present, pulled with progress when not), in a create-only or a
create-and-start mode, and reporting any refusal with the daemon's own message.

## Contract

- `createContainer(spec, handlers) → void`
  - `spec: ContainerCreateSpec` — `image` (required), `platform?`, `name?`, `command?`,
    `entrypoint?`, `env?` (`KEY=value` entries), `ports?` (`{ containerPort, protocol, hostPort?,
    hostIp? }`), `mounts?` (`{ type: 'bind' | 'volume', source, destination, readOnly }`),
    `networks?`, `restartPolicy?`, `resourceLimits?` (`cpus`, `memoryBytes`), `labels?`,
    `privileged?`, `capabilities?` (`{ add, drop }`), `start?`.
  - `handlers` — `onImageResolved(pulled)`, `onPullStep(step)`, `onCreated(result)`,
    `onError(message)`.
  - `result: { id, name, started, imagePulled, warnings }`.
  - order of events: any number of `onPullStep`, then `onImageResolved`, then exactly one of
    `onCreated` / `onError`.
  - rejects before touching the daemon when `image` is blank, or when `name` is present and does
    not match `[a-zA-Z0-9][a-zA-Z0-9_.-]*` → `onError` with that reason.
  - effect on success: the container exists; in create-and-start mode it is also running.

## Rules and invariants

- The image is pulled only when the daemon does not already hold the reference; a reference that is
  present is used as-is and produces no `onPullStep` (`imagePulled` is then `false`).
- A pull is attempted only on a 404 from the image lookup; any other daemon refusal on that lookup
  is reported as an error rather than turned into a pull.
- Exactly one terminal handler fires: `onCreated` or `onError`, never both, never neither.
- `onError` carries the daemon's own message verbatim whenever the daemon is the one refusing —
  the failing step (pull, create, network attach or start) is never masked by a generic message.
- The first requested network is attached at creation time (the Engine API accepts a single
  endpoint there); the remaining ones are attached before the container is started, so a
  create-and-start container starts already on every requested network.
- `cpus` is expressed to the daemon as a quota over a 100 ms period; `memoryBytes` is passed as-is.
- Creation never mutates any existing container.

## Dependencies

- docker-access: EngineClient, DockerDaemonError
- images: image transfer service (pull)
- connectivity: the active Engine client

## Requirements served

- plan-docker_management_app/REQ-27
- plan-docker_management_app/REQ-28
- plan-docker_management_app/REQ-29
