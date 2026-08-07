# images — Index

| Component | Type | Path | Responsibility | Spec |
|-----------|------|------|-----------------|------|
| ImagesService | backend service | `server/src/images/images-service.ts` | Lists local images over the Engine API (tags, digest, platform(s), size, age) and reads an image's inspect data (config, entrypoint/cmd, env, labels, exposed ports, history) plus the raw payload | `specs/images-service.md` |
| ImageTransferService | backend service | `server/src/images/image-transfer-service.ts` | Registry-facing image operations over the Engine API: pull and push with per-layer progress, tag, untag, remove, and prune of dangling images | `specs/image-transfer-service.md` |
| Images endpoints | REST endpoint | `server/src/images/images-routes.ts` | Exposes image listing, inspect, pull/push progress streams, tag, untag, remove and prune to the client | `specs/images-endpoints.md` |
| Images client | frontend data client | `client/src/data/images-client.ts` | Typed `fetch` wrapper for the images endpoints, plus the pull/push progress stream URL builders | `specs/images-client.md` |
| useImages | frontend hook | `client/src/data/use-images.ts` | Reads the image list, re-reading on a bounded poll and on `image` daemon events | `specs/use-images.md` |
| useImageInspect | frontend hook | `client/src/data/use-image-inspect.ts` | Reads a single image's inspect data, re-reading on `id` change and on `image` daemon events | `specs/use-image-inspect.md` |
| useImageTransferStream | frontend hook | `client/src/data/use-image-transfer.ts` | Subscribes to a pull/push progress stream, collecting per-layer steps until completion or failure | `specs/use-image-transfer-stream.md` |
| ImagesScreen | UI component | `client/src/images/ImagesScreen.tsx` | The Images screen: toolbar (pull, prune dangling), searchable data table of local images laid out like the containers table, per-row tag/untag/push/remove actions with destructive confirmation on remove, pull/push progress dialogs | `specs/images-screen.md` |
| ImageDetailPanel | UI component | `client/src/images/ImageDetailPanel.tsx` | Image inspect surface: structured inspect data (config, env, labels, exposed ports, history) plus the raw payload, copyable | `specs/image-detail-panel.md` |
