import type { ReactNode } from 'react';
import './controls.css';

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

/**
 * `quiet` drops the fill and renders the label in muted monospace: a secondary
 * attribute of an object (a node's availability next to its role) that must not
 * read as a second pill competing with the first.
 */
export type BadgeVariant = 'solid' | 'quiet';

export interface BadgeProps {
  children?: ReactNode;
  tone?: BadgeTone;
  variant?: BadgeVariant;
}

/**
 * Small tag/count label, also used as a status/lifecycle indicator — and a
 * statement, never a control.
 *
 * It used to offer a click handler that rendered it as a `<button>`, told apart
 * from a plain label by a hover fill and nothing else. That is precisely the
 * affordance `plan-ui-coherence-optimisation/REQ-27` forbids, and its only call
 * site anywhere was inside the retired card list, so it went with it (REQ-82):
 * a dead prop is untidy, a dead prop that manufactures a banned affordance in
 * one line is a trap. A caller that wants a pill the operator can press asks
 * `ActionButtonGroup` for an action with a weight.
 */
export function Badge({ children, tone = 'neutral', variant = 'solid' }: BadgeProps) {
  const classes = ['ui-badge', variant === 'quiet' ? 'ui-badge--quiet' : '', tone === 'neutral' ? '' : `ui-badge--tone-${tone}`]
    .filter(Boolean)
    .join(' ');
  return <span className={classes}>{children}</span>;
}
