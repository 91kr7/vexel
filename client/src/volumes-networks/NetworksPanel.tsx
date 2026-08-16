import { useState } from 'react';
import {
  ActionButtonGroup,
  Button,
  Card,
  ChipGroup,
  CodeViewer,
  Combobox,
  DataTable,
  DetailPanel,
  EmptyState,
  ErrorBanner,
  FormDialog,
  FormField,
  KeyValueEditor,
  MetaCell,
  ScreenToolbar,
  SectionHeader,
  Stack,
  TextField,
  TwoLineCell,
  useToast,
  type ChipGroupItem,
  type DataTableColumn,
  type KeyValuePair,
} from '../ui';
import { attachContainer, createNetwork, detachContainer, pruneNetworks, removeNetwork, type NetworkSummary } from '../data/networks-client';
import { useNetworkInspect } from '../data/use-network-inspect';
import { useContainers } from '../data/use-containers';
import { useConfirmation } from '../shell/services/ConfirmationService';
import { useErrorReporter } from '../shell/services/ErrorReportingService';
import { useProgress } from '../shell/services/ProgressService';

export interface NetworksPanelProps {
  networks: NetworkSummary[];
  loaded: boolean;
  error?: string;
  onRefresh: () => void;
}

const DRIVER_SUGGESTIONS = [
  { value: 'bridge', label: 'bridge' },
  { value: 'overlay', label: 'overlay' },
  { value: 'macvlan', label: 'macvlan' },
];

function pairsToRecord(pairs: KeyValuePair[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (const pair of pairs) {
    if (pair.key.trim() === '') continue;
    record[pair.key.trim()] = pair.value;
  }
  return record;
}

function subnetLine(network: NetworkSummary): string {
  if (!network.subnet) return 'no subnet';
  return network.gateway ? `${network.subnet} · gw ${network.gateway}` : network.subnet;
}

/**
 * The inspect surface for a selected network, revealed by the library's detail
 * panel in the row's expansion: full content width, properties in the two-column
 * grid — `Options` left-aligned like every other value — and the raw payload at
 * that same width rather than in a card column's leftover.
 */
function NetworkDetail({ network, onClose }: { network: NetworkSummary; onClose: () => void }) {
  const { inspect, loaded, error, refresh } = useNetworkInspect(network.id);

  return (
    // As on volumes: no close control, the row that opened it closes it, and it
    // is rendered whatever the inspect call has returned so far — the panel is
    // what holds the one-open guarantee across the screen's two lists.
    <DetailPanel
      dismissal="opening-gesture"
      onClose={onClose}
      properties={
        inspect
          ? [
              { label: 'Driver', value: inspect.driver },
              { label: 'Scope', value: inspect.scope },
              { label: 'Subnet', value: inspect.subnet ?? '–' },
              { label: 'Gateway', value: inspect.gateway ?? '–' },
              { label: 'IP range', value: inspect.ipRange ?? '–' },
              { label: 'Options', value: Object.entries(inspect.options).map(([key, value]) => `${key}=${value}`).join(', ') || '–' },
              { label: 'Labels', value: Object.entries(inspect.labels).map(([key, value]) => `${key}=${value}`).join(', ') || '–' },
            ]
          : undefined
      }
      propertiesContentClass="long-single-line"
    >
      <Stack gap="var(--space-4)">
        {error ? <ErrorBanner title="Could not load network details" detail={error} onRetry={refresh} /> : null}
        {!inspect ? (
          loaded ? (
            <EmptyState
              title="No inspect data available"
              description="The daemon returned no details for this network."
              action={null}
            />
          ) : (
            <EmptyState title="Loading network details…" description={null} action={null} />
          )
        ) : (
          <>
            <SectionHeader variant="eyebrow" title="Raw payload" description="Exactly as received from the Engine API." />
            <CodeViewer code={JSON.stringify(inspect.raw, null, 2)} maxHeight="240px" />
          </>
        )}
      </Stack>
    </DetailPanel>
  );
}

/**
 * The Networks panel of the Volumes & networks screen (REQ-72, REQ-73, REQ-74):
 * every network with its driver, scope and subnet/gateway, listed with the
 * object list's comfortable variant, its attached containers as chips carrying
 * their own detach action below each row, create and prune in the toolbar under
 * the section header, and attach and remove in the row's action cluster.
 */
export function NetworksPanel({ networks, loaded, error, onRefresh }: NetworksPanelProps) {
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [driver, setDriver] = useState('bridge');
  const [subnet, setSubnet] = useState('');
  const [gateway, setGateway] = useState('');
  const [ipRange, setIpRange] = useState('');
  const [options, setOptions] = useState<KeyValuePair[]>([]);
  const [labels, setLabels] = useState<KeyValuePair[]>([]);
  const [creating, setCreating] = useState(false);

  const [attachTarget, setAttachTarget] = useState<NetworkSummary | undefined>(undefined);
  const [attachContainerName, setAttachContainerName] = useState('');
  const [attaching, setAttaching] = useState(false);
  const { containers } = useContainers();

  const { confirm } = useConfirmation();
  const { push } = useToast();
  const { run } = useProgress();
  const { reportError } = useErrorReporter();

  function openCreate() {
    setName('');
    setDriver('bridge');
    setSubnet('');
    setGateway('');
    setIpRange('');
    setOptions([]);
    setLabels([]);
    setCreateOpen(true);
  }

  async function submitCreate() {
    setCreating(true);
    try {
      await run('Create network', () =>
        createNetwork({
          name: name.trim(),
          driver: driver.trim() || undefined,
          subnet: subnet.trim() || undefined,
          gateway: gateway.trim() || undefined,
          ipRange: ipRange.trim() || undefined,
          options: pairsToRecord(options),
          labels: pairsToRecord(labels),
        }),
      );
      setCreateOpen(false);
      onRefresh();
    } catch (cause) {
      reportError('Could not create network', (cause as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function handlePrune() {
    const confirmed = await confirm({
      targetName: 'unused networks',
      consequence: 'This will permanently remove every network not currently used by a container.',
      confirmLabel: 'Prune',
    });
    if (!confirmed) return;
    try {
      const result = await run('Prune unused networks', () => pruneNetworks());
      push({
        title: `${result.removedNames.length} network${result.removedNames.length === 1 ? '' : 's'} removed`,
        tone: 'success',
      });
      onRefresh();
    } catch (cause) {
      reportError('Could not prune networks', (cause as Error).message);
    }
  }

  async function handleRemove(network: NetworkSummary) {
    const confirmed = await confirm({
      targetName: network.name,
      consequence: 'This will permanently remove the network.',
      confirmLabel: 'Remove',
    });
    if (!confirmed) return;
    try {
      await run(`Remove ${network.name}`, () => removeNetwork(network.id));
      setSelectedId((current) => (current === network.id ? undefined : current));
      onRefresh();
    } catch (cause) {
      reportError(`Could not remove ${network.name}`, (cause as Error).message);
    }
  }

  function handleSelect(network: NetworkSummary) {
    setSelectedId((current) => (current === network.id ? undefined : network.id));
  }

  async function handleDetach(network: NetworkSummary, containerName: string) {
    try {
      await run(`Detach ${containerName}`, () => detachContainer(network.id, containerName));
      onRefresh();
    } catch (cause) {
      reportError(`Could not detach ${containerName}`, (cause as Error).message);
    }
  }

  function openAttach(network: NetworkSummary) {
    setAttachContainerName('');
    setAttachTarget(network);
  }

  async function submitAttach() {
    if (!attachTarget) return;
    setAttaching(true);
    try {
      await run(`Attach ${attachContainerName}`, () => attachContainer(attachTarget.id, attachContainerName));
      setAttachTarget(undefined);
      onRefresh();
    } catch (cause) {
      reportError(`Could not attach ${attachContainerName}`, (cause as Error).message);
    } finally {
      setAttaching(false);
    }
  }

  const containerOptions = containers.map((container) => ({ value: container.name, label: container.name }));

  const columns: DataTableColumn<NetworkSummary>[] = [
    {
      id: 'name',
      header: 'NAME',
      width: '2fr',
      render: (network) => <TwoLineCell title={network.name} subtitle={subnetLine(network)} />,
    },
    { id: 'driver', header: 'DRIVER', width: '0.8fr', render: (network) => <MetaCell>{network.driver}</MetaCell> },
    { id: 'scope', header: 'SCOPE', width: '0.8fr', render: (network) => <MetaCell>{network.scope}</MetaCell> },
    {
      id: 'actions',
      header: 'ACTIONS',
      // Attaching a container is an action of this row, so it is a control of
      // the row's cluster and not the bare text it used to be beside the chips.
      // A **length**, not an intrinsic track: this cluster's two controls made
      // the widest gap in the product between a header's track and its rows' —
      // 57.4px against 130.7px, carrying this table's `NAME` column 46px out of
      // line with its own header at 1440×1000.
      width: '144px',
      render: (network) => (
        <ActionButtonGroup
          actions={[
            { id: 'attach', label: 'Attach…', onClick: () => openAttach(network) },
            { id: 'remove', label: 'Remove', weight: 'destructive', onClick: () => handleRemove(network) },
          ]}
        />
      ),
    },
  ];

  return (
    <Card>
      <SectionHeader title="Networks" />
      <ScreenToolbar
        primaryAction={{ label: 'Create network…', onClick: openCreate }}
        destructiveAction={{ label: 'Prune', onClick: handlePrune, disabled: networks.length === 0 }}
      />
      <Stack gap="var(--space-3)">
        {error ? <ErrorBanner title="Could not load networks" detail={error} onRetry={onRefresh} /> : null}
        <DataTable
          // The `NAME` cell is a name over its subnet line, so the row is sized
          // by what it holds rather than clipped to the fixed height a list of
          // one-line values is drawn at.
          autoRowHeight
          columns={columns}
          rows={networks}
          rowKey={(network) => network.id}
          selectedRowKey={selectedId}
          onRowSelect={handleSelect}
          renderRowContent={(network) => (
            <ChipGroup
              items={network.attachedContainers.map<ChipGroupItem>((containerName) => ({
                key: containerName,
                label: containerName,
                actionLabel: 'detach',
                onAction: () => handleDetach(network, containerName),
              }))}
              emptyLabel="No attached containers"
            />
          )}
          expandedRowKey={selectedId}
          renderExpanded={(network) => <NetworkDetail network={network} onClose={() => setSelectedId(undefined)} />}
          emptyState={
            loaded ? (
              <EmptyState
                title="No networks"
                description="A user-defined network lets the containers on it reach each other by name."
                // Its label is the invitation, never the toolbar's own word
                // (DEF-2, `networks-panel.md`): one surface, one control per name.
                action={<Button onClick={openCreate}>Create the first network</Button>}
              />
            ) : (
              <EmptyState title="Loading networks…" description={null} action={null} />
            )
          }
        />
      </Stack>

      <FormDialog
        open={createOpen}
        title="Create network"
        description="Creates a new user-defined network."
        submitLabel="Create"
        submitting={creating}
        onSubmit={submitCreate}
        onCancel={() => setCreateOpen(false)}
      >
        <Stack gap="var(--space-3)">
          <FormField label="Name">
            <TextField ariaLabel="Network name" placeholder="e.g. app-network" value={name} onChange={setName} autoFocus />
          </FormField>
          <FormField label="Driver">
            <Combobox ariaLabel="Driver" value={driver} onChange={setDriver} options={DRIVER_SUGGESTIONS} />
          </FormField>
          <FormField label="Subnet" hint="e.g. 172.20.0.0/24">
            <TextField ariaLabel="Subnet" placeholder="172.20.0.0/24" value={subnet} onChange={setSubnet} />
          </FormField>
          <FormField label="Gateway">
            <TextField ariaLabel="Gateway" placeholder="172.20.0.1" value={gateway} onChange={setGateway} />
          </FormField>
          <FormField label="IP range">
            <TextField ariaLabel="IP range" placeholder="172.20.0.128/25" value={ipRange} onChange={setIpRange} />
          </FormField>
          <FormField label="Options">
            <KeyValueEditor pairs={options} onChange={setOptions} name="Options" addLabel="Add option" />
          </FormField>
          <FormField label="Labels">
            <KeyValueEditor pairs={labels} onChange={setLabels} name="Labels" keyPlaceholder="key" addLabel="Add label" />
          </FormField>
        </Stack>
      </FormDialog>

      <FormDialog
        open={attachTarget !== undefined}
        title={attachTarget ? `Attach a container to ${attachTarget.name}` : 'Attach a container'}
        submitLabel="Attach"
        submitting={attaching}
        onSubmit={submitAttach}
        onCancel={() => setAttachTarget(undefined)}
      >
        <FormField label="Container">
          <Combobox
            ariaLabel="Container"
            value={attachContainerName}
            onChange={setAttachContainerName}
            options={containerOptions}
          />
        </FormField>
      </FormDialog>
    </Card>
  );
}
