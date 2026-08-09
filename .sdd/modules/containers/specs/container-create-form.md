---
module: containers
component: ContainerCreateForm
type: UI component
---

# ContainerCreateForm

**Purpose** → the create/run form: the image is picked among the local images or typed freely, every
configuration section is grouped, what the browser can check is checked before submitting, and a
daemon refusal is shown with the daemon's own message while every entered value stays in place.

## Contract

- `<ContainerCreateForm open images imagesLoaded? initialImage? defaultStart? onCancel onCreated />`
  — `images: ImageSummary[]` are the local images offered as suggestions, `initialImage?` pre-fills
  the reference, `defaultStart?` (default `true`) decides which commit action is the primary one,
  `onCreated(result)` is called with the created container.

Description:
- A `FormSheet` whose body is a stack of `FormSection`s, with the two commit choices in its footer.
Shows:
- "Image and identity" → image (a `Combobox` over every local image's tag, or its short id when it
  has none; any other reference can be typed and is pulled), platform (used only when pulling),
  container name.
- "Entrypoint and command" → both free text, split on whitespace; empty keeps the image's own.
- "Environment" → repeatable name/value pairs.
- "Ports" → repeatable rows of container port, host port, host address and protocol (tcp/udp).
- "Volumes" → repeatable rows of type (bind/volume), source, container path and a read-only switch.
- "Networks" → a list of network names.
- "Restart policy" → no / on-failure / always / unless-stopped; a maximum-retries field appears
  only for on-failure.
- "Resource limits" → CPUs and memory in MB, each empty meaning "no limit".
- "Labels" → repeatable key/value pairs.
- "Privileges" → a privileged switch, plus capabilities to add and to drop.
- "Pulling the image" → per-layer progress, present only while an image is being pulled and after.
- The daemon's refusal, verbatim, in the sheet's pinned banner.
Actions:
- "Create and start" → creates the container and starts it. "Create only" → creates it stopped.
  Both go through the same submission; `defaultStart` only decides which of the two is the primary
  action ("Run container…" versus "Create from image…" entry points).
- A successful creation reports the container's name via `useToast()`, reports each daemon warning
  via `useErrorReporter()`, and calls `onCreated`.
- Cancel calls `onCancel` without creating anything.

## Rules and invariants

- Local validation (REQ-28), reported on the field it concerns and only after the first submission
  attempt; a submission with any of these pending performs no call:
  - an image reference is required;
  - a container name, when given, must match `[a-zA-Z0-9][a-zA-Z0-9_.-]*`;
  - every port mapping needs a container port in 1–65535, and a host port, when given, in the same
    range;
  - every mount needs a source and an absolute container path;
  - every environment variable needs a name, without `=`; every label needs a key;
  - a CPU or memory limit, when given, must be greater than zero.
- The sheet's two key/value editors name their rows apart — the "Environment" ones and the "Labels"
  ones — so no two fields of the sheet share an accessible name and a screen reader says which of
  the two a row belongs to.
- A daemon refusal leaves the sheet open with every entered value untouched (REQ-28): only the
  banner appears, nothing is cleared and nothing is re-defaulted.
- The form is reset to its initial values only when it opens, never in reaction to a refusal.
- While the creation is in flight, the sheet is busy: the commit actions and cancel are disabled.

## Dependencies

- ui-library: FormSheet, FormSection, FormField, Combobox, ChipInput, KeyValueEditor,
  RepeatableRowList, TextField, NumberField, Select, Toggle, StepProgressList, ErrorBanner, Row,
  useToast
- useContainerCreate, Container create client, Images client (`ImageSummary`)
- app-shell: ErrorReportingService

## Requirements served

- plan-docker_management_app/REQ-27
- plan-docker_management_app/REQ-28
- plan-docker_management_app/REQ-29
