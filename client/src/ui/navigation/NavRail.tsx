import type { ReactNode } from 'react';
import './navigation.css';

export interface NavBrandProps {
  name: string;
  tagline: string;
}

/** Application mark shown at the top of the navigation rail. */
export function NavBrand({ name, tagline }: NavBrandProps) {
  return (
    <div className="ui-nav-rail__brand">
      <div className="ui-nav-rail__brand-mark" />
      <div>
        <p className="ui-nav-rail__brand-name">{name}</p>
        <p className="ui-nav-rail__brand-tagline">{tagline}</p>
      </div>
    </div>
  );
}

export interface NavRailProps {
  brand: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
}

/** Persistent left navigation rail: brand, grouped entries, footer status. */
export function NavRail({ brand, footer, children }: NavRailProps) {
  return (
    <nav className="ui-nav-rail">
      {brand}
      <div className="ui-nav-rail__groups">{children}</div>
      {footer}
    </nav>
  );
}
