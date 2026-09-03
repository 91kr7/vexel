// Typed client for the server's registry endpoints (REQ-85, REQ-86, REQ-87).
//
// A credential is a request argument here and nothing else: `login` takes the
// secret, sends it once and keeps no reference to it. Nothing in this module
// stores, caches or returns a secret, and no response ever carries one.
export interface RegistrySummary {
  host: string;
  serverUrl: string;
  authenticated: boolean;
  /** The account the session is authenticated as, when the credential store reports one. */
  account?: string;
  /** The credential helper backing this registry; absent when credentials sit in the Docker config file. */
  credentialStore?: string;
  /** `false` when the daemon treats the registry as an insecure (plain http) one. */
  secure: boolean;
  official: boolean;
}

export interface RepositorySummary {
  name: string;
  description?: string;
  pullCount?: number;
}

export interface TagSummary {
  name: string;
  sizeBytes?: number;
  updatedAt?: string;
  /** The reference the daemon pulls this tag by; the server decides its shape. */
  pullReference: string;
}

export interface RegistryLoginInput {
  host: string;
  username: string;
  secret: string;
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

export async function fetchRepositories(host: string, query: string, limit?: number): Promise<RepositorySummary[]> {
  const params = new URLSearchParams({ host, query });
  if (limit) params.set('limit', String(limit));
  const response = await fetch(`/api/registries/repositories?${params.toString()}`);
  await requireOk(response);
  return (await response.json()) as RepositorySummary[];
}

export async function fetchRepositoryTags(host: string, repository: string, limit?: number): Promise<TagSummary[]> {
  const params = new URLSearchParams({ host, repository });
  if (limit) params.set('limit', String(limit));
  const response = await fetch(`/api/registries/tags?${params.toString()}`);
  await requireOk(response);
  return (await response.json()) as TagSummary[];
}

/** Sends the secret once, to be handed to the host credential store; the answer never carries it back. */
export async function loginToRegistry(input: RegistryLoginInput): Promise<RegistrySummary> {
  const response = await fetch('/api/registries/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  await requireOk(response);
  return (await response.json()) as RegistrySummary;
}

export async function logoutFromRegistry(host: string): Promise<RegistrySummary> {
  const response = await fetch('/api/registries/logout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ host }),
  });
  await requireOk(response);
  return (await response.json()) as RegistrySummary;
}
