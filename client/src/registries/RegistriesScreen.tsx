import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  CardList,
  ChipGroup,
  DefinitionList,
  EmptyState,
  ErrorBanner,
  FormDialog,
  FormField,
  Grid,
  SearchField,
  SecretField,
  SectionHeader,
  Stack,
  StatusPill,
  StepProgressList,
  TextField,
  useToast,
  type CardListRowContent,
  type ChipGroupItem,
  type ProgressStep,
} from '../ui';
import type { RegistrySummary, TagSummary } from '../data/registries-client';
import type { RepositoryEntry } from '../data/use-registry-repositories';
import { useRegistries } from '../data/use-registries';
import { useRegistryRepositories } from '../data/use-registry-repositories';
import { imagePullStreamUrl } from '../data/images-client';
import { useImageTransferStream } from '../data/use-image-transfer';
import { useConfirmation } from '../shell/services/ConfirmationService';
import { useErrorReporter } from '../shell/services/ErrorReportingService';
import { useProgress } from '../shell/services/ProgressService';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(0)}${units[unitIndex]}`;
}

function formatPullCount(pulls: number): string {
  if (pulls < 1000) return `${pulls} pulls`;
  if (pulls < 1_000_000) return `${(pulls / 1000).toFixed(pulls < 10_000 ? 1 : 0)}k pulls`;
  if (pulls < 1_000_000_000) return `${(pulls / 1_000_000).toFixed(pulls < 10_000_000 ? 1 : 0)}M pulls`;
  return `${(pulls / 1_000_000_000).toFixed(1)}B pulls`;
}

/**
 * The line under a registry's host, as drawn in the mockup: who the session is
 * authenticated as and which store holds it, or that it is not authenticated
 * and reached over plain http. It never carries a credential — only whether
 * there is one and in whose name (REQ-87).
 */
function registryLine(registry: RegistrySummary): string {
  const parts: string[] = [registry.authenticated ? (registry.account ?? 'authenticated') : 'not authenticated'];
  if (registry.authenticated) parts.push(`credential store: ${registry.credentialStore ?? 'docker config file'}`);
  if (!registry.secure) parts.push('plain http');
  return parts.join(' · ');
}

function stepStatus(step: { status: string }): ProgressStep['status'] {
  const normalized = step.status.toLowerCase();
  if (normalized.includes('complete') || normalized.includes('exists') || normalized.startsWith('status:')) return 'done';
  return 'active';
}

function tagChip(tag: TagSummary, onPull: (tag: TagSummary) => void): ChipGroupItem {
  return {
    key: tag.name,
    label: tag.name,
    meta: tag.sizeBytes === undefined ? undefined : formatBytes(tag.sizeBytes),
    actionLabel: 'pull',
    onAction: () => onPull(tag),
  };
}

/**
 * The Registries screen (REQ-85, REQ-86, REQ-87): the configured registries
 * with their account, credential store and authentication state, log in and
 * log out, and a browser over the selected registry's repositories and tags
 * with each tag's size and a pull straight from it.
 */
export function RegistriesScreen() {
  const registries = useRegistries();
  const { confirm } = useConfirmation();
  const { push } = useToast();
  const { run } = useProgress();
  const { reportError } = useErrorReporter();

  const [selectedHost, setSelectedHost] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState('');

  const [loginTarget, setLoginTarget] = useState<RegistrySummary | null>(null);
  const [username, setUsername] = useState('');
  const [secret, setSecret] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  const [pullReference, setPullReference] = useState<string | undefined>(undefined);
  const [pullStreamUrl, setPullStreamUrl] = useState<string | undefined>(undefined);
  const pullTransfer = useImageTransferStream(pullStreamUrl);

  // The first registry read settles on a selection, so the browser has a
  // registry to work against without the operator picking one first.
  useEffect(() => {
    if (selectedHost !== undefined || registries.registries.length === 0) return;
    setSelectedHost(registries.registries[0].host);
  }, [registries.registries, selectedHost]);

  const selected = registries.registries.find((registry) => registry.host === selectedHost);
  const repositories = useRegistryRepositories(selected?.host, search);

  const closePullDialog = useCallback(() => {
    setPullReference(undefined);
    setPullStreamUrl(undefined);
  }, []);

  useEffect(() => {
    if (!pullStreamUrl || !pullTransfer.done || pullTransfer.error) return;
    push({ title: 'Image pulled', message: pullReference ?? '', tone: 'success' });
    closePullDialog();
  }, [pullStreamUrl, pullTransfer.done, pullTransfer.error, pullReference, push, closePullDialog]);

  function openLogin(registry: RegistrySummary) {
    setUsername(registry.account ?? '');
    setSecret('');
    setLoginTarget(registry);
  }

  function closeLogin() {
    // The secret is dropped the moment the form closes, whichever way it did.
    setSecret('');
    setUsername('');
    setLoginTarget(null);
  }

  async function submitLogin() {
    if (!loginTarget) return;
    const host = loginTarget.host;
    setLoggingIn(true);
    try {
      await run(`Log in to ${host}`, () => registries.logIn({ host, username: username.trim(), secret }));
      push({ title: 'Logged in', message: `${host} as ${username.trim()}`, tone: 'success' });
      closeLogin();
    } catch (cause) {
      reportError(`Could not log in to ${host}`, (cause as Error).message);
    } finally {
      setLoggingIn(false);
    }
  }

  async function handleLogout(registry: RegistrySummary) {
    const confirmed = await confirm({
      targetName: registry.host,
      consequence: "This will remove the stored credential from the host's credential store. Pulling or pushing private repositories will need a new log in.",
      confirmLabel: 'Log out',
    });
    if (!confirmed) return;
    try {
      await run(`Log out of ${registry.host}`, () => registries.logOut(registry.host));
    } catch (cause) {
      reportError(`Could not log out of ${registry.host}`, (cause as Error).message);
    }
  }

  function startPull(tag: TagSummary) {
    setPullReference(tag.pullReference);
    setPullStreamUrl(undefined);
  }

  function confirmPull() {
    if (!pullReference) return;
    setPullStreamUrl(imagePullStreamUrl(pullReference));
  }

  function registryRow(registry: RegistrySummary): CardListRowContent {
    return {
      status: registry.authenticated ? 'success' : 'neutral',
      title: registry.host,
      subtitle: registryLine(registry),
      meta: registry.authenticated ? (
        <Button onClick={() => handleLogout(registry)}>Log out</Button>
      ) : (
        <Button variant="primary" onClick={() => openLogin(registry)}>
          Log in
        </Button>
      ),
    };
  }

  function repositoryRow(entry: RepositoryEntry): CardListRowContent {
    return {
      title: entry.repository.name,
      subtitle: entry.repository.description,
      meta: entry.repository.pullCount === undefined ? undefined : formatPullCount(entry.repository.pullCount),
      content: (
        <ChipGroup
          items={entry.tags.map((tag) => tagChip(tag, startPull))}
          emptyLabel={entry.tagsLoading ? 'Reading tags…' : (entry.tagsError ?? 'No tags reachable')}
        />
      ),
    };
  }

  const pullSteps: ProgressStep[] = pullTransfer.steps.map((step) => ({
    id: step.id,
    label: step.id === 'overall' ? step.status : `${step.id} · ${step.status}`,
    status: stepStatus(step),
    currentBytes: step.currentBytes,
    totalBytes: step.totalBytes,
  }));

  const browserTitle = selected ? `Repositories · ${selected.host}${search.trim() === '' ? '' : `/${search.trim()}`}` : 'Repositories';

  return (
    <Stack gap="var(--space-5)">
      <Grid columns="1fr 1.2fr" gap="var(--space-5)">
        <Card>
          <SectionHeader title="Registries & credentials" />
          <Stack gap="var(--space-3)">
            {registries.error ? (
              <ErrorBanner title="Could not read the configured registries" detail={registries.error} onRetry={registries.refresh} />
            ) : null}
            <CardList
              items={registries.registries}
              itemKey={(registry) => registry.host}
              renderRow={registryRow}
              selectedKey={selectedHost}
              onSelect={(registry) => setSelectedHost(registry.host)}
              emptyState={<EmptyState title={registries.loaded ? 'No registries configured' : 'Reading registries…'} />}
            />
          </Stack>
        </Card>

        <Card>
          <SectionHeader
            title={browserTitle}
            trailing={
              selected ? (
                <StatusPill tone={selected.authenticated ? 'success' : 'neutral'}>
                  {selected.authenticated ? `authenticated${selected.account ? ` as ${selected.account}` : ''}` : 'anonymous'}
                </StatusPill>
              ) : undefined
            }
          />
          <Stack gap="var(--space-3)">
            <SearchField
              value={search}
              onChange={setSearch}
              ariaLabel="Search repositories"
              placeholder={selected?.official ? 'Search Docker Hub…' : 'Filter repositories…'}
            />
            {repositories.error ? (
              <ErrorBanner title="Could not browse the registry" detail={repositories.error} onRetry={repositories.refresh} />
            ) : null}
            <CardList
              items={repositories.entries}
              itemKey={(entry) => entry.repository.name}
              renderRow={repositoryRow}
              emptyState={
                <EmptyState
                  title={browserEmptyTitle(selected, search, repositories.searching, repositories.loaded)}
                  description={browserEmptyDescription(selected, search)}
                />
              }
            />
          </Stack>
        </Card>
      </Grid>

      <FormDialog
        open={loginTarget !== null}
        title={loginTarget ? `Log in to ${loginTarget.host}` : 'Log in'}
        description="The credential is handed to the host's Docker credential store and is never kept, shown or logged by this application."
        submitLabel="Log in"
        submitting={loggingIn}
        submitDisabled={username.trim() === '' || secret === ''}
        onSubmit={submitLogin}
        onCancel={closeLogin}
      >
        <Stack gap="var(--space-3)">
          <FormField label="Username">
            <TextField ariaLabel="Registry username" placeholder="e.g. myorg" value={username} onChange={setUsername} autoFocus />
          </FormField>
          <FormField label="Password or access token" hint="Masked as you type; it cannot be read back.">
            <SecretField ariaLabel="Registry password or access token" value={secret} onChange={setSecret} onSubmit={submitLogin} />
          </FormField>
        </Stack>
      </FormDialog>

      <FormDialog
        open={pullReference !== undefined}
        title="Pull tag"
        description="Pulls the selected tag onto the active daemon, with per-layer download progress."
        submitLabel="Pull"
        submitting={Boolean(pullStreamUrl) && !pullTransfer.done}
        submitDisabled={Boolean(pullStreamUrl)}
        onSubmit={confirmPull}
        onCancel={closePullDialog}
      >
        <Stack gap="var(--space-3)">
          <DefinitionList items={[{ label: 'Reference', value: pullReference ?? '', copyValue: pullReference }]} />
          {pullStreamUrl ? <StepProgressList steps={pullSteps.length === 0 ? [{ id: 'overall', label: 'Starting…', status: 'active' }] : pullSteps} /> : null}
          {pullTransfer.error ? <ErrorBanner title="Pull failed" detail={pullTransfer.error} /> : null}
        </Stack>
      </FormDialog>
    </Stack>
  );
}

function browserEmptyTitle(selected: RegistrySummary | undefined, search: string, searching: boolean, loaded: boolean): string {
  if (!selected) return 'Select a registry';
  if (searching) return 'Searching…';
  if (selected.official && search.trim() === '') return 'Search Docker Hub';
  return loaded ? 'No repositories match' : 'Reading repositories…';
}

function browserEmptyDescription(selected: RegistrySummary | undefined, search: string): string | undefined {
  if (!selected) return 'Pick one of the configured registries to browse its repositories.';
  if (selected.official && search.trim() === '') return 'Docker Hub has no catalog to list: type a term to search it.';
  return undefined;
}
