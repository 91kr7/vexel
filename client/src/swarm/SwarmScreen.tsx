import { useCallback, useState } from 'react';
import {
  Button,
  EmptyState,
  ErrorBanner,
  FormDialog,
  FormField,
  RevealableValue,
  Row,
  SecretField,
  SectionHeader,
  Stack,
  StateSummaryBar,
  TextField,
  useToast,
  type StatusTone,
} from '../ui';
import type { SwarmJoinTokens, SwarmState } from '../data/swarm-client';
import { useSwarm } from '../data/use-swarm';
import { useConfirmation } from '../shell/services/ConfirmationService';
import { useErrorReporter } from '../shell/services/ErrorReportingService';
import { useProgress } from '../shell/services/ProgressService';
import { SwarmConfigsStacksPanel } from './SwarmConfigsStacksPanel';
import { SwarmNodesPanel } from './SwarmNodesPanel';
import { SwarmSecretsPanel } from './SwarmSecretsPanel';
import { SwarmServicesPanel } from './SwarmServicesPanel';

/**
 * The one statement of the condition, and what it takes to leave it. Every fact
 * the daemon's own sentence carries is here — the two ways in, and what appears
 * once one of them is taken — with the condition itself said by the title alone
 * (plan-ui-coherence-optimisation/REQ-52).
 */
const NOT_IN_A_SWARM =
  'Initialise one to make this daemon the first manager of a new swarm, or join an existing one with a token from one of its managers. Its nodes, services, stacks, secrets and configs are then listed here.';

/** Why a worker shows no inventory, and why nothing on this screen resolves it. */
const NOT_A_MANAGER =
  'Only a manager answers for the cluster: its nodes, services, stacks, secrets and configs are read from a manager of this swarm, or from this daemon once a manager promotes it.';

function stateTitle(state: SwarmState): string {
  if (state.localNodeState === 'active') return 'Swarm active';
  return `Swarm ${state.localNodeState}`;
}

function stateTone(state: SwarmState): StatusTone {
  if (state.localNodeState !== 'active' || state.error) return 'warning';
  if (state.manager && state.raft.status === 'degraded') return 'warning';
  return 'success';
}

/** The monospace line under the state, saying what this daemon is in the cluster. */
function stateFacts(state: SwarmState): string[] {
  if (!state.manager) return ['worker'];
  return [
    'manager',
    state.clusterId ? `cluster id ${state.clusterId.slice(0, 12)}` : 'cluster id unknown',
    state.nodeCount === undefined ? 'node count unknown' : `${state.nodeCount} nodes`,
    `raft ${state.raft.status}`,
  ];
}

/**
 * The Swarm screen (REQ-79 to REQ-84): the cluster's state with join tokens and
 * leave, above the inventories of the cluster — nodes, services & tasks,
 * secrets, configs and stacks.
 *
 * **One fact is stated once** (plan-ui-coherence-optimisation/REQ-52, REQ-53).
 * The delivered screen said "this daemon is not part of a swarm" six times: in
 * the state bar's own facts, and in the empty state of each of the five lists —
 * while the two actions that resolve it sat in the bar, 239px above the first
 * repetition and 883px above the last, at 1440×1000. Now the condition is one
 * empty state, on one surface, carrying `Initialise a swarm` and `Join an
 * existing one` **in it**; the state bar is drawn only where there is a state to
 * qualify, and the panels only where there is a cluster to read, so neither can
 * repeat it. The same holds for a worker, whose one statement replaces five
 * copies of the daemon's "not a manager" reason.
 *
 * **The inventories are stacked, each at the content column's full width**
 * (REQ-55). The two-by-two grid the screen shipped with capped a service's
 * reveal at 482px of a 1120px column at 1440×1000 and 362px at 1280×800 — a
 * one-column property grid, measured, where every migrated screen's panel
 * carries two — which is REQ-23's own constraint and the argument batches 6, 10
 * and 11 each recorded when their side-by-side pairs were deleted.
 *
 * The screen carries no deploy affordance, no compose-file path input and no
 * compose editor (departure Three, REQ-83).
 */
export function SwarmScreen() {
  const swarm = useSwarm();
  const { confirm } = useConfirmation();
  const { push } = useToast();
  const { run } = useProgress();
  const { reportError } = useErrorReporter();

  const [initOpen, setInitOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [advertiseAddr, setAdvertiseAddr] = useState('');
  const [managerAddr, setManagerAddr] = useState('');
  const [joinToken, setJoinToken] = useState('');
  const [working, setWorking] = useState(false);

  const [tokensOpen, setTokensOpen] = useState(false);
  const [tokens, setTokens] = useState<SwarmJoinTokens | undefined>(undefined);
  const [tokensReason, setTokensReason] = useState<string | undefined>(undefined);
  const [tokensLoading, setTokensLoading] = useState(false);
  const [workerRevealed, setWorkerRevealed] = useState(false);
  const [managerRevealed, setManagerRevealed] = useState(false);

  const state = swarm.state;
  const canManage = state?.manager === true;
  const inSwarm = state !== undefined && state.role !== 'inactive';

  const loadTokens = useCallback(async () => {
    setTokensLoading(true);
    try {
      const reading = await swarm.readTokens();
      setTokens(reading.tokens);
      setTokensReason(reading.unavailableReason);
    } catch (cause) {
      setTokens(undefined);
      setTokensReason((cause as Error).message);
    } finally {
      setTokensLoading(false);
    }
  }, [swarm]);

  function openTokens() {
    setWorkerRevealed(false);
    setManagerRevealed(false);
    setTokens(undefined);
    setTokensReason(undefined);
    setTokensOpen(true);
    void loadTokens();
  }

  function closeTokens() {
    // The tokens live only as long as the dialog does.
    setTokens(undefined);
    setTokensReason(undefined);
    setWorkerRevealed(false);
    setManagerRevealed(false);
    setTokensOpen(false);
  }

  async function rotate(target: 'worker' | 'manager') {
    try {
      const reading = await run(`Rotate the ${target} join token`, () => swarm.rotateToken(target));
      setTokens(reading.tokens);
      setTokensReason(reading.unavailableReason);
      push({ title: 'Join token rotated', message: `The previous ${target} token no longer joins this swarm.`, tone: 'success' });
    } catch (cause) {
      reportError(`Could not rotate the ${target} join token`, (cause as Error).message);
    }
  }

  function openInit() {
    setAdvertiseAddr('');
    setInitOpen(true);
  }

  function openJoin() {
    setAdvertiseAddr('');
    setManagerAddr('');
    setJoinToken('');
    setJoinOpen(true);
  }

  function closeJoin() {
    // The join token is dropped the moment the form closes, whichever way it did.
    setJoinToken('');
    setManagerAddr('');
    setJoinOpen(false);
  }

  async function submitInit() {
    setWorking(true);
    try {
      await run('Initialise swarm', () => swarm.initialise({ advertiseAddr: advertiseAddr.trim() || undefined }));
      push({ title: 'Swarm initialised', message: 'This daemon is now the first manager of a new swarm.', tone: 'success' });
      setInitOpen(false);
    } catch (cause) {
      reportError('Could not initialise the swarm', (cause as Error).message);
    } finally {
      setWorking(false);
    }
  }

  async function submitJoin() {
    setWorking(true);
    try {
      await run('Join swarm', () =>
        swarm.join({
          remoteAddrs: managerAddr
            .split(',')
            .map((entry) => entry.trim())
            .filter((entry) => entry !== ''),
          joinToken,
          advertiseAddr: advertiseAddr.trim() || undefined,
        }),
      );
      push({ title: 'Swarm joined', message: 'This daemon is now part of the swarm.', tone: 'success' });
      closeJoin();
    } catch (cause) {
      reportError('Could not join the swarm', (cause as Error).message);
      setJoinToken('');
    } finally {
      setWorking(false);
    }
  }

  async function handleLeave() {
    const confirmed = await confirm({
      targetName: 'this swarm',
      consequence:
        'This daemon stops being part of the cluster and its swarm objects become unreachable from here. The last manager of a swarm can only leave forcibly, which destroys the cluster state held on it.',
      confirmLabel: 'Leave swarm',
    });
    if (!confirmed) return;
    try {
      // A worker leaves cleanly; a manager is refused unless the leave is
      // forced, and the confirmation above stated exactly that.
      await run('Leave swarm', () => swarm.leave(canManage));
      push({ title: 'Swarm left', message: 'This daemon is no longer part of a swarm.', tone: 'success' });
    } catch (cause) {
      reportError('Could not leave the swarm', (cause as Error).message);
    }
  }

  /**
   * What the screen holds: the cluster, or the one statement of why there is no
   * cluster to hold. Never both, and never the statement more than once — the
   * reason each panel used to carry its own copy is that each was asked to
   * decide on its own.
   */
  function clusterView() {
    if (!swarm.loaded) return <EmptyState title="Reading the swarm state…" description={null} action={null} />;
    if (!inSwarm) {
      return (
        <EmptyState
          title="This daemon is not part of a swarm"
          description={NOT_IN_A_SWARM}
          action={
            <Row gap="var(--space-2)" align="center" wrap>
              <Button variant="primary" onClick={openInit}>
                Initialise a swarm
              </Button>
              <Button onClick={openJoin}>Join an existing one</Button>
            </Row>
          }
        />
      );
    }
    if (!canManage) {
      // The daemon's own words where it gave any, this screen's where it did
      // not — a reading that states a reason is never replaced by a generic one.
      return <EmptyState title="No cluster to read from here" description={state?.unavailableReason ?? NOT_A_MANAGER} action={null} />;
    }
    return (
      <Stack gap="var(--space-5)">
        <SwarmNodesPanel nodes={swarm.nodes} onUpdate={swarm.updateNode} onRemove={swarm.removeNode} />
        <SwarmServicesPanel
          services={swarm.services}
          onCreate={swarm.createService}
          onUpdate={swarm.updateService}
          onRemove={swarm.removeService}
        />
        <SwarmSecretsPanel
          secrets={swarm.secrets}
          onCreate={(input) => swarm.createData('secret', input)}
          onRemove={(id) => swarm.removeData('secret', id)}
        />
        <SwarmConfigsStacksPanel
          configs={swarm.configs}
          stacks={swarm.stacks}
          onCreateConfig={(input) => swarm.createData('config', input)}
          onRemoveConfig={(id) => swarm.removeData('config', id)}
          onRemoveStack={swarm.removeStack}
        />
      </Stack>
    );
  }

  return (
    <Stack gap="var(--space-5)">
      {swarm.error ? <ErrorBanner title="Could not read the swarm state" detail={swarm.error} onRetry={swarm.refresh} /> : null}

      {/* The bar qualifies a state; a daemon outside a swarm has none to
          qualify, and its condition is stated once below instead. */}
      {inSwarm && state ? (
        <StateSummaryBar
          tone={stateTone(state)}
          title={stateTitle(state)}
          facts={stateFacts(state)}
          actions={
            <Row gap="var(--space-2)" align="center" wrap>
              {canManage ? <Button onClick={openTokens}>Join tokens</Button> : null}
              <Button variant="destructive" onClick={handleLeave}>
                Leave swarm
              </Button>
            </Row>
          }
        />
      ) : null}

      {clusterView()}

      <FormDialog
        open={initOpen}
        title="Initialise swarm"
        description="Turns this daemon into the first manager of a new swarm. Other nodes join it with the tokens it then issues."
        submitLabel="Initialise"
        submitting={working}
        onSubmit={submitInit}
        onCancel={() => setInitOpen(false)}
      >
        <FormField label="Advertise address" hint="The address other nodes reach this manager on. Leave blank to let the daemon choose.">
          <TextField ariaLabel="Advertise address" placeholder="e.g. 192.168.1.10" value={advertiseAddr} onChange={setAdvertiseAddr} autoFocus />
        </FormField>
      </FormDialog>

      <FormDialog
        open={joinOpen}
        title="Join swarm"
        description="Joins an existing swarm. The token decides whether this daemon joins as a worker or as a manager."
        submitLabel="Join"
        submitting={working}
        submitDisabled={managerAddr.trim() === '' || joinToken.trim() === ''}
        onSubmit={submitJoin}
        onCancel={closeJoin}
      >
        <Stack gap="var(--space-3)">
          <FormField label="Manager address" hint="Host:port of a manager of the swarm; several are separated by commas.">
            <TextField ariaLabel="Manager address" placeholder="e.g. 192.168.1.10:2377" value={managerAddr} onChange={setManagerAddr} autoFocus />
          </FormField>
          <FormField label="Join token" hint="Masked as you type; it is sent once and never displayed back.">
            <SecretField ariaLabel="Join token" value={joinToken} onChange={setJoinToken} />
          </FormField>
          <FormField label="Advertise address" hint="The address the other nodes reach this one on. Leave blank to let the daemon choose.">
            <TextField ariaLabel="Advertise address" placeholder="e.g. 192.168.1.11" value={advertiseAddr} onChange={setAdvertiseAddr} />
          </FormField>
        </Stack>
      </FormDialog>

      <FormDialog
        open={tokensOpen}
        title="Join tokens"
        description="A join token is a credential: anyone holding it can add a node to this swarm. Rotating one invalidates it immediately; nodes already in the swarm are unaffected."
        submitLabel="Done"
        onSubmit={closeTokens}
        onCancel={closeTokens}
      >
        <Stack gap="var(--space-3)">
          {tokensReason ? <ErrorBanner title="No join token to show" detail={tokensReason} onRetry={() => void loadTokens()} /> : null}
          <Stack gap="var(--space-2)">
            <SectionHeader variant="eyebrow" title="Worker token" />
            <RevealableValue
              ariaLabel="Worker join token"
              value={tokens?.worker}
              loading={tokensLoading}
              revealed={workerRevealed}
              onRevealedChange={setWorkerRevealed}
              action={{ label: 'Rotate', onClick: () => void rotate('worker') }}
            />
          </Stack>
          <Stack gap="var(--space-2)">
            <SectionHeader variant="eyebrow" title="Manager token" />
            <RevealableValue
              ariaLabel="Manager join token"
              value={tokens?.manager}
              loading={tokensLoading}
              revealed={managerRevealed}
              onRevealedChange={setManagerRevealed}
              action={{ label: 'Rotate', onClick: () => void rotate('manager') }}
            />
          </Stack>
        </Stack>
      </FormDialog>
    </Stack>
  );
}
