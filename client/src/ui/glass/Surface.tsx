import type { ReactNode } from 'react';
import './surface.css';

export type SurfaceElevation = 'flat' | 'raised' | 'sunken';
export type SurfacePadding = 'none' | 'sm' | 'md' | 'lg';

const paddingClass: Record<SurfacePadding, string> = {
  none: 'ui-surface--pad-none',
  sm: 'ui-surface--pad-sm',
  md: 'ui-surface--pad-md',
  lg: 'ui-surface--pad-lg',
};

export interface SurfaceProps {
  children?: ReactNode;
  elevation?: SurfaceElevation;
  padding?: SurfacePadding;
}

/**
 * Glass panel: translucency over the backdrop, a hairline border and a
 * subtle top highlight. Never uses backdrop-filter or filter: blur().
 */
export function Surface({ children, elevation = 'flat', padding = 'none' }: SurfaceProps) {
  const classes = ['ui-surface', `ui-surface--${elevation}`, paddingClass[padding]]
    .filter(Boolean)
    .join(' ');
  return <div className={classes}>{children}</div>;
}
