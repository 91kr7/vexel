import type { ReactNode } from 'react';
import { Stack } from '../ui';
import { useVolumes } from '../data/use-volumes';
import { VolumesPanel } from './VolumesPanel';

export interface VolumesNetworksScreenProps {
  /** The Networks panel, below the Volumes panel and at the same width. */
  networksPanel?: ReactNode;
}

/**
 * The Volumes & networks screen: the two object lists, one under the other, each
 * at the full width of the content column (REQ-70, REQ-72), and the volume
 * listing read here rather than by the shell
 * (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-40).
 *
 * Reinstating the side-by-side pair brings the ~250px panel back with it:
 * `volumes-networks-screen.md` carries the figures and the accepted cost.
 */
export function VolumesNetworksScreen({ networksPanel }: VolumesNetworksScreenProps) {
  const volumes = useVolumes();

  return (
    <Stack gap="var(--space-5)">
      <VolumesPanel volumes={volumes.volumes} loaded={volumes.loaded} error={volumes.error} onRefresh={volumes.refresh} />
      {networksPanel}
    </Stack>
  );
}
