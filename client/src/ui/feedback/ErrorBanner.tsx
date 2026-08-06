import { Surface } from '../glass/Surface';
import { IconButton } from '../controls/IconButton';
import { Row } from '../layout/Row';
import './feedback.css';

export interface ErrorBannerProps {
  title: string;
  detail?: string;
  onDismiss?: () => void;
}

/** Inline failure banner; shows the upstream error message verbatim in `detail`. */
export function ErrorBanner({ title, detail, onDismiss }: ErrorBannerProps) {
  return (
    <Surface elevation="flat" padding="md">
      <div className="ui-error-banner">
        <Row justify="between" align="center">
          <p className="ui-error-banner__title">{title}</p>
          {onDismiss ? (
            <IconButton label="Dismiss error" onClick={onDismiss}>
              ×
            </IconButton>
          ) : null}
        </Row>
        {detail ? <p className="ui-error-banner__detail">{detail}</p> : null}
      </div>
    </Surface>
  );
}
