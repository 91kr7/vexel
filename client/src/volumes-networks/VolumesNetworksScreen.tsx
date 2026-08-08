import type { ReactNode } from 'react';
import { Grid } from '../ui';
import { VolumesPanel, type VolumesPanelProps } from './VolumesPanel';

export interface VolumesNetworksScreenProps {
  volumes: VolumesPanelProps;
  /** The Networks panel, dropped in by a later batch; the layout stays a single column until then. */
  networksPanel?: ReactNode;
}

/**
 * The Volumes & networks screen: two side-by-side panels, each owning its own
 * header and actions (REQ-70). Only the Volumes panel is implemented by this
 * batch; the Networks panel slots into the same layout once a later batch
 * supplies it.
 */
export function VolumesNetworksScreen({ volumes, networksPanel }: VolumesNetworksScreenProps) {
  return (
    <Grid columns={networksPanel ? '1fr 1fr' : '1fr'} gap="var(--space-5)">
      <VolumesPanel {...volumes} />
      {networksPanel}
    </Grid>
  );
}
