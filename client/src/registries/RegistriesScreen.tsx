import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActionButtonGroup,
  Button,
  Card,
  ChipGroup,
  DataTable,
  DefinitionList,
  EmptyState,
  ErrorBanner,
  FormDialog,
  FormField,
  Grid,
  MetaCell,
  ScreenToolbar,
  SearchField,
  SecretField,
  SectionHeader,
  Stack,
  StatusDotCell,
  StatusPill,
  StepProgressList,
  TextField,
  TwoLineCell,
  useToast,
  type ChipGroupItem,
  type DataTableColumn,
  type ProgressStep,
  type SearchFieldHandle,
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
 * The store holding this registry's credential, as the row states it: the
 * helper's name, "docker config file" when the credential sits in the
 * configuration itself, and nothing at all for a registry with no credential.
 * It never carries a credential — only whether there is one (REQ-87).
 */
function credentialStoreOf(registry: RegistrySummary): string | undefined {
  if (!registry.authenticated) return undefined;
  return registry.credentialStore ?? 'docker config file';
}

/**
 * The line under a registry's host: who the session is authenticated as — or
 * that it is not authenticated — and whether the registry is reached over plain
 * http. **It is never empty**, whatever the registry's state, which is what
 * makes every row the same height as every other (REQ-37): the credential
 * store, the one part whose presence did depend on the state, is a column of
 * its own now. It never carries a credential (REQ-87).
 */
function registryStateLine(registry: RegistrySummary): string {
  const parts = [registry.authenticated ? (registry.account ?? 'authenticated') : 'not authenticated'];
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
  // The way out of the "type a term" empty state is the search box above it, so
  // that state's action has to be able to put the cursor there.
  const searchRef = useRef<SearchFieldHandle>(null);

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

  // The values of the delivered state line, in the same order, with the one
  // that came and went — the credential store — lifted into a column of its
  // own. Every cell here is a fixed number of lines whatever the registry's
  // state, so no row can be taller than another (REQ-37).
  const registryColumns: DataTableColumn<RegistrySummary>[] = [
    {
      id: 'state-dot',
      header: '',
      width: '20px',
      render: (registry) => <StatusDotCell tone={registry.authenticated ? 'success' : 'neutral'} />,
    },
    {
      id: 'registry',
      header: 'REGISTRY',
      width: '1.6fr',
      render: (registry) => <TwoLineCell title={registry.host} subtitle={registryStateLine(registry)} />,
    },
    {
      id: 'credential-store',
      header: 'CREDENTIAL STORE',
      // Wide enough for the longest value this column holds — "docker config
      // file" — at the width the screen is normally read at.
      width: '1.2fr',
      render: (registry) => <MetaCell>{credentialStoreOf(registry)}</MetaCell>,
    },
    {
      id: 'actions',
      header: 'ACTIONS',
      // The cluster's own width and no more, so the data columns keep the rest
      // of a panel that is half the screen wide. A **length**, not the intrinsic
      // track this was written as: the header and every row are grids of their
      // own, so `max-content` resolved 57.4px in the header, 50.7px on a
      // `Log in` row and 58.0px on a `Log out` row, moving this panel's other
      // columns with it. 64px carries the wider of the two labels.
      width: '64px',
      render: (registry) => (
        <ActionButtonGroup
          actions={[
            registry.authenticated
              ? { id: 'log-out', label: 'Log out', weight: 'secondary', onClick: () => handleLogout(registry) }
              : { id: 'log-in', label: 'Log in', weight: 'primary', onClick: () => openLogin(registry) },
          ]}
        />
      ),
    },
  ];

  const repositoryColumns: DataTableColumn<RepositoryEntry>[] = [
    {
      id: 'repository',
      header: 'REPOSITORY',
      width: '2fr',
      render: (entry) => <TwoLineCell title={entry.repository.name} subtitle={entry.repository.description} />,
    },
    {
      id: 'pulls',
      header: 'PULLS',
      // Wide enough for the longest count this column formats — `12.3k pulls`,
      // `1.2B pulls` — and the same width on every row, which an intrinsic track
      // is not (see the action column above).
      width: '96px',
      align: 'end',
      render: (entry) => <MetaCell>{entry.repository.pullCount === undefined ? undefined : formatPullCount(entry.repository.pullCount)}</MetaCell>,
    },
  ];

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
      {/* The pair collapses to one column when the screen is too narrow to
          carry both panels, instead of dividing a phone's width between them. */}
      <Grid arrangement="pair">
        <Card>
          <SectionHeader title="Registries & credentials" />
          <Stack gap="var(--space-3)">
            {registries.error ? (
              <ErrorBanner title="Could not read the configured registries" detail={registries.error} onRetry={registries.refresh} />
            ) : null}
            <DataTable
              // The `REGISTRY` cell is a host over its state line, so the row is
              // sized by what it holds rather than clipped to the fixed height a
              // list of one-line values is drawn at. Every row still holds the
              // same number of lines as every other (REQ-37 of the reference
              // plan), so they all resolve to one height.
              autoRowHeight
              columns={registryColumns}
              rows={registries.registries}
              rowKey={(registry) => registry.host}
              selectedRowKey={selectedHost}
              onRowSelect={(registry) => setSelectedHost(registry.host)}
              emptyState={
                registries.loaded ? (
                  <EmptyState
                    title="No registries configured"
                    description="Registries come from the host's Docker configuration; logging in to one adds it there."
                    action={null}
                  />
                ) : (
                  <EmptyState title="Reading registries…" description={null} action={null} />
                )
              }
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
          <ScreenToolbar
            filters={
              <SearchField
                ref={searchRef}
                value={search}
                onChange={setSearch}
                ariaLabel="Search repositories"
                placeholder={selected?.official ? 'Search Docker Hub…' : 'Filter repositories…'}
              />
            }
          />
          <Stack gap="var(--space-3)">
            {repositories.error ? (
              <ErrorBanner title="Could not browse the registry" detail={repositories.error} onRetry={repositories.refresh} />
            ) : null}
            <DataTable
              // The `REPOSITORY` cell is a name over its description, so the row
              // is sized by what it holds rather than clipped to the fixed
              // height a list of one-line values is drawn at.
              autoRowHeight
              columns={repositoryColumns}
              rows={repositories.entries}
              rowKey={(entry) => entry.repository.name}
              renderRowContent={(entry) => (
                <ChipGroup
                  items={entry.tags.map((tag) => tagChip(tag, startPull))}
                  emptyLabel={entry.tagsLoading ? 'Reading tags…' : (entry.tagsError ?? 'No tags reachable')}
                />
              )}
              emptyState={browserEmptyState({
                selected,
                search,
                searching: repositories.searching,
                loaded: repositories.loaded,
                onSearch: () => searchRef.current?.focus(),
                onClearSearch: () => setSearch(''),
              })}
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
          <DefinitionList items={[{ label: 'Reference', value: pullReference ?? '' }]} />
          {pullStreamUrl ? <StepProgressList steps={pullSteps.length === 0 ? [{ id: 'overall', label: 'Starting…', status: 'active' }] : pullSteps} /> : null}
          {pullTransfer.error ? <ErrorBanner title="Pull failed" detail={pullTransfer.error} /> : null}
        </Stack>
      </FormDialog>
    </Stack>
  );
}

interface BrowserEmptyStateInput {
  selected: RegistrySummary | undefined;
  search: string;
  searching: boolean;
  loaded: boolean;
  /** Puts the cursor in the search box — the way out of "there is nothing to list until you ask". */
  onSearch: () => void;
  onClearSearch: () => void;
}

/**
 * What the browser shows instead of repositories. Five states, each stating why
 * it is empty and offering the control that resolves it where one exists: two
 * of them are readings still in flight, where nothing the operator does from
 * here would settle them any sooner.
 *
 * The default index's — `Search Docker Hub` with its explanatory line — is the
 * one the analysis calls correct, preserved word for word (REQ-38).
 */
function browserEmptyState({ selected, search, searching, loaded, onSearch, onClearSearch }: BrowserEmptyStateInput) {
  const term = search.trim();
  if (!selected) {
    return (
      <EmptyState
        title="Select a registry"
        description="Pick one of the configured registries to browse its repositories."
        action={null}
      />
    );
  }
  if (searching) return <EmptyState title="Searching…" description={null} action={null} />;
  if (selected.official && term === '') {
    return (
      <EmptyState
        title="Search Docker Hub"
        description="Docker Hub has no catalog to list: type a term to search it."
        action={
          <Button variant="primary" onClick={onSearch}>
            Type a search term
          </Button>
        }
      />
    );
  }
  if (!loaded) return <EmptyState title="Reading repositories…" description={null} action={null} />;
  return (
    <EmptyState
      title="No repositories match"
      description={term === '' ? `${selected.host} published no repository to list.` : `No repository of ${selected.host} matches “${term}”.`}
      action={term === '' ? null : <Button onClick={onClearSearch}>Clear the search</Button>}
    />
  );
}
