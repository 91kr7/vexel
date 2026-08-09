import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckboxGroup, ConfirmDialog, PrivilegeList, type CheckboxOption, type PrivilegeItem } from '../../ui';

export interface ConfirmationRequest {
  targetName: string;
  consequence: string;
  confirmLabel?: string;
  destructive?: boolean;
}

export interface ScopeConfirmationRequest extends ConfirmationRequest {
  /** The parts of the action the human chooses from; the confirmation carries the chosen ones back. */
  options: CheckboxOption[];
  /** Selected when the dialog opens; every option when omitted. */
  initialSelectedIds?: string[];
  scopeLabel?: string;
}

export interface PrivilegeConfirmationRequest extends ConfirmationRequest {
  /** What the action asks to be allowed to do; shown in full before it can be granted. */
  privileges: PrivilegeItem[];
  /** Said in place of the list when the action asks for nothing. */
  noPrivilegesLabel?: string;
}

interface ConfirmationContextValue {
  confirm: (request: ConfirmationRequest) => Promise<boolean>;
  confirmScope: (request: ScopeConfirmationRequest) => Promise<string[] | undefined>;
  confirmPrivileges: (request: PrivilegeConfirmationRequest) => Promise<boolean>;
}

const ConfirmationContext = createContext<ConfirmationContextValue | null>(null);

/**
 * Application-wide destructive-confirmation service (REQ-6): feature code
 * calls `confirm()` — or `confirmScope()` when the human also chooses what the
 * action applies to (REQ-96), or `confirmPrivileges()` when what is being
 * decided is what the target is allowed to do (REQ-99) — and awaits the
 * decision instead of building its own dialog. Cancelling performs no action.
 */
export function ConfirmationProvider({ children }: { children?: ReactNode }) {
  const [request, setRequest] = useState<ConfirmationRequest | ScopeConfirmationRequest | PrivilegeConfirmationRequest | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const resolver = useRef<((confirmed: boolean, scope: string[]) => void) | null>(null);

  const confirm = useCallback((next: ConfirmationRequest) => {
    return new Promise<boolean>((resolve) => {
      resolver.current = (confirmed) => resolve(confirmed);
      setSelectedIds([]);
      setRequest(next);
    });
  }, []);

  const confirmScope = useCallback((next: ScopeConfirmationRequest) => {
    return new Promise<string[] | undefined>((resolve) => {
      resolver.current = (confirmed, scope) => resolve(confirmed ? scope : undefined);
      setSelectedIds(next.initialSelectedIds ?? next.options.map((option) => option.id));
      setRequest(next);
    });
  }, []);

  const confirmPrivileges = useCallback((next: PrivilegeConfirmationRequest) => {
    return new Promise<boolean>((resolve) => {
      resolver.current = (confirmed) => resolve(confirmed);
      setSelectedIds([]);
      setRequest(next);
    });
  }, []);

  const settle = useCallback(
    (confirmed: boolean, scope: string[]) => {
      resolver.current?.(confirmed, scope);
      resolver.current = null;
      setRequest(null);
    },
    [],
  );

  const value = useMemo(() => ({ confirm, confirmScope, confirmPrivileges }), [confirm, confirmScope, confirmPrivileges]);
  const scopeRequest = request !== null && 'options' in request ? request : null;
  const privilegeRequest = request !== null && 'privileges' in request ? request : null;

  return (
    <ConfirmationContext.Provider value={value}>
      {children}
      <ConfirmDialog
        open={request !== null}
        targetName={request?.targetName ?? ''}
        consequence={request?.consequence ?? ''}
        confirmLabel={request?.confirmLabel}
        destructive={request?.destructive ?? true}
        confirmDisabled={scopeRequest !== null && selectedIds.length === 0}
        onConfirm={() => settle(true, selectedIds)}
        onCancel={() => settle(false, [])}
      >
        {scopeRequest ? (
          <CheckboxGroup
            ariaLabel={scopeRequest.scopeLabel ?? 'Scope'}
            options={scopeRequest.options}
            selectedIds={selectedIds}
            onChange={setSelectedIds}
          />
        ) : null}
        {privilegeRequest ? (
          <PrivilegeList items={privilegeRequest.privileges} emptyLabel={privilegeRequest.noPrivilegesLabel} />
        ) : null}
      </ConfirmDialog>
    </ConfirmationContext.Provider>
  );
}

/** Request an explicit, target-naming confirmation before a destructive action. */
export function useConfirmation(): ConfirmationContextValue {
  const context = useContext(ConfirmationContext);
  if (!context) throw new Error('useConfirmation must be used within a ConfirmationProvider');
  return context;
}
