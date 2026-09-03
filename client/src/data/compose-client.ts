// Typed client for the server's compose endpoints (REQ-75, REQ-76, REQ-77,
// REQ-116). Lifecycle and scaling responses stream newline-delimited JSON —
// `EventSource` cannot issue a POST, and the output is unbounded — read
// straight off the `fetch` response body, mirroring the container-create
// client.
export interface ComposeServiceSummary {
  name: string;
  image: string;
  state: string;
  replicas: number;
}

export type ComposeProjectState = 'running' | 'partial' | 'stopped' | 'unknown';

export interface ComposeProjectSummary {
  name: string;
  configFiles: string[];
  state: ComposeProjectState;
  services: ComposeServiceSummary[];
  error?: string;
}

export interface ComposeFileContent {
  path: string;
  content: string;
}

export type ComposeFileReadResult = { ok: true; files: ComposeFileContent[] } | { ok: false; reason: string };
export type ComposeFileWriteResult = { ok: true } | { ok: false; reason: string };

export interface ComposeValidationResult {
  valid: boolean;
  errors: string[];
  services: string[];
  volumes: string[];
  networks: string[];
}

export interface ComposeCommandHandlers {
  onOutput?: (line: string) => void;
}

type ComposeCommandEvent =
  | { type: 'output'; line: string }
  | { type: 'result'; project: ComposeProjectSummary }
  | { type: 'error'; message: string };

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

export async function fetchComposeFiles(projectName: string): Promise<ComposeFileReadResult> {
  const response = await fetch(`/api/compose/projects/${encodeURIComponent(projectName)}/files`);
  await requireOk(response);
  return (await response.json()) as ComposeFileReadResult;
}

export async function writeComposeFile(projectName: string, path: string, content: string): Promise<ComposeFileWriteResult> {
  const response = await fetch(`/api/compose/projects/${encodeURIComponent(projectName)}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content }),
  });
  await requireOk(response);
  return (await response.json()) as ComposeFileWriteResult;
}

export async function validateComposeFile(projectName: string): Promise<ComposeValidationResult> {
  const response = await fetch(`/api/compose/projects/${encodeURIComponent(projectName)}/validate`, { method: 'POST' });
  await requireOk(response);
  return (await response.json()) as ComposeValidationResult;
}

async function runComposeCommand(url: string, handlers: ComposeCommandHandlers = {}, body?: unknown): Promise<ComposeProjectSummary> {
  const response = await fetch(url, {
    method: 'POST',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!response.ok || !response.body) throw new Error(await extractErrorMessage(response));

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let result: ComposeProjectSummary | undefined;
  let failure: string | undefined;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    const lines = pending.split('\n');
    pending = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim() === '') continue;
      const event = JSON.parse(line) as ComposeCommandEvent;
      if (event.type === 'output') handlers.onOutput?.(event.line);
      else if (event.type === 'result') result = event.project;
      else failure = event.message;
    }
  }

  if (failure !== undefined) throw new Error(failure);
  if (!result) throw new Error('The command stream ended without a result.');
  return result;
}

export function bringComposeProjectUp(projectName: string, handlers?: ComposeCommandHandlers): Promise<ComposeProjectSummary> {
  return runComposeCommand(`/api/compose/projects/${encodeURIComponent(projectName)}/up`, handlers);
}

export function bringComposeProjectDown(projectName: string, handlers?: ComposeCommandHandlers): Promise<ComposeProjectSummary> {
  return runComposeCommand(`/api/compose/projects/${encodeURIComponent(projectName)}/down`, handlers);
}

export function restartComposeProject(projectName: string, handlers?: ComposeCommandHandlers): Promise<ComposeProjectSummary> {
  return runComposeCommand(`/api/compose/projects/${encodeURIComponent(projectName)}/restart`, handlers);
}

export function scaleComposeService(
  projectName: string,
  service: string,
  replicas: number,
  handlers?: ComposeCommandHandlers,
): Promise<ComposeProjectSummary> {
  return runComposeCommand(
    `/api/compose/projects/${encodeURIComponent(projectName)}/services/${encodeURIComponent(service)}/scale`,
    handlers,
    { replicas },
  );
}

/** Builds the aggregated-log stream URL for a project. */
export function composeLogsStreamUrl(projectName: string): string {
  return `/api/compose/projects/${encodeURIComponent(projectName)}/logs/stream`;
}
