import {
  Badge,
  Button,
  Card,
  CrossReference,
  DataTable,
  DefinitionList,
  ErrorBanner,
  MetaCell,
  SectionHeader,
  Stack,
  StateSummaryBar,
  TwoLineCell,
  type BadgeTone,
  type DataTableColumn,
  type DefinitionItem,
  type StatusTone,
} from '../ui';
import type { BaselineComparison, BaselineReport } from '../data/system-client';
import { useCoverage } from '../data/use-coverage';
import { screens } from '../shell/navigation';
import { useCrossNavigation } from '../shell/services/CrossNavigationService';
import type { CoverageArea, CoverageCounts, CoverageState } from './coverage-map';

const RAW_CONSOLE_SCREEN_ID = 'raw-console';

const STATE_LABEL: Record<CoverageState, string> = {
  'dedicated-screen': 'Dedicated screen',
  'console-only': 'Console only',
  'not-applicable': 'Not applicable',
};

const STATE_TONE: Record<CoverageState, BadgeTone> = {
  'dedicated-screen': 'success',
  'console-only': 'warning',
  'not-applicable': 'neutral',
};

const COMPARISON_TITLE: Record<BaselineComparison, string> = {
  match: 'The connected daemon matches the declared baseline',
  'daemon-newer': 'The connected daemon is newer than the declared baseline',
  'daemon-older': 'The connected daemon is older than the declared baseline',
  unknown: 'The connected daemon could not be compared to the declared baseline',
};

const COMPARISON_TONE: Record<BaselineComparison, StatusTone> = {
  match: 'success',
  'daemon-newer': 'warning',
  'daemon-older': 'warning',
  unknown: 'neutral',
};

function screenLabel(screenId: string): string {
  return screens.find((screen) => screen.id === screenId)?.label ?? screenId;
}

function baselineFacts(baseline: BaselineReport): string[] {
  const declared = `declared Engine API v${baseline.declared.engineApiVersion} · docker CLI ${baseline.declared.cliVersion}`;
  const daemon = baseline.daemon
    ? `daemon Engine API v${baseline.daemon.apiVersion} · docker ${baseline.daemon.version}`
    : (baseline.daemonUnavailableDetail ?? 'daemon not read');
  return [declared, daemon];
}

function baselineItems(baseline: BaselineReport): DefinitionItem[] {
  return [
    { label: 'Declared Engine API baseline', value: `v${baseline.declared.engineApiVersion}` },
    { label: 'Declared docker CLI baseline', value: baseline.declared.cliVersion },
    { label: 'Connected daemon Engine API', value: baseline.daemon ? `v${baseline.daemon.apiVersion}` : 'unavailable' },
    { label: 'Connected daemon version', value: baseline.daemon?.version ?? 'unavailable' },
    {
      label: 'Oldest Engine API the daemon accepts',
      value: baseline.daemon?.minApiVersion ? `v${baseline.daemon.minApiVersion}` : 'not reported',
    },
  ];
}

function coverageDescription(counts: CoverageCounts): string {
  return `${counts.total} capability areas · ${counts.dedicatedScreen} with a dedicated screen · ${counts.consoleOnly} reachable only through the raw console · ${counts.notApplicable} outside this product`;
}

/**
 * The Coverage matrix (REQ-105, REQ-106): every Docker capability area with the
 * state of its coverage and the way to reach it — its own screen, or the raw
 * console — and the baseline that statement holds against, next to the daemon
 * currently connected so a divergence between the two is visible.
 */
export function CoverageMatrixScreen() {
  const coverage = useCoverage();
  const { navigateTo } = useCrossNavigation();

  const columns: DataTableColumn<CoverageArea>[] = [
    {
      id: 'area',
      header: 'Capability area',
      width: '1.7fr',
      render: (area) => <TwoLineCell wrap title={area.name} subtitle={area.summary} />,
    },
    {
      id: 'state',
      header: 'Coverage',
      width: '160px',
      render: (area) => <Badge tone={STATE_TONE[area.state]}>{STATE_LABEL[area.state]}</Badge>,
    },
    {
      id: 'where',
      header: 'Where it lives',
      width: '210px',
      render: (area) => {
        const destination = area.state === 'dedicated-screen' ? area.screenId : area.state === 'console-only' ? RAW_CONSOLE_SCREEN_ID : undefined;
        if (!destination) return <CrossReference unavailableReason="no screen, no command" />;
        return (
          <CrossReference kind="screen" label={screenLabel(destination)} onNavigate={() => navigateTo({ screenId: destination })} />
        );
      },
    },
    {
      id: 'note',
      header: 'Command and reason',
      width: '2fr',
      render: (area) =>
        area.state === 'dedicated-screen' ? (
          <MetaCell />
        ) : (
          <Stack gap="var(--space-1)">
            {area.command ? <MetaCell wrap>{area.command}</MetaCell> : null}
            <TwoLineCell wrap subtitle={area.reason} />
          </Stack>
        ),
    },
  ];

  return (
    <Stack gap="var(--space-5)">
      <Card>
        <SectionHeader
          title="Coverage baseline"
          description="The Docker versions this coverage statement was written against, next to the daemon it is being shown for."
        />
        <Stack gap="var(--space-3)">
          {coverage.error ? (
            <ErrorBanner title="Could not read the coverage baseline" detail={coverage.error} onRetry={coverage.refresh} />
          ) : null}
          {coverage.baseline ? (
            <>
              <StateSummaryBar
                tone={COMPARISON_TONE[coverage.baseline.comparison]}
                title={COMPARISON_TITLE[coverage.baseline.comparison]}
                facts={baselineFacts(coverage.baseline)}
                actions={
                  <Button variant="ghost" onClick={coverage.refresh}>
                    Re-read
                  </Button>
                }
              />
              <DefinitionList columns={2} items={baselineItems(coverage.baseline)} />
            </>
          ) : (
            <StateSummaryBar tone="neutral" title={coverage.loaded ? 'The baseline could not be read' : 'Reading the baseline…'} />
          )}
        </Stack>
      </Card>

      <Card>
        <SectionHeader title="Docker capability coverage" description={coverageDescription(coverage.counts)} />
        <DataTable columns={columns} rows={coverage.areas} rowKey={(area) => area.id} rowHeight={64} autoRowHeight />
      </Card>
    </Stack>
  );
}
