import type { ReactNode } from 'react';
import { contentColumnsClassName, type ContentClass } from './content-columns';

export interface ContentColumnsProps {
  children?: ReactNode;
  /** Defaults to short scalar, the class of most property values. */
  contentClass?: ContentClass;
}

/**
 * Arranges a list of single values in as many columns as its own box can carry
 * at its content class's minimum band width.
 *
 * The label→value form of the same rule is `DefinitionList`, which shares this
 * arrangement rather than restating it.
 */
export function ContentColumns({ children, contentClass = 'short-scalar' }: ContentColumnsProps) {
  return <div className={contentColumnsClassName('value', contentClass)}>{children}</div>;
}
