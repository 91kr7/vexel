# image-analysis — Index

| Component | Type | Path | Responsibility | Spec |
|-----------|------|------|-----------------|------|
| LayerMetadataService | backend service | `server/src/image-analysis/layer-metadata-service.ts` | Assembles an image's ordered layer stack from its manifest/config (RootFS diff ids) and history: digest, uncompressed size, empty-layer flag and originating instruction/command, marking anything the daemon cannot provide as explicitly unavailable | `specs/layer-metadata-service.md` |
| SharedLayerService | backend service | `server/src/image-analysis/shared-layer-service.ts` | For a set of diff ids, finds the other local images that reference the same content-addressed layer | `specs/shared-layer-service.md` |
| ChangesetService | backend service | `server/src/image-analysis/changeset-service.ts` | Computes per-layer added/modified/deleted paths by reading an exported image tarball layer by layer, honouring OCI whiteout markers; cached, progress-reporting and cancellable | `specs/changeset-service.md` |
| FilesystemExtractionService | backend service | `server/src/image-analysis/filesystem-extraction-service.ts` | Creates a container from an image without ever starting it, exports and indexes its merged filesystem into a flat entry list, removes the container whatever happens, and serves lazy per-directory reads and the startup cleanup sweep; cached across restarts, progress-reporting and cancellable | `specs/filesystem-extraction-service.md` |
| Image analysis endpoints | REST endpoint | `server/src/image-analysis/image-analysis-routes.ts` | Exposes the layer stack (with shared-layer markers), a cancellable changeset-analysis progress stream, and the filesystem extraction/tree-read pair to the client | `specs/image-analysis-endpoints.md` |
