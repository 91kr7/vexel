# networks — Index

| Component | Type | Path | Responsibility | Spec |
|-----------|------|------|-----------------|------|
| NetworksService | backend service | `server/src/networks/networks-service.ts` | Lists networks over the Engine API in name order (name, driver, scope, subnet, gateway, IP range, attached containers), reads a network's full inspect data, creates, removes and prunes unused networks, attaches and detaches a container — each marking the listing changed — and registers that listing as a refresh-cache kind marked due by `network` and `container` events | `specs/networks-service.md` |
| Networks endpoints | REST endpoint | `server/src/networks/networks-routes.ts` | Exposes network listing answered from the refresh cache, plus inspect, create, remove, prune and container attach/detach | `specs/networks-endpoints.md` |
| Networks client | frontend data client | `client/src/data/networks-client.ts` | Typed `fetch` wrapper for the networks endpoints | `specs/networks-client.md` |
| useNetworks | frontend hook | `client/src/data/use-networks.ts` | Reads the network list, re-reading on a bounded poll and on `network`/`container` daemon events | `specs/use-networks.md` |
| useNetworkInspect | frontend hook | `client/src/data/use-network-inspect.ts` | Reads a single network's inspect data, re-reading on `id` change, on `network` daemon events about that same network and on every `container` event | `specs/use-network-inspect.md` |
