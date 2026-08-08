---
module: image-analysis
component: SecretPatternScan
type: backend utility
---

# SecretPatternScan

**Purpose** → flags paths matching common credential/secret path conventions anywhere in an image's
layer history — including a path later deleted and so absent from the final merged filesystem — as a
heuristic name/path signal, never a content-based security verdict (REQ-67).

## Contract

- `scanForSecretPaths(changesets: ImageChangesets): LayerSecretScan`
  - `LayerSecretScan`: `{ imageId, findings }`, sorted by `path`.
  - `SecretFinding`: `{ path, patternName, introducedLayerIndex, removedLayerIndex? }` —
    `patternName` names the matched convention (e.g. `"Private key"`, `"AWS credentials"`);
    `removedLayerIndex` is present only when a later layer deletes the path.

## Rules and invariants

- Matching is against the path only (name and directory conventions: `.env`, `id_rsa`, `*.pem`,
  `.aws/credentials`, `.ssh/id_*`, `.npmrc`, `.docker/config.json`, service-account JSON, generic
  `secrets.*`/`credentials.*`, and similar) — file content is never read or interpreted.
- A path is reported once per introduction: a matching path added, then deleted, then re-added is
  flagged for its own occurrence.
- No I/O: pure computation over an already-computed `ImageChangesets` (ChangesetService, batch 13).

## Dependencies

- image-analysis: ChangesetService (`ImageChangesets` type)

## Requirements served

- plan-docker_management_app/REQ-67
