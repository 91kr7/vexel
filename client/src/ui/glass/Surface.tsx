import type { ReactNode } from 'react';
import './surface.css';
import './overlay-glass.css';

export type SurfaceElevation = 'flat' | 'raised' | 'sunken';
export type SurfacePadding = 'none' | 'sm' | 'md' | 'lg';
export type SurfaceMaterial = 'base' | 'overlay';
/** State colours a surface may edge itself with; they are the tokens the status tones already use. */
export type SurfaceAccent = 'success' | 'warning' | 'danger' | 'neutral';

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
  /** Draws a full-height bar down the surface's left edge in a state colour, following its own left rounding. */
  accent?: SurfaceAccent;
  /** Makes the surface selectable: it takes the hover highlight and reports whether it is the selected one. */
  onSelect?: () => void;
  /** Whether this is the selected surface; only meaningful together with `onSelect`. */
  selected?: boolean;
  /** A band closing the surface: its own ground under a hairline, spanning the full width, holding the surface's actions. */
  footer?: ReactNode;
}

/**
 * Glass panel: translucency over the backdrop, a hairline border and a subtle
 * top highlight. The base material computes no blur; `material="overlay"` is
 * the one opt-in that does, bounded by the `--blur-overlay` token.
 *
 * `onSelect` and `selected` give it the object table's own hover and selected
 * highlights, by reference to the same tokens, so a list drawn as one surface
 * per object behaves as a list of rows does.
 *
 * With a `footer` the surface parts into two bands: the padding moves off the
 * surface and onto each band, so the footer's ground reaches its edges.
 */
export function Surface({
  children,
  elevation = 'flat',
  padding = 'none',
  material = 'base',
  accent,
  onSelect,
  selected,
  footer,
}: SurfaceProps) {
  const parted = footer !== undefined;
  const classes = [
    'ui-surface',
    `ui-surface--${elevation}`,
    paddingClass[padding],
    parted ? 'ui-surface--parted' : '',
    material === 'overlay' ? 'ui-overlay-glass' : '',
    accent ? `ui-surface--accent ui-surface--accent-${accent}` : '',
    onSelect ? 'ui-surface--selectable' : '',
    onSelect && selected ? 'ui-surface--selected' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classes} onClick={onSelect} aria-selected={onSelect ? selected === true : undefined}>
      {parted ? (
        <>
          <div className="ui-surface__body">{children}</div>
          <div className="ui-surface__footer">{footer}</div>
        </>
      ) : (
        children
      )}
    </div>
  );
}
