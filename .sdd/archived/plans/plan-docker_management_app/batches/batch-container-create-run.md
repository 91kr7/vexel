---
batch: 10 · container-create-run
feature: F6 — Container creation and run
closed_req: [REQ-27, REQ-28, REQ-29]
depends: [4, 9]
---

# Batch 10 — Container creation and run

Depends on batch 9 because the image to run is picked among local images or pulled when missing.

Visual reference: the "Run container…" / "Create from image…" toolbar actions in
`.sdd/analysis/ui-mock/containers.png`.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client, UI library (`client/src/ui/`) | Multi-section form surface (grouped sections, sticky footer with the two commit actions) and a combobox with asynchronous options and free text, plus a chip input for lists of values. | REQ-27, REQ-29 | — |
| INT-2 | create | server, containers area | Container creation over the Engine API from a full configuration (name, command/entrypoint, environment, port mappings, volume mounts, networks, restart policy, resource limits, labels, privileged/capabilities), with a create-only and a create-and-start mode, returning the daemon's own message on rejection. | REQ-27, REQ-28 | — |
| INT-3 | create | server, containers area | Resolution of the requested image reference: use the local image when present, otherwise pull it first with progress, before creating the container. | REQ-29 | INT-2 |
| INT-4 | create | client, data-access layer | Creation mutation with progress (pull then create), rejection payload preserved for the form, and refresh of the container list on success. | REQ-27, REQ-28, REQ-29 | INT-2, INT-3 |
| INT-5 | create | client, containers feature area | Create/run form: image chosen from local images or typed, all configuration sections, local validation of what can be validated client-side, daemon rejection displayed with its own message while the entered values are kept, and the create-only / create-and-start choice. | REQ-27, REQ-28, REQ-29 | INT-1, INT-4 |
| INT-6 | modify | client, containers feature area (created by `batch-containers-lifecycle`) | Wire the "Run container…" and "Create from image…" toolbar actions to the form and show the new container in the list on success. | REQ-27 | INT-5 |
| INT-7 | modify | client, images feature area (created by `batch-images-core`) | Offer "run this image" from an image row, opening the same form pre-filled with that reference. | REQ-29 | INT-5 |
