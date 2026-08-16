import type { ReactNode } from 'react';
import { Surface, type SurfaceElevation, type SurfacePadding } from './Surface';

export interface CardProps {
  children?: ReactNode;
  elevation?: SurfaceElevation;
  /** `none` when the content manages its own edge-to-edge inset (e.g. a table). */
  padding?: SurfacePadding;
}

/**
 * A glass Surface with padding: the everyday content block.
 *
 * It titles nothing. A card that could title itself was a second way of asking
 * the one question `SectionHeader` answers — and by the end of the migrations no
 * screen was using it, every one of them composing the header into the card
 * instead. The prop, its element and its stylesheet went with the finding.
 */
export function Card({ children, elevation = 'flat', padding = 'lg' }: CardProps) {
  return (
    <Surface elevation={elevation} padding={padding}>
      {children}
    </Surface>
  );
}
