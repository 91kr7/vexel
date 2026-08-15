import type { ReactNode } from 'react';
import { Stack } from '../ui';
import { VolumesPanel, type VolumesPanelProps } from './VolumesPanel';

export interface VolumesNetworksScreenProps {
  volumes: VolumesPanelProps;
  /** The Networks panel, below the Volumes panel and at the same width. */
  networksPanel?: ReactNode;
}

/**
 * The Volumes & networks screen: the two object lists, one under the other, each
 * at the full width of the content column (REQ-70, REQ-72).
 *
 * The side-by-side pair is gone, and not as a concession: containers and images
 * were already single full-width lists, so this was **the last screen laying a
 * list out differently** — which is this plan's whole subject. It could not have
 * been kept in any case: the detail is the row's own expansion, so the list's
 * width is the panel's width, and the pair capped the panel at 482px of a
 * 1120px content column.
 *
 * The cost is that networks now takes a scroll rather than the right half of the
 * screen. Stated in `volumes-networks-screen.md` with its figures, so that the
 * pair is not reinstated as a layout preference: it would bring the ~250px panel
 * back with it.
 */
export function VolumesNetworksScreen({ volumes, networksPanel }: VolumesNetworksScreenProps) {
  return (
    <Stack gap="var(--space-5)">
      <VolumesPanel {...volumes} />
      {networksPanel}
    </Stack>
  );
}
