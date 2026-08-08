import type { ReactNode } from 'react';
import { Grid } from '../ui';
import { VolumesPanel, type VolumesPanelProps } from './VolumesPanel';

export interface VolumesNetworksScreenProps {
  volumes: VolumesPanelProps;
  /** The Networks panel; the layout stays a single column when it is omitted. */
  networksPanel?: ReactNode;
}

/**
 * The Volumes & networks screen: two side-by-side panels, each owning its own
 * header and actions (REQ-70, REQ-72).
 */
export function VolumesNetworksScreen({ volumes, networksPanel }: VolumesNetworksScreenProps) {
  return (
    <Grid columns={networksPanel ? '1fr 1fr' : '1fr'} gap="var(--space-5)">
      <VolumesPanel {...volumes} />
      {networksPanel}
    </Grid>
  );
}
