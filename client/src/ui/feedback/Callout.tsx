import type { ReactNode } from 'react';
import { Surface } from '../glass/Surface';
import { Row } from '../layout/Row';
import './feedback.css';

export type CalloutTone = 'info' | 'warning';

export interface CalloutProps {
  tone?: CalloutTone;
  title?: string;
  children: ReactNode;
}

/**
 * Persistent explanatory banner (e.g. a heuristic-signal disclaimer): never
 * dismissible and never reports a failure — ErrorBanner covers that case.
 */
export function Callout({ tone = 'info', title, children }: CalloutProps) {
  const classes = tone === 'info' ? 'ui-callout' : `ui-callout ui-callout--tone-${tone}`;
  return (
    <Surface elevation="flat" padding="md">
      <div className={classes}>
        <Row gap="var(--space-3)" align="start">
          <span className="ui-callout__glyph" aria-hidden="true">
            {tone === 'warning' ? '!' : 'i'}
          </span>
          <div className="ui-callout__body">
            {title ? <p className="ui-callout__title">{title}</p> : null}
            <div className="ui-callout__content">{children}</div>
          </div>
        </Row>
      </div>
    </Surface>
  );
}
