// Typed client for the server's persistence and host-path endpoints
// (REQ-113, REQ-115, REQ-116).
export interface OperatorPreferences {
  lastScreenId?: string;
  selectedContext?: string;
  listFilters: Record<string, unknown>;
  logFollow: boolean;
  logTimestamps: boolean;
}

export const DEFAULT_PREFERENCES: OperatorPreferences = {
  listFilters: {},
  logFollow: true,
  logTimestamps: false,
};

export async function fetchPreferences(): Promise<OperatorPreferences> {
  const response = await fetch('/api/persistence/preferences');
  if (!response.ok) throw new Error(`Preferences request failed with HTTP ${response.status}`);
  return (await response.json()) as OperatorPreferences;
}

export async function savePreferences(patch: Partial<OperatorPreferences>): Promise<OperatorPreferences> {
  const response = await fetch('/api/persistence/preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!response.ok) throw new Error(`Preferences update failed with HTTP ${response.status}`);
  return (await response.json()) as OperatorPreferences;
}

export interface AnalysisCacheUsage {
  totalSizeBytes: number;
}

export async function fetchAnalysisCacheUsage(): Promise<AnalysisCacheUsage> {
  const response = await fetch('/api/persistence/analysis-cache');
  if (!response.ok) throw new Error(`Analysis-cache usage request failed with HTTP ${response.status}`);
  return (await response.json()) as AnalysisCacheUsage;
}

export async function clearAnalysisCache(): Promise<void> {
  const response = await fetch('/api/persistence/analysis-cache/clear', { method: 'POST' });
  if (!response.ok) throw new Error(`Analysis-cache clear failed with HTTP ${response.status}`);
}

export type HostPathKind = 'file' | 'directory';

export interface HostPathValidationRequest {
  path: string;
  kind?: HostPathKind;
  root?: string;
}

export interface HostPathValidationResult {
  valid: boolean;
  reason?: string;
  resolvedPath?: string;
  kind?: HostPathKind;
}

export async function validateHostPath(request: HostPathValidationRequest): Promise<HostPathValidationResult> {
  const response = await fetch('/api/host-paths/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error(`Host-path validation request failed with HTTP ${response.status}`);
  return (await response.json()) as HostPathValidationResult;
}
