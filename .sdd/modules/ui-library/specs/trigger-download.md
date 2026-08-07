---
module: ui-library
component: triggerDownload
type: UI utility
---

# triggerDownload

**Purpose** → triggers a native browser download of a server URL (e.g. saving an image tarball,
exporting a container's filesystem) so the browser carries the transfer end to end, never the
application (REQ-42, REQ-43).

## Contract

- `triggerDownload(url: string): void` — navigates the browser to `url` through a transient,
  invisible anchor; the endpoint's own `Content-Disposition: attachment` header is what makes the
  browser download rather than navigate.

## Rules and invariants

- Never reads or buffers the response body: the function only starts the browser's own download,
  the same mechanism `LogStream`'s buffered-content download action uses internally.

## Requirements served

- plan-docker_management_app/REQ-42
- plan-docker_management_app/REQ-43
