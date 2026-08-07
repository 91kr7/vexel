// Typed description of the server's interactive-session WebSocket endpoint
// (REQ-34, REQ-35, REQ-36).
export type SessionKind = 'exec' | 'attach';

export interface ExecLaunchOptions {
  cmd: string[];
  user?: string;
  workingDir?: string;
}

/** Builds the exec/attach session WebSocket URL for a container. */
export function containerSessionUrl(id: string, kind: SessionKind, launch?: ExecLaunchOptions): string {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const params = new URLSearchParams();
  if (launch) {
    for (const token of launch.cmd) params.append('cmd', token);
    if (launch.user) params.set('user', launch.user);
    if (launch.workingDir) params.set('workdir', launch.workingDir);
  }
  const query = params.toString();
  return `${protocol}://${window.location.host}/api/containers/${encodeURIComponent(id)}/${kind}${query ? `?${query}` : ''}`;
}
