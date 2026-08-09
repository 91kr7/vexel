// Typed client for the server's swarm endpoints (REQ-79 to REQ-84).
//
// A secret's or config's value is a request argument and nothing else:
// `createSwarmData` sends it once and keeps no reference to it, and no function
// here ever returns one. A join token is returned by the two token functions
// alone and is cached nowhere in this module.
export type SwarmRole = 'inactive' | 'manager' | 'worker';

export interface SwarmRaftHealth {
  status: 'healthy' | 'degraded' | 'unknown';
  detail: string;
}

export interface SwarmState {
  role: SwarmRole;
  localNodeState: string;
  manager: boolean;
  clusterId?: string;
  nodeId?: string;
  nodeCount?: number;
  managerCount?: number;
  raft: SwarmRaftHealth;
  /** Why manager-only readings cannot be served by this daemon; absent on a manager. */
  unavailableReason?: string;
  error?: string;
}

/** A manager-only listing: the items, or the reason there are none to show. */
export interface SwarmListing<T> {
  items: T[];
  unavailableReason?: string;
}

export interface SwarmJoinTokens {
  worker: string;
  manager: string;
}

export interface SwarmTokensReading {
  tokens?: SwarmJoinTokens;
  unavailableReason?: string;
}

export type SwarmNodeRole = 'manager' | 'worker';
export type SwarmNodeAvailability = 'active' | 'pause' | 'drain';

export interface SwarmNode {
  id: string;
  hostname: string;
  role: SwarmNodeRole;
  availability: SwarmNodeAvailability;
  status: string;
  statusMessage?: string;
  address?: string;
  leader: boolean;
  reachability?: string;
  engineVersion?: string;
  platform?: string;
  self: boolean;
  version: number;
  labels: Record<string, string>;
  createdAt?: string;
  updatedAt?: string;
}

export type SwarmServiceMode = 'replicated' | 'global';

export interface SwarmServicePort {
  published?: number;
  target: number;
  protocol: string;
  mode?: string;
}

export interface SwarmService {
  id: string;
  name: string;
  image: string;
  mode: SwarmServiceMode;
  replicasRunning?: number;
  replicasDesired?: number;
  ports: SwarmServicePort[];
  stack?: string;
  version: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface SwarmTask {
  id: string;
  slot?: number;
  nodeId?: string;
  nodeHostname?: string;
  state: string;
  desiredState: string;
  message?: string;
  error?: string;
  timestamp?: string;
}

export interface SwarmServiceDetail {
  service: SwarmService;
  env: string[];
  labels: Record<string, string>;
  tasks: SwarmTask[];
  raw: unknown;
}

export interface CreateSwarmServiceInput {
  name: string;
  image: string;
  mode: SwarmServiceMode;
  replicas?: number;
  env?: string[];
  ports?: SwarmServicePort[];
  labels?: Record<string, string>;
}

export interface UpdateSwarmServiceInput {
  image?: string;
  replicas?: number;
  env?: string[];
  ports?: SwarmServicePort[];
}

export interface SwarmStackService {
  id: string;
  name: string;
  image: string;
  mode: SwarmServiceMode;
  replicasRunning?: number;
  replicasDesired?: number;
}

export interface SwarmStack {
  name: string;
  serviceCount: number;
  services: SwarmStackService[];
  secretCount: number;
  configCount: number;
  networkCount: number;
}

export interface StackRemovalResult {
  removedServices: string[];
  removedSecrets: string[];
  removedConfigs: string[];
  removedNetworks: string[];
}

export type SwarmDataKind = 'secret' | 'config';

export interface SwarmDataItem {
  kind: SwarmDataKind;
  id: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
  version: number;
  labels: Record<string, string>;
  stack?: string;
}

export interface CreateSwarmDataInput {
  name: string;
  value: string;
  labels?: Record<string, string>;
}

export interface InitialiseSwarmInput {
  advertiseAddr?: string;
  listenAddr?: string;
}

export interface JoinSwarmInput {
  remoteAddrs: string[];
  joinToken: string;
  advertiseAddr?: string;
  listenAddr?: string;
}

async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    if (typeof body.error === 'string') return body.error;
  } catch {
    // no JSON body; fall through to the generic message
  }
  return `Request failed with HTTP ${response.status}`;
}

async function requireOk(response: Response): Promise<void> {
  if (!response.ok) throw new Error(await extractErrorMessage(response));
}

async function readJson<T>(response: Response): Promise<T> {
  await requireOk(response);
  return (await response.json()) as T;
}

function post(path: string, body?: unknown): Promise<Response> {
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
}

function collectionOf(kind: SwarmDataKind): string {
  return kind === 'secret' ? 'secrets' : 'configs';
}

export async function fetchSwarmState(): Promise<SwarmState> {
  return readJson<SwarmState>(await fetch('/api/swarm'));
}

export async function initialiseSwarm(input: InitialiseSwarmInput): Promise<SwarmState> {
  return readJson<SwarmState>(await post('/api/swarm/init', input));
}

export async function joinSwarm(input: JoinSwarmInput): Promise<SwarmState> {
  return readJson<SwarmState>(await post('/api/swarm/join', input));
}

export async function leaveSwarm(force: boolean): Promise<SwarmState> {
  return readJson<SwarmState>(await post('/api/swarm/leave', { force }));
}

export async function fetchJoinTokens(): Promise<SwarmTokensReading> {
  return readJson<SwarmTokensReading>(await fetch('/api/swarm/tokens'));
}

export async function rotateJoinToken(target: 'worker' | 'manager'): Promise<SwarmTokensReading> {
  return readJson<SwarmTokensReading>(await post('/api/swarm/tokens/rotate', { target }));
}

export async function fetchSwarmNodes(): Promise<SwarmListing<SwarmNode>> {
  return readJson<SwarmListing<SwarmNode>>(await fetch('/api/swarm/nodes'));
}

export async function updateSwarmNode(id: string, input: { role?: SwarmNodeRole; availability?: SwarmNodeAvailability }): Promise<SwarmNode> {
  return readJson<SwarmNode>(await post(`/api/swarm/nodes/${encodeURIComponent(id)}/update`, input));
}

export async function removeSwarmNode(id: string, force: boolean): Promise<void> {
  await requireOk(await fetch(`/api/swarm/nodes/${encodeURIComponent(id)}?force=${force ? 'true' : 'false'}`, { method: 'DELETE' }));
}

export async function fetchSwarmServices(): Promise<SwarmListing<SwarmService>> {
  return readJson<SwarmListing<SwarmService>>(await fetch('/api/swarm/services'));
}

export async function fetchSwarmServiceDetail(id: string): Promise<SwarmServiceDetail> {
  return readJson<SwarmServiceDetail>(await fetch(`/api/swarm/services/${encodeURIComponent(id)}`));
}

export async function createSwarmService(input: CreateSwarmServiceInput): Promise<SwarmService> {
  return readJson<SwarmService>(await post('/api/swarm/services', input));
}

export async function updateSwarmService(id: string, input: UpdateSwarmServiceInput): Promise<SwarmService> {
  return readJson<SwarmService>(await post(`/api/swarm/services/${encodeURIComponent(id)}/update`, input));
}

export async function removeSwarmService(id: string): Promise<void> {
  await requireOk(await fetch(`/api/swarm/services/${encodeURIComponent(id)}`, { method: 'DELETE' }));
}

export async function fetchSwarmStacks(): Promise<SwarmListing<SwarmStack>> {
  return readJson<SwarmListing<SwarmStack>>(await fetch('/api/swarm/stacks'));
}

export async function removeSwarmStack(name: string): Promise<StackRemovalResult> {
  return readJson<StackRemovalResult>(await fetch(`/api/swarm/stacks/${encodeURIComponent(name)}`, { method: 'DELETE' }));
}

export async function fetchSwarmData(kind: SwarmDataKind): Promise<SwarmListing<SwarmDataItem>> {
  return readJson<SwarmListing<SwarmDataItem>>(await fetch(`/api/swarm/${collectionOf(kind)}`));
}

/** Sends the value once, to be held by the cluster's store; the answer is metadata only. */
export async function createSwarmData(kind: SwarmDataKind, input: CreateSwarmDataInput): Promise<SwarmDataItem> {
  return readJson<SwarmDataItem>(await post(`/api/swarm/${collectionOf(kind)}`, input));
}

export async function removeSwarmData(kind: SwarmDataKind, id: string): Promise<void> {
  await requireOk(await fetch(`/api/swarm/${collectionOf(kind)}/${encodeURIComponent(id)}`, { method: 'DELETE' }));
}
