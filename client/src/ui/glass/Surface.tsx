import type { ReactNode } from 'react';
import './surface.css';
import './overlay-glass.css';

export type SurfaceElevation = 'flat' | 'raised' | 'sunken';
export type SurfacePadding = 'none' | 'sm' | 'md' | 'lg';
export type SurfaceMaterial = 'base' | 'overlay';

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
  /** `'overlay'` adds the blurred overlay glass material; only a surface drawn above what it covers may ask for it. */
  material?: SurfaceMaterial;
}

/**
 * Glass panel: translucency over the backdrop, a hairline border and a subtle
 * top highlight. The base material computes no blur; `material="overlay"` is
 * the one opt-in that does, bounded by the `--blur-overlay` token.
 */
export function Surface({
  children,
  elevation = 'flat',
  padding = 'none',
  material = 'base',
}: SurfaceProps) {
  const classes = [
    'ui-surface',
    `ui-surface--${elevation}`,
    paddingClass[padding],
    material === 'overlay' ? 'ui-overlay-glass' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return <div className={classes}>{children}</div>;
}
