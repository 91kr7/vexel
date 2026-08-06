import './navigation.css';

export interface NavItemProps {
  glyph: string;
  label: string;
  active?: boolean;
  count?: number;
  onSelect?: () => void;
}

/** A single navigation entry: two-letter glyph, label, optional count badge. */
export function NavItem({ glyph, label, active = false, count, onSelect }: NavItemProps) {
  const classes = active ? 'ui-nav-item ui-nav-item--active' : 'ui-nav-item';
  return (
    <button type="button" className={classes} aria-current={active ? 'page' : undefined} onClick={onSelect}>
      <span className="ui-nav-item__glyph">{glyph}</span>
      <span className="ui-nav-item__label">{label}</span>
      {typeof count === 'number' ? <span className="ui-nav-item__badge">{count}</span> : null}
    </button>
  );
}
