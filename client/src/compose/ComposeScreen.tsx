import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CodeEditor,
  EmptyState,
  ErrorBanner,
  GroupedRowsPanel,
  Grid,
  LogStream,
  Row,
  SectionHeader,
  Stack,
  StatusPill,
  Stepper,
  Tabs,
  useToast,
  type GroupedRowsPanelGroup,
  type LogStreamLine,
  type StatusTone,
  type TabItem,
} from '../ui';
import type { ComposeProjectSummary, ComposeProjectState } from '../data/compose-client';
import { useComposeFile } from '../data/use-compose-file';
import { useComposeLifecycle } from '../data/use-compose-lifecycle';
import { useComposeLogs } from '../data/use-compose-logs';
import { useConfirmation } from '../shell/services/ConfirmationService';
import { useErrorReporter } from '../shell/services/ErrorReportingService';

export interface ComposeScreenProps {
  projects: ComposeProjectSummary[];
  loaded: boolean;
  error?: string;
  onRefresh: () => void;
}

function projectTone(state: ComposeProjectState): StatusTone {
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
 */
export function ComposeScreen({ projects, loaded, error, onRefresh }: ComposeScreenProps) {
  const [selectedName, setSelectedName] = useState<string | undefined>(undefined);
  const [activeFilePath, setActiveFilePath] = useState<string | undefined>(undefined);
  const validateOnLoadRef = useRef<string | undefined>(undefined);

  const { confirm } = useConfirmation();
  const { push } = useToast();
  const { reportError } = useErrorReporter();

  const handleResult = useCallback(() => onRefresh(), [onRefresh]);
  const handleCommandError = useCallback((message: string) => reportError('Compose command failed', message), [reportError]);
  const lifecycle = useComposeLifecycle(handleResult, handleCommandError);

  useEffect(() => {
    if (selectedName !== undefined && projects.some((project) => project.name === selectedName)) return;
    setSelectedName(projects[0]?.name);
  }, [projects, selectedName]);

  const selectedProject = projects.find((project) => project.name === selectedName);
  const composeFile = useComposeFile(selectedProject?.name);
  const logs = useComposeLogs(selectedProject?.name);

  useEffect(() => {
    setActiveFilePath(composeFile.files[0]?.path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject?.name, composeFile.files.length]);

  useEffect(() => {
    if (!composeFile.loaded || validateOnLoadRef.current !== selectedProject?.name) return;
    validateOnLoadRef.current = undefined;
    void composeFile.validate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composeFile.loaded, selectedProject?.name]);

  const activeFile = composeFile.files.find((file) => file.path === activeFilePath) ?? composeFile.files[0];

  function selectProject(project: ComposeProjectSummary) {
    setSelectedName(project.name);
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

  function handleValidateRequest(project: ComposeProjectSummary) {
    if (project.name === selectedProject?.name) {
      void composeFile.validate();
      return;
    }
    validateOnLoadRef.current = project.name;
    setSelectedName(project.name);
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

  const groups: GroupedRowsPanelGroup[] = projects.map((project) => {
    const busy = lifecycle.runningProjects.includes(project.name);
    return {
      id: project.name,
      tone: projectTone(project.state),
      title: project.name,
      subtitle: project.configFiles.join(', ') || project.error,
      actions: (
        <Row gap="var(--space-2)" align="center">
          <StatusPill tone={projectTone(project.state)}>{stateLabel(project.state)}</StatusPill>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void lifecycle.restart(project.name)}>
            Restart
          </Button>
          <Button size="sm" variant={project.state === 'stopped' ? 'primary' : 'destructive'} disabled={busy} onClick={() => void handleUpOrDown(project)}>
            {project.state === 'stopped' || project.state === 'unknown' ? 'Up' : 'Down'}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => handleValidateRequest(project)}>
            Validate
          </Button>
        </Row>
      ),
      rows: project.services.map((service) => ({
        id: service.name,
        tone: service.state === 'running' ? 'success' : 'neutral',
        title: service.name,
        subtitle: service.image,
        trailing: (
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
      })),
    };
  });

  const tabs: TabItem[] = composeFile.files.map((file) => ({ id: file.path, label: basename(file.path) }));

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

  return (
    <Grid columns="2fr 1fr" gap="var(--space-5)">
      <Stack gap="var(--space-4)">
        {error ? <ErrorBanner title="Could not load compose projects" detail={error} onRetry={onRefresh} /> : null}
        <GroupedRowsPanel
          groups={groups}
          selectedGroupId={selectedName}
          onSelectGroup={(group) => selectProject(projects.find((project) => project.name === group.id) ?? projects[0])}
          emptyState={<EmptyState title={loaded ? 'No compose projects' : 'Loading compose projects…'}  description={null} action={null} />}
        />
      </Stack>
      <Stack gap="var(--space-4)">
        <Card>
          <SectionHeader
            title={activeFile ? basename(activeFile.path) : 'Compose file'}
            trailing={composeFile.dirtyPaths.length > 0 ? <Badge tone="warning">Unsaved</Badge> : undefined}
          />
          {!selectedProject ? (
            <EmptyState title="No project selected"  description={null} action={null} />
          ) : composeFile.error && composeFile.files.length === 0 ? (
            <ErrorBanner title="Could not read the compose file" detail={composeFile.error} />
          ) : (
            <Stack gap="var(--space-3)">
              {tabs.length > 1 ? <Tabs tabs={tabs} activeId={activeFilePath ?? tabs[0].id} onSelect={setActiveFilePath} /> : null}
              {activeFile ? (
                <CodeEditor
                  value={activeFile.content}
                  onChange={(value) => composeFile.edit(activeFile.path, value)}
                  dirty={composeFile.dirtyPaths.includes(activeFile.path)}
                  ariaLabel={basename(activeFile.path)}
                  statusLine={validationSummary}
                />
              ) : (
                <EmptyState title={composeFile.loaded ? 'No compose file discovered' : 'Loading compose file…'}  description={null} action={null} />
              )}
              <Row justify="between" align="center">
                <Button variant="secondary" onClick={() => void composeFile.validate()} disabled={!selectedProject || composeFile.validating}>
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
          )}
        </Card>
        <Card>
          <SectionHeader title="Aggregated logs" />
          <LogStream lines={logLines} showTimestamps emptyLabel="No log output." downloadFileName={selectedProject ? `${selectedProject.name}-logs.txt` : undefined} />
          {logs.error ? <ErrorBanner title="The log stream was interrupted" detail={logs.error} onRetry={logs.restart} /> : null}
        </Card>
      </Stack>
    </Grid>
  );
}
