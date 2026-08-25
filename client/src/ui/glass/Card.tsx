import type { ReactNode } from 'react';
import { Surface, type SurfaceAccent, type SurfaceElevation, type SurfacePadding } from './Surface';

export interface CardProps {
  children?: ReactNode;
  elevation?: SurfaceElevation;
  /** `none` when the content manages its own edge-to-edge inset (e.g. a table). */
  padding?: SurfacePadding;
  /** Forwarded to the Surface: a state-coloured bar down the card's left edge. */
  accent?: SurfaceAccent;
  /** Forwarded to the Surface: makes the card selectable, with the table row's own highlights. */
  onSelect?: () => void;
  selected?: boolean;
}

/**
 * A glass Surface with padding: the everyday content block.
 *
 * It titles nothing. A card that could title itself was a second way of asking
 * the one question `SectionHeader` answers — and by the end of the migrations no
 * screen was using it, every one of them composing the header into the card
 * instead. The prop, its element and its stylesheet went with the finding.
 *
 * There is still no card stylesheet: the accent edge and the selectable
 * treatment are the Surface's, forwarded, not a second material declared here.
 */
export function Card({ children, elevation = 'flat', padding = 'lg', accent, onSelect, selected }: CardProps) {
  return (
    <Surface elevation={elevation} padding={padding} accent={accent} onSelect={onSelect} selected={selected}>
      {children}
    </Surface>
  );
}
