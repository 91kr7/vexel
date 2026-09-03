import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Badge,
  Card,
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
  type StatusTone,
} from '../ui';
import { clearAnalysisCache, fetchAnalysisCacheUsage } from '../data/preferences-client';
import { reloadWhenChannelReturns } from '../data/reload-signal';
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
 * "Vexel — Docker Control" shell: rail, header and footer stay in place while the content area is
 * replaced by the active screen (REQ-1, REQ-2). It draws no failure of its own and subscribes to no
 * event stream (…-inline_error_panels/REQ-2, plan-ui-coherence-optimisation/REQ-71).
 */
export function Shell() {
  const [activeId, setActiveId] = useState(defaultScreenId);
  const { pending } = useProgress();
  const connection = useConnectionStatus();
  const { preferences, loaded: preferencesLoaded, updatePreferences } = usePreferences();
  const { request: crossNavigationRequest } = useCrossNavigation();
  const containers = useContainers();
  const images = useImages();
  const compose = useComposeProjects();
  const contexts = useContexts();
  const [cacheUsage, setCacheUsage] = useState<number | undefined>(undefined);
  // Guards a second restore, and a slow preferences read yanking the operator off the screen they
  // have already chosen (REQ-2, REQ-115).
  const screenSettledRef = useRef(false);

  // Restore the last active screen once preferences have loaded (REQ-115).
  useEffect(() => {
    if (!preferencesLoaded || screenSettledRef.current) return;
    screenSettledRef.current = true;
    if (preferences.lastScreenId && screens.some((screen) => screen.id === preferences.lastScreenId)) {
      setActiveId(preferences.lastScreenId);
    }
  }, [preferencesLoaded, preferences.lastScreenId]);

  // A connection that comes back reads every mounted view again (plan-docker_management_app-inline_error_panels/REQ-12).
  useEffect(() => reloadWhenChannelReturns(), []);

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

  // A cross-reference followed from another screen brings its own screen into view (REQ-68, REQ-69).
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
  // The report names which side is gone (plan-docker_management_app-inline_error_panels/REQ-9).
  const statusLabel = pending.length > 0
    ? `${pending.length} pending`
    : connection.unreachable === 'server'
      ? 'Server unreachable'
      : connection.unreachable === 'daemon'
        ? 'Docker daemon unreachable'
        : 'Live · daemon events';

  return (
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
          {activeScreen.id === 'dashboard' ? (
            <DashboardScreen containers={containers.containers} containersLoaded={containers.loaded} containersError={containers.error} />
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
            // CLI availability (REQ-110) and the analysis cache (REQ-113) have no other surface in
            // the application, and keep this one (plan-ui-coherence-optimisation/REQ-70, /REQ-71).
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
            // The fallback for an active id naming no screen at all.
            <PlaceholderScreen screenLabel={activeScreen.label} />
          )}
        </Stack>
      </Frame>
    </ConfirmationProvider>
  );
}
