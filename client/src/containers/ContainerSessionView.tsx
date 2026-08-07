import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Button,
  EmptyState,
  Row,
  Select,
  SessionEndedOverlay,
  SessionHeader,
  SessionSurface,
  Stack,
  Terminal,
  TextField,
  type SessionConnectionState,
  type TerminalHandle,
} from '../ui';
import { useContainerSession } from '../data/use-container-session';
import type { ExecLaunchOptions, SessionKind } from '../data/container-session-client';
import type { ContainerSummary } from '../data/containers-client';

export interface ContainerSessionViewProps {
  container: ContainerSummary;
  kind: SessionKind;
}

const SHELL_OPTIONS = [
  { value: '/bin/bash', label: 'bash' },
  { value: '/bin/sh', label: 'sh' },
  { value: 'custom', label: 'Custom command' },
];

/** Turns a shell selection (or a free-form custom command) into an exec Cmd. */
function buildCmd(shell: string, customCommand: string): string[] {
  if (shell !== 'custom') return [shell];
  const trimmed = customCommand.trim();
  return trimmed === '' ? ['/bin/sh'] : ['/bin/sh', '-c', trimmed];
}

/**
 * Exec/attach view (REQ-34, REQ-35, REQ-36): for `exec`, a launch form
 * (command/shell, user, working directory) opens a new session; for `attach`,
 * an explicit action attaches to the running container's own stdio. Either
 * way, once connected a live terminal is shown, with a detach/close action
 * and a session-ended state when the connection ends.
 */
export function ContainerSessionView({ container, kind }: ContainerSessionViewProps) {
  const [shell, setShell] = useState(SHELL_OPTIONS[0].value);
  const [customCommand, setCustomCommand] = useState('');
  const [user, setUser] = useState('');
  const [workingDir, setWorkingDir] = useState('');
  const [launch, setLaunch] = useState<ExecLaunchOptions | undefined>(undefined);
  const [active, setActive] = useState(false);

  const terminalRef = useRef<TerminalHandle>(null);
  const { status, error, exitCode, send, resize, subscribe, close } = useContainerSession(container.id, kind, launch, active);

  useEffect(() => subscribe((chunk) => terminalRef.current?.write(chunk)), [subscribe]);

  const handleStart = useCallback(() => {
    if (kind === 'exec') setLaunch({ cmd: buildCmd(shell, customCommand), user: user.trim() || undefined, workingDir: workingDir.trim() || undefined });
    setActive(true);
  }, [kind, shell, customCommand, user, workingDir]);

  const handleDetach = useCallback(() => {
    close();
  }, [close]);

  const handleReset = useCallback(() => {
    setActive(false);
    setLaunch(undefined);
  }, []);

  if (container.state !== 'running') {
    return <EmptyState title="Container is not running" description="Exec and attach sessions require a running container." />;
  }

  if (!active) {
    return (
      <Stack gap="var(--space-3)">
        {kind === 'exec' ? (
          <>
            <Row gap="var(--space-3)" wrap>
              <Select ariaLabel="Shell" value={shell} options={SHELL_OPTIONS} onChange={setShell} />
              {shell === 'custom' ? (
                <TextField ariaLabel="Custom command" placeholder="Command to run" value={customCommand} onChange={setCustomCommand} />
              ) : null}
            </Row>
            <Row gap="var(--space-3)" wrap>
              <TextField ariaLabel="User" placeholder="User (optional)" value={user} onChange={setUser} />
              <TextField ariaLabel="Working directory" placeholder="Working directory (optional)" value={workingDir} onChange={setWorkingDir} />
            </Row>
          </>
        ) : null}
        <Row>
          <Button variant="primary" onClick={handleStart}>
            {kind === 'exec' ? 'Launch session' : 'Attach'}
          </Button>
        </Row>
      </Stack>
    );
  }

  const ended = status === 'closed' || status === 'error';
  const headerState: SessionConnectionState = status;

  return (
    <Stack gap="var(--space-3)">
      <SessionHeader
        title={kind === 'exec' ? `Exec — ${container.name}` : `Attach — ${container.name}`}
        state={headerState}
        disconnectLabel={kind === 'exec' ? 'Close' : 'Detach'}
        onDisconnect={handleDetach}
      />
      <SessionSurface
        overlay={
          ended ? (
            <SessionEndedOverlay
              message={error ?? (exitCode !== null && exitCode !== undefined ? `Session ended (exit code ${exitCode}).` : 'Session ended.')}
              action={
                <Button variant="secondary" size="sm" onClick={handleReset}>
                  Close
                </Button>
              }
            />
          ) : undefined
        }
      >
        <Terminal ref={terminalRef} onInput={send} onResize={resize} />
      </SessionSurface>
    </Stack>
  );
}
