import type { ReactNode } from 'react';
import { Row } from '../layout/Row';
import './controls.css';

export interface ControlGroupProps {
  label: string;
  children?: ReactNode;
}

/**
 * A labelled group of controls on a toolbar row: the label says what the
 * controls have in common, and the group is the block the row wraps by.
 *
 * The controls sit on the library's own row so that a control sizing itself by
 * the axis it was placed on — the stream search band — reads the same axis
 * inside a group as it does directly on a row.
 */
export function ControlGroup({ label, children }: ControlGroupProps) {
  return (
    <div className="ui-control-group">
      <span className="ui-control-group__label">{label}</span>
      <Row align="center" gap="var(--space-2)" wrap>
        {children}
      </Row>
    </div>
  );
}
