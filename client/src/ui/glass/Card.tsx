import type { ReactNode } from 'react';
import { SectionHeader } from './SectionHeader';
import { Surface, type SurfaceElevation, type SurfacePadding } from './Surface';
import './card.css';

export interface CardProps {
  children?: ReactNode;
  title?: string;
  elevation?: SurfaceElevation;
  /** `none` when the content manages its own edge-to-edge inset (e.g. a table). */
  padding?: SurfacePadding;
}

/**
 * A glass Surface with padding and an optional title.
 *
 * The title is a `SectionHeader`, not a treatment of the card's own: a card's
 * heading and a section's heading were two styles for one thing, and one of
 * them had to stop existing. All that is left here is the step between the
 * heading and the card's content.
 */
export function Card({ children, title, elevation = 'flat', padding = 'lg' }: CardProps) {
  return (
    <Surface elevation={elevation} padding={padding}>
      {title ? (
        <div className="ui-card__title">
          <SectionHeader variant="eyebrow" title={title} />
        </div>
      ) : null}
      {children}
    </Surface>
  );
}
