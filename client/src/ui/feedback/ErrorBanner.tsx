import { Surface } from '../glass/Surface';
import { Button } from '../controls/Button';
import { IconButton } from '../controls/IconButton';
import { Row } from '../layout/Row';
import './feedback.css';

export interface ErrorBannerProps {
  title: string;
  detail?: string;
  onDismiss?: () => void;
  /** When provided, renders a retry Button next to the dismiss action. */
  onRetry?: () => void;
  retryLabel?: string;
}

/** Inline failure banner; shows the upstream error message verbatim in `detail`. */
export function ErrorBanner({ title, detail, onDismiss, onRetry, retryLabel = 'Retry' }: ErrorBannerProps) {
  return (
    <Surface elevation="flat" padding="md">
      <div className="ui-error-banner">
        <Row justify="between" align="center">
          <p className="ui-error-banner__title">{title}</p>
          <Row gap="var(--space-2)" align="center">
            {onRetry ? (
              <Button variant="secondary" onClick={onRetry}>
                {retryLabel}
              </Button>
            ) : null}
            {onDismiss ? (
              <IconButton label="Dismiss error" onClick={onDismiss}>
                ×
              </IconButton>
            ) : null}
          </Row>
        </Row>
        {detail ? <p className="ui-error-banner__detail">{detail}</p> : null}
      </div>
    </Surface>
  );
}
