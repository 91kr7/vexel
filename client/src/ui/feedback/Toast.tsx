import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Surface } from '../glass/Surface';
import './feedback.css';

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

/** A per-instance counter would collide across concurrently mounted providers (and reset on remount); a random id never does. */
function createToastId(): string {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

/** Provides `useToast()` and renders the toast stack, bottom-right. */
export function ToastProvider({ children }: { children?: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (toast: ToastInput) => {
      const id = createToastId();
      setToasts((current) => [...current, { id, ...toast }]);
      window.setTimeout(() => dismiss(id), toast.durationMs ?? 5000);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="ui-toast-viewport">
        {toasts.map((toast) => (
          <Surface key={toast.id} elevation="raised" padding="md">
            <div className="ui-toast">
              <p className="ui-toast__title">{toast.title}</p>
              {toast.message ? <p className="ui-toast__message">{toast.message}</p> : null}
            </div>
          </Surface>
        ))}
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
