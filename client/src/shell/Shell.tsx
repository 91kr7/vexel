import { useCallback, useEffect, useRef, useState } from 'react';
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
  StorageUsageRow,
  ToastProvider,
  type StatusTone,
} from '../ui';
import { clearAnalysisCache, fetchAnalysisCacheUsage } from '../data/preferences-client';
import { usePreferences } from '../data/use-preferences';
import { useContainers } from '../data/use-containers';
import { useImages } from '../data/use-images';
import { useVolumes } from '../data/use-volumes';
import { ContainersScreen } from '../containers/ContainersScreen';
import { ImagesScreen } from '../images/ImagesScreen';
import { VolumesNetworksScreen } from '../volumes-networks/VolumesNetworksScreen';
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)}${units[unitIndex]}`;
}

/**
 * "Vexel — Docker Control" shell: rail, header, footer stay in place while
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
  const { preferences, loaded: preferencesLoaded, updatePreferences } = usePreferences();
  const containers = useContainers();
  const images = useImages();
  const volumes = useVolumes();
  const [cacheUsage, setCacheUsage] = useState<number | undefined>(undefined);
  // Set as soon as the restore has had its chance — either because it ran, or
  // because the operator picked a screen first. Guards both against a second
  // restore and against a slow preferences read yanking the operator off the
  // screen they have already chosen (REQ-2, REQ-115).
  const screenSettledRef = useRef(false);

  // Restore the last active screen once preferences have loaded (REQ-115).
  useEffect(() => {
    if (!preferencesLoaded || screenSettledRef.current) return;
    screenSettledRef.current = true;
    if (preferences.lastScreenId && screens.some((screen) => screen.id === preferences.lastScreenId)) {
      setActiveId(preferences.lastScreenId);
    }
  }, [preferencesLoaded, preferences.lastScreenId]);

  const refreshCacheUsage = useCallback(() => {
    fetchAnalysisCacheUsage()
      .then((usage) => setCacheUsage(usage.totalSizeBytes))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    refreshCacheUsage();
  }, [refreshCacheUsage]);

  const selectScreen = useCallback(
    (id: string) => {
      screenSettledRef.current = true;
      setActiveId(id);
      updatePreferences({ lastScreenId: id });
    },
    [updatePreferences],
  );

  const handleClearCache = useCallback(() => {
    clearAnalysisCache().then(refreshCacheUsage).catch(() => undefined);
  }, [refreshCacheUsage]);

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
              brand={<NavBrand name="Vexel" tagline="Docker control" />}
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
                        count={
                          screen.id === 'containers'
                            ? containers.containers.length
                            : screen.id === 'images-layers'
                              ? images.images.length
                              : undefined
                        }
                        onSelect={() => selectScreen(screen.id)}
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
            {activeScreen.id === 'containers' ? (
              <ContainersScreen
                containers={containers.containers}
                loaded={containers.loaded}
                error={containers.error}
                onRefresh={containers.refresh}
                images={images.images}
                imagesLoaded={images.loaded}
              />
            ) : activeScreen.id === 'images-layers' ? (
              <ImagesScreen images={images.images} loaded={images.loaded} error={images.error} onRefresh={images.refresh} />
            ) : activeScreen.id === 'volumes-networks' ? (
              <VolumesNetworksScreen
                volumes={{ volumes: volumes.volumes, loaded: volumes.loaded, error: volumes.error, onRefresh: volumes.refresh }}
              />
            ) : (
              <>
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
                <Card title="Local storage">
                  <StorageUsageRow
                    label="Analysis cache"
                    description="Cached image extraction and layer-analysis results"
                    sizeLabel={cacheUsage === undefined ? '—' : formatBytes(cacheUsage)}
                    action={{ label: 'Clear', onClick: handleClearCache, disabled: !cacheUsage }}
                  />
                </Card>
                <PlaceholderScreen screenLabel={activeScreen.label} />
              </>
            )}
          </Stack>
        </Frame>
      </ConfirmationProvider>
    </ToastProvider>
  );
}
