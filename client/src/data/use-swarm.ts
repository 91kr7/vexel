import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeToActiveContextChange } from './active-context';
import { subscribeToDaemonEvents, type DaemonEvent } from './event-stream';
import {
  createSwarmData,
  createSwarmService,
  fetchJoinTokens,
  fetchSwarmData,
  fetchSwarmNodes,
  fetchSwarmServices,
  fetchSwarmStacks,
  fetchSwarmState,
  initialiseSwarm,
  joinSwarm,
  leaveSwarm,
  removeSwarmData,
  removeSwarmNode,
  removeSwarmService,
  removeSwarmStack,
  rotateJoinToken,
  updateSwarmNode,
  updateSwarmService,
  type CreateSwarmDataInput,
  type CreateSwarmServiceInput,
  type InitialiseSwarmInput,
  type JoinSwarmInput,
  type StackRemovalResult,
  type SwarmDataItem,
  type SwarmDataKind,
  type SwarmListing,
  type SwarmNode,
  type SwarmNodeAvailability,
  type SwarmNodeRole,
  type SwarmService,
  type SwarmStack,
  type SwarmState,
  type SwarmTokensReading,
  type UpdateSwarmServiceInput,
} from './swarm-client';

// `docker swarm init`, `join` and `leave` run from a terminal emit no daemon
// event, so a bounded poll is the only way to notice them. Everything else
// this hook shows does emit one, hence a slow interval.
const POLL_INTERVAL_MS = 10000;

const SWARM_EVENT_TYPES = new Set(['node', 'service', 'secret', 'config']);

function emptyListing<T>(): SwarmListing<T> {
  return { items: [] };
}

/**
 * A payload that is not a listing is a failed read like any other: it is
 * reported, never stored, so no panel is ever handed something without an
 * `items` array to render.
 */
function requireListing<T>(listing: SwarmListing<T>, what: string): SwarmListing<T> {
  if (!listing || !Array.isArray(listing.items)) throw new Error(`The server did not answer with a list of ${what}.`);
  return listing;
}

/** Likewise for the state: the bar reads `raft` and `role` unconditionally. */
function requireState(state: SwarmState): SwarmState {
  if (!state || typeof state.role !== 'string' || !state.raft) throw new Error('The server did not answer with a swarm state.');
  return state;
}

export interface UseSwarmResult {
  state?: SwarmState;
  nodes: SwarmListing<SwarmNode>;
  services: SwarmListing<SwarmService>;
  stacks: SwarmListing<SwarmStack>;
  secrets: SwarmListing<SwarmDataItem>;
  configs: SwarmListing<SwarmDataItem>;
  loaded: boolean;
  error?: string;
  refresh: () => void;
  initialise: (input: InitialiseSwarmInput) => Promise<SwarmState>;
  join: (input: JoinSwarmInput) => Promise<SwarmState>;
  leave: (force: boolean) => Promise<SwarmState>;
  readTokens: () => Promise<SwarmTokensReading>;
  rotateToken: (target: 'worker' | 'manager') => Promise<SwarmTokensReading>;
  updateNode: (id: string, input: { role?: SwarmNodeRole; availability?: SwarmNodeAvailability }) => Promise<SwarmNode>;
  removeNode: (id: string, force: boolean) => Promise<void>;
  createService: (input: CreateSwarmServiceInput) => Promise<SwarmService>;
  updateService: (id: string, input: UpdateSwarmServiceInput) => Promise<SwarmService>;
  removeService: (id: string) => Promise<void>;
  removeStack: (name: string) => Promise<StackRemovalResult>;
  createData: (kind: SwarmDataKind, input: CreateSwarmDataInput) => Promise<SwarmDataItem>;
  removeData: (kind: SwarmDataKind, id: string) => Promise<void>;
}

/**
 * The swarm reading of the active daemon, kept current as one round so the
 * panels of the screen never show two different moments of the same cluster
 * (REQ-79 to REQ-84).
 *
 * A daemon outside a swarm is a normal reading, not a failure: every listing
 * comes back empty with the reason attached, and `error` stays empty.
 *
 * No join token and no secret value is ever held here: tokens are read on
 * demand and handed straight to the caller (REQ-80, REQ-84).
 */
export function useSwarm(): UseSwarmResult {
  const [state, setState] = useState<SwarmState | undefined>(undefined);
  const [nodes, setNodes] = useState<SwarmListing<SwarmNode>>(emptyListing);
  const [services, setServices] = useState<SwarmListing<SwarmService>>(emptyListing);
  const [stacks, setStacks] = useState<SwarmListing<SwarmStack>>(emptyListing);
  const [secrets, setSecrets] = useState<SwarmListing<SwarmDataItem>>(emptyListing);
  const [configs, setConfigs] = useState<SwarmListing<SwarmDataItem>>(emptyListing);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const cancelledRef = useRef(false);

  const refresh = useCallback(() => {
    Promise.all([fetchSwarmState(), fetchSwarmNodes(), fetchSwarmServices(), fetchSwarmStacks(), fetchSwarmData('secret'), fetchSwarmData('config')])
      .then(([nextState, nextNodes, nextServices, nextStacks, nextSecrets, nextConfigs]) => {
        if (cancelledRef.current) return;
        // Validated before anything is stored: one malformed answer must fail
        // the round, not reach a panel and take the screen down with it.
        const state = requireState(nextState);
        const nodes = requireListing(nextNodes, 'nodes');
        const services = requireListing(nextServices, 'services');
        const stacks = requireListing(nextStacks, 'stacks');
        const secrets = requireListing(nextSecrets, 'secrets');
        const configs = requireListing(nextConfigs, 'configs');
        setState(state);
        setNodes(nodes);
        setServices(services);
        setStacks(stacks);
        setSecrets(secrets);
        setConfigs(configs);
        setError(undefined);
      })
      .catch((cause: Error) => {
        if (cancelledRef.current) return;
        setError(cause.message);
      })
      .finally(() => {
        if (cancelledRef.current) return;
        setLoaded(true);
      });
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    refresh();
    return () => {
      cancelledRef.current = true;
    };
  }, [refresh]);

  useEffect(
    () =>
      subscribeToDaemonEvents((event: DaemonEvent) => {
        if (SWARM_EVENT_TYPES.has(event.type)) refresh();
      }),
    [refresh],
  );

  // Another context means another daemon: the cluster held here belongs to the
  // one left behind and is re-read at once (REQ-93).
  useEffect(() => subscribeToActiveContextChange(refresh), [refresh]);

  useEffect(() => {
    const interval = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const after = useCallback(
    async <T,>(operation: Promise<T>): Promise<T> => {
      const result = await operation;
      refresh();
      return result;
    },
    [refresh],
  );

  return {
    state,
    nodes,
    services,
    stacks,
    secrets,
    configs,
    loaded,
    error,
    refresh,
    initialise: useCallback((input: InitialiseSwarmInput) => after(initialiseSwarm(input)), [after]),
    join: useCallback((input: JoinSwarmInput) => after(joinSwarm(input)), [after]),
    leave: useCallback((force: boolean) => after(leaveSwarm(force)), [after]),
    // Read on demand and handed straight back: the token is never state here.
    readTokens: useCallback(() => fetchJoinTokens(), []),
    rotateToken: useCallback((target: 'worker' | 'manager') => rotateJoinToken(target), []),
    updateNode: useCallback((id: string, input: { role?: SwarmNodeRole; availability?: SwarmNodeAvailability }) => after(updateSwarmNode(id, input)), [after]),
    removeNode: useCallback((id: string, force: boolean) => after(removeSwarmNode(id, force)), [after]),
    createService: useCallback((input: CreateSwarmServiceInput) => after(createSwarmService(input)), [after]),
    updateService: useCallback((id: string, input: UpdateSwarmServiceInput) => after(updateSwarmService(id, input)), [after]),
    removeService: useCallback((id: string) => after(removeSwarmService(id)), [after]),
    removeStack: useCallback((name: string) => after(removeSwarmStack(name)), [after]),
    createData: useCallback((kind: SwarmDataKind, input: CreateSwarmDataInput) => after(createSwarmData(kind, input)), [after]),
    removeData: useCallback((kind: SwarmDataKind, id: string) => after(removeSwarmData(kind, id)), [after]),
  };
}
