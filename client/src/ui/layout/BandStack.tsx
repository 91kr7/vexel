import type { ReactNode } from 'react';
import './band-stack.css';

export interface BandStackProps {
  /**
   * The chrome bands, in the order they are read: each takes the height of its
   * own content and no more, and each is a band of the arrangement itself — the
   * bands are not wrapped, so nothing between them can claim height of its own.
   * A band given as `null` leaves nothing behind: not an empty band, and not the
   * spacing one would have taken.
   */
  bands: ReactNode[];
  /** The one region that absorbs whatever height is left over, and the only one. */
  fill: ReactNode;
}

/**
 * Bands of chrome above one region that takes the remaining height.
 *
 * The arrangement is **bounded, never given a height**: it takes what the
 * container it is placed in offers. With less content than that bound the
 * arrangement is the size of its own content and the filling region does not
 * stretch — a surface with little to show stays short. With more, the filling
 * region shrinks against the bound and so is handed a definite height, which is
 * what lets its content scroll and virtualise inside it instead of pushing the
 * whole arrangement past its container.
 *
 * Which is why no length is accepted from the caller: a stated height would make
 * the surface that height for ever, and "grow to fit" would take the definite
 * height its content needs away.
 */
export function BandStack({ bands, fill }: BandStackProps) {
  return (
    <div className="ui-band-stack">
      {bands}
      <div className="ui-band-stack__fill">{fill}</div>
    </div>
  );
}
