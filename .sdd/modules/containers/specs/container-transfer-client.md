---
module: containers
component: Container transfer client
type: frontend data client
---

# Container transfer client

**Purpose** → typed client for the container filesystem export/import transport: the export
download URL, triggered with the ui-library's `triggerDownload`, and the import upload URL,
consumed with the images module's `useFileUpload` the same way its own load URL is.

## Contract

- `ContainerImportResult`: `{ id?, reference? }` — mirrors the server shape (see
  `container-transfer-service.md`).
- `exportContainerUrl(id, filename?): string` — `/api/containers/:id/export[?filename=...]`.
- `containerImportUploadUrl(targetReference?, changes?): string` —
  `/api/containers/import[?targetReference=...][&changes=...]*`.

## Dependencies

- None (URL builders only).

## Requirements served

- plan-docker_management_app/REQ-43
