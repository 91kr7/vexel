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
  /** Forwarded to the Surface: the band that closes the card, on its own ground under a hairline. */
  footer?: ReactNode;
}

/**
 * A glass Surface with padding: the everyday content block. It titles nothing — that is
 * `SectionHeader`'s one question — and it has no stylesheet: the accent edge, the selectable
 * treatment and the footer band are the Surface's, forwarded.
 */
export function Card({ children, elevation = 'flat', padding = 'lg', accent, onSelect, selected, footer }: CardProps) {
  return (
    <Surface elevation={elevation} padding={padding} accent={accent} onSelect={onSelect} selected={selected} footer={footer}>
      {children}
    </Surface>
  );
}
