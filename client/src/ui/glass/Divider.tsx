import './divider.css';

export interface DividerProps {
  orientation?: 'horizontal' | 'vertical';
}

/** Hairline separator between sections or list rows. */
export function Divider({ orientation = 'horizontal' }: DividerProps) {
  const classes = orientation === 'vertical' ? 'ui-divider ui-divider--vertical' : 'ui-divider';
  return <hr className={classes} />;
}
