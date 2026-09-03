import { useCallback, useEffect, useState } from 'react';
import {
  ActionButtonGroup,
  Badge,
  BadgeListCell,
  Button,
  Card,
  CodeEditor,
  DataTable,
  DetailPanel,
  EmptyState,
  LogStream,
  MetaCell,
  Row,
  SectionHeader,
  Stack,
  Stepper,
  Tabs,
  TwoLineCell,
  useToast,
  type BadgeTone,
  type DataTableColumn,
  type LogStreamLine,
  type TabItem,
} from '../ui';
import type { ComposeProjectSummary, ComposeProjectState, ComposeServiceSummary } from '../data/compose-client';
import { useComposeFile } from '../data/use-compose-file';
import { useComposeLifecycle } from '../data/use-compose-lifecycle';
import { useComposeLogs } from '../data/use-compose-logs';
import { useConfirmation } from '../shell/services/ConfirmationService';
import { useErrorReporter } from '../shell/services/ErrorReportingService';
import { useFailureReport } from '../shell/services/use-failure-report';
import { FailedReadEmptyState } from '../shell/FailedReadEmptyState';

export interface ComposeScreenProps {
  projects: ComposeProjectSummary[];
  loaded: boolean;
  error?: string;
  onRefresh: () => void;
}

/** Which view of a project the detail panel is showing. */
type ProjectView = 'file' | 'logs';

const PROJECT_VIEWS: TabItem[] = [
  { id: 'file', label: 'Compose file' },
  { id: 'logs', label: 'Aggregated logs' },
];

/** What a project appearing here takes, for the list that holds none. */
const NO_PROJECTS =
  'A project is listed here once it has been brought up on this daemon: it is discovered from the labels its own containers carry, never from a path typed here.';

function projectTone(state: ComposeProjectState): BadgeTone {
  if (state === 'running') return 'success';
  if (state === 'partial') return 'warning';
  if (state === 'stopped') return 'neutral';
  return 'danger';
}

function stateLabel(state: ComposeProjectState): string {
  if (state === 'running') return 'Up';
  if (state === 'partial') return 'Partial';
  if (state === 'stopped') return 'Down';
  return 'Unknown';
}

function runningServices(project: ComposeProjectSummary): number {
  return project.services.filter((service) => service.state === 'running').length;
}

function basename(path: string): string {
  const segments = path.split(/[\\/]/);
  return segments[segments.length - 1] || path;
}

function formatTimestamp(timestamp: string | undefined): string | undefined {
  if (!timestamp) return undefined;
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? timestamp : new Date(parsed).toLocaleTimeString([], { hour12: false });
}

/**
 * The Compose screen (REQ-75, REQ-76, REQ-77, REQ-78): every discovered
 * project with its per-service state, up/down/restart and per-service
 * replica scaling, the selected project's compose file(s) — editable,
 * validated on demand, saved back to disk after confirmation — and its
 * aggregated live logs labelled per service.
 *
 * **One list, one paradigm** (plan-ui-coherence-optimisation/REQ-49): the
 * projects are rows of the object list and each project's services are a nested
 * header-less list in the row's own content slot, so the grouping survives while
 * the rows, the columns, the action cluster and the truncation contract are the
 * ones every other screen draws. `GroupedRowsPanel` — the product's third answer
 * to "how is an object listed", and this screen's alone — leaves the library with
 * this migration.
 *
 * **And it is the containers table** (`.../classic-table/REQ-19`, REQ-39,
 * REQ-40): one header over a continuous run of ruled rows, the parent row of the
 * reference's own height and alignment and stating no modifier of its own, the
 * table edge to edge in an unpadded card holding it and nothing else. What tells
 * a project from its services is the indentation the library draws for a nested
 * list — never a surface, which is the presentation this plan retires.
 *
 * **The side-by-side pair is gone with it**
 * (plan-ui-coherence-optimisation/REQ-50). Two reasons, and the second is the
 * decisive one: the fixed `2fr 1fr` template never collapsed, so at 375×812 its
 * second column resolved shrink-to-fit and the two empty states in it measured
 * 48px wide — `2 × --space-6` of padding around a content box of zero width,
 * their titles wrapping one character per line; and the column's two regions,
 * the compose file and the aggregated logs, are now views of the selected
 * project inside its own detail panel, so the pair has **one child** and is not
 * a pair at all. Collapsing it with `arrangement="pair"` would have repaired the
 * phone and left the panel at a third of the screen.
 */
export function ComposeScreen({ projects, loaded, error, onRefresh }: ComposeScreenProps) {
  const [selectedName, setSelectedName] = useState<string | undefined>(undefined);
  const [projectView, setProjectView] = useState<ProjectView>('file');
  const [activeFilePath, setActiveFilePath] = useState<string | undefined>(undefined);

  const { confirm } = useConfirmation();
  const { push } = useToast();
  const { reportError } = useErrorReporter();

  const handleResult = useCallback(() => onRefresh(), [onRefresh]);
  const handleCommandError = useCallback((message: string) => reportError('Compose command failed', message), [reportError]);
  const lifecycle = useComposeLifecycle(handleResult, handleCommandError);
  const busyProjects = lifecycle.runningProjects;

  // A project that has gone from the daemon takes its panel with it.
  useEffect(() => {
    if (selectedName === undefined || projects.some((project) => project.name === selectedName)) return;
    setSelectedName(undefined);
  }, [projects, selectedName]);

  const selectedProject = projects.find((project) => project.name === selectedName);
  const composeFile = useComposeFile(selectedProject?.name);
  const logs = useComposeLogs(selectedProject?.name);

  // The hook holds one `error` for the read and the save alike; the save reports its own.
  useFailureReport('Could not read the compose file', composeFile.files.length === 0 ? composeFile.error : undefined);
  useFailureReport('The log stream was interrupted', logs.error);

  useEffect(() => {
    setActiveFilePath(composeFile.files[0]?.path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject?.name, composeFile.files.length]);

  const activeFile = composeFile.files.find((file) => file.path === activeFilePath) ?? composeFile.files[0];

  /**
   * The one way the selection changes, and therefore the one place the compose
   * buffer can be discarded: the row that opens the panel, the row that closes
   * it again, another project's row, and the panel's own `Escape` all arrive
   * here.
   *
   * **The guard, not a second dismissal.** The panel dismisses exactly as every
   * other one in the product does — the opening gesture and `Escape`, no close
   * control — and the editable buffer is protected by the confirmation the
   * product already uses for anything that destroys work. `DetailPanel` never
   * closes itself: it asks its caller to, and the caller owns the state, so a
   * panel that may refuse to close needs nothing from the library.
   */
  async function requestSelect(next: string | undefined) {
    if (next === selectedName) return;
    if (composeFile.dirtyPaths.length > 0) {
      const confirmed = await confirm({
        targetName: composeFile.dirtyPaths.map(basename).join(', '),
        consequence: 'The unsaved changes to this project’s compose file are discarded; the file on disk is left as it is.',
        confirmLabel: 'Discard changes',
      });
      if (!confirmed) return;
    }
    setSelectedName(next);
  }

  async function handleUpOrDown(project: ComposeProjectSummary) {
    if (project.state === 'stopped' || project.state === 'unknown') {
      await lifecycle.up(project.name);
      return;
    }
    const confirmed = await confirm({
      targetName: project.name,
      consequence: 'This stops and removes every container of this stack.',
      confirmLabel: 'Down',
    });
    if (!confirmed) return;
    await lifecycle.down(project.name);
  }

  async function handleSave() {
    if (!activeFile) return;
    const confirmed = await confirm({
      targetName: basename(activeFile.path),
      consequence: 'This overwrites the compose file on disk.',
      confirmLabel: 'Save',
      destructive: false,
    });
    if (!confirmed) return;
    const saved = await composeFile.save(activeFile.path);
    if (saved) push({ title: `${basename(activeFile.path)} saved`, tone: 'success' });
    else if (composeFile.error) reportError('Could not save the compose file', composeFile.error);
  }

  /**
   * A service's row, in the nested list every project row carries: the group's
   * children rendered by the same list as the group itself. Every cell is a
   * fixed number of lines whatever the service's state, so a service without an
   * image costs its row no height. The project is the columns' argument because
   * a service carries its own name and not its stack's, and both are needed to
   * scale it.
   */
  function serviceColumns(project: ComposeProjectSummary): DataTableColumn<ComposeServiceSummary>[] {
    const busy = busyProjects.includes(project.name);
    return [
      {
        id: 'service',
        header: 'SERVICE',
        width: '1.4fr',
        render: (service) => <TwoLineCell title={service.name} />,
      },
      {
        id: 'state',
        header: 'STATE',
        // The daemon's own word for the service's state, in a tone and in words.
        width: '116px',
        render: (service) => <BadgeListCell labels={[service.state]} tone={service.state === 'running' ? 'success' : 'neutral'} />,
      },
      {
        id: 'image',
        header: 'IMAGE',
        width: '2fr',
        render: (service) => <MetaCell>{service.image}</MetaCell>,
      },
      {
        id: 'replicas',
        header: 'REPLICAS',
        // The stepper's own track, plus the word that names what it counts: this
        // list draws no header, so the label travels with the control.
        width: '164px',
        render: (service) => (
          <Row gap="var(--space-2)" align="center">
            <Badge>replicas</Badge>
            <Stepper
              value={service.replicas}
              onChange={(value) => void lifecycle.scale(project.name, service.name, value)}
              min={0}
              disabled={busy}
              ariaLabel={`${service.name} replicas`}
            />
          </Row>
        ),
      },
    ];
  }


  /**
   * A project's row. The discovered compose file paths and the daemon's own
   * refusal to read the project shared one subtitle line, which is the value
   * whose presence depends on the project: each is a column here, where an
   * absent one is the column's own '–' and costs the row no height.
   */
  const projectColumns: DataTableColumn<ComposeProjectSummary>[] = [
    {
      id: 'project',
      header: 'PROJECT',
      width: '1.4fr',
      render: (project) => <TwoLineCell title={project.name} />,
    },
    {
      id: 'state',
      header: 'STATE',
      // What the stack *is*, in words and in a tone — a statement drawn like a
      // statement, beside the cluster that changes it
      // (plan-ui-coherence-optimisation/REQ-27).
      width: '116px',
      render: (project) => <BadgeListCell labels={[stateLabel(project.state)]} tone={projectTone(project.state)} />,
    },
    {
      id: 'services',
      header: 'SERVICES UP',
      width: '116px',
      render: (project) => <MetaCell>{`${runningServices(project)}/${project.services.length}`}</MetaCell>,
    },
    {
      id: 'files',
      header: 'COMPOSE FILES',
      width: '2fr',
      render: (project) => <MetaCell>{project.configFiles.join(', ')}</MetaCell>,
    },
    {
      id: 'reports',
      header: 'DOCKER REPORTS',
      // Only a project the daemon could not read explains itself, and the
      // column's own '–' is what every other project reads as.
      width: '1.2fr',
      render: (project) => <MetaCell>{project.error}</MetaCell>,
    },
    {
      id: 'actions',
      header: 'ACTIONS',
      // The cluster's own width and no more (plan-ui-coherence-optimisation/REQ-9),
      // stated as a length: an intrinsic track resolves separately in the header
      // and in every row. The pair of controls a project row ever carries inks
      // 109.4px of it, measured — the same track a context's row uses.
      width: '120px',
      render: (project) => {
        const busy = busyProjects.includes(project.name);
        const down = project.state !== 'stopped' && project.state !== 'unknown';
        return (
          <ActionButtonGroup
            actions={[
              { id: 'restart', label: 'Restart', disabled: busy, onClick: () => void lifecycle.restart(project.name) },
              {
                id: 'lifecycle',
                label: down ? 'Down' : 'Up',
                weight: down ? ('destructive' as const) : ('primary' as const),
                disabled: busy,
                onClick: () => void handleUpOrDown(project),
              },
            ]}
          />
        );
      },
    },
  ];

  const fileTabs: TabItem[] = composeFile.files.map((file) => ({ id: file.path, label: basename(file.path) }));

  const validationSummary = composeFile.validation
    ? composeFile.validation.valid
      ? `${basename(activeFile?.path ?? '')} is valid · ${composeFile.validation.services.length} services · ${composeFile.validation.volumes.length} volumes · ${composeFile.validation.networks.length} networks`
      : composeFile.validation.errors.join(' ')
    : undefined;

  const logLines: LogStreamLine[] = logs.lines.map((line) => ({
    id: String(line.seq),
    source: line.service,
    timestamp: formatTimestamp(line.timestamp),
    text: line.text,
  }));

  function composeFileView() {
    if (composeFile.error && composeFile.files.length === 0) {
      return <FailedReadEmptyState compact />;
    }
    return (
      <Stack gap="var(--space-3)">
        {fileTabs.length > 1 ? <Tabs tabs={fileTabs} activeId={activeFilePath ?? fileTabs[0].id} onSelect={setActiveFilePath} /> : null}
        {activeFile ? (
          <CodeEditor
            value={activeFile.content}
            onChange={(value) => composeFile.edit(activeFile.path, value)}
            dirty={composeFile.dirtyPaths.includes(activeFile.path)}
            ariaLabel={basename(activeFile.path)}
            statusLine={validationSummary}
          />
        ) : composeFile.loaded ? (
          <EmptyState
            title="No compose file discovered"
            description="The daemon records no compose file for this project; it can be brought up and down from here, but there is nothing to read or edit."
            action={null}
            compact
          />
        ) : (
          <EmptyState title="Reading the compose file…" description={null} action={null} compact />
        )}
        {/* One cluster under the editor rather than the delivered pair pushed to
            opposite edges of the card: at the panel's full width that spread
            them a content column apart. */}
        <Row gap="var(--space-2)">
          <Button variant="secondary" onClick={() => void composeFile.validate()} disabled={composeFile.validating}>
            Validate
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleSave()}
            disabled={!activeFile || !composeFile.dirtyPaths.includes(activeFile.path) || composeFile.saving}
          >
            Save
          </Button>
        </Row>
      </Stack>
    );
  }

  // The stream exists only inside a project's own panel, so it always has a
  // project to name its download after: this screen no longer holds the case of
  // a stream offered without one.
  function aggregatedLogsView(project: ComposeProjectSummary) {
    return <LogStream lines={logLines} showTimestamps emptyLabel="No log output." downloadFileName={`${project.name}-logs.txt`} />;
  }

  /**
   * The selected project's detail, at the full width of the content column
   * (plan-ui-coherence-optimisation/REQ-50): its properties in the library's
   * grid, and its compose file and aggregated logs as two views of one panel
   * rather than two regions permanently stacked beside the list.
   *
   * **It is dismissed exactly as every other panel in the product is**: the row
   * that opened it closes it, `Escape` closes it, and it presents no close
   * control of its own. The risk that presentation carries here — this body
   * holds an editable buffer, and `Escape` is an unremarkable keystroke to type
   * in a textarea — is answered by the confirmation in `requestSelect` rather
   * than by a dismissal only this screen has.
   */
  function projectDetail(project: ComposeProjectSummary) {
    return (
      <DetailPanel
        dismissal="opening-gesture"
        onClose={() => void requestSelect(undefined)}
        properties={[
          { label: 'Project', value: project.name },
          { label: 'State', value: stateLabel(project.state) },
          { label: 'Services running', value: `${runningServices(project)} of ${project.services.length}` },
          { label: 'Compose files', value: project.configFiles.join(', ') || 'none discovered' },
          ...(project.error ? [{ label: 'Docker reports', value: project.error }] : []),
        ]}
        // What a project's bands hold: a name, a state, a count, and the
        // discovered paths. The grid derives the column count from its own
        // width against that class's minimum — the panel carries two at
        // desktop widths and one on the phone — and the caller states no count.
        propertiesContentClass="short-scalar"
      >
        <Stack gap="var(--space-3)">
          <Tabs tabs={PROJECT_VIEWS} activeId={projectView} onSelect={(id) => setProjectView(id as ProjectView)} />
          {projectView === 'file' ? composeFileView() : aggregatedLogsView(project)}
        </Stack>
      </DetailPanel>
    );
  }

  return (
    // The composition containers and images ship: the section header above, and
    // the list alone in a card of its own that it fills edge to edge. The list's
    // one enclosing surface is that card, so the screen has none — and neither do
    // the nested service lists inside it.
    <Stack gap="var(--space-4)">
      <SectionHeader title="Compose projects" description="Discovered from the labels the projects' own containers carry" />
      <Card padding="none">
        <DataTable
          columns={projectColumns}
          rows={projects}
          rowKey={(project) => project.name}
          selectedRowKey={selectedName}
          // The opening gesture is also the closing one, as on every other
          // migrated screen; the buffer's guard is in `requestSelect`.
          onRowSelect={(project) => void requestSelect(project.name === selectedName ? undefined : project.name)}
          expandedRowKey={selectedName}
          renderExpanded={(project) => projectDetail(project)}
          // Every project row carries its services, opened or not: the grouping
          // is the object's own shape, not a detail of the selection
          // (plan-ui-coherence-optimisation/REQ-49).
          renderRowContent={(project) => (
            // The services take no surface of their own: they are drawn inside
            // the projects list's own, indented under the row they belong to,
            // which is what the library's `nested` states
            // (`.../classic-table/REQ-7`).
            <DataTable
              nested
              hideHeader
              columns={serviceColumns(project)}
              rows={project.services}
              rowKey={(service) => service.name}
              emptyState={
                <EmptyState title="No services" description="The daemon reports no service for this project." action={null} compact />
              }
            />
          )}
          emptyState={
            error && projects.length === 0 ? (
              <FailedReadEmptyState />
            ) : loaded ? (
              <EmptyState title="No compose projects" description={NO_PROJECTS} action={<Button onClick={onRefresh}>Check again</Button>} />
            ) : (
              <EmptyState title="Loading compose projects…" description={null} action={null} />
            )
          }
        />
      </Card>
    </Stack>
  );
}
