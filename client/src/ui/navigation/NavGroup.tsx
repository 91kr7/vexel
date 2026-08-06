import type { ReactNode } from 'react';
import './navigation.css';

export interface NavGroupProps {
  label: string;
  children?: ReactNode;
}

/** Labeled group of navigation entries (e.g. "Workloads", "Artifacts"). */
export function NavGroup({ label, children }: NavGroupProps) {
  return (
    <div>
      <p className="ui-nav-group__label">{label}</p>
      <div className="ui-nav-group__items">{children}</div>
    </div>
  );
}
