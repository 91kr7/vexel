import { useCallback, useState } from 'react';
import {
  Button,
  ErrorBanner,
  FormDialog,
  FormField,
  QuadPanelLayout,
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

function stateTitle(state: SwarmState | undefined): string {
  if (!state) return 'Reading swarm state…';
  if (state.role === 'inactive') return 'Swarm inactive';
  if (state.localNodeState === 'active') return 'Swarm active';
  return `Swarm ${state.localNodeState}`;
}

function stateTone(state: SwarmState | undefined): StatusTone {
  if (!state || state.role === 'inactive') return 'neutral';
  if (state.localNodeState !== 'active' || state.error) return 'warning';
  if (state.manager && state.raft.status === 'degraded') return 'warning';
  return 'success';
}

/** The mockup's monospace line under the state, saying what this daemon is. */
function stateFacts(state: SwarmState | undefined): string[] {
  if (!state) return [];
  if (state.role === 'inactive') return ['not part of a swarm'];
  if (!state.manager) return ['worker', 'only a manager can read the cluster'];
  return [
    'manager',
    state.clusterId ? `cluster id ${state.clusterId.slice(0, 12)}` : 'cluster id unknown',
    state.nodeCount === undefined ? 'node count unknown' : `${state.nodeCount} nodes`,
    `raft ${state.raft.status}`,
  ];
}

/**
 * The Swarm screen (REQ-79 to REQ-84): the cluster state with init / join /
 * leave and its join tokens, above the four panels of the mockup — nodes,
 * services & tasks, secrets, configs & stacks.
 *
 * The daemon not being a swarm manager is the common case, not an error: the
 * bar says what the daemon is and offers the way in, and every panel carries
 * the reason it has nothing to list.
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

  const inSwarm = state !== undefined && state.role !== 'inactive';

  return (
    <Stack gap="var(--space-5)">
      {swarm.error ? <ErrorBanner title="Could not read the swarm state" detail={swarm.error} onRetry={swarm.refresh} /> : null}

      <StateSummaryBar
        tone={stateTone(state)}
        title={stateTitle(state)}
        facts={stateFacts(state)}
        actions={
          <Row gap="var(--space-2)" align="center" wrap>
            {!inSwarm && swarm.loaded ? (
              <>
                <Button variant="primary" onClick={openInit}>
                  Initialise swarm
                </Button>
                <Button onClick={openJoin}>Join swarm</Button>
              </>
            ) : null}
            {inSwarm && canManage ? <Button onClick={openTokens}>Join tokens</Button> : null}
            {inSwarm ? (
              <Button variant="destructive" onClick={handleLeave}>
                Leave swarm
              </Button>
            ) : null}
          </Row>
        }
      />

      <QuadPanelLayout
        topStart={
          <SwarmNodesPanel nodes={swarm.nodes} loaded={swarm.loaded} canManage={canManage} onUpdate={swarm.updateNode} onRemove={swarm.removeNode} />
        }
        topEnd={
          <SwarmServicesPanel
            services={swarm.services}
            loaded={swarm.loaded}
            canManage={canManage}
            onCreate={swarm.createService}
            onUpdate={swarm.updateService}
            onRemove={swarm.removeService}
          />
        }
        bottomStart={
          <SwarmSecretsPanel
            secrets={swarm.secrets}
            loaded={swarm.loaded}
            canManage={canManage}
            onCreate={(input) => swarm.createData('secret', input)}
            onRemove={(id) => swarm.removeData('secret', id)}
          />
        }
        bottomEnd={
          <SwarmConfigsStacksPanel
            configs={swarm.configs}
            stacks={swarm.stacks}
            loaded={swarm.loaded}
            canManage={canManage}
            onCreateConfig={(input) => swarm.createData('config', input)}
            onRemoveConfig={(id) => swarm.removeData('config', id)}
            onRemoveStack={swarm.removeStack}
          />
        }
      />

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
