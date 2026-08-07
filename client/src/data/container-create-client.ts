// Typed client for the container creation endpoint (REQ-27, REQ-28, REQ-29).
//
// Creation is a POST (the configuration is far too large for a query string)
// whose response body streams newline-delimited JSON: pull progress first when
// the image had to be fetched, then exactly one terminal `created` or `error`
// event. `EventSource` cannot issue a POST, so the stream is read straight off
// the `fetch` response body.
import type { ImageTransferStep } from './use-image-transfer';

export interface PortBinding {
  containerPort: number;
  protocol: 'tcp' | 'udp';
  hostPort?: number;
  hostIp?: string;
}

export interface MountSpec {
  type: 'bind' | 'volume';
  source: string;
  destination: string;
  readOnly: boolean;
}

export interface ContainerCapabilities {
  add: string[];
  drop: string[];
}

export interface ContainerCreateSpec {
  image: string;
  platform?: string;
  name?: string;
  command?: string[];
  entrypoint?: string[];
  /** Environment entries in the daemon's own `KEY=value` form. */
  env?: string[];
  ports?: PortBinding[];
  mounts?: MountSpec[];
  networks?: string[];
  restartPolicy?: { name: string; maximumRetryCount?: number };
  resourceLimits?: { cpus?: number; memoryBytes?: number };
  labels?: Record<string, string>;
  privileged?: boolean;
  capabilities?: ContainerCapabilities;
  start?: boolean;
}

export interface ContainerCreateResult {
  id: string;
  name: string;
  started: boolean;
  imagePulled: boolean;
  warnings: string[];
}

export interface ContainerCreateHandlers {
  onImageResolved?: (pulled: boolean) => void;
  onPullStep?: (step: ImageTransferStep) => void;
}

type CreateEvent =
  | { type: 'image-resolved'; pulled: boolean }
  | { type: 'pull-step'; step: ImageTransferStep }
  | { type: 'created'; result: ContainerCreateResult }
  | { type: 'error'; message: string };

/**
 * Creates the container, reporting pull progress as it goes. Resolves with the
 * created container; rejects with the daemon's own message when the daemon
 * refuses — the caller's form values are never touched either way.
 */
export async function createContainer(spec: ContainerCreateSpec, handlers: ContainerCreateHandlers = {}): Promise<ContainerCreateResult> {
  const response = await fetch('/api/containers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(spec),
  });

  if (!response.ok || !response.body) {
    throw new Error(await extractErrorMessage(response));
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let result: ContainerCreateResult | undefined;
  let failure: string | undefined;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    const lines = pending.split('\n');
    pending = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim() === '') continue;
      const event = JSON.parse(line) as CreateEvent;
      if (event.type === 'image-resolved') handlers.onImageResolved?.(event.pulled);
      else if (event.type === 'pull-step') handlers.onPullStep?.(event.step);
      else if (event.type === 'created') result = event.result;
      else failure = event.message;
    }
  }

  if (failure !== undefined) throw new Error(failure);
  if (!result) throw new Error('The creation stream ended without a result.');
  return result;
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
