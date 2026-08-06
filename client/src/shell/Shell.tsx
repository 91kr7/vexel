import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  ErrorBanner,
  EventStream,
  FooterStatus,
  Frame,
  KeyHint,
  NavBrand,
  NavGroup,
  NavItem,
  NavRail,
  PageHeader,
  Row,
  SectionHeader,
  Stack,
  StatusPill,
  ToastProvider,
  type StatusTone,
} from '../ui';
import { defaultScreenId, navGroupOrder, screens } from './navigation';
import { PlaceholderScreen } from './screens/PlaceholderScreen';
import { ConfirmationProvider } from './services/ConfirmationService';
import { useConnectionStatus } from './services/ConnectionStatusService';
import { useDaemonEventStream } from './services/EventStreamService';
import { useErrorReporter } from './services/ErrorReportingService';
import { useProgress } from './services/ProgressService';

function connectionTone(reachable: boolean, unavailableCapabilities: string[]): StatusTone {
  if (!reachable) return 'danger';
  return unavailableCapabilities.length > 0 ? 'warning' : 'success';
}

function cliBadgeLabel(name: string, status: { available: boolean; version?: string }): string {
  return status.available ? `${name} ${status.version}` : `${name} not found`;
}

/**
 * "Vessel — Docker Control" shell: rail, header, footer stay in place while
 * the content area is replaced by the active screen (REQ-1, REQ-2).
 *
 * Owns the toast and confirmation services itself (screen-local concerns);
 * error-reporting, progress, connection status and the event stream are
 * supplied by the caller (App), so other code can observe them independently
 * of the shell chrome.
 */
export function Shell() {
  const [activeId, setActiveId] = useState(defaultScreenId);
  const { errors, dismissError } = useErrorReporter();
  const { pending } = useProgress();
  const connection = useConnectionStatus();
  const { events } = useDaemonEventStream();

  const activeScreen = screens.find((screen) => screen.id === activeId) ?? screens[0];

  const statusTone: StatusTone = pending.length > 0 ? 'warning' : connectionTone(connection.daemon.reachable, connection.unavailableCapabilities);
  const statusLabel = pending.length > 0
    ? `${pending.length} pending`
    : connection.daemon.reachable
      ? 'Live · daemon events'
      : 'Daemon unreachable';

  const eventEntries = events.map((event) => ({
    id: event.id,
    timestamp: new Date(event.timestamp).toLocaleTimeString([], { hour12: false }),
    type: event.type,
    action: event.action,
    summary: event.actor,
  }));

  return (
    <ToastProvider>
      <ConfirmationProvider>
        <Frame
          rail={
            <NavRail
              brand={<NavBrand name="Vessel" tagline="Docker control" />}
              footer={<FooterStatus label="Active context" value="default (local)" />}
            >
              {navGroupOrder.map((group) => (
                <NavGroup key={group} label={group}>
                  {screens
                    .filter((screen) => screen.group === group)
                    .map((screen) => (
                      <NavItem
                        key={screen.id}
                        glyph={screen.glyph}
                        label={screen.label}
                        active={screen.id === activeScreen.id}
                        onSelect={() => setActiveId(screen.id)}
                      />
                    ))}
                </NavGroup>
              ))}
            </NavRail>
          }
          header={
            <PageHeader
              title={activeScreen.title}
              description={activeScreen.description}
              actions={
                <Row align="center" gap="var(--space-2)" wrap>
                  <StatusPill
                    tone={statusTone}
                    action={!connection.daemon.reachable ? { label: 'Retry', onClick: connection.retry } : undefined}
                  >
                    {statusLabel}
                  </StatusPill>
                  {connection.apiVersion ? <Badge>{`Engine API v${connection.apiVersion}`}</Badge> : null}
                  <Button variant="ghost">
                    <KeyHint keys="⌘K" /> Search
                  </Button>
                  <Button variant="secondary">Console</Button>
                </Row>
              }
            />
          }
        >
          <Stack gap="var(--space-5)">
            {errors.map((error) => (
              <ErrorBanner key={error.id} title={error.title} detail={error.detail} onDismiss={() => dismissError(error.id)} />
            ))}
            {!connection.daemon.reachable ? (
              <ErrorBanner
                title="Daemon unreachable"
                detail={connection.daemon.cause ?? 'The application could not reach the Docker daemon of the active context.'}
                onRetry={connection.retry}
              />
            ) : null}
            <Card>
              <SectionHeader
                title="CLI availability"
                description={
                  connection.unavailableCapabilities.length > 0
                    ? connection.unavailableCapabilities.join(' ')
                    : 'docker, compose and buildx are all available.'
                }
              />
              <Row gap="var(--space-3)" wrap>
                <Badge tone={connection.cli.docker.available ? 'success' : 'danger'}>{cliBadgeLabel('docker', connection.cli.docker)}</Badge>
                <Badge tone={connection.cli.compose.available ? 'success' : 'danger'}>{cliBadgeLabel('compose', connection.cli.compose)}</Badge>
                <Badge tone={connection.cli.buildx.available ? 'success' : 'danger'}>{cliBadgeLabel('buildx', connection.cli.buildx)}</Badge>
              </Row>
            </Card>
            <Card title="Daemon event stream">
              <EventStream entries={eventEntries} emptyLabel="No daemon events yet." />
            </Card>
            <PlaceholderScreen screenLabel={activeScreen.label} />
          </Stack>
        </Frame>
      </ConfirmationProvider>
    </ToastProvider>
  );
}
