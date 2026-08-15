import type { ReactNode } from 'react';
import './feedback.css';

export interface EmptyStateProps {
  /** What is empty, in the operator's words. */
  title: string;
  /**
   * Why it is empty, or what it would take to fill it — **required**, and `null`
   * only where the title genuinely says everything there is to say.
   *
   * Required rather than optional because the three empty-state treatments this
   * product shipped were never three components: they were this one rendering
   * whichever subset each caller happened to fill in, and an optional prop is
   * what let a caller stop at a title without deciding to. Written out, `null`
   * is a decision a reader can see and a later batch can find; omitted, it was
   * a default nobody took.
   */
  description: string | null;
  /**
   * The control that resolves the condition — **required**, and `null` where
   * nothing the operator can do from here would resolve it (a list that is
   * empty because a filter excludes everything, a subsystem that is simply
   * idle). Same reason as above: the absence of the way out is a decision, not
   * an omission.
   */
  action: ReactNode | null;
  /**
   * Compact: the height of its own content, at the top of the space it is given
   * — for a placeholder inside a pane, where the full-height, centred
   * presentation reads as a void the pane could not fill. Screens and lists keep
   * the default.
   */
  compact?: boolean;
}

/**
 * The one placeholder for a screen, a list or a pane with nothing to display.
 *
 * It is the single answer to "what does an empty result look like": there is no
 * variant that renders bare text, and the explanation and the resolving action
 * are props a caller must answer rather than props a caller may skip.
 */
export function EmptyState({ title, description, action, compact = false }: EmptyStateProps) {
  return (
    <div className={compact ? 'ui-empty-state ui-empty-state--compact' : 'ui-empty-state'}>
      <p className="ui-empty-state__title">{title}</p>
      {description ? <p className="ui-empty-state__description">{description}</p> : null}
      {action}
    </div>
  );
}
