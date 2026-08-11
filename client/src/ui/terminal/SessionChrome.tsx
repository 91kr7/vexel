import type { ReactNode } from 'react';
import { Button } from '../controls/Button';
import { StatusPill, type StatusTone } from '../controls/StatusPill';
import '../glass/overlay-glass.css';
import './session-chrome.css';

export type SessionConnectionState = 'connecting' | 'open' | 'closed' | 'error';

const STATE_LABEL: Record<SessionConnectionState, string> = {
  connecting: 'Connecting…',
  open: 'Connected',
  closed: 'Session ended',
  error: 'Connection error',
};

const STATE_TONE: Record<SessionConnectionState, StatusTone> = {
  connecting: 'neutral',
  open: 'success',
  closed: 'neutral',
  error: 'danger',
};

export interface SessionHeaderProps {
  title: string;
  state: SessionConnectionState;
  /** Label for the trailing action (e.g. "Detach", "Disconnect"); omitted hides the action. */
  disconnectLabel?: string;
  onDisconnect?: () => void;
}

/** Header of an interactive session surface: title, connection state and a disconnect/detach action. */
export function SessionHeader({ title, state, disconnectLabel, onDisconnect }: SessionHeaderProps) {
  return (
    <div className="ui-session-header">
      <span className="ui-session-header__title">{title}</span>
      <StatusPill tone={STATE_TONE[state]}>{STATE_LABEL[state]}</StatusPill>
      {disconnectLabel && onDisconnect ? (
        <Button variant="ghost" size="sm" onClick={onDisconnect} disabled={state === 'closed'}>
          {disconnectLabel}
        </Button>
      ) : null}
    </div>
  );
}

export interface SessionEndedOverlayProps {
  message: string;
  action?: ReactNode;
}

/** Blurs an ended session's terminal and states why, with an optional action (e.g. "Close"). */
export function SessionEndedOverlay({ message, action }: SessionEndedOverlayProps) {
  return (
    <div className="ui-session-ended-overlay ui-overlay-glass">
      <p className="ui-session-ended-overlay__message">{message}</p>
      {action}
    </div>
  );
}

export interface SessionSurfaceProps {
  /** The Terminal (or its placeholder while a launch form is shown). */
  children: ReactNode;
  /** A SessionEndedOverlay, shown over the terminal — which it blurs — once the session ends. */
  overlay?: ReactNode;
}

/** Positions an optional SessionEndedOverlay over its terminal content. */
export function SessionSurface({ children, overlay }: SessionSurfaceProps) {
  return (
    <div className="ui-session-surface">
      {children}
      {overlay}
    </div>
  );
}
