# volumes-networks — Index

| Component | Type | Path | Responsibility | Spec |
|-----------|------|------|-----------------|------|
| VolumesNetworksScreen | UI component | `client/src/volumes-networks/VolumesNetworksScreen.tsx` | The Volumes & networks screen: the two lists one under the other, each at the screen's full content width, so that neither the list nor the detail it reveals is confined to a column | `specs/volumes-networks-screen.md` |
| VolumesPanel | UI component | `client/src/volumes-networks/VolumesPanel.tsx` | The Volumes panel: the object list with driver, mountpoint, size and mounting containers in columns, the detail panel on selection, create and prune in the toolbar under the section header, and remove in the row's action cluster — all three through the confirmation service with the reclaimed space reported | `specs/volumes-panel.md` |
| NetworksPanel | UI component | `client/src/volumes-networks/NetworksPanel.tsx` | The Networks panel: the object list with driver, scope and subnet/gateway in columns and the attached containers as chips with an inline detach below each row, the detail panel on selection, create and prune in the toolbar under the section header, and attach and remove in the row's action cluster | `specs/networks-panel.md` |
