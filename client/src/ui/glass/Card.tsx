import type { ReactNode } from 'react';
import { Surface, type SurfaceElevation } from './Surface';
import './card.css';

export interface CardProps {
  children?: ReactNode;
  title?: string;
  elevation?: SurfaceElevation;
}

/** A glass Surface with padding and an optional eyebrow-style title. */
export function Card({ children, title, elevation = 'flat' }: CardProps) {
  return (
    <Surface elevation={elevation} padding="lg">
      {title ? <p className="ui-card__title">{title}</p> : null}
      {children}
    </Surface>
  );
}
