# volumes-networks — Index

| Component | Type | Path | Responsibility | Spec |
|-----------|------|------|-----------------|------|
| VolumesNetworksScreen | UI component | `client/src/volumes-networks/VolumesNetworksScreen.tsx` | The Volumes & networks screen: a two-panel layout hosting the Volumes panel, with a slot for the Networks panel added by a later batch | `specs/volumes-networks-screen.md` |
| VolumesPanel | UI component | `client/src/volumes-networks/VolumesPanel.tsx` | The Volumes panel: list with driver, mountpoint, size and mounting containers, inline inspect on selection, create dialog, and remove/prune through the confirmation service with the reclaimed space reported | `specs/volumes-panel.md` |
