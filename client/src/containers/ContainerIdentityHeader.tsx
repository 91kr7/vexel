import { Badge, IdentifierCell, Row, SectionHeader, StatusDotCell } from '../ui';
import type { ContainerSummary } from '../data/containers-client';
import { STATE_TONE, readHealthOutcome } from './container-status';

export interface ContainerIdentityHeaderProps {
  /** The container as the list last carried it; the header states these values and reads nothing of its own. */
  container: ContainerSummary;
}

/** One container's identity as a dialog's title: state dot, name, state pill, health pill when the daemon states an outcome, short id. */
export function ContainerIdentityHeader({ container }: ContainerIdentityHeaderProps) {
  const tone = STATE_TONE[container.state];
  const health = readHealthOutcome(container.status);

  return (
    <Row truncating wrap align="center" gap="var(--space-3)">
      <StatusDotCell tone={tone} />
      <SectionHeader title={container.name} truncate />
      <Badge tone={tone}>{container.state.toUpperCase()}</Badge>
      {/* Absent, not empty: a container with no health check leaves no gap here. */}
      {health ? <Badge tone={health.tone}>{health.label}</Badge> : null}
      <IdentifierCell value={container.shortId} />
    </Row>
  );
}
