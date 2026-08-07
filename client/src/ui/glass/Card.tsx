import type { ReactNode } from 'react';
import { Surface, type SurfaceElevation, type SurfacePadding } from './Surface';
import './card.css';

export interface CardProps {
  children?: ReactNode;
  title?: string;
  elevation?: SurfaceElevation;
  /** `none` when the content manages its own edge-to-edge inset (e.g. a table). */
  padding?: SurfacePadding;
}

/** A glass Surface with padding and an optional eyebrow-style title. */
export function Card({ children, title, elevation = 'flat', padding = 'lg' }: CardProps) {
  return (
    <Surface elevation={elevation} padding={padding}>
      {title ? <p className="ui-card__title">{title}</p> : null}
      {children}
    </Surface>
  );
}
