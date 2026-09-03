import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Badge,
  Card,
  ErrorBanner,
  FooterStatus,
  Frame,
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
import { useComposeProjects } from '../data/use-compose-projects';
import { useContexts } from '../data/use-contexts';
import { ComposeScreen } from '../compose/ComposeScreen';
import { ContextsScreen } from '../contexts/ContextsScreen';
import { CoverageMatrixScreen } from '../coverage/CoverageMatrixScreen';
import { DashboardScreen } from '../dashboard/DashboardScreen';
import { BuildersScreen } from '../builders/BuildersScreen';
import { ContainersScreen } from '../containers/ContainersScreen';
import { ImagesScreen } from '../images/ImagesScreen';
import { PluginsScreen } from '../plugins/PluginsScreen';
import { RawConsoleScreen } from '../console/RawConsoleScreen';
import { RegistriesScreen } from '../registries/RegistriesScreen';
import { SystemScreen } from '../system/SystemScreen';
import { VolumesNetworksScreen } from '../volumes-networks/VolumesNetworksScreen';
import { NetworksPanel } from '../volumes-networks/NetworksPanel';
import { AboutNotice } from './AboutNotice';
import { defaultScreenId, navGroupOrder, screens } from './navigation';
import { RefreshControl } from './RefreshControl';
import { PlaceholderScreen } from './screens/PlaceholderScreen';
import { ConfirmationProvider } from './services/ConfirmationService';
import { useConnectionStatus } from './services/ConnectionStatusService';
import { useCrossNavigation } from './services/CrossNavigationService';
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
 * error-reporting, progress and connection status are supplied by the caller
 * (App), so other code can observe them independently of the shell chrome.
 *
 * It subscribes to no daemon event stream: the stream is the Dashboard's, and
 * the card that repeated it here is gone (plan-ui-coherence-optimisation/REQ-71).
 * `DaemonEventStreamProvider` stays mounted in `App` for the Dashboard and the
 * invalidation registry — one consumer stopped, nothing else moved.
 */
export function Shell() {
  const [activeId, setActiveId] = useState(defaultScreenId);
  const { errors, dismissError } = useErrorReporter();
  const { pending } = useProgress();
  const connection = useConnectionStatus();
  const { preferences, loaded: preferencesLoaded, updatePreferences } = usePreferences();
  const { request: crossNavigationRequest } = useCrossNavigation();
  const containers = useContainers();
  const images = useImages();
  const compose = useComposeProjects();
  const contexts = useContexts();
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

  // A cross-reference followed from another screen brings its own screen into
  // view (REQ-68, REQ-69); the destination screen then reveals the object and
  // acknowledges the request itself.
  useEffect(() => {
    if (!crossNavigationRequest) return;
    selectScreen(crossNavigationRequest.screenId);
  }, [crossNavigationRequest, selectScreen]);

  const handleClearCache = useCallback(() => {
    clearAnalysisCache().then(refreshCacheUsage).catch(() => undefined);
  }, [refreshCacheUsage]);

  const activeScreen = screens.find((screen) => screen.id === activeId) ?? screens[0];

  // The context every screen currently follows, named in the footer (REQ-93);
  // it changes as soon as the operator switches from the Contexts screen.
  const activeContextLabel = contexts.active ? `${contexts.active.name} (${contexts.active.kind})` : '—';

  const statusTone: StatusTone = pending.length > 0 ? 'warning' : connectionTone(connection.daemon.reachable, connection.unavailableCapabilities);
  const statusLabel = pending.length > 0
    ? `${pending.length} pending`
    : connection.daemon.reachable
      ? 'Live · daemon events'
      : 'Daemon unreachable';

  return (
    <ToastProvider>
      <ConfirmationProvider>
        <Frame
          rail={
            <NavRail
              brand={<NavBrand name="Vexel" tagline="Docker control" />}
              footer={<FooterStatus label="Active context" value={activeContextLabel} />}
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
                              : screen.id === 'compose'
                                ? compose.projects.length
                                : screen.id === 'contexts'
                                  ? contexts.contexts.length
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
                  {/* First in the group, so the pill and the version badge keep
                      the coordinates they had (REQ-15). */}
                  <RefreshControl />
                  <StatusPill
                    tone={statusTone}
                    action={!connection.daemon.reachable ? { label: 'Retry', onClick: connection.retry } : undefined}
                  >
                    {statusLabel}
                  </StatusPill>
                  {connection.apiVersion ? <Badge>{`Engine API v${connection.apiVersion}`}</Badge> : null}
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
            {activeScreen.id === 'dashboard' ? (
              <DashboardScreen
                containers={containers.containers}
                containersLoaded={containers.loaded}
                containersError={containers.error}
                onRefreshContainers={containers.refresh}
              />
            ) : activeScreen.id === 'containers' ? (
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
            ) : activeScreen.id === 'compose' ? (
              <ComposeScreen projects={compose.projects} loaded={compose.loaded} error={compose.error} onRefresh={compose.refresh} />
            ) : activeScreen.id === 'volumes-networks' ? (
              <VolumesNetworksScreen networksPanel={<NetworksPanel />} />
            ) : activeScreen.id === 'registries' ? (
              <RegistriesScreen />
            ) : activeScreen.id === 'builders-cache' ? (
              <BuildersScreen />
            ) : activeScreen.id === 'contexts' ? (
              <ContextsScreen />
            ) : activeScreen.id === 'plugins' ? (
              <PluginsScreen />
            ) : activeScreen.id === 'system-prune' ? (
              <SystemScreen />
            ) : activeScreen.id === 'raw-console' ? (
              <RawConsoleScreen />
            ) : activeScreen.id === 'coverage-matrix' ? (
              // The shell's own cards keep the home they have always had: the
              // last entry of the navigation. CLI availability (REQ-110) and
              // the analysis cache's size and clear action (REQ-113) have no
              // other surface in the application. The daemon event stream had
              // one — the Dashboard's, which it repeated verbatim — and it is
              // stated there alone (plan-ui-coherence-optimisation/REQ-71).
              // Every section here is titled by the one section-header
              // treatment (plan-ui-coherence-optimisation/REQ-70).
              <>
                <AboutNotice />
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
                <Card>
                  <SectionHeader title="Local storage" />
                  <StorageUsageRow
                    label="Analysis cache"
                    description="Cached image extraction and layer-analysis results"
                    sizeLabel={cacheUsage === undefined ? '—' : formatBytes(cacheUsage)}
                    action={{ label: 'Clear', onClick: handleClearCache, disabled: !cacheUsage }}
                  />
                </Card>
                <CoverageMatrixScreen />
              </>
            ) : (
              // No screen of the navigation data is left without its own
              // content; this is the fallback for an id that names none of
              // them.
              <PlaceholderScreen screenLabel={activeScreen.label} />
            )}
          </Stack>
        </Frame>
      </ConfirmationProvider>
    </ToastProvider>
  );
}
