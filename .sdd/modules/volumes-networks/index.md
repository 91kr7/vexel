# volumes-networks — Index

| Component | Type | Path | Responsibility | Spec |
|-----------|------|------|-----------------|------|
| VolumesNetworksScreen | UI component | `client/src/volumes-networks/VolumesNetworksScreen.tsx` | The Volumes & networks screen: a two-panel layout hosting the Volumes panel and the Networks panel | `specs/volumes-networks-screen.md` |
| VolumesPanel | UI component | `client/src/volumes-networks/VolumesPanel.tsx` | The Volumes panel: list with driver, mountpoint, size and mounting containers, inline inspect on selection, create dialog, and remove/prune through the confirmation service with the reclaimed space reported | `specs/volumes-panel.md` |
| NetworksPanel | UI component | `client/src/volumes-networks/NetworksPanel.tsx` | The Networks panel: list with driver, scope, subnet/gateway and attached containers as chips with an inline detach action, inline inspect on selection, create dialog, remove/prune through the confirmation service, and attaching a container from a chip-group add affordance | `specs/networks-panel.md` |
