import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { ConfirmDialog } from '../../ui';

export interface ConfirmationRequest {
  targetName: string;
  consequence: string;
  confirmLabel?: string;
  destructive?: boolean;
}

interface ConfirmationContextValue {
  confirm: (request: ConfirmationRequest) => Promise<boolean>;
}

const ConfirmationContext = createContext<ConfirmationContextValue | null>(null);

/**
 * Application-wide destructive-confirmation service (REQ-6): feature code
 * calls `confirm()` and awaits the human's decision instead of building its
 * own dialog. Cancelling resolves `false` and performs no action.
 */
export function ConfirmationProvider({ children }: { children?: ReactNode }) {
  const [request, setRequest] = useState<ConfirmationRequest | null>(null);
  const resolver = useRef<((confirmed: boolean) => void) | null>(null);

  const confirm = useCallback((next: ConfirmationRequest) => {
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setRequest(next);
    });
  }, []);

  const settle = useCallback((confirmed: boolean) => {
    resolver.current?.(confirmed);
    resolver.current = null;
    setRequest(null);
  }, []);

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmationContext.Provider value={value}>
      {children}
      <ConfirmDialog
        open={request !== null}
        targetName={request?.targetName ?? ''}
        consequence={request?.consequence ?? ''}
        confirmLabel={request?.confirmLabel}
        destructive={request?.destructive ?? true}
        onConfirm={() => settle(true)}
        onCancel={() => settle(false)}
      />
    </ConfirmationContext.Provider>
  );
}

/** Request an explicit, target-naming confirmation before a destructive action. */
export function useConfirmation(): ConfirmationContextValue {
  const context = useContext(ConfirmationContext);
  if (!context) throw new Error('useConfirmation must be used within a ConfirmationProvider');
  return context;
}
