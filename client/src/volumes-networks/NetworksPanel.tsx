import { useState } from 'react';
import {
  Button,
  Card,
  CardList,
  ChipGroup,
  CodeViewer,
  Combobox,
  DefinitionList,
  EmptyState,
  ErrorBanner,
  FormDialog,
  FormField,
  KeyValueEditor,
  Row,
  SectionHeader,
  Stack,
  TextField,
  useToast,
  type CardListRowContent,
  type ChipGroupItem,
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

/** The inline inspect surface for a selected network's row, expanded in place by `CardList`. */
function NetworkDetail({ network, onRemoved }: { network: NetworkSummary; onRemoved: () => void }) {
  const { inspect, loaded, error, refresh } = useNetworkInspect(network.id);
  const { confirm } = useConfirmation();
  const { run } = useProgress();
  const { reportError } = useErrorReporter();

  async function handleRemove() {
    const confirmed = await confirm({
      targetName: network.name,
      consequence: 'This will permanently remove the network.',
      confirmLabel: 'Remove',
    });
    if (!confirmed) return;
    try {
      await run(`Remove ${network.name}`, () => removeNetwork(network.id));
      onRemoved();
    } catch (cause) {
      reportError(`Could not remove ${network.name}`, (cause as Error).message);
    }
  }

  return (
    <Stack gap="var(--space-4)">
      {error ? <ErrorBanner title="Could not load network details" detail={error} onRetry={refresh} /> : null}
      {!inspect ? (
        <EmptyState title={loaded ? 'No inspect data available' : 'Loading network details…'} />
      ) : (
        <>
          <DefinitionList
            items={[
              { label: 'Driver', value: inspect.driver },
              { label: 'Scope', value: inspect.scope },
              { label: 'Subnet', value: inspect.subnet ?? '–' },
              { label: 'Gateway', value: inspect.gateway ?? '–' },
              { label: 'IP range', value: inspect.ipRange ?? '–' },
              { label: 'Options', value: Object.entries(inspect.options).map(([key, value]) => `${key}=${value}`).join(', ') || '–' },
              { label: 'Labels', value: Object.entries(inspect.labels).map(([key, value]) => `${key}=${value}`).join(', ') || '–' },
            ]}
          />
          <SectionHeader variant="eyebrow" title="Raw payload" description="Exactly as received from the Engine API." />
          <CodeViewer code={JSON.stringify(inspect.raw, null, 2)} maxHeight="240px" />
        </>
      )}
      <Row justify="between">
        <Button variant="destructive" onClick={handleRemove}>Remove</Button>
      </Row>
    </Stack>
  );
}

/**
 * The Networks panel of the Volumes & networks screen (REQ-72, REQ-73,
 * REQ-74): every network with its driver, scope, subnet/gateway and attached
 * containers as chips carrying a detach action, create/inspect/remove, prune
 * of unused networks, and attaching a container from a chip-group add
 * affordance.
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

  function handleSelect(network: NetworkSummary) {
    setSelectedId((current) => (current === network.id ? undefined : network.id));
  }

  function handleRemoved() {
    setSelectedId(undefined);
    onRefresh();
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

  function networkRow(network: NetworkSummary): CardListRowContent {
    const chipItems: ChipGroupItem[] = network.attachedContainers.map((containerName) => ({
      key: containerName,
      label: containerName,
      actionLabel: 'detach',
      onAction: () => handleDetach(network, containerName),
    }));
    return {
      title: network.name,
      subtitle: [subnetLine(network)],
      meta: `${network.driver} · ${network.scope}`,
      content: (
        <ChipGroup
          items={chipItems}
          addLabel="+ Attach"
          onAdd={() => openAttach(network)}
          emptyLabel="No attached containers"
        />
      ),
    };
  }

  const containerOptions = containers.map((container) => ({ value: container.name, label: container.name }));

  return (
    <Card>
      <SectionHeader
        title="Networks"
        trailing={
          <Row gap="var(--space-2)">
            <Button onClick={openCreate}>Create</Button>
            <Button variant="destructive" onClick={handlePrune} disabled={networks.length === 0}>Prune</Button>
          </Row>
        }
      />
      <Stack gap="var(--space-3)">
        {error ? <ErrorBanner title="Could not load networks" detail={error} onRetry={onRefresh} /> : null}
        <CardList
          items={networks}
          itemKey={(network) => network.id}
          renderRow={networkRow}
          selectedKey={selectedId}
          onSelect={handleSelect}
          expandedKey={selectedId}
          renderExpanded={(network) => <NetworkDetail network={network} onRemoved={handleRemoved} />}
          emptyState={<EmptyState title={loaded ? 'No networks' : 'Loading networks…'} />}
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
