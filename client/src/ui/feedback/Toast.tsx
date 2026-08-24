import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { IconButton } from '../controls/IconButton';
import { Surface } from '../glass/Surface';
import { Row } from '../layout/Row';
import './feedback.css';

/**
 * How many toasts are on screen at once. Each one carries the blurred overlay
 * glass material, so this is also the bound on how many blurred surfaces the
 * compositor can ever be asked for at the same time
 * (plan-liquid_glass_overlays/REQ-10).
 */
const maxVisibleToasts = 3;

export type ToastTone = 'neutral' | 'success' | 'danger';

export interface ToastInput {
  title: string;
  message?: string;
  tone?: ToastTone;
  durationMs?: number;
}

interface ToastEntry extends ToastInput {
  id: string;
}

interface ToastContextValue {
  push: (toast: ToastInput) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** The mark a toned toast carries before its text; `neutral` carries none. */
const toneGlyph: Record<ToastTone, string | null> = {
  neutral: null,
  success: '✓',
  danger: '!',
};

/** A per-instance counter would collide across concurrently mounted providers (and reset on remount); a random id never does. */
function createToastId(): string {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

/** Provides `useToast()` and renders the toast stack, bottom-right. */
export function ToastProvider({ children }: { children?: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const timers = useRef(new Map<string, number>());

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (toast: ToastInput) => {
      const id = createToastId();
      // The oldest gives way once a fourth arrives; ids are unique, so the
      // timeout of a toast dropped this way can only ever look for an entry
      // that is gone, never dismiss the toast that took its place.
      setToasts((current) => [...current, { id, ...toast }].slice(-maxVisibleToasts));
      timers.current.set(id, window.setTimeout(() => dismiss(id), toast.durationMs ?? 5000));
    },
    [dismiss],
  );

  // A toast that left the stack before its time — dropped by the cap, or
  // dismissed — has a timeout still pending: it is cleared here rather than
  // left to fire against a toast that no longer exists.
  useEffect(() => {
    for (const [id, timer] of [...timers.current]) {
      if (toasts.some((toast) => toast.id === id)) continue;
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, [toasts]);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="ui-toast-viewport">
        {toasts.map((toast) => {
          const tone = toast.tone ?? 'neutral';
          const glyph = toneGlyph[tone];
          return (
            // The surface carries no padding: the card's one padding is on
            // `.ui-toast`, which therefore fills the glass exactly and can draw
            // the tone accent at its edge.
            <Surface key={toast.id} elevation="raised" padding="none" material="overlay">
              <div className={tone === 'neutral' ? 'ui-toast' : `ui-toast ui-toast--tone-${tone}`}>
                <Row gap="var(--space-3)" align="start">
                  {glyph ? (
                    <span className="ui-toast__glyph" aria-hidden="true">
                      {glyph}
                    </span>
                  ) : null}
                  <div className="ui-toast__body">
                    <p className="ui-toast__title">{toast.title}</p>
                    {toast.message ? <p className="ui-toast__message">{toast.message}</p> : null}
                  </div>
                  <div className="ui-toast__dismiss">
                    <IconButton label={`Dismiss notification: ${toast.title}`} size="sm" onClick={() => dismiss(toast.id)}>
                      ×
                    </IconButton>
                  </div>
                </Row>
              </div>
            </Surface>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

/** Push transient toast notifications from anywhere under ToastProvider. */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within a ToastProvider');
  return context;
}
